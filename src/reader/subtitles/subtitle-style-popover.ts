const POPOVER_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 9;
const POPOVER_MAX_HEIGHT_PX = 520;
const POPOVER_MAX_WIDTH_PX = 282;

export interface SubtitleStylePopoverViewport {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

function currentViewport(): SubtitleStylePopoverViewport {
    const viewport = window.visualViewport;
    return {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
    };
}

export function positionSubtitleStylePopover(
    popover: HTMLElement,
    rail: HTMLElement,
    viewport: SubtitleStylePopoverViewport = currentViewport(),
): void {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const railRect = rail.getBoundingClientRect();
    const viewportRight = viewport.left + viewport.width;
    const viewportBottom = viewport.top + viewport.height;
    const spaceAbove = Math.max(0, railRect.top - viewport.top - POPOVER_GAP_PX - VIEWPORT_MARGIN_PX);
    const spaceBelow = Math.max(0, viewportBottom - railRect.bottom - POPOVER_GAP_PX - VIEWPORT_MARGIN_PX);
    const wantedHeight = Math.min(POPOVER_MAX_HEIGHT_PX, popover.scrollHeight || POPOVER_MAX_HEIGHT_PX);
    const placeAbove = spaceBelow < wantedHeight && spaceAbove > spaceBelow;
    const availableHeight = placeAbove ? spaceAbove : spaceBelow;

    popover.style.top = placeAbove ? 'auto' : 'calc(100% + 8px)';
    popover.style.bottom = placeAbove ? 'calc(100% + 8px)' : 'auto';
    popover.style.maxHeight = `${Math.floor(Math.min(POPOVER_MAX_HEIGHT_PX, availableHeight))}px`;

    const width = Math.min(POPOVER_MAX_WIDTH_PX, Math.max(0, viewport.width - (VIEWPORT_MARGIN_PX * 2)));
    const desiredLeft = Math.min(
        Math.max(railRect.left, viewport.left + VIEWPORT_MARGIN_PX),
        viewportRight - VIEWPORT_MARGIN_PX - width,
    );
    popover.style.left = `${Math.round(desiredLeft - railRect.left)}px`;
    popover.style.right = 'auto';
}
