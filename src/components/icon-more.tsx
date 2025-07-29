import type { JSX } from 'preact';
import { classNames } from '../helpers/class-names';

export const IconMore = (props: JSX.SVGAttributes<SVGSVGElement>) => {
    return (
        <svg width="16" height="16" fill="currentColor" {...props} className={classNames('icon', props.class, props.className)}>
            <circle cx="2" cy="8" r="2" />
            <circle cx="8" cy="8" r="2" />
            <circle cx="14" cy="8" r="2" />
        </svg>
    );
};
