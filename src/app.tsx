import { render } from 'preact';
import { computed, effect, signal } from '@preact/signals';
import { loadToolchain } from './toolchain';
import { loadPyodide } from './pyodide';
import { Area } from './area';
import { Terminal } from './terminal';
import { TreeNode, TreeView } from './tree-view';
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

interface FileTreeNode extends TreeNode<FileTreeNode> {
    path: string;
}

(async () => {
    const isInitializing = signal(true);
    const fileTree = signal<FileTreeNode[] | null>(null);

    const isNativeFSMounted = signal(false);
    const isNativeFSMountDisabled = signal(true);

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
            pyodide.FS.mount(pyodide.FS.filesystems.NATIVEFS_ASYNC, {
                fileSystemHandle,
                autoPersist: true
            }, MOUNT_DIRECTORY);
            syncFSFromBacking();
            isNativeFSMounted.value = true;
        } finally {
            isNativeFSMountDisabled.value = false;
        }
    };

    const isCurrentlyExecutingCommand = signal(false);
    const isInterruptExecutionButtonEnabled = signal(false);
    let interruptExecutionButtonActivationTimeout: number | null = null;

    effect(() => {
        if (isCurrentlyExecutingCommand.value) {
            interruptExecutionButtonActivationTimeout = setTimeout(() => {
                isInterruptExecutionButtonEnabled.value = true;
            }, 100);
        } else {
            if (interruptExecutionButtonActivationTimeout !== null) {
                clearTimeout(interruptExecutionButtonActivationTimeout);
                interruptExecutionButtonActivationTimeout = null;
            }
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

    const handleFileTreeNodeAction = (event: Event, node: FileTreeNode) => {
        // @ts-expect-error Pyodide's FS typings are not comprehensive enough
        let fileContents: Uint8Array = pyodide.FS.readFile(node.path);
        let url = URL.createObjectURL(new Blob([fileContents]));
        let element = document.createElement('a');
        element.href = url;
        element.download = node.name;
        element.click();
        URL.revokeObjectURL(url);
    };

    render(
        <>
            <Area
                id="terminal-area"
                name="Terminal"
                iconName="terminal"
                actions={computed(() => [
                    {
                        name: 'Stop execution',
                        iconName: 'stop-circle',
                        disabled: !isInterruptExecutionButtonEnabled.value,
                        handleAction: handleInterruptExecutionClick,
                    },
                    'showDirectoryPicker' in window && {
                        name: isNativeFSMounted.value ? 'Unmount /mnt' : 'Mount /mnt',
                        disabled: isNativeFSMountDisabled.value,
                        handleAction: handleMountNativeFSClick,
                    },
                ].filter(Boolean))}
            >
                <div class="area-content" id="terminal" />
            </Area>
            <Area
                id="file-tree-area"
                name="/root"
                iconName="folder-opened"
                helpText="Persisted over reloads"
            >
                <div class="area-content file-tree">
                    {computed(() => (
                        fileTree.value
                            ? (
                                <TreeView
                                    nodes={fileTree.value}
                                    emptyTreeMessage="Directory is empty"
                                    handleNodeAction={handleFileTreeNodeAction}
                                />
                            )
                            : <i>{computed(() => isInitializing.value ? 'Waiting...' : 'Unavailable')}</i>
                    ))}
                </div>
            </Area>
        </>,
        document.querySelector('.main'),
    );

    const xterm = new Terminal(document.getElementById('terminal'));
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

    printText(termColors.bold('Glasgow via WebUSB'));
    printText('Experimental software, use at your own risk.');
    printText('All data is processed locally.');
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

    globalThis.syncFSFromBacking = () => new Promise((resolve, reject) => {
        pyodide.FS.syncfs(true, (error) => {
            if (error !== null) {
                console.log('[FS Error]', error);
                reject(error);
                return;
            }

            resolve();
        });
    });

    globalThis.syncFSToBacking = () => new Promise((resolve, reject) => {
        pyodide.FS.syncfs(false, (error) => {
            if (error !== null) {
                console.log('[FS Error]', error);
                reject(error);
                return;
            }

            resolve();
        });
    });

    pyodide.FS.mkdirTree(HOME_DIRECTORY);
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, { autoPersist: true }, HOME_DIRECTORY);
    syncFSFromBacking().then(() => {
        fileTree.value = readFileTree('/root');
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
