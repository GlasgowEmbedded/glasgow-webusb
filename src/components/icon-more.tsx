import type { JSX } from 'preact';
import classNames from 'classnames';

export const IconMore = ({ className, class: classNameAttr, ...other }: JSX.SVGAttributes<SVGSVGElement>) => {
    return (
        <svg width="16" height="16" fill="currentColor" className={classNames('icon', className, classNameAttr)} {...other}>
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="14" cy="8" r="1.5" />
        </svg>
    );
};
