const SITE_POPUPS = '.ytp-popup, .ytp-settings-menu, .ytp-contextmenu, .ytp-tooltip, tp-yt-iron-dropdown, tp-yt-paper-dialog, dialog[open], [role="dialog"], [aria-modal="true"], [role="menu"], [role="tooltip"]';
type PopupRect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;

// A portaled caption escapes the player's clip, but also its native popup
// context. Exclude popup paint from that exceptional surface. Normal captions
// use native stacking and install no observer or animation-frame sampler.
export class SubtitlePopupOcclusion {
    private root?: HTMLElement;
    private observer?: MutationObserver;
    private frame?: number;
    private desired?: HTMLElement;
    private queued = false;
    private clip = '';

    schedule(root: HTMLElement, enabled: boolean): void {
        this.desired = enabled ? root : undefined;
        if (!enabled) { this.release(); return; }
        if (this.queued) return;
        this.queued = true;
        queueMicrotask(() => {
            this.queued = false;
            const desired = this.desired;
            if (!desired) return;
            if (this.root !== desired) {
                this.detach();
                this.root = desired;
                this.observer = new MutationObserver(mutations => {
                    if (mutations.some(mutation => this.concernsPopup(mutation))) this.refresh();
                });
                this.observer.observe(desired.ownerDocument.body, {
                    subtree: true, childList: true, attributes: true,
                    attributeFilter: ['style', 'class', 'hidden', 'open', 'role', 'aria-hidden', 'aria-modal'],
                });
            }
            this.refresh();
        });
    }

    private concernsPopup(mutation: MutationRecord): boolean {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!target || target.closest('[data-jpdb-reader-root], .jpdb-reader-word')) return false;
        if (target.matches(SITE_POPUPS) || target.closest(SITE_POPUPS)) return true;
        if (mutation.type === 'attributes') return Boolean(target.querySelector(SITE_POPUPS));
        return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node instanceof Element
            && !node.closest('[data-jpdb-reader-root]')
            && (node.matches(SITE_POPUPS) || node.querySelector(SITE_POPUPS)));
    }

    private refresh(): void {
        const root = this.root;
        const view = root?.ownerDocument.defaultView;
        if (!root || !view) return;
        const holes: PopupRect[] = [];
        let animating = false;
        for (const popup of root.ownerDocument.querySelectorAll(SITE_POPUPS)) {
            if (popup.closest('[data-jpdb-reader-root]')) continue;
            const rect = popup.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= view.innerWidth || rect.top >= view.innerHeight) continue;
            const style = view.getComputedStyle(popup);
            if (style.visibility !== 'visible') continue;
            animating ||= popup.getAnimations().some(animation => animation.playState === 'running');
            if (Number(style.opacity) === 0) continue;
            // Merge overlapping rectangles so even-odd holes cannot cancel.
            let merged: PopupRect = rect;
            for (let index = 0; index < holes.length;) {
                const other = holes[index];
                if (merged.left <= other.right && merged.right >= other.left
                    && merged.top <= other.bottom && merged.bottom >= other.top) {
                    merged = { left: Math.min(merged.left, other.left), top: Math.min(merged.top, other.top),
                        right: Math.max(merged.right, other.right), bottom: Math.max(merged.bottom, other.bottom) };
                    holes.splice(index, 1);
                    index = 0;
                } else index += 1;
            }
            holes.push(merged);
        }
        let clip = '';
        if (holes.length) {
            const origin = root.getBoundingClientRect();
            const path = (rect: PopupRect): string => `M${rect.left - origin.left} ${rect.top - origin.top}H${rect.right - origin.left}V${rect.bottom - origin.top}H${rect.left - origin.left}Z`;
            clip = `path(evenodd, "${path({ left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight })}${holes.map(path).join('')}")`;
        }
        if (holes.length || animating) {
            if (this.frame === undefined) this.frame = view.requestAnimationFrame(() => {
                this.frame = undefined;
                this.refresh();
            });
        } else if (this.frame !== undefined) {
            view.cancelAnimationFrame(this.frame);
            this.frame = undefined;
        }
        if (this.clip !== clip) {
            root.style.clipPath = clip;
            this.clip = clip;
        }
    }

    release(): void { this.desired = undefined; this.detach(); }

    private detach(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        if (this.frame !== undefined) this.root?.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
        this.frame = undefined;
        if (this.root?.style.clipPath) this.root.style.removeProperty('clip-path');
        this.root = undefined;
        this.clip = '';
    }
}
