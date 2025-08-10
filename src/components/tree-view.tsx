import { createContext, type Ref } from 'preact';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { computed, type ReadonlySignal, signal, Signal, useSignal, useSignalEffect } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { ContextMenu, type TwoDim } from './context-menu';
import { Icon } from './icon';
import { IconMore } from './icon-more';
import { classNames } from '../helpers/class-names';
import { writeToRef } from '../helpers/write-to-ref';
import { mergeRefs } from '../helpers/merge-refs';
import { modulo } from '../helpers/modulo';

export interface TreeNode {
    name: string;
    children?: TreeNode[];
}

interface TreeNodeAction<N extends TreeNode> {
    name: string;
    iconName?: string;
    applicable: (node: N | null, parents: N[]) => boolean;
    execute: (node: N | null, parents: N[], nodeAPI: TreeNodeAPI | null) => void;
    showInline?: boolean;
}

export interface TreeViewAPI<N extends TreeNode> {
    createFile(underNode: TreeNode | null): Promise<{ node: N | null; parents: N[]; name: string }>;
    createFolder(underNode: TreeNode | null): Promise<{ node: N | null; parents: N[]; name: string }>;
}

interface TreeNodeAPI {
    rename(): Promise<{ newName: string }>;
}

interface TreeRootContextValue {
    rootNodes: TreeNode[];
    nodeElements: Map<TreeNode, HTMLElement>;
    currentlyFocusableNode: Signal<TreeNode | null>;
    creatingNewNode: ReadonlySignal<
        null | ({
            under: TreeNode | null;
            type: 'file' | 'folder';
        } & PromiseWithResolvers<{
            node: TreeNode | null;
            parents: TreeNode[];
            name: string;
        }>)
    >;
    actions: TreeNodeAction<TreeNode>[];
    focus(node: TreeNode | null): void;
    onNewNodeCreation(node: TreeNode | null, parents: TreeNode[], name: string): void;
    cancelNewNodeCreation(): void;
}

const TreeRootContext = createContext<TreeRootContextValue | null>(null);

interface TreeNodeCreationProps {
    creatingType: 'file' | 'folder';
    parents: TreeNode[];
    onConfirm: (name: string) => void;
    onCancel: () => void;
}

const TreeNodeCreationForm = ({ creatingType, parents, onConfirm, onCancel }: TreeNodeCreationProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleBlur = useCallback((event: FocusEvent) => {
        onCancel();
    }, []);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            onCancel();
        }
    }, []);

    const handleSubmit = useCallback((event: SubmitEvent) => {
        event.preventDefault();
        let nameInput = (event.target as HTMLFormElement).elements.namedItem('name') as HTMLInputElement;
        let name = nameInput.value.trim();
        if (!['', '.', '..'].includes(name) && !name.includes('/')) {
            onConfirm(name);
        }
    }, []);

    useLayoutEffect(() => {
        inputRef.current?.focus();
    }, [inputRef.current]);

    return (
        <form className="tree-list-item" onSubmit={handleSubmit}>
            <div className="tree-node-line" style={{ '--level': parents.length }}>
                {creatingType === 'folder' ? (
                    <Icon className="tree-node-chevron" name="chevron-right" />
                ) : null}
                <Icon className="tree-node-icon" name={creatingType === 'folder' ? 'folder' : 'file'} aria-hidden />
                <input
                    ref={inputRef}
                    className="tree-node-name"
                    type="text"
                    name="name"
                    autocomplete="off"
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                />
            </div>
        </form>
    );
};

interface TreeListProps {
    nodes: TreeNode[];
    parents: TreeNode[];
    ref?: Ref<HTMLElement>;
}

const TreeList = ({ nodes, parents, ref }: TreeListProps) => {
    const treeRootContext = useContext(TreeRootContext);
    if (treeRootContext === null) {
        throw new Error('TreeRootContext must be provided');
    }

    const isRoot = parents.length === 0;

    const ulRef = useRef<HTMLUListElement>(null);
    const contextMenuOpenAtPosition = useSignal<TwoDim | null>(null);

    const nodesIncludingNew = useMemo(() => computed<(TreeNode | { creatingType: 'file' | 'folder' })[]>(() => {
        const creatingNewNode = treeRootContext.creatingNewNode.value;
        if (creatingNewNode === null) {
            return nodes;
        }
        if (creatingNewNode.under !== (parents.at(-1) ?? null)) {
            return nodes;
        }
        if (creatingNewNode.type === 'folder') {
            return [{ creatingType: 'folder' }, ...nodes];
        }
        let firstFileIndex = nodes.findIndex(node => !node.children);
        let folders = firstFileIndex !== -1 ? nodes.slice(0, firstFileIndex) : nodes;
        let files = nodes.slice(folders.length);
        return [...folders, { creatingType: 'file' }, ...files];
    }), [nodes]);

    const handleFocus = useCallback((event: FocusEvent) => {
        if (isRoot) {
            treeRootContext.currentlyFocusableNode.value = null;
        }
    }, [isRoot, treeRootContext]);

    const handleContextMenu = useCallback((event: MouseEvent) => {
        event.preventDefault();
        contextMenuOpenAtPosition.value = [event.clientX, event.clientY];
    }, []);

    const handleContextMenuCancel = useCallback(() => {
        ulRef.current?.focus();
        contextMenuOpenAtPosition.value = null;
    }, []);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            let direction = event.key === 'ArrowDown' ? 1 : -1;
            let currentIndex = -1;
            if (treeRootContext.currentlyFocusableNode.value) {
                currentIndex = nodes.indexOf(treeRootContext.currentlyFocusableNode.value);
            }
            let newIndex = currentIndex + direction;
            if (currentIndex === -1) {
                newIndex = direction === 1 ? 0 : -1;
            }
            if (currentIndex !== -1 && newIndex < 0) {
                if (parents.length > 0) {
                    treeRootContext.focus(parents.at(-1)!);
                    event.stopPropagation();
                }
            } else if (currentIndex !== -1 && newIndex >= nodes.length) {
                if (parents.length > 0) {
                    let parentParentChildren = parents.at(-2)?.children ?? treeRootContext.rootNodes;
                    let parentIndex = parentParentChildren.indexOf(parents.at(-1)!);
                    if (parentIndex + 1 < parentParentChildren.length) {
                        treeRootContext.focus(parentParentChildren[parentIndex + 1]);
                        event.stopPropagation();
                    }
                }
            } else {
                newIndex = modulo(newIndex, nodes.length);
                let node = nodes[newIndex];
                if (direction === -1) {
                    while (node.children && node.children.length > 0 && treeRootContext.nodeElements.has(node.children.at(-1)!)) {
                        node = node.children.at(-1)!;
                    }
                }
                treeRootContext.focus(node);
                event.stopPropagation();
            }
        } else if (isRoot && event.key === 'ArrowRight') {
            if (nodes.length > 0 && treeRootContext.currentlyFocusableNode.value === null) {
                treeRootContext.focus(nodes[0]);
            }
        }
    }, [treeRootContext, nodes, isRoot]);

    return (
        <>
            <ul
                ref={mergeRefs(ulRef, ref)}
                className="tree-list"
                role={isRoot ? 'tree' : 'group'}
                tabIndex={computed(() => {
                    if (isRoot) return treeRootContext.currentlyFocusableNode.value === null ? 0 : -1;
                    return undefined;
                })}
                onFocus={handleFocus}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown}
            >
                {computed(() => nodesIncludingNew.value.map((node) => (
                    'creatingType' in node
                        ? (
                            <TreeNodeCreationForm
                                creatingType={node.creatingType}
                                parents={parents}
                                onConfirm={(name) => {
                                    treeRootContext.onNewNodeCreation(parents.at(-1) ?? null, parents.slice(0, -1), name);
                                }}
                                onCancel={() => {
                                    treeRootContext.cancelNewNodeCreation();
                                }}
                            />
                        )
                        : <TreeNodeView node={node} parents={parents} />
                )))}
            </ul>
            <Show when={computed(() => contextMenuOpenAtPosition.value !== null)}>
                {() => (
                    <ContextMenu
                        position={contextMenuOpenAtPosition.value!}
                        items={treeRootContext.actions
                            .filter((action) => action.applicable(parents.at(-1) ?? null, parents.slice(0, -1)))
                            .map((action) => ({
                                name: action.name,
                                action: () => action.execute(parents.at(-1) ?? null, parents.slice(0, -1), null),
                            }))}
                        onCancel={handleContextMenuCancel}
                    />
                )}
            </Show>
        </>
    );
};

interface TreeNodeViewProps {
    node: TreeNode;
    parents: TreeNode[];
}

const TreeNodeView = ({ node, parents, ...other }: TreeNodeViewProps) => {
    const treeRootContext = useContext(TreeRootContext);
    if (treeRootContext === null) {
        throw new Error('TreeRootContext must be provided');
    }

    const ref = useRef<HTMLElement | null>(null);
    const isOpened = useSignal(false);
    const wasLastFocused = useSignal(false);
    const contextMenuOpenAtPosition = useSignal<TwoDim | null>(null);
    const currentlyRenaming = useSignal<PromiseWithResolvers<{ newName: string; }> | null>(null);

    useSignalEffect(() => {
        if (treeRootContext.creatingNewNode.value?.under === node) {
            isOpened.value = true;
        }
    });

    const handleFocus = useCallback((event: FocusEvent) => {
        treeRootContext.currentlyFocusableNode.value = node;
    }, [treeRootContext, node]);

    const handleClick = useCallback((event: MouseEvent) => {
        event.stopPropagation();

        if (node.children) {
            isOpened.value = !isOpened.value;
        }
    }, [treeRootContext, node]);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'ArrowDown' && node.children && node.children.length > 0 && isOpened.value) {
            treeRootContext.focus(node.children[0]);
            event.stopPropagation();
        } else if (event.key === 'ArrowRight' && node.children && event.target === ref.current) {
            if (isOpened.value) {
                if (node.children.length > 0) {
                    treeRootContext.focus(node.children[0]);
                    event.stopPropagation();
                }
            } else {
                isOpened.value = true;
                event.stopPropagation();
            }
        } else if (event.key === 'ArrowLeft') {
            if (!node.children || !isOpened.value) {
                treeRootContext.focus(parents.at(-1) ?? null);
                event.stopPropagation();
            } else {
                isOpened.value = false;
                event.stopPropagation();
            }
        }
    }, [treeRootContext, node, parents]);

    const handleContextMenu = useCallback((event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        wasLastFocused.value = true;
        contextMenuOpenAtPosition.value = [event.clientX, event.clientY];
    }, []);

    const handleContextMenuCancel = useCallback(() => {
        ref.current?.focus();
        wasLastFocused.value = false;
        contextMenuOpenAtPosition.value = null;
    }, []);

    const saveNewName = useCallback((input: HTMLInputElement) => {
        if (!currentlyRenaming.value) {
            return;
        }
        const newName = input.value.trim();
        if (!['', '.', '..'].includes(newName) && !newName.includes('/')) {
            currentlyRenaming.value.resolve({ newName });
            currentlyRenaming.value = null;
        }
    }, [node]);

    const handleInputBlur = useCallback((event: FocusEvent) => {
        if (!currentlyRenaming.value) {
            return;
        }
        saveNewName(event.target as HTMLInputElement);
    }, [saveNewName]);

    const handleInputKeyDown = useCallback((event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
            event.preventDefault();
            saveNewName(event.target as HTMLInputElement);
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            currentlyRenaming.value?.reject('Canceled by user');
            currentlyRenaming.value = null;
        }
    }, [saveNewName]);

    const treeNodeAPI: TreeNodeAPI = {
        rename() {
            currentlyRenaming.value = Promise.withResolvers();
            return currentlyRenaming.value.promise;
        },
    };

    const inlineActions = [];
    const hiddenActions = [];
    for (const action of treeRootContext.actions) {
        if (!action.applicable(node, parents)) {
            continue;
        }
        if (action.showInline && action.iconName) {
            inlineActions.push(action);
        } else {
            hiddenActions.push(action);
        }
    }

    return (
        <li
            ref={mergeRefs(ref, (element) => {
                element ? treeRootContext.nodeElements.set(node, element) : treeRootContext.nodeElements.delete(node);
            })}
            role="treeitem"
            className={classNames('tree-list-item', () => wasLastFocused.value && 'last-focused')}
            aria-expanded={node.children ? isOpened : undefined}
            tabIndex={computed(() => node === treeRootContext.currentlyFocusableNode.value ? 0 : -1)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
        >
            <div
                className="tree-node-line"
                style={{ '--level': parents.length }}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {node.children ? computed(() => (
                    <Icon className="tree-node-chevron" name={isOpened.value ? 'chevron-down' : 'chevron-right'} />
                )) : null}
                {computed(() => (
                    <Icon className="tree-node-icon" name={node.children ? isOpened.value ? 'folder-opened' : 'folder' : 'file'} aria-hidden />
                ))}
                <Show when={currentlyRenaming}>
                    {() => (
                        <input
                            ref={el => {
                                if (el) {
                                    el.focus();
                                    el.setSelectionRange(0, modulo(el.value.lastIndexOf('.'), el.value.length + 1));
                                }
                            }}
                            className="tree-node-name"
                            type="text"
                            defaultValue={node.name}
                            autocomplete="off"
                            onBlur={handleInputBlur}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={handleInputKeyDown}
                        />
                    )}
                </Show>
                <Show when={computed(() => !currentlyRenaming.value)}>
                    <span className="tree-node-name">{node.name}</span>
                </Show>
                <div className="tree-node-actions">
                    {inlineActions.map((action) => (
                        <button
                            type="button"
                            className="button"
                            onClick={() => action.execute(node, parents, treeNodeAPI)}
                        >
                            <Icon className="aligned-icon" name={action.iconName!} />
                            <span className="visually-hidden">{action.name}</span>
                        </button>
                    ))}
                    {hiddenActions.length ? (
                        <button
                            type="button"
                            className="button"
                            onClick={handleContextMenu}
                        >
                            <IconMore class="aligned-icon" />
                            <span className="visually-hidden">More</span>
                        </button>
                    ) : null}
                </div>
            </div>
            <Show when={computed(() => node.children && isOpened.value)}>
                {() => (
                    <TreeList
                        nodes={node.children!}
                        parents={[...parents, node]}
                        {...other}
                    />
                )}
            </Show>
            <Show when={computed(() => contextMenuOpenAtPosition.value !== null)}>
                {() => (
                    <ContextMenu
                        position={contextMenuOpenAtPosition.value!}
                        items={treeRootContext.actions
                            .filter((action) => action.applicable(node, parents))
                            .map((action) => ({
                                name: action.name,
                                action: () => action.execute(node, parents, treeNodeAPI),
                            }))}
                        onCancel={handleContextMenuCancel}
                    />
                )}
            </Show>
        </li>
    );
};

interface TreeViewProps<N extends TreeNode> {
    nodes: N[];
    emptyTreeMessage?: string;
    actions: TreeNodeAction<N>[];
    api: Ref<TreeViewAPI<N>>;
}

export const TreeView = <N extends TreeNode>({ nodes, emptyTreeMessage, actions, ...other }: TreeViewProps<N>) => {
    const rootListRef = useRef<HTMLElement>(null);
    const nodeElements = useRef(new Map<TreeNode, HTMLElement>());
    const currentlyFocusableNode = useMemo(() => signal<TreeNode | null>(null), [nodes]);
    const creatingNewNode = useSignal<TreeRootContextValue['creatingNewNode']['value']>(null);
    const showEmptyMessage = useMemo(() => computed(() => nodes.length === 0 && creatingNewNode.value === null), [nodes]);

    const treeRootContextValue = useMemo(() => ({
        rootNodes: nodes,
        currentlyFocusableNode,
        nodeElements: nodeElements.current,
        creatingNewNode,
        actions: actions as TreeNodeAction<TreeNode>[],

        focus(node) {
            treeRootContextValue.currentlyFocusableNode.value = node;
            if (node) {
                treeRootContextValue.nodeElements.get(node)?.focus();
            } else {
                rootListRef.current?.focus();
            }
        },

        onNewNodeCreation(node, parents, name) {
            creatingNewNode.value?.resolve({ node, parents, name });
            creatingNewNode.value = null;
        },

        cancelNewNodeCreation() {
            creatingNewNode.value?.reject('Canceled by user');
            creatingNewNode.value = null;
        },
    }) satisfies TreeRootContextValue, [
        nodes,
        currentlyFocusableNode,
        nodeElements.current,
        creatingNewNode,
        actions,
    ]);

    const api = useMemo(() => ({
        createFile(underNode) {
            creatingNewNode.value = { under: underNode ?? currentlyFocusableNode.value, type: 'file', ...Promise.withResolvers() };
            return creatingNewNode.value.promise as ReturnType<TreeViewAPI<N>['createFile']>;
        },

        createFolder(underNode) {
            creatingNewNode.value = { under: underNode ?? currentlyFocusableNode.value, type: 'folder', ...Promise.withResolvers() };
            return creatingNewNode.value.promise as ReturnType<TreeViewAPI<N>['createFolder']>;
        },
    }) satisfies TreeViewAPI<N>, [treeRootContextValue, currentlyFocusableNode]);

    useEffect(() => {
        return writeToRef(other.api, api);
    }, [other.api, api]);

    return (
        <TreeRootContext value={treeRootContextValue}>
            <Show when={showEmptyMessage}>
                <i>{emptyTreeMessage ?? 'No entries'}</i>
            </Show>
            <Show when={computed(() => !showEmptyMessage.value)}>
                <TreeList ref={rootListRef} nodes={nodes} parents={[]} />
            </Show>
        </TreeRootContext>
    );
};
