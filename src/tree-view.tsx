import { computed, useSignal } from '@preact/signals';
import { Icon } from './icon';
import { Show } from '@preact/signals/utils';
import { useMemo } from 'preact/hooks';

export interface TreeNode<N extends TreeNode<N>> {
    name: string;
    children?: N[];
}

interface TreeViewContext<N extends TreeNode<N>> {
    level?: number;
    handleNodeAction: (event: Event, node: N) => void;
}

interface TreeNodeViewProps<N extends TreeNode<N>> extends TreeViewContext<N> {
    node: N;
}

const TreeNodeView = <N extends TreeNode<N>>({ node, level, ...other }: TreeNodeViewProps<N>) => {
    const isOpened = useSignal(true);

    const handleClick = useMemo(() => (event: MouseEvent) => {
        event.stopPropagation();

        if (node.children) {
            isOpened.value = !isOpened.value;
        } else {
            other.handleNodeAction(event, node);
        }
    }, []);

    return (
        <li role="treeitem" aria-expanded={isOpened}>
            <div class="tree-node-line" style={{ '--level': level }} onClick={handleClick} tabIndex={-1}>
                <Show when={computed(() => !!node.children)}>
                    <Icon class="tree-node-chevron" name={isOpened.value ? 'chevron-down' : 'chevron-right'} />
                </Show>
                {computed(() => (
                    <Icon class="tree-node-icon" name={node.children ? isOpened.value ? 'folder-opened' : 'folder' : 'file'} aria-hidden />
                ))}
                <span class="tree-node-name">{node.name}</span>
            </div>
            <Show when={computed(() => node.children && isOpened.value)}>
                {() => <TreeView nodes={node.children} level={level + 1} {...other} />}
            </Show>
        </li>
    );
};

interface TreeViewProps<N extends TreeNode<N>> extends TreeViewContext<N> {
    nodes: N[];
    emptyTreeMessage?: string;
}

export const TreeView = <N extends TreeNode<N>>({ nodes, emptyTreeMessage, level = 0, ...other }: TreeViewProps<N>) => {
    if (nodes.length === 0) {
        if (level === 0) {
            return <i>{emptyTreeMessage ?? 'No entries'}</i>;
        }
        return null;
    }

    return (
        <ul role={level === 0 ? 'tree' : 'group'}>
            {nodes.map(node => (
                <TreeNodeView node={node} level={level} {...other} />
            ))}
        </ul>
    );
};
