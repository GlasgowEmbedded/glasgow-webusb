import type { PyodideAPI } from './pyodide';
import type { TreeNode } from './components/tree-view';
import { HOME_DIRECTORY, MOUNT_DIRECTORY } from './filesystem-constants';

export interface FileTreeNode extends TreeNode {
    path: string;
}

export class GlasgowFileSystem {
    #pyodide: PyodideAPI;
    #nativeFSMountRoot: unknown | null = null;

    constructor({ pyodide }: { pyodide: PyodideAPI }) {
        this.#pyodide = pyodide;
    }

    subscribeToHomeUpdates(callback: () => void) {
        // @ts-expect-error Pyodide's FS typings are not comprehensive enough
        let trackingDelegate: Record<string, (...args: any) => void> = this.#pyodide.FS.trackingDelegate;
        trackingDelegate['onMakeDirectory'] = (path: string, mode: number) => {
            if (path.startsWith(HOME_DIRECTORY)) {
                callback();
            }
        };
        trackingDelegate['onMakeSymlink'] = (oldPath: string, newPath: string) => {
            if (newPath.startsWith(HOME_DIRECTORY)) {
                callback();
            }
        };
        trackingDelegate['onMovePath'] = (oldPath: string, newPath: string) => {
            if (oldPath.startsWith(HOME_DIRECTORY) || newPath.startsWith(HOME_DIRECTORY)) {
                callback();
            }
        };
        trackingDelegate['onDeletePath'] = (path: string) => {
            if (path.startsWith(HOME_DIRECTORY)) {
                callback();
            }
        };
        trackingDelegate['onCloseFile'] = (path: string) => {
            if (path.startsWith(HOME_DIRECTORY)) {
                callback();
            }
        };
    }

    readFileTree(path: string) {
        let result = [];
        let names = this.#pyodide.FS.readdir(path);
        for (let name of names) {
            if (name === '.' || name === '..') {
                continue;
            }

            let node: FileTreeNode = {
                name,
                path: `${path}/${name}`,
            };
            let stat = this.#pyodide.FS.stat(node.path, true);
            if (this.#pyodide.FS.isDir(stat.mode)) {
                node.children = this.readFileTree(node.path);
            }
            result.push(node);
        }
        result.sort((a, b) => {
            return Number(!!b.children) - Number(!!a.children);
        });
        return result;
    }

    readFile(path: string) {
        // @ts-expect-error Pyodide's FS typings are not comprehensive enough
        return this.#pyodide.FS.readFile(path) as Uint8Array<ArrayBuffer>;
    };

    createPath(
        path: string,
        type: 'file' | 'folder',
        fileContents: Uint8Array<ArrayBuffer> | null,
        dryRun: boolean,
    ) {
        const name = this.#pyodide.PATH.basename(path);

        if (['', '.', '..'].includes(name)) {
            throw 'The file name must not be . or ..';
        }
        if (name.includes('/')) {
            throw 'The file name must not include a slash';
        }

        let stat;
        try {
            stat = this.#pyodide.FS.stat(path, true);
        } catch (e) {}
        if (stat) {
            throw `A ${this.#pyodide.FS.isDir(stat.mode) ? 'folder' : 'file'} with the same name already exists`;
        }

        if (dryRun)
            return;

        switch (type) {
            case 'file': {
                this.#pyodide.FS.mkdirTree(this.#pyodide.PATH.dirname(path));
                const stream = this.#pyodide.FS.open(path, 'w+');
                this.#pyodide.FS.write(stream, fileContents!, 0, fileContents!.length, 0);
                this.#pyodide.FS.close(stream);
                break;
            }
            case 'folder': {
                this.#pyodide.FS.mkdirTree(path);
                break;
            }
        }
    };

    deletePath(path: string) {
        const deleteFile = (path: string) => {
            if (this.#pyodide.FS.isDir(this.#pyodide.FS.stat(path, true).mode)) {
                for (const file of this.#pyodide.FS.readdir(path)) {
                    if (file === '.' || file === '..') {
                        continue;
                    }
                    deleteFile(`${path}/${file}`);
                }
                this.#pyodide.FS.rmdir(path);
            } else {
                this.#pyodide.FS.unlink(path);
            }
        };
        deleteFile(path);
    }

    renamePath(path: string, newPath: string, dryRun: boolean) {
        let stat;
        try {
            stat = this.#pyodide.FS.stat(newPath, true);
        } catch (e) {}
        if (stat && path !== newPath) {
            throw `A ${this.#pyodide.FS.isDir(stat.mode) ? 'folder' : 'file'} with the same name already exists`;
        }

        if (dryRun)
            return;

        // @ts-expect-error Pyodide's FS typings are not comprehensive enough
        this.#pyodide.FS.rename(path, newPath);
    }

    async mountHome() {
        this.#pyodide.FS.mkdirTree(HOME_DIRECTORY);
        const homeMountRoot = this.#pyodide.FS.mount(this.#pyodide.FS.filesystems.IDBFS, { autoPersist: true }, HOME_DIRECTORY);
        return new Promise<void>((resolve) => {
            this.#pyodide.FS.filesystems.IDBFS.syncfs(homeMountRoot.mount, true, (error: unknown) => {
                if (error !== null) {
                    console.log('[FS Error]', error);
                    return;
                }

                resolve();
            });
        });
    }

    async mountNativeFS() {
        const fileSystemHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        this.#pyodide.FS.mkdirTree(MOUNT_DIRECTORY);
        this.#nativeFSMountRoot = this.#pyodide.FS.mount(this.#pyodide.FS.filesystems.NATIVEFS_ASYNC, {
            fileSystemHandle,
        }, MOUNT_DIRECTORY);
        await this.syncFSFromBacking();
    }

    async unmountNativeFS() {
        this.#pyodide.FS.unmount(MOUNT_DIRECTORY);
        this.#pyodide.FS.rmdir(MOUNT_DIRECTORY);
    }

    async syncFSFromBacking() {
        if (!this.#nativeFSMountRoot) return;
        return await new Promise<void>((resolve, reject) => {
            this.#pyodide.FS.filesystems.NATIVEFS_ASYNC.syncfs((this.#nativeFSMountRoot as any).mount, true, (error: unknown) => {
                if (error !== null) {
                    console.log('[FS Error]', error);
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }

    async syncFSToBacking() {
        if (!this.#nativeFSMountRoot) return;
        return await new Promise<void>((resolve, reject) => {
            this.#pyodide.FS.filesystems.NATIVEFS_ASYNC.syncfs((this.#nativeFSMountRoot as any).mount, false, (error: unknown) => {
                if (error !== null) {
                    console.log('[FS Error]', error);
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}
