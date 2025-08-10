import type { ComponentChildren, RefCallback } from 'preact';
import { useCallback, useMemo, useRef } from 'preact/hooks';
import { computed, useComputed, useSignal, type ReadonlySignal } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { ContextMenu, type TwoDim } from './context-menu';
import { Icon } from './icon';
import { IconMore } from './icon-more';
import { classNames } from '../helpers/class-names';

const resizeObserverCallbacks = new Map<Element, (entry: ResizeObserverEntry) => void>();

const resizeObserver = new ResizeObserver((entries, _observer) => {
    for (const entry of entries) {
        resizeObserverCallbacks.get(entry.target)?.(entry);
    }
});

function useResizeObserverRef(callback: (entry: ResizeObserverEntry) => void): RefCallback<Element> {
    const savedElementRef = useRef<Element | null>(null);

    const refCallback = useCallback((element: Element | null) => {
        if (savedElementRef.current !== null) {
            resizeObserver.unobserve(savedElementRef.current);
            resizeObserverCallbacks.delete(savedElementRef.current);
        }
        savedElementRef.current = element;
        if (savedElementRef.current !== null) {
            resizeObserver.observe(savedElementRef.current);
            resizeObserverCallbacks.set(savedElementRef.current, callback);
        }
    }, [callback]);

    return refCallback;
}

interface PanelAction {
    name: string;
    iconName?: string;
    iconOnly?: boolean;
    disabled: boolean;
    handleAction: (event: Event) => void;
}

interface PanelActionsProps {
    actions?: ReadonlySignal<PanelAction[]>;
}

const PanelActions = ({ actions }: PanelActionsProps) => {
    const numberOfVisibleActions = useSignal(actions?.value.length ?? 0);
    const actionsMenuOpenAtPosition = useSignal<TwoDim | null>(null);

    const visibleActionsWrapperRef = useResizeObserverRef((entry: ResizeObserverEntry) => {
        const wrapper = entry.target as HTMLElement;
        const gap = Number(getComputedStyle(wrapper.children[0]).gap.replace(/px$/, ''));
        const buttons = [...wrapper.children[0].children] as HTMLElement[];
        const hiddenButtons = buttons.filter(element => element.hidden);
        const actions = buttons.slice(0, -1);
        const moreButton = buttons.at(-1)!;

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

    const handleMoreButtonClick = useMemo(() => (event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        actionsMenuOpenAtPosition.value = [rect.right, rect.bottom - 4];
    }, []);

    return (
        <>
            <div ref={visibleActionsWrapperRef} className="panel-visible-actions-wrapper">
                <div className="panel-visible-actions">
                    {computed(() => actions!.value.map((action, idx) => (
                        <button
                            type="button"
                            className="button"
                            hidden={idx >= numberOfVisibleActions.value}
                            disabled={action.disabled}
                            title={action.name}
                            aria-label={action.name}
                            onClick={action.handleAction}
                        >
                            {action.iconName ? <Icon className="aligned-icon" name={action.iconName} /> : null}
                            {!action.iconOnly ? <span>{action.name}</span> : null}
                        </button>
                    )))}
                    <button
                        type="button"
                        className="button"
                        aria-label="More"
                        hidden={computed(() => numberOfVisibleActions.value === actions!.value.length)}
                        onClick={handleMoreButtonClick}
                    >
                        <IconMore class="aligned-icon" />
                    </button>
                </div>
            </div>
            {computed(() => actionsMenuOpenAtPosition.value ? (
                <ContextMenu
                    position={actionsMenuOpenAtPosition.value}
                    items={actions!.value.slice(numberOfVisibleActions.value).map((action) => ({
                        name: action.name,
                        action: (event) => action.handleAction(event),
                    }))}
                    onCancel={() => actionsMenuOpenAtPosition.value = null}
                />
            ) : null)}
        </>
    );
};

interface Panel {
    name: string;
    iconName: string;
    className?: string;
    actions?: ReadonlySignal<PanelAction[]>;
    children?: ComponentChildren;
}

interface PanelContainerProps {
    panels: Panel[];
}

export const PanelContainer = ({ panels }: PanelContainerProps) => {
    const activePanelIdx = useSignal(0);
    const isSinglePanel = useSignal(false);
    const isMultiplePanel = useComputed(() => !isSinglePanel.value);

    const handleResize = useCallback((entry: ResizeObserverEntry) => {
        isSinglePanel.value = entry.borderBoxSize[0].inlineSize <= 600;
    }, []);

    const rootRefCallback = useResizeObserverRef(handleResize);

    return (
        <div
            ref={rootRefCallback}
            className={classNames('panel-container', () => isSinglePanel.value && 'single-panel')}
        >
            <Show when={isSinglePanel}>
                {() => <header className="panel-header">
                    {computed(() => panels.map((panel, idx) => (
                        <button
                            className={classNames('panel-title', panel.className && `${panel.className}-title`, () => activePanelIdx.value === idx && 'active')}
                            aria-label={panel.name}
                            onClick={() => activePanelIdx.value = idx}
                        >
                            <Icon className="aligned-icon" name={panel.iconName} />
                        </button>
                    )))}
                    {computed(() => <PanelActions actions={panels[activePanelIdx.value].actions} />)}
                </header>}
            </Show>
            <div className="panel-grid">
                {panels.map((panel, idx) => (
                    <div
                        className={classNames(
                            'panel',
                            panel.className,
                            () => !isSinglePanel.value && 'padded',
                            () => isSinglePanel.value && activePanelIdx.value !== idx && 'panel-hidden',
                        )}
                    >
                        <Show when={isMultiplePanel}>
                            <header className="panel-header">
                                <h2 className="panel-title active">
                                    <Icon className="aligned-icon" name={panel.iconName} />
                                    <span>{panel.name}</span>
                                </h2>
                                <Show when={computed(() => panel.actions && panel.actions.value.length > 0)}>
                                    {() => <PanelActions actions={panel.actions} />}
                                </Show>
                            </header>
                        </Show>
                        {panel.children}
                    </div>
                ))}
            </div>
        </div>
    );
};
