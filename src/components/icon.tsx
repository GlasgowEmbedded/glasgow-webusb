import type { JSX } from 'preact';
import classNames from 'classnames';

const codiconsSpriteSheetURL = new URL('../../node_modules/@vscode/codicons/dist/codicon.svg', import.meta.url).href;

export interface IconProps extends JSX.SVGAttributes<SVGSVGElement> {
    name: string;
}

export const Icon = ({ name, className, class: classNameAttr, ...other }: IconProps) => {
    return (
        <svg width={16} height={16} className={classNames('icon', className, classNameAttr)} {...other}>
            <use href={`${codiconsSpriteSheetURL}#${name}`} />
        </svg>
    );
};
