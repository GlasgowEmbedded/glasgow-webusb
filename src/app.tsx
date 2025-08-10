import { render, options } from 'preact';
import { computed, effect, signal } from '@preact/signals';
import debounce from 'lodash/debounce';
import { loadToolchain } from './toolchain';
import { loadPyodide } from './pyodide';
import { PanelContainer } from './components/panel';
import { Terminal } from './terminal';
import { type TreeNode, TreeView, type TreeViewAPI } from './components/tree-view';
import { truthyFilter } from './helpers/truthy-filter';
import termColors from './terminal-colors';
import shell from './shell.py';

const HOME_DIRECTORY = "/root";
const MOUNT_DIRECTORY = "/mnt";

declare global {
    function syncFSFromBacking(): Promise<void>;
    function syncFSToBacking(): Promise<void>;

    function signalExecutionStart(): void;
    function signalExecutionEnd(): void;
}

interface FileTreeNode extends TreeNode {
    path: string;
}

(() => {
    // Backport https://github.com/preactjs/preact/pull/4658
    // Delete once a new version of Preact is released

    let oldDiffHook = (options as any).__b /* _diff */;
    (options as any).__b /* _diff */ = (vnode: any) => {
        const isClassComponent = typeof vnode.type === 'function' && 'prototype' in vnode.type && vnode.type.prototype.render;
        if (typeof vnode.type === 'function' && !isClassComponent && vnode.ref) {
            vnode.props.ref = vnode.ref;
            vnode.ref = null;
        }
        if (oldDiffHook) oldDiffHook(vnode);
    };
})();

(async () => {
    const isInitializing = signal(true);
    const fileTree = signal<FileTreeNode[] | null>(null);

    const isNativeFSMounted = signal(false);
    const isNativeFSMountDisabled = signal(true);
    let nativeFSMountRoot: unknown | null = null;

    const handleMountNativeFSClick = async () => {
        isNativeFSMountDisabled.value = true;

        if (isNativeFSMounted.value) {
            // @ts-expect-error
            pyodide.FS.unmount(MOUNT_DIRECTORY);
            pyodide.FS.rmdir(MOUNT_DIRECTORY);

            isNativeFSMounted.value = false;
            isNativeFSMountDisabled.value = false;
            return;
        }

        try {
            if (!confirm("The changes in the directory you pick will be reflected within /mnt and vice versa. Bugs may cause DATA CORRUPTION. Consider picking a new directory just for this application."))
                throw new Error("declined");

            const fileSystemHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            pyodide.FS.mkdirTree(MOUNT_DIRECTORY);
            nativeFSMountRoot = pyodide.FS.mount(pyodide.FS.filesystems.NATIVEFS_ASYNC, {
                fileSystemHandle,
            }, MOUNT_DIRECTORY);
            syncFSFromBacking();
            isNativeFSMounted.value = true;
        } finally {
            isNativeFSMountDisabled.value = false;
        }
    };

    const isCurrentlyExecutingCommand = signal(false);
    const isInterruptExecutionButtonEnabled = signal(false);
    const activateInterruptExecutionButton = debounce(() => {
        isInterruptExecutionButtonEnabled.value = true;
    }, 100);

    effect(() => {
        if (isCurrentlyExecutingCommand.value) {
            activateInterruptExecutionButton();
        } else {
            activateInterruptExecutionButton.cancel();
            isInterruptExecutionButtonEnabled.value = false;
        }
    });

    globalThis.signalExecutionStart = () => {
        isCurrentlyExecutingCommand.value = true;
    };

    globalThis.signalExecutionEnd = () => {
        isCurrentlyExecutingCommand.value = false;
    };

    const handleInterruptExecutionClick = () => {
        interrupt();
    };

    let treeViewAPI: TreeViewAPI<FileTreeNode> | null = null;

    const nodeAndParentsToPath = (node: FileTreeNode | null, parents: FileTreeNode[], ...segments: string[]) =>
        [parents.map(({ name }) => name), node && node.name, ...segments].filter(Boolean).join('/');

    const handleFileTreeNodeAction = (node: FileTreeNode) => {
        // @ts-expect-error Pyodide's FS typings are not comprehensive enough
        let fileContents: Uint8Array<ArrayBuffer> = pyodide.FS.readFile(node.path);
        let url = URL.createObjectURL(new Blob([fileContents]));
        let element = document.createElement('a');
        element.href = url;
        element.download = node.name;
        element.click();
        URL.revokeObjectURL(url);
    };

    const handleNewFileCreation = (node: FileTreeNode | null, parents: FileTreeNode[], name: string, type: 'file' | 'folder') => {
        const path = nodeAndParentsToPath(node, parents, name);
        const absolutePath = pyodide.PATH.join(HOME_DIRECTORY, path);

        if (type === 'file') {
            pyodide.FS.mkdirTree(pyodide.PATH.dirname(absolutePath));
            const stream = pyodide.FS.open(absolutePath, 'w+');
            pyodide.FS.close(stream);

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.addEventListener('change', () => {
                if (!fileInput.files || fileInput.files.length < 1) {
                    return;
                }
                let file = fileInput.files[0];
                let fileReader = new FileReader();
                fileReader.addEventListener('loadend', () => {
                    pyodide.FS.writeFile(absolutePath, new Uint8Array(fileReader.result as ArrayBuffer));
                });
                fileReader.readAsArrayBuffer(file);
            });
            fileInput.click();
        }

        if (type === 'folder') {
            pyodide.FS.mkdirTree(absolutePath);
        }
    };

    const handleFileDeletion = (node: FileTreeNode, parents: FileTreeNode[]) => {
        if (!confirm(`Are you sure you want to delete ${node.children ? 'folder' : 'file'} "${node.name}"? This operation is irreversible.`)) {
            return;
        }

        const path = nodeAndParentsToPath(node, parents);

        const deleteFile = (path: string) => {
            if (pyodide.FS.isDir(pyodide.FS.stat(path, true).mode)) {
                for (const file of pyodide.FS.readdir(path)) {
                    if (file === '.' || file === '..') {
                        continue;
                    }
                    deleteFile(`${path}/${file}`);
                }
                pyodide.FS.rmdir(path);
            } else {
                pyodide.FS.unlink(path);
            }
        };
        deleteFile(pyodide.PATH.join(HOME_DIRECTORY, path));
    };

    const handleFileRename = (node: FileTreeNode, parents: FileTreeNode[], newName: string) => {
        const path = nodeAndParentsToPath(node, parents);
        const newPath = nodeAndParentsToPath(null, parents, newName);

        // @ts-expect-error Pyodide's FS typings are not comprehensive enough
        pyodide.FS.rename(
            pyodide.PATH.join(HOME_DIRECTORY, path),
            pyodide.PATH.join(HOME_DIRECTORY, newPath),
        );
    };

    render(
        <div className="main">
            <PanelContainer
                panels={[
                    {
                        name: 'Terminal',
                        iconName: 'terminal',
                        className: 'terminal-panel',
                        actions: computed(() => [
                            {
                                name: 'Stop',
                                iconName: 'stop-circle',
                                disabled: !isInterruptExecutionButtonEnabled.value,
                                handleAction: handleInterruptExecutionClick,
                            },
                            'showDirectoryPicker' in window && {
                                name: isNativeFSMounted.value ? 'Unmount /mnt' : 'Mount /mnt',
                                disabled: isNativeFSMountDisabled.value,
                                handleAction: handleMountNativeFSClick,
                            },
                        ].filter(truthyFilter)),
                        children: (
                            <div class="panel-content" id="terminal" />
                        ),
                    },

                    {
                        name: '/root',
                        iconName: 'folder-opened',
                        className: 'file-tree-panel',
                        actions: computed(() => [
                            {
                                name: 'Upload file',
                                iconName: 'new-file',
                                iconOnly: true,
                                disabled: fileTree.value === null,
                                handleAction() {
                                    treeViewAPI?.createFile(null).then(({ node, parents, name }) => {
                                        handleNewFileCreation(node, parents, name, 'file');
                                    });
                                },
                            },
                            {
                                name: 'Create folder',
                                iconName: 'new-folder',
                                iconOnly: true,
                                disabled: fileTree.value === null,
                                handleAction() {
                                    treeViewAPI?.createFolder(null).then(({ node, parents, name }) => {
                                        handleNewFileCreation(node, parents, name, 'folder');
                                    });
                                },
                            },
                        ]),
                        children: (
                            <div class="panel-content tree">
                                {computed(() => (
                                    fileTree.value
                                        ? (
                                            <TreeView
                                                nodes={fileTree.value}
                                                emptyTreeMessage="Directory is empty"
                                                actions={[
                                                    {
                                                        name: 'New File...',
                                                        iconName: 'new-file',
                                                        applicable: (node) => !node || !!node.children,
                                                        execute: (node, _parents) => {
                                                            treeViewAPI!.createFile(node).then(({ node, parents, name }) => {
                                                                handleNewFileCreation(node, parents, name, 'file');
                                                            });
                                                        },
                                                    },
                                                    {
                                                        name: 'New Folder...',
                                                        iconName: 'new-file',
                                                        applicable: (node) => !node || !!node.children,
                                                        execute: (node, _parents) => {
                                                            treeViewAPI!.createFolder(node).then(({ node, parents, name }) => {
                                                                handleNewFileCreation(node, parents, name, 'folder');
                                                            });
                                                        },
                                                    },
                                                    {
                                                        name: 'Download',
                                                        iconName: 'save',
                                                        applicable: (node) => !!node && !node.children,
                                                        execute: (node) => handleFileTreeNodeAction(node!),
                                                        showInline: true,
                                                    },
                                                    {
                                                        name: 'Rename...',
                                                        applicable: (node) => !!node,
                                                        execute: (node, parents, nodeAPI) => {
                                                            nodeAPI!.rename().then(({ newName }) => {
                                                                handleFileRename(node!, parents, newName);
                                                            });
                                                        },
                                                    },
                                                    {
                                                        name: 'Delete',
                                                        applicable: (node) => !!node,
                                                        execute: (node, parents) => handleFileDeletion(node!, parents),
                                                    },
                                                ]}
                                                api={(value) => treeViewAPI = value}
                                            />
                                        )
                                        : <i>{computed(() => isInitializing.value ? 'Waiting...' : 'Unavailable')}</i>
                                ))}
                            </div>
                        ),
                    },
                ]}
            />
        </div>,
        document.querySelector('#app')!,
    );

    const xterm = new Terminal(document.getElementById('terminal')!);
    xterm.focus();

    const printText = (text: string, end: string = '\n') => {
        xterm.write(new TextEncoder().encode(text + end));
    };

    const printError = (text: string, end?: string) => {
        printText(`${termColors.bgRed(' Error ')} ${text}`, end);
    };

    const printProgress = (text: string, end?: string) => {
        printText(termColors.dim(text), end);
    };

    printText(termColors.bold('Glasgow Interface Explorer on the Web platform'));
    printText('Experimental software, use at your own risk.');
    printText('All data is processed locally.');
    printText('Files in /root are persisted over reloads.');
    printText('');

    try {
        if (typeof WebAssembly !== "object") {
            throw 'WebAssembly is required but not available.';
        // @ts-expect-error
        } else if (typeof WebAssembly.promising !== "function") {
            throw 'WebAssembly JSPI is required but not available.';
        } else if (typeof navigator.usb !== "object") {
            throw 'WebUSB is required but not available.';
        }
    } catch (errorText: unknown) {
        isInitializing.value = false;
        printError(errorText as string);
        xterm.endSession();
        return;
    }

    printProgress('Loading toolchain...');
    await loadToolchain();

    printProgress('Loading Python...');
    const pyodide = await loadPyodide({
        env: { HOME: HOME_DIRECTORY },
    });

    const interruptBuffer = new Uint8Array(new ArrayBuffer(1));
    const interrupt = () => { interruptBuffer[0] = 2; };
    pyodide.setInterruptBuffer(interruptBuffer);
    xterm.onInterrupt(interrupt);

    const conoutHandler = {
        write(buf: Uint8Array) {
            xterm.write(buf);
            return buf.length;
        },
        isatty: true
    };
    pyodide.setStdout(conoutHandler);
    pyodide.setStderr(conoutHandler);

    pyodide.FS.closeStream(0);
    pyodide.FS.unlink("/dev/stdin");
    // @ts-expect-error
    pyodide.FS.createAsyncInputDevice("/dev", "stdin", () => xterm.read());
    const stdinStream = pyodide.FS.open("/dev/stdin", "r");
    // @ts-expect-error
    if (stdinStream.fd !== 0) throw "stdin fd not zero";
    // broken:
    // stdinStream.tty = { ops: {} };

    const readFileTree = (path: string) => {
        let result = [];
        let names = pyodide.FS.readdir(path);
        for (let name of names) {
            if (name === '.' || name === '..') {
                continue;
            }

            let node: FileTreeNode = {
                name,
                path: `${path}/${name}`,
            };
            let stat = pyodide.FS.stat(node.path, true);
            if (pyodide.FS.isDir(stat.mode)) {
                node.children = readFileTree(node.path);
            }
            result.push(node);
        }
        result.sort((a, b) => {
            return Number(!!b.children) - Number(!!a.children);
        });
        return result;
    };

    globalThis.syncFSFromBacking = async () => {
        if (!nativeFSMountRoot) return;
        return await new Promise((resolve, reject) => {
            pyodide.FS.filesystems.NATIVEFS_ASYNC.syncfs((nativeFSMountRoot as any).mount, true, (error: unknown) => {
                if (error !== null) {
                    console.log('[FS Error]', error);
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    };

    globalThis.syncFSToBacking = async () => {
        if (!nativeFSMountRoot) return;
        return await new Promise((resolve, reject) => {
            pyodide.FS.filesystems.NATIVEFS_ASYNC.syncfs((nativeFSMountRoot as any).mount, false, (error: unknown) => {
                if (error !== null) {
                    console.log('[FS Error]', error);
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    };

    const updateFileTree = () => {
        fileTree.value = readFileTree(HOME_DIRECTORY);
    };
    const queueFileTreeUpdate = (() => {
        let queued = false;
        return () => {
            if (queued) return;
            setTimeout(() => {
                queued = false;
                updateFileTree();
            }, 0);
            queued = true;
        };
    })();

    // @ts-expect-error Pyodide's FS typings are not comprehensive enough
    let trackingDelegate: Record<string, (...args: any) => void> = pyodide.FS.trackingDelegate;
    trackingDelegate['onMakeDirectory'] = (path: string, mode: number) => {
        if (path.startsWith(HOME_DIRECTORY)) {
            queueFileTreeUpdate();
        }
    };
    trackingDelegate['onMakeSymlink'] = (oldPath: string, newPath: string) => {
        if (newPath.startsWith(HOME_DIRECTORY)) {
            queueFileTreeUpdate();
        }
    };
    trackingDelegate['onMovePath'] = (oldPath: string, newPath: string) => {
        if (oldPath.startsWith(HOME_DIRECTORY) || newPath.startsWith(HOME_DIRECTORY)) {
            queueFileTreeUpdate();
        }
    };
    trackingDelegate['onDeletePath'] = (path: string) => {
        if (path.startsWith(HOME_DIRECTORY)) {
            queueFileTreeUpdate();
        }
    };
    trackingDelegate['onCloseFile'] = (path: string) => {
        if (path.startsWith(HOME_DIRECTORY)) {
            queueFileTreeUpdate();
        }
    };

    Object.assign(window, { pyodide });

    pyodide.FS.mkdirTree(HOME_DIRECTORY);
    const homeMountRoot = pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, { autoPersist: true }, HOME_DIRECTORY);
    pyodide.FS.filesystems.IDBFS.syncfs(homeMountRoot.mount, true, (error: unknown) => {
        if (error !== null) {
            console.log('[FS Error]', error);
            return;
        }

        updateFileTree();
    });

    isNativeFSMountDisabled.value = false;

    printProgress('Loading dependencies...');
    await pyodide.loadPackage([
        './whl/micropip-0.10.0-py3-none-any.whl',
        './whl/markupsafe-3.0.2-cp313-cp313-pyodide_2025_0_wasm32.whl',
        './whl/cobs-1.2.1-cp313-cp313-pyodide_2025_0_wasm32.whl',
    ], {
        messageCallback: printProgress,
    });

    printProgress('Loading Glasgow software...');
    await pyodide.runPythonAsync(String.raw`
        import micropip
        await micropip.install('./whl/glasgow-0.1-py3-none-any.whl')

        #from _pyrepl.main import interactive_console
        #interactive_console()
    `);

    isInitializing.value = false;
    await pyodide.runPythonAsync(shell);
})();
