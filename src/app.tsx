import './preact-hacks';
import { render } from 'preact';
import { computed, effect, signal } from '@preact/signals';
import debounce from 'lodash/debounce';
import termColors from './vendor/terminal-colors';

import { loadToolchain, createController } from './controller';
import { InputOutputMethods } from './controller/proto';
import { Terminal } from './terminal';
import { type FileTreeNode } from './filesystem';

import { PanelContainer } from './components/panel';
import { TreeView, type TreeViewAPI } from './components/tree-view';

import { joinPath } from './helpers/path';
import { truthyFilter } from './helpers/truthy-filter';

import { GLASGOW_WHEEL_URL, HOME_DIRECTORY } from './config';
import shell from './shell.py';

declare global {
    namespace WebAssembly {
        const promising: unknown;
    }

    interface RegExpConstructor {
        escape(string: string): string;
    }
}

(async () => {
    const isInitializing = signal(true);
    const fileTree = signal<FileTreeNode[] | null>(null);

    const isNativeFSMounted = signal(false);
    const isNativeFSMountDisabled = signal(true);

    const handleMountNativeFSClick = async () => {
        isNativeFSMountDisabled.value = true;

        if (isNativeFSMounted.value) {
            await glasgowFS.unmountNativeFS();

            isNativeFSMounted.value = false;
            isNativeFSMountDisabled.value = false;
            return;
        }

        try {
            if (!confirm("The changes in the directory you pick will be reflected within /mnt and vice versa. Bugs may cause DATA CORRUPTION. Consider picking a new directory just for this application."))
                throw new Error("declined");

            const fileSystemHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await glasgowFS.mountNativeFS(fileSystemHandle);
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

    const handleInterruptExecutionClick = () => {
        printText(termColors.reset('^C'), '');
        controller.interrupt();
    };

    let treeViewAPI: TreeViewAPI<FileTreeNode> | null = null;

    const handleFileTreeNodeAction = async (node: FileTreeNode) => {
        let fileContents = await glasgowFS.readFile(node.path);
        let url = URL.createObjectURL(new Blob([fileContents]));
        let element = document.createElement('a');
        element.href = url;
        element.download = node.name;
        element.click();
        URL.revokeObjectURL(url);
    };

    const createNewFile = (node: FileTreeNode | null) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.addEventListener('change', () => {
            if (!fileInput.files || fileInput.files.length < 1) {
                return;
            }
            let file = fileInput.files[0];
            let fileReader = new FileReader();
            fileReader.addEventListener('loadend', () => {
                const fileContents = new Uint8Array(fileReader.result as ArrayBuffer);

                treeViewAPI!.createFile({
                    underNode: node,
                    defaultName: file.name,
                    async execute({ node, parents, name, dryRun }) {
                        await glasgowFS.createPath(joinPath(HOME_DIRECTORY, ...parents, node, name), 'file', fileContents, dryRun);
                    },
                });
            });
            fileReader.readAsArrayBuffer(file);
        });
        fileInput.click();
    };

    const createNewFolder = (node: FileTreeNode | null) => {
        treeViewAPI!.createFolder({
            underNode: node,
            async execute({ node, parents, name, dryRun }) {
                await glasgowFS.createPath(joinPath(HOME_DIRECTORY, ...parents, node, name), 'folder', null, dryRun);
            },
        });
    };

    const handleFileDeletion = async (node: FileTreeNode, parents: FileTreeNode[]) => {
        if (!confirm(`Are you sure you want to delete ${node.children ? 'folder' : 'file'} "${node.name}"? This operation is irreversible.`)) {
            return;
        }

        await glasgowFS.deletePath(joinPath(HOME_DIRECTORY, ...parents, node));
    };

    const handleFileDuplicate = async (node: FileTreeNode, parents: FileTreeNode[]) => {
        let options: (
            | Parameters<NonNullable<typeof treeViewAPI>['createFile']>[0]
            | Parameters<NonNullable<typeof treeViewAPI>['createFolder']>[0]
        ) = {
            underNode: parents.at(-1) ?? null,
            defaultName: node.name,
            async execute({ name, dryRun }) {
                await glasgowFS.duplicatePath(node.path, joinPath(HOME_DIRECTORY, ...parents, name), dryRun);
            },
        };
        if (!node.children) {
            treeViewAPI!.createFile(options);
        } else {
            treeViewAPI!.createFolder(options);
        }
    };

    const handleFileRename = async (node: FileTreeNode, parents: FileTreeNode[], newName: string, dryRun: boolean) => {
        if (['', '.', '..'].includes(newName)) {
            throw 'The file name must not be . or ..';
        }

        const path = joinPath(HOME_DIRECTORY, ...parents, node);
        const newPath = joinPath(HOME_DIRECTORY, ...parents, newName);

        await glasgowFS.renamePath(path, newPath, dryRun);
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
                            'showDirectoryPicker' in window && {
                                name: isNativeFSMounted.value ? 'Unmount /mnt' : 'Mount /mnt',
                                disabled: isNativeFSMountDisabled.value,
                                handleAction: handleMountNativeFSClick,
                            },
                            {
                                name: 'Stop',
                                iconName: 'stop-circle',
                                iconOnly: true,
                                disabled: !isInterruptExecutionButtonEnabled.value,
                                handleAction: handleInterruptExecutionClick,
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
                                    createNewFile(null);
                                },
                            },
                            {
                                name: 'Create folder',
                                iconName: 'new-folder',
                                iconOnly: true,
                                disabled: fileTree.value === null,
                                handleAction() {
                                    createNewFolder(null);
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
                                                            createNewFile(node);
                                                        },
                                                    },
                                                    {
                                                        name: 'New Folder...',
                                                        iconName: 'new-file',
                                                        applicable: (node) => !node || !!node.children,
                                                        execute: (node, _parents) => {
                                                            createNewFolder(node);
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
                                                        name: 'Duplicate...',
                                                        applicable: (node) => !!node,
                                                        execute: (node, parents) => handleFileDuplicate(node!, parents),
                                                    },
                                                    {
                                                        name: 'Rename...',
                                                        applicable: (node) => !!node,
                                                        execute: (node, parents, nodeAPI) => {
                                                            nodeAPI!.rename({
                                                                async execute({ newName, dryRun }) {
                                                                    await handleFileRename(node!, parents, newName, dryRun);
                                                                },
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
    printText(termColors.yellowBright('Experimental software, use at your own risk.'));
    printText('All data is processed locally.');
    printText('Files in /root are persisted over reloads.');
    printText('');

    try {
        if (typeof WebAssembly !== "object") {
            throw 'WebAssembly is required but not available.';
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
    const controller = await createController({
        env: { HOME: HOME_DIRECTORY },
    });

    await controller.handleUSBRequestDevice(async (...args) => {
        await navigator.usb.requestDevice(...args);
    });

    const glasgowFS = await controller.getFileSystem();

    xterm.onInterrupt(() => controller.interrupt());

    await controller.setupInputOutput(new InputOutputMethods({
        read: () => {
            return xterm.read();
        },
        write: (buf: Uint8Array) => {
            xterm.write(buf);
            return buf.length;
        },
        terminalColumns: () => {
            return xterm.columns;
        },
    }));

    await controller.onExecutionStart(() => {
        isCurrentlyExecutingCommand.value = true;
    });

    await controller.onExecutionEnd(() => {
        isCurrentlyExecutingCommand.value = false;
    });

    const updateFileTree = async () => {
        fileTree.value = await glasgowFS.readFileTree(HOME_DIRECTORY);
    };
    await glasgowFS.subscribeToUpdates(new RegExp(`^${RegExp.escape(HOME_DIRECTORY)}(?:\\/|$)`), () => {
        updateFileTree();
    });

    await glasgowFS.mountHome();
    isNativeFSMountDisabled.value = false;

    printProgress('Loading Glasgow software...');

    printText('\x1b[2m', '');
    await controller.install(GLASGOW_WHEEL_URL);
    printText('\x1b[22m', '');

    // await pyodide.runPythonAsync(`
    //     from _pyrepl.main import interactive_console
    //     interactive_console()
    // `);

    isInitializing.value = false;
    await controller.runPythonAsync(shell);
})();
