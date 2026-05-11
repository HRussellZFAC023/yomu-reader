import { Logger } from './logger';

const log = Logger.scope('BrowserUi');

export function pauseActiveVideo(): void {
    const videos = Array.from(document.querySelectorAll('video'));
    const playable = videos
        .filter(video => video.readyState > 0)
        .sort((a, b) => {
            const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
            const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
            return Number(a.paused) - Number(b.paused) || bArea - aArea;
        });
    const target = playable[0];
    target?.pause();
    log.debug('Pause active video requested', { videos: videos.length, playable: playable.length, paused: Boolean(target) });
}

export function isEditableTarget(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            log.debug('Copied text with Clipboard API', { length: text.length });
            return;
        } catch (error) {
            log.debug('Clipboard API copy failed, falling back', { length: text.length, error });
            // Userscript contexts can deny clipboard even when the API exists.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    log.debug('Copied text with execCommand fallback', { length: text.length });
}

export function normalizePressedKey(key: string): string {
    if (key === ' ') return 'space';
    return key.toLowerCase();
}

export function positionPopover(popover: HTMLElement, anchor?: HTMLElement, fallbackRect?: DOMRect): void {
    const selection = window.getSelection();
    const rect = anchor?.getBoundingClientRect()
        ?? fallbackRect
        ?? (selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : undefined);
    const margin = 8;
    popover.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
    const width = popover.offsetWidth;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const height = popover.offsetHeight;
    const fallbackLeft = (window.innerWidth - width) / 2;
    const fallbackTop = viewportHeight * 0.18;
    if (!rect) {
        popover.style.left = `${Math.max(margin, Math.min(fallbackLeft, viewportWidth - width - margin))}px`;
        popover.style.top = `${Math.max(margin, Math.min(fallbackTop, viewportHeight - height - margin))}px`;
        log.debugThrottled('position-popover', 1000, 'Popover positioned without anchor', { width, height, viewportWidth, viewportHeight });
        return;
    }

    const centeredLeft = rect.left + (rect.width - width) / 2;
    const aboveSpace = Math.max(0, rect.top - margin - 10);
    const belowSpace = Math.max(0, viewportHeight - rect.bottom - margin - 10);
    const preferredVerticalSpace = Math.max(aboveSpace, belowSpace);
    const minimumVerticalHeight = Math.min(180, viewportHeight - margin * 2);
    const canUseVerticalSpace = preferredVerticalSpace >= minimumVerticalHeight;
    const effectiveMaxHeight = canUseVerticalSpace
        ? Math.min(viewportHeight - margin * 2, preferredVerticalSpace)
        : viewportHeight - margin * 2;
    popover.style.maxHeight = `${Math.max(180, effectiveMaxHeight)}px`;
    const effectiveHeight = popover.offsetHeight;
    const sideTop = rect.top + (rect.height - effectiveHeight) / 2;
    const clampLeft = (left: number) => Math.max(margin, Math.min(left, viewportWidth - width - margin));
    const clampTop = (top: number) => Math.max(margin, Math.min(top, viewportHeight - effectiveHeight - margin));
    const candidates = [
        { left: centeredLeft, top: rect.top - effectiveHeight - 10, space: aboveSpace, axis: 'vertical', side: 'above' },
        { left: centeredLeft, top: rect.bottom + 10, space: belowSpace, axis: 'vertical', side: 'below' },
        { left: rect.left - width - 10, top: sideTop, space: rect.left - margin, axis: 'horizontal', side: 'left' },
        { left: rect.right + 10, top: sideTop, space: viewportWidth - rect.right - margin, axis: 'horizontal', side: 'right' },
    ].map(candidate => {
        const left = clampLeft(candidate.left);
        const top = clampTop(candidate.top);
        const overlapsAnchor = left < rect.right + margin
            && left + width > rect.left - margin
            && top < rect.bottom + margin
            && top + effectiveHeight > rect.top - margin;
        const fits = candidate.axis === 'vertical'
            ? candidate.space + 4 >= effectiveHeight
            : candidate.space >= width + 10;
        return {
            left,
            top,
            score: (fits ? 100000 : 0)
                + candidate.space
                + (candidate.axis === 'vertical' ? 30000 : 0)
                + (candidate.side === 'left' ? 15000 : 0)
                - (candidate.side === 'right' ? 10000 : 0)
                - (overlapsAnchor ? 50000 : 0),
        };
    }).sort((a, b) => b.score - a.score);
    const placement = candidates[0];
    popover.style.left = `${placement.left}px`;
    popover.style.top = `${placement.top}px`;
    log.debugThrottled('position-popover', 1000, 'Popover positioned', {
        left: Math.round(placement.left),
        top: Math.round(placement.top),
        score: Math.round(placement.score),
        viewportWidth,
        viewportHeight,
    });
}
