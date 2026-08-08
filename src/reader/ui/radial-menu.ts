import { escapeHtml, setInnerHtml } from '../dom/index';
import { applyOverlayPageScale, overlayViewport, sourceRectToOverlay } from './page-scale';

export type RadialActionTone = 'on' | 'off' | 'partial' | 'neutral';

export interface RadialAction {
    id: string;
    label: string;
    /** SVG markup, or — when `glyph` is set — plain text rendered as the icon. */
    icon: string;
    glyph?: boolean;
    tone?: RadialActionTone;
    /** Emphasise this action (slightly larger, accent ring). */
    primary?: boolean;
    /** Action is shown but not interactive. */
    disabled?: boolean;
    /** Keep the menu open after activation (toggles re-render their state). */
    keepOpen?: boolean;
    run: () => void;
}

export interface RadialMenuHost {
    /** The live puck element the menu fans out from. */
    getButton: () => HTMLButtonElement | undefined;
    /** Built fresh each open / re-render so toggle state and context stay current. */
    buildActions: () => RadialAction[];
    /** Accessible label for the menu surface. */
    menuLabel: () => string;
}

const ITEM_EXIT_MS = 180;
const PI = Math.PI;
const MIN_GAP = 62;
// Aesthetic reach cap only — the per-item screen-edge clamp in radiusForLayout
// is the real off-screen guard. Sized so the densest menu (YouTube page with a
// subtitle video: 8 items) still fans out at the MIN_GAP finger spacing on a
// roomy screen instead of collapsing items on top of each other.
const MAX_R = 320;
const EDGE = 32;

/**
 * A floating radial menu that grows out of the Yomu puck. Items spring out along
 * a quarter-arc that always points into the open screen quadrant (so a corner
 * puck never throws items off-screen), with a staggered scale-in that mirrors the
 * kanji origin-graph's springy, accent-haloed nodes.
 */
export class RadialMenuController {
    private backdrop?: HTMLDivElement;
    private items = new Map<string, HTMLButtonElement>();
    private state: 'closed' | 'open' | 'closing' = 'closed';
    private listeners?: AbortController;
    private closeTimer?: number;

    constructor(private readonly host: RadialMenuHost) {}

    // fallow-ignore-next-line unused-class-member
    isOpen(): boolean {
        return this.state === 'open';
    }

    toggle(): void {
        if (this.state === 'open') this.close();
        else this.show();
    }

    show(): void {
        const button = this.host.getButton();
        if (!button || this.state === 'open') return;
        window.clearTimeout(this.closeTimer);
        this.teardownDom();

        const actions = this.host.buildActions();
        if (!actions.length) return;

        const backdrop = document.createElement('div');
        backdrop.className = 'jpdb-reader-fab-radial';
        backdrop.dataset.jpdbReaderRoot = 'true';
        backdrop.setAttribute('role', 'menu');
        backdrop.setAttribute('aria-label', this.host.menuLabel());
        document.body.appendChild(backdrop);
        applyOverlayPageScale(backdrop);
        this.backdrop = backdrop;

        this.layout(button, backdrop, actions);
        button.classList.add('jpdb-reader-fab--menu-open');

        this.listeners = new AbortController();
        const { signal } = this.listeners;
        backdrop.addEventListener('pointerdown', event => {
            if (event.target === backdrop) this.close();
        }, { signal });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.close();
            }
        }, { signal, capture: true });
        // The menu is transient: drift would look broken, so dismiss on any
        // viewport change rather than chase the puck.
        window.addEventListener('scroll', this.close, { signal, passive: true });
        window.addEventListener('resize', this.close, { signal, passive: true });

        this.state = 'open';
        // Two frames so the collapsed-at-hub start state is painted before the
        // open transition runs — otherwise items snap straight to their slots.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (this.state === 'open') backdrop.classList.add('is-open');
        }));
    }

    close = (): void => {
        if (this.state !== 'open') return;
        this.state = 'closing';
        this.host.getButton()?.classList.remove('jpdb-reader-fab--menu-open');
        this.listeners?.abort();
        this.listeners = undefined;
        this.backdrop?.classList.remove('is-open');
        this.backdrop?.classList.add('is-closing');
        this.closeTimer = window.setTimeout(() => this.teardownDom(), ITEM_EXIT_MS + 40);
    };

    destroy(): void {
        window.clearTimeout(this.closeTimer);
        this.listeners?.abort();
        this.listeners = undefined;
        this.host.getButton()?.classList.remove('jpdb-reader-fab--menu-open');
        this.teardownDom();
    }

    private teardownDom(): void {
        this.backdrop?.remove();
        this.backdrop = undefined;
        this.items.clear();
        this.state = 'closed';
    }

    private layout(button: HTMLButtonElement, backdrop: HTMLDivElement, actions: RadialAction[]): void {
        const rect = sourceRectToOverlay(button.getBoundingClientRect(), button);
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const { width: vw, height: vh } = overlayViewport();

        // Fan into the quadrant with the most room: the arc runs from the open
        // vertical edge (straight up/down) to the open horizontal edge
        // (straight left/right), so items hug the screen interior.
        const vAngle = cy > vh / 2 ? -PI / 2 : PI / 2;
        let hAngle = cx > vw / 2 ? PI : 0;
        while (hAngle - vAngle > PI) hAngle -= 2 * PI;
        while (hAngle - vAngle < -PI) hAngle += 2 * PI;

        const count = actions.length;
        const pad = count >= 7 ? 0.01 : count >= 5 ? 0.08 : 0.12; // keep dense menus touch-spaced without throwing items off-screen
        const radius = this.radiusForLayout(cx, cy, vw, vh, vAngle, hAngle, count, pad);

        actions.forEach((action, index) => {
            const t = count > 1 ? pad + (1 - 2 * pad) * (index / (count - 1)) : 0.5;
            const angle = vAngle + (hAngle - vAngle) * t;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const item = this.createItem(action, index);
            item.style.left = `${cx}px`;
            item.style.top = `${cy}px`;
            item.style.setProperty('--radial-x', `${x.toFixed(1)}px`);
            item.style.setProperty('--radial-y', `${y.toFixed(1)}px`);
            // Stagger from the hub outward, ordered by distance from the puck so
            // the reveal reads as a single fluid bloom.
            item.style.setProperty('--radial-i', String(index));
            backdrop.appendChild(item);
            this.items.set(action.id, item);
        });
    }

    private radiusForLayout(cx: number, cy: number, vw: number, vh: number, vAngle: number, hAngle: number, count: number, pad: number): number {
        const comfortRadius = 116 + count * 11;
        if (count <= 1) return Math.min(MAX_R, comfortRadius);
        const usableArc = Math.abs(hAngle - vAngle) * (1 - 2 * pad);
        const step = usableArc / (count - 1);
        const targetRadius = Math.max(comfortRadius, Math.min(MAX_R, MIN_GAP / (2 * Math.sin(step / 2))));
        let maxRadius = MAX_R;
        for (let index = 0; index < count; index += 1) {
            const t = count > 1 ? pad + (1 - 2 * pad) * (index / (count - 1)) : 0.5;
            const angle = vAngle + (hAngle - vAngle) * t;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            maxRadius = Math.min(
                maxRadius,
                cos > 0 ? (vw - EDGE - cx) / cos : cos < 0 ? (cx - EDGE) / -cos : Number.POSITIVE_INFINITY,
                sin > 0 ? (vh - EDGE - cy) / sin : sin < 0 ? (cy - EDGE) / -sin : Number.POSITIVE_INFINITY,
            );
        }
        return Math.max(0, Math.min(maxRadius, targetRadius));
    }

    private createItem(action: RadialAction, index: number): HTMLButtonElement {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.radialId = action.id;
        item.setAttribute('role', 'menuitem');
        item.tabIndex = action.disabled ? -1 : 0;
        this.applyActionState(item, action);
        item.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (action.disabled) return;
            action.run();
            if (action.keepOpen) this.refresh();
            else this.close();
        });
        item.addEventListener('keydown', event => this.handleItemKeydown(event, index));
        return item;
    }

    private applyActionState(item: HTMLButtonElement, action: RadialAction): void {
        item.className = 'jpdb-reader-fab-radial-item';
        if (action.primary) item.classList.add('is-primary');
        if (action.disabled) item.classList.add('is-disabled');
        const tone = action.disabled ? 'neutral' : action.tone ?? 'neutral';
        if (tone === 'on') item.classList.add('is-on');
        else if (tone === 'off') item.classList.add('is-off');
        else if (tone === 'partial') item.classList.add('is-partial');
        item.title = action.label;
        item.setAttribute('aria-label', action.label);
        item.setAttribute('aria-disabled', String(Boolean(action.disabled)));
        const iconClass = action.glyph
            ? 'jpdb-reader-fab-radial-icon is-glyph'
            : 'jpdb-reader-fab-radial-icon';
        const label = `<span class="jpdb-reader-fab-radial-label">${escapeHtml(action.label)}</span>`;
        if (action.glyph) {
            setInnerHtml(item, `<span class="${iconClass}">${escapeHtml(action.icon)}</span>${label}`);
        } else {
            setInnerHtml(item, `<span class="${iconClass}">${action.icon}</span>${label}`);
        }
    }

    /** Re-derive tone/label/icon for toggles that kept the menu open. */
    private refresh(): void {
        if (this.state !== 'open') return;
        const actions = this.host.buildActions();
        for (const action of actions) {
            const item = this.items.get(action.id);
            if (item) this.applyActionState(item, action);
        }
    }

    private handleItemKeydown(event: KeyboardEvent, index: number): void {
        const order = Array.from(this.items.values());
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            this.focusItem(order, index + 1);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            event.preventDefault();
            this.focusItem(order, index - 1);
        } else if (event.key === 'Home') {
            event.preventDefault();
            this.focusItem(order, 0);
        } else if (event.key === 'End') {
            event.preventDefault();
            this.focusItem(order, order.length - 1);
        }
    }

    private focusItem(order: HTMLButtonElement[], index: number): void {
        if (!order.length) return;
        const wrapped = (index + order.length) % order.length;
        order[wrapped]?.focus();
    }
}

const SVG_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

/** Power symbol — the on/off master toggle. */
export function radialPowerIcon(): string {
    return `${SVG_OPEN}<path d="M12 4v8"></path><path d="M7.5 7.5a7 7 0 1 0 9 0"></path></svg>`;
}

/** Furigana hidden — the master toggle is in colours/lookups-only mode. */
export function radialFuriganaHiddenIcon(): string {
    return `${SVG_OPEN}<text x="12" y="15.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none">ふ</text><path d="M5 19 19 5"></path></svg>`;
}

/** Paused — all reader annotations are disabled. */
export function radialPausedIcon(): string {
    return `${SVG_OPEN}<path d="M9 5v14"></path><path d="M15 5v14"></path></svg>`;
}

/** Gear — open settings. */
export function radialSettingsIcon(): string {
    return `${SVG_OPEN}<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
}

/** Speaker with sound waves — auto-play audio is on. */
export function radialAudioOnIcon(): string {
    return `${SVG_OPEN}<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"></path><path d="M15.5 8.5a4.5 4.5 0 0 1 0 7"></path><path d="M18.5 5.5a8.5 8.5 0 0 1 0 13"></path></svg>`;
}

/** Muted speaker — auto-play audio is off. */
export function radialAudioMutedIcon(): string {
    return `${SVG_OPEN}<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"></path><path d="m23 9-6 6"></path><path d="m17 9 6 6"></path></svg>`;
}

/** Image/text scan — cycle OCR interaction mode. */
export function radialOcrIcon(): string {
    return `${SVG_OPEN}<rect x="3" y="4" width="18" height="16" rx="2.5"></rect><path d="M7 8h4"></path><path d="M7 12h10"></path><path d="M7 16h7"></path><path d="M15.5 7.5 17 6l1.5 1.5"></path><path d="M17 6v5"></path></svg>`;
}

/** Corner scan frame — OCR is in direct tap/hover mode. */
export function radialOcrOnIcon(): string {
    return `${SVG_OPEN}<path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M7 12h10"></path></svg>`;
}

/** Language-neutral captions — discover subtitle tracks for the active target. */
export function radialCaptionsIcon(): string {
    return `${SVG_OPEN}<rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="M7 10h3"></path><path d="M14 10h3"></path><path d="M7 14h4"></path><path d="M13 14h4"></path></svg>`;
}

/** Video filter — toggle YouTube immersion filtering (YouTube only). */
export function radialYoutubeIcon(): string {
    return `${SVG_OPEN}<rect x="3" y="6" width="18" height="12" rx="3"></rect><path d="M10.2 9.6 14.4 12l-4.2 2.4z" fill="currentColor" stroke="none"></path></svg>`;
}
