import type { JSX } from 'preact';
import { batch, computed, ReadonlySignal, useSignal } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { Icon } from './icon';
import { classNames } from './helpers/class-names';
import { useMemo } from 'preact/hooks';

export interface AreaAction {
    name: string;
    iconName?: string;
    iconOnly?: boolean;
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
    const numberOfVisibleActions = useSignal(actions?.value.length ?? 0);
    const isActionsMenuVisible = useSignal(false);
    const actionsMenuPosition = useSignal<[number, number]>([0, 0]);

    const resizeObserver = new ResizeObserver(([entry]) => {
        const wrapper = entry.target as HTMLElement;
        const gap = Number(getComputedStyle(wrapper.children[0]).gap.replace(/px$/, ''));
        const buttons = [...wrapper.children[0].children] as HTMLElement[];
        const hiddenButtons = buttons.filter(element => element.hidden);
        const actions = buttons.slice(0, -1);
        const moreButton = buttons.at(-1);

        for (const button of hiddenButtons) {
            button.hidden = false;
        }

        let cumulativeInlineSize = moreButton.clientWidth;
        let numberOfActionsThatFit = 0;
        for (let idx = 0, len = actions.length; idx < len; idx++) {
            if (cumulativeInlineSize + gap + actions[idx].clientWidth > entry.contentBoxSize[0].inlineSize) {
                break;
            }
            cumulativeInlineSize += gap + actions[idx].clientWidth;
            numberOfActionsThatFit++;
        }

        for (const button of hiddenButtons) {
            button.hidden = true;
        }

        numberOfVisibleActions.value = numberOfActionsThatFit;
    });

    const visibleActionsWrapperRef = (element: HTMLDivElement) => {
        resizeObserver.observe(element);

        return () => {
            resizeObserver.unobserve(element);
        };
    };

    const handleMoreButtonClick = useMemo(() => (event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        batch(() => {
            isActionsMenuVisible.value = true;
            actionsMenuPosition.value = [window.innerWidth - rect.right, rect.bottom];
        });
    }, []);

    return (
        <div {...other} class={classNames('area', other.class, other.className)}>
            <header>
                <h2>
                    <Icon class="aligned-icon" name={iconName} />
                    <span>{name}</span>
                </h2>
                {helpText ? <p>{helpText}</p> : null}
                <Show when={computed(() => actions?.value.length > 0)}>
                    {() => (
                        <>
                            <div ref={visibleActionsWrapperRef} class="area-visible-actions-wrapper">
                                <div class="area-visible-actions">
                                    {computed(() => actions.value.map((action, idx) => (
                                        <button
                                            type="button"
                                            hidden={idx >= numberOfVisibleActions.value}
                                            disabled={action.disabled}
                                            title={action.name}
                                            aria-label={action.name}
                                            onClick={action.handleAction}
                                        >
                                            {action.iconName ? <Icon class="aligned-icon" name={action.iconName} /> : null}
                                            {!action.iconOnly ? <span>{action.name}</span> : null}
                                        </button>
                                    )))}
                                    <button
                                        type="button"
                                        aria-label="More"
                                        hidden={computed(() => numberOfVisibleActions.value === actions.value.length)}
                                        onClick={handleMoreButtonClick}
                                    >
                                        <svg class="icon aligned-icon" width="16" height="16" fill="currentColor">
                                            <circle cx="2" cy="8" r="2" />
                                            <circle cx="8" cy="8" r="2" />
                                            <circle cx="14" cy="8" r="2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            {computed(() => isActionsMenuVisible.value ? (
                                <div
                                    class="area-actions-menu-wrapper"
                                    onClick={() => isActionsMenuVisible.value = false}
                                >
                                    <div class="area-actions-menu" style={{
                                        right: actionsMenuPosition.value[0],
                                        top: actionsMenuPosition.value[1],
                                    }} onClick={(event) => event.stopPropagation()}>
                                        {computed(() => actions.value.slice(numberOfVisibleActions.value).map(action => (
                                            <button
                                                type="button"
                                                disabled={action.disabled}
                                                onClick={(event) => {
                                                    isActionsMenuVisible.value = false;
                                                    action.handleAction(event);
                                                }}
                                            >
                                                {action.iconName ? <Icon class="aligned-icon" name={action.iconName} /> : null}
                                                <span>{action.name}</span>
                                            </button>
                                        )))}
                                    </div>
                                </div>
                            ) : null)}
                        </>
                    )}
                </Show>
            </header>
            {children}
        </div>
    );
};
