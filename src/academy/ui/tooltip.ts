/**
 * Labels compact Academy controls and presents their explanation above the app
 * chrome. The tooltip is portalled to document.body so panel overflow cannot
 * clip it.
 */
export function setAcademyTooltip(trigger: HTMLElement, label: string): void {
    trigger.setAttribute('aria-label', label);
    trigger.title = label;
    trigger.dataset.tooltip = label;

    let controller = tooltipControllers.get(trigger);
    if (!controller) {
        controller = createTooltipController(trigger);
        tooltipControllers.set(trigger, controller);
    }
    controller.setLabel(label);
}

interface TooltipController {
    setLabel(label: string): void;
    show(): void;
    hide(): void;
    isOpen(): boolean;
}

let activeTooltip: TooltipController | null = null;
let activeTooltipTrigger: HTMLElement | null = null;
let tooltipSequence = 0;
let lastPointerType = '';
const tooltipControllers = new WeakMap<HTMLElement, TooltipController>();

/**
 * Touch parity for icon-only controls (記/読/訳): hover previews on desktop,
 * so on touch the FIRST tap shows the same preview and the SECOND tap acts.
 * Opt-in via data-tooltip-touch-preview so labeled buttons keep one-tap.
 */
document.addEventListener('pointerdown', event => {
    lastPointerType = event.pointerType;
    if (
        event.pointerType === 'touch'
        && activeTooltipTrigger
        && event.target instanceof Node
        && !activeTooltipTrigger.contains(event.target)
    ) activeTooltip?.hide();
}, true);
document.addEventListener('keydown', () => { lastPointerType = ''; }, true);
document.addEventListener('click', event => {
    if (lastPointerType !== 'touch' || !(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLElement>('[data-tooltip-touch-preview]');
    if (!trigger) return;
    const controller = tooltipControllers.get(trigger);
    if (!controller || controller.isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    controller.show();
}, true);

function createTooltipController(trigger: HTMLElement): TooltipController {
    let label = trigger.dataset.tooltip ?? '';
    let tooltip: HTMLDivElement | null = null;
    let describedById: string | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const position = () => {
        if (!tooltip || !trigger.isConnected) return;
        const gap = 8;
        const edge = 8;
        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportWidth = viewport?.width ?? (document.documentElement.clientWidth || window.innerWidth);
        const viewportHeight = viewport?.height ?? (document.documentElement.clientHeight || window.innerHeight);
        const viewportRight = viewportLeft + viewportWidth;
        const viewportBottom = viewportTop + viewportHeight;
        tooltip.style.setProperty('--academy-tooltip-viewport-inline', `${Math.max(0, viewportWidth - edge * 2)}px`);
        tooltip.style.setProperty('--academy-tooltip-viewport-block', `${Math.max(0, viewportHeight - edge * 2)}px`);
        tooltip.dataset.viewportConstrained = String(tooltip.scrollWidth > tooltip.clientWidth);
        const bounds = trigger.getBoundingClientRect();
        const tooltipBounds = tooltip.getBoundingClientRect();
        const headerBounds = trigger.closest<HTMLElement>('.academy-vn-dialogue-header, .academy-vn-log-header')
            ?.getBoundingClientRect();
        const center = Math.min(
            Math.max(bounds.left + bounds.width / 2, viewportLeft + edge + tooltipBounds.width / 2),
            viewportRight - edge - tooltipBounds.width / 2,
        );
        const aboveTop = bounds.top - gap - tooltipBounds.height;
        const overlapsHeader = headerBounds
            ? aboveTop < headerBounds.bottom && bounds.top - gap > headerBounds.top
            : false;
        const fitsAbove = aboveTop >= viewportTop + edge && !overlapsHeader;
        tooltip.dataset.placement = fitsAbove ? 'above' : 'below';
        tooltip.style.left = `${center}px`;
        tooltip.style.top = `${fitsAbove
            ? bounds.top - gap
            : Math.max(
                viewportTop + edge,
                Math.min(bounds.bottom + gap, viewportBottom - edge - tooltipBounds.height),
            )}px`;
    };

    const hide = () => {
        if (!tooltip) return;
        tooltip.remove();
        tooltip = null;
        if (describedById) removeDescription(trigger, describedById);
        describedById = null;
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        window.visualViewport?.removeEventListener('resize', position);
        window.visualViewport?.removeEventListener('scroll', position);
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (activeTooltip === controller) {
            activeTooltip = null;
            activeTooltipTrigger = null;
        }
    };

    const show = () => {
        if (!label || !trigger.isConnected) return;
        if (activeTooltip && activeTooltip !== controller) activeTooltip.hide();
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = `academy-tooltip-${++tooltipSequence}`;
            tooltip.className = 'academy-tooltip';
            tooltip.setAttribute('role', 'tooltip');
            tooltip.dataset.compact = String([...label].length <= 24);
            tooltip.textContent = label;
            document.body.append(tooltip);
            describedById = tooltip.id;
            addDescription(trigger, describedById);
            window.addEventListener('resize', position);
            window.addEventListener('scroll', position, true);
            window.visualViewport?.addEventListener('resize', position);
            window.visualViewport?.addEventListener('scroll', position);
            if (typeof ResizeObserver !== 'undefined') {
                resizeObserver = new ResizeObserver(position);
                resizeObserver.observe(tooltip);
            }
        } else {
            tooltip.textContent = label;
        }
        activeTooltip = controller;
        activeTooltipTrigger = trigger;
        position();
    };

    const controller: TooltipController = {
        setLabel(next) {
            label = next;
            if (tooltip) {
                tooltip.dataset.compact = String([...label].length <= 24);
                tooltip.textContent = label;
                position();
            }
        },
        show,
        hide,
        isOpen: () => tooltip !== null,
    };
    trigger.addEventListener('pointerenter', event => {
        if ((event as PointerEvent).pointerType !== 'touch') show();
    });
    trigger.addEventListener('pointerleave', event => {
        // Touch pointers "leave" at the end of every tap; hiding here would
        // close the first-tap preview before its confirming second tap.
        if ((event as PointerEvent).pointerType !== 'touch') hide();
    });
    trigger.addEventListener('focus', () => {
        if (lastPointerType !== 'touch') show();
    });
    trigger.addEventListener('blur', hide);
    trigger.addEventListener('click', hide);
    trigger.addEventListener('keydown', event => {
        if (event.key === 'Escape') hide();
    });
    return controller;
}

function addDescription(element: HTMLElement, id: string): void {
    const ids = new Set((element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    ids.add(id);
    element.setAttribute('aria-describedby', [...ids].join(' '));
}

function removeDescription(element: HTMLElement, id: string): void {
    const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(candidate => candidate && candidate !== id);
    if (ids.length) element.setAttribute('aria-describedby', ids.join(' '));
    else element.removeAttribute('aria-describedby');
}
