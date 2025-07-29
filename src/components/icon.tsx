import type { JSX } from 'preact';
import { classNames } from '../helpers/class-names';

const codiconsSpriteSheetURL = new URL('../../node_modules/@vscode/codicons/dist/codicon.svg', import.meta.url).href;

export interface IconProps extends JSX.SVGAttributes<SVGSVGElement> {
    name: string;
}

export const Icon = ({ name, ...other }: IconProps) => {
    return (
        <svg width={16} height={16} {...other} class={classNames('icon', other.class, other.className)}>
            <use href={`${codiconsSpriteSheetURL}#${name}`} />
        </svg>
    );
};
