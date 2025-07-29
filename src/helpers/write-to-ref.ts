import type { Ref } from 'preact';

export function writeToRef<T>(ref: Ref<T> | undefined, value: T | null) {
    if (typeof ref === 'function') {
        ref(value);
        return () => ref(null);
    } else if (ref !== undefined && ref !== null) {
        ref.current = value;
        return () => void(ref.current = null);
    }
    return () => {};
}
