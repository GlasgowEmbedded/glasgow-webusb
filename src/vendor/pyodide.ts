import { loadPyodide as originalLoadPyodide } from './pyodide/pyodide';

export const loadPyodide = async (options: Parameters<typeof originalLoadPyodide>[0]): Promise<PyodideAPI> => {
    await import(new URL('./pyodide/pyodide.asm.js', import.meta.url).href);
    return originalLoadPyodide({
        indexURL: '.',
        stdLibURL: new URL('./pyodide/python_stdlib.zip', import.meta.url).href,
        lockFileURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.1/full/pyodide-lock.json',
        ...options
    }) as Promise<PyodideAPI>;
};

import type { PyodideAPI as OriginalPyodideAPI } from './pyodide/pyodide';

// Vendored from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/a3e120322e4ff5b5c6aa19876c5f15d977dc97ef/types/emscripten/index.d.ts
// It is not a module declaration file therefore it will pollute the global namespace if installed.

declare namespace Emscripten {
    interface FileSystemType {
        mount(mount: FS.Mount): FS.FSNode;
        syncfs(mount: FS.Mount, populate: () => unknown, done: (err?: number | null) => unknown): void;
    }
}

declare namespace FS {
    interface Lookup {
        path: string;
        node: FSNode;
    }

    interface Analyze {
        isRoot: boolean;
        exists: boolean;
        error: Error;
        name: string;
        path: Lookup["path"];
        object: Lookup["node"];
        parentExists: boolean;
        parentPath: Lookup["path"];
        parentObject: Lookup["node"];
    }

    interface Mount {
        type: Emscripten.FileSystemType;
        opts: object;
        mountpoint: string;
        mounts: Mount[];
        root: FSNode;
    }

    class FSStream {
        constructor();
        object: FSNode;
        readonly isRead: boolean;
        readonly isWrite: boolean;
        readonly isAppend: boolean;
        flags: number;
        position: number;
        fd?: number;
        nfd?: number;
    }

    interface StreamOps {
        open?: (stream: FSStream) => void;
        close?: (stream: FSStream) => void;
        read?: (stream: FSStream, buffer: Int8Array, offset: number, length: number, position: number) => number;
        readAsync?: (stream: FSStream, buffer: Int8Array, offset: number, length: number, position: number) => Promise<number>;
        write?: (stream: FSStream, buffer: Int8Array, offset: number, length: number, position: number) => number;
        llseek?: (stream: FSStream, offset: number, whence: number) => number;
        pollAsync?: (stream: FSStream, timeout: number) => Promise<number>;
        ioctl?: (stream: FSStream, request: number, varargs: number) => number;
    }

    class FSNode {
        parent: FSNode;
        mount: Mount;
        mounted?: Mount;
        id: number;
        name: string;
        mode: number;
        rdev: number;
        readMode: number;
        writeMode: number;
        constructor(parent: FSNode, name: string, mode: number, rdev: number);
        read: boolean;
        write: boolean;
        readonly isFolder: boolean;
        readonly isDevice: boolean;
    }

    interface NodeOps {
        getattr(node: FSNode): Stats;
        setattr(node: FSNode, attr: Stats): void;
        lookup(parent: FSNode, name: string): FSNode;
        mknod(parent: FSNode, name: string, mode: number, dev: unknown): FSNode;
        rename(oldNode: FSNode, newDir: FSNode, newName: string): void;
        unlink(parent: FSNode, name: string): void;
        rmdir(parent: FSNode, name: string): void;
        readdir(node: FSNode): string[];
        symlink(parent: FSNode, newName: string, oldPath: string): void;
        readlink(node: FSNode): string;
    }

    interface Stats {
        dev: number;
        ino: number;
        mode: number;
        nlink: number;
        uid: number;
        gid: number;
        rdev: number;
        size: number;
        blksize: number;
        blocks: number;
        atime: Date;
        mtime: Date;
        ctime: Date;
        timestamp?: number;
    }

    class ErrnoError extends Error {
        name: "ErronoError";
        errno: number;
        code: string;
        constructor(errno: number);
    }

    let ignorePermissions: boolean;
    let trackingDelegate: {
        onOpenFile(path: string, trackingFlags: number): unknown;
        onCloseFile(path: string): unknown;
        onSeekFile(path: string, position: number, whence: number): unknown;
        onReadFile(path: string, bytesRead: number): unknown;
        onWriteToFile(path: string, bytesWritten: number): unknown;
        onMakeDirectory(path: string, mode: number): unknown;
        onMakeSymlink(oldpath: string, newpath: string): unknown;
        willMovePath(old_path: string, new_path: string): unknown;
        onMovePath(old_path: string, new_path: string): unknown;
        willDeletePath(path: string): unknown;
        onDeletePath(path: string): unknown;
    };
    let tracking: any;
    let genericErrors: Record<number, ErrnoError>;

    //
    // paths
    //
    function lookupPath(
        path: string,
        opts: Partial<{
            follow_mount: boolean;
            /**
             * by default, lookupPath will not follow a symlink if it is the final path component.
             * setting opts.follow = true will override this behavior.
             */
            follow: boolean;
            recurse_count: number;
            parent: boolean;
        }>,
    ): Lookup;
    function getPath(node: FSNode): string;
    function analyzePath(path: string, dontResolveLastLink?: boolean): Analyze;

    //
    // nodes
    //
    function isFile(mode: number): boolean;
    function isDir(mode: number): boolean;
    function isLink(mode: number): boolean;
    function isChrdev(mode: number): boolean;
    function isBlkdev(mode: number): boolean;
    function isFIFO(mode: number): boolean;
    function isSocket(mode: number): boolean;

    //
    // devices
    //
    function major(dev: number): number;
    function minor(dev: number): number;
    function makedev(ma: number, mi: number): number;
    function registerDevice(dev: number, ops: Partial<StreamOps>): void;
    function getDevice(dev: number): { stream_ops: StreamOps };

    //
    // core
    //
    function getMounts(mount: Mount): Mount[];
    function syncfs(populate: boolean, callback: (e: any) => any): void;
    function syncfs(callback: (e: any) => any, populate?: boolean): void;
    function mount(type: Emscripten.FileSystemType, opts: any, mountpoint: string): any;
    function unmount(mountpoint: string): void;

    function mkdir(path: string, mode?: number): FSNode;
    function mkdev(path: string, mode?: number, dev?: number): FSNode;
    function symlink(oldpath: string, newpath: string): FSNode;
    function rename(old_path: string, new_path: string): void;
    function rmdir(path: string): void;
    function readdir(path: string): string[];
    function unlink(path: string): void;
    function readlink(path: string): string;
    function stat(path: string, dontFollow?: boolean): Stats;
    function lstat(path: string): Stats;
    function chmod(path: string, mode: number, dontFollow?: boolean): void;
    function lchmod(path: string, mode: number): void;
    function fchmod(fd: number, mode: number): void;
    function chown(path: string, uid: number, gid: number, dontFollow?: boolean): void;
    function lchown(path: string, uid: number, gid: number): void;
    function fchown(fd: number, uid: number, gid: number): void;
    function truncate(path: string, len: number): void;
    function ftruncate(fd: number, len: number): void;
    function utime(path: string, atime: number, mtime: number): void;
    function open(path: string, flags: string, mode?: number, fd_start?: number, fd_end?: number): FSStream;
    function close(stream: FSStream): void;
    function llseek(stream: FSStream, offset: number, whence: number): number;
    function read(stream: FSStream, buffer: ArrayBufferView, offset: number, length: number, position?: number): number;
    function write(
        stream: FSStream,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position?: number,
        canOwn?: boolean,
    ): number;
    function allocate(stream: FSStream, offset: number, length: number): void;
    function mmap(
        stream: FSStream,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position: number,
        prot: number,
        flags: number,
    ): {
        allocated: boolean;
        ptr: number;
    };
    function ioctl(stream: FSStream, cmd: any, arg: any): any;
    function readFile(path: string, opts: { encoding: "binary"; flags?: string | undefined }): Uint8Array;
    function readFile(path: string, opts: { encoding: "utf8"; flags?: string | undefined }): string;
    function readFile(path: string, opts?: { flags?: string | undefined }): Uint8Array;
    function writeFile(path: string, data: string | ArrayBufferView, opts?: { flags?: string | undefined }): void;

    //
    // module-level FS code
    //
    function cwd(): string;
    function chdir(path: string): void;
    function init(
        input: null | (() => number | null),
        output: null | ((c: number) => any),
        error: null | ((c: number) => any),
    ): void;

    function createLazyFile(
        parent: string | FSNode,
        name: string,
        url: string,
        canRead: boolean,
        canWrite: boolean,
    ): FSNode;
    function createPreloadedFile(
        parent: string | FSNode,
        name: string,
        url: string,
        canRead: boolean,
        canWrite: boolean,
        onload?: () => void,
        onerror?: () => void,
        dontCreateFile?: boolean,
        canOwn?: boolean,
    ): void;
    function createDataFile(
        parent: string | FSNode,
        name: string,
        data: ArrayBufferView,
        canRead: boolean,
        canWrite: boolean,
        canOwn: boolean,
    ): FSNode;
}

interface FSExtensions {
    createAsyncInputDevice(parent: FS.FSNode | string, name: string, input: () => Promise<Uint8Array>): FS.FSNode;
}

declare namespace TTY {
    interface TTY {
        input: [];
        output: [];
        ops: TTYOps;
    }

    interface TTYOps {
        get_char(tty: TTY): number;
        put_char(tty: TTY, val: number): void;
        fsync(tty: TTY): void;
        ioctl_tcgets(tty: TTY): {
            c_iflag: number;
            c_oflag: number;
            c_cflag: number;
            c_lflag: number;
            c_cc: number[];
        };
        ioctl_tcsets(tty: TTY, optional_actions: unknown, data: {
            c_iflag: number;
            c_oflag: number;
            c_cflag: number;
            c_lflag: number;
            c_cc: number[];
        }): void;
        ioctl_tiocgwinsz(tty: TTY): [number, number];
    }

    var stream_ops: FS.StreamOps;
    var default_tty_ops: TTYOps;
}

interface PyodideAPI extends OriginalPyodideAPI {
    FS: PyodideAPI['_module']['FS'];

    _module: {
        HEAP8: Int8Array;
        HEAP16: Int16Array;
        HEAP32: Int32Array;
        HEAPU8: Uint8Array;
        HEAPU16: Uint16Array;
        HEAPU32: Uint32Array;
        HEAPF32: Float32Array;
        HEAPF64: Float64Array;
        HEAP64: BigInt64Array;
        HEAPU64: BigUint64Array;

        FS: typeof FS & FSExtensions & OriginalPyodideAPI['FS'];
        TTY: typeof TTY;
    }
}

export type { PyodideAPI };
export type { PyProxy } from './pyodide/ffi';
