import type { JSX } from 'preact';
import { computed, Signal } from '@preact/signals';

type ClassName = string | false | null | undefined

export function classNames(...classNames: (ClassName | JSX.Signalish<ClassName> | (() => ClassName))[]) {
    return computed(() => {
        return classNames
            .map(className => {
                if (typeof className === 'function') {
                    return className();
                } else if (className instanceof Signal) {
                    return className.value;
                } else {
                    return className;
                }
            })
            .filter(Boolean)
            .join(' ');
    });
}
