import { options } from 'preact';

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
