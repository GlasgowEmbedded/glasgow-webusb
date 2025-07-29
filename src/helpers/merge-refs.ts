import type { Ref, RefCallback } from 'preact';
import { writeToRef } from './write-to-ref';

export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
    return (value) => {
        for (const ref of refs) {
            writeToRef(ref, value);
        }
    };
}
