import { SUBTITLE_SECONDARY_CLASS } from './subtitle-rendering';

const SAFE_ZONE_ATTRIBUTE = 'data-jpdb-subtitle-native-control-safe-zone';
const OVERLAY_TARGETS = `.jpdb-subtitle-primary,.jpdb-subtitle-primary .jpdb-reader-word,.${SUBTITLE_SECONDARY_CLASS}-ink,.${SUBTITLE_SECONDARY_CLASS} .jpdb-reader-word`;
const NATIVE_CONTROLS = 'button,[role="button"],a[href],[tabindex]:not([tabindex="-1"])';

function overlaps(first: DOMRect, second: DOMRect): boolean {
    return first.right > second.left && second.right > first.left && first.bottom > second.top && second.bottom > first.top;
}

function isPainted(element: HTMLElement, style = getComputedStyle(element)): boolean {
    return !element.hidden && element.getAttribute('aria-hidden') !== 'true'
        && style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > .01;
}

export function nativePlayerControlRects(surfaces: readonly HTMLElement[], videoRect: DOMRect): DOMRect[] {
    const maxWidth = Math.min(240, Math.max(72, videoRect.width * .42));
    const maxHeight = Math.min(180, Math.max(56, videoRect.height * .28));
    const controls = new Set(surfaces.flatMap(surface => Array.from(surface.querySelectorAll<HTMLElement>(NATIVE_CONTROLS))));
    return Array.from(controls)
        .filter(control => {
            if (control.closest('[data-jpdb-reader-root="true"]') || control.getAttribute('aria-disabled') === 'true' || control.matches(':disabled')) return false;
            const style = getComputedStyle(control);
            return isPainted(control, style) && style.pointerEvents !== 'none';
        })
        .map(control => control.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0 && rect.width <= maxWidth && rect.height <= maxHeight && overlaps(rect, videoRect));
}

/** Read the complete geometry before making any protection writes. */
export function syncSubtitleNativeControlHitProtection(root: HTMLElement | undefined, zones: readonly DOMRect[]): void {
    const targets = Array.from(root?.querySelectorAll<HTMLElement>(OVERLAY_TARGETS) ?? []);
    const protectedTargets = targets.map(target => {
        if (!zones.length) return false;
        const rect = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && zones.some(zone => overlaps(rect, zone));
    });
    for (const [index, target] of targets.entries()) {
        if (protectedTargets[index]) {
            if (!target.hasAttribute(SAFE_ZONE_ATTRIBUTE)) target.setAttribute(SAFE_ZONE_ATTRIBUTE, 'true');
        } else if (target.hasAttribute(SAFE_ZONE_ATTRIBUTE)) target.removeAttribute(SAFE_ZONE_ATTRIBUTE);
    }
}

/** Wide title/header paint reserves rail space without becoming a hit-test control. */
export function subtitleRailReservedRects(surfaces: readonly HTMLElement[], videoRect: DOMRect, controls: readonly DOMRect[] = nativePlayerControlRects(surfaces, videoRect)): DOMRect[] {
    const titles = surfaces.flatMap(surface => Array.from(surface.querySelectorAll<HTMLElement>('.ytp-title, .ytp-chrome-top')));
    return [...controls, ...titles.filter(title=>isPainted(title))
        .map(title => title.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0 && overlaps(rect, videoRect))];
}
