import type { JSX } from 'preact';
import { computed, Signal } from "@preact/signals";

type ClassName = string | false | null | undefined

export function classNames(...classNames: (ClassName | JSX.Signalish<ClassName>)[]) {
    return computed(() => {
        return classNames
            .map(className => {
                if (className instanceof Signal) {
                    return className.value;
                }
                return className;
            })
            .filter(Boolean)
            .join(' ');
    });
}
