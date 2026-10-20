import { isYouTubePage } from './subtitle-youtube';
import type { SubtitleElementLayout } from './subtitle-surface';
import { SubtitlePopupOcclusion } from './subtitle-popup-occlusion';

const HOST_CLASS = 'jpdb-subtitle-layer-host';
const youtubeCaptionLayerAdapter = {
    host: (video: HTMLVideoElement) => video.closest<HTMLElement>('#movie_player, .html5-video-player, ytm-player, ytd-player'),
    chromeTier: (host: HTMLElement) => Math.max(0, ...Array.from(host.querySelectorAll('.ytp-chrome-top, .ytp-chrome-bottom'),
        element => Number.parseInt(getComputedStyle(element).zIndex) || 0)) + 1,
};

/** Captions share the player's stacking context; page sheets remain outside it. */
export class SubtitleLayer {
    private host?: HTMLElement;
    private local = false;
    private player?: HTMLElement;
    private floating = false;
    private readonly popupOcclusion = new SubtitlePopupOcclusion();

    sync(root: HTMLElement, video: HTMLVideoElement | undefined, fullscreen: HTMLElement, fullscreenHost?: HTMLElement): boolean {
        const previousHost = this.host;
        const previousLocal = this.local;
        // Own controls must not hold the site's :focus-within player state.
        // The supplied fullscreen parent still bounds a real top-layer host.
        const focused = root.contains(root.ownerDocument.activeElement);
        const floating = focused || (this.captionLeavesFrame(root) ?? this.floating);
        const fallbackHost = fullscreenHost !== document.body && fullscreenHost !== document.documentElement ? fullscreenHost : undefined;
        const player = (video && (isYouTubePage()
            ? youtubeCaptionLayerAdapter.host(video) ?? fallbackHost
            : fallbackHost ?? video.parentElement)) ?? undefined;
        const host = !floating && player && player !== document.body ? player : undefined;
        if (host !== this.host || player !== this.player) {
            this.release();
            this.host = host;
            this.player = player;
            host?.classList.add(HOST_CLASS);
        }
        // Native styles can arrive after the caption's first mount (WebKit).
        // Refresh the derived context, but write only when it actually changes.
        this.local = Boolean(host && ['relative', 'absolute', 'fixed', 'sticky'].includes(getComputedStyle(host).position));
        let tier = 0;
        if (host) {
            // The YouTube Adapter follows native chrome, below its menus.
            tier = isYouTubePage() ? youtubeCaptionLayerAdapter.chromeTier(host) : 0;
        } else {
            // A dragged caption shares the player's outer page tier.
            for (let ancestor: HTMLElement | null = player ?? null; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
                const value = Number.parseInt(getComputedStyle(ancestor).zIndex);
                if (Number.isFinite(value)) tier = value;
            }
        }
        if (root.style.getPropertyValue('--subtitle-layer') !== String(tier)) root.style.setProperty('--subtitle-layer', String(tier));
        this.floating = floating;
        const parent = host ?? fullscreen;
        const moved = root.parentElement !== parent;
        if (moved) {
            let before = host?.querySelector('.ytp-settings-menu, [role="dialog"], [aria-modal="true"], dialog[open], [role="menu"]') ?? null;
            while (before?.parentElement && before.parentElement !== parent) before = before.parentElement;
            const active = root.ownerDocument.activeElement;
            const focused = active instanceof HTMLElement && root.contains(active) ? active : null;
            const moveBefore = (parent as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
            if (moveBefore && root.isConnected && parent.isConnected && root.getRootNode() === parent.getRootNode()) moveBefore.call(parent, root, before);
            else parent.insertBefore(root, before);
            if (focused && root.ownerDocument.activeElement !== focused) focused.focus({ preventScroll: true });
        }
        if (root.classList.contains('jpdb-subtitle-layer-local') !== this.local) root.classList.toggle('jpdb-subtitle-layer-local', this.local);
        this.popupOcclusion.schedule(root, floating);
        return moved || previousHost !== this.host || previousLocal !== this.local;
    }

    private captionLeavesFrame(root: HTMLElement): boolean | undefined {
        const frame = root.getBoundingClientRect();
        if (frame.height <= 0) return undefined;
        const rows = Array.from(root.querySelectorAll('.jpdb-subtitle-primary-row, .jpdb-subtitle-secondary'))
            .map(element => element.getBoundingClientRect()).filter(rect => rect.height > 0);
        // Preserve the portal through an empty cue gap. One CSS pixel allows
        // layout rounding at the edge without repeatedly moving the root.
        return rows.length ? rows.some(rect => rect.top < frame.top - 1 || rect.bottom > frame.bottom + 1) : undefined;
    }

    layout(rect: SubtitleElementLayout): SubtitleElementLayout {
        if (!this.host || !this.local) return rect;
        const hostRect = this.host.getBoundingClientRect();
        const scaleX = hostRect.width && this.host.offsetWidth ? hostRect.width / this.host.offsetWidth : 1;
        const scaleY = hostRect.height && this.host.offsetHeight ? hostRect.height / this.host.offsetHeight : 1;
        return {
            left: (rect.left - hostRect.left) / scaleX - this.host.clientLeft + this.host.scrollLeft,
            top: (rect.top - hostRect.top) / scaleY - this.host.clientTop + this.host.scrollTop,
            width: rect.width / scaleX,
            height: rect.height / scaleY,
        };
    }

    release(): void {
        this.popupOcclusion.release();
        this.host?.classList.remove(HOST_CLASS);
        this.host = undefined;
        this.local = false;
        this.player = undefined;
        this.floating = false;
    }
}
