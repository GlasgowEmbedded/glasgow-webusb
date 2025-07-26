import type { JSX } from 'preact';
import { computed, ReadonlySignal } from '@preact/signals';
import { Icon } from './icon';
import { classNames } from './helpers/class-names';

export interface AreaAction {
    name: string;
    iconName?: string;
    disabled: boolean;
    handleAction: (event: Event) => void;
}

export interface AreaProps extends JSX.HTMLAttributes<HTMLDivElement> {
    name: string;
    iconName: string;
    helpText?: string;
    actions?: ReadonlySignal<AreaAction[]>;
}

export const Area = ({ name, iconName, helpText, actions, children, ...other }: AreaProps) => {
    return (
        <div {...other} class={classNames('area', other.class, other.className)}>
            <header>
                <h2>
                    <Icon class="aligned-icon" name={iconName} />
                    {name}
                </h2>
                {helpText ? <p>{helpText}</p> : null}
                {computed(() => actions?.value.map(action => (
                    <button
                        type="button"
                        disabled={action.disabled}
                        onClick={action.handleAction}
                    >
                        {action.iconName ? <Icon class="aligned-icon" name={action.iconName} /> : null}
                        {action.name}
                    </button>
                )))}
            </header>
            {children}
        </div>
    );
};
