import { escapeHtml, setInnerHtml } from '../dom/index';

export type RadialActionTone = 'on' | 'off' | 'neutral';

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
        const rect = button.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Fan into the quadrant with the most room: the arc runs from the open
        // vertical edge (straight up/down) to the open horizontal edge
        // (straight left/right), so items hug the screen interior.
        const vAngle = cy > vh / 2 ? -PI / 2 : PI / 2;
        let hAngle = cx > vw / 2 ? PI : 0;
        while (hAngle - vAngle > PI) hAngle -= 2 * PI;
        while (hAngle - vAngle < -PI) hAngle += 2 * PI;

        const count = actions.length;
        const radius = Math.min(178, 116 + count * 11);
        const pad = 0.12; // keep items off the exact screen-edge directions

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

/** Gear — open settings. */
export function radialSettingsIcon(): string {
    return `${SVG_OPEN}<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
}

/** Viewfinder/scan — scan the page now. */
export function radialScanIcon(): string {
    return `${SVG_OPEN}<path d="M4 8V6a2 2 0 0 1 2-2h2"></path><path d="M16 4h2a2 2 0 0 1 2 2v2"></path><path d="M20 16v2a2 2 0 0 1-2 2h-2"></path><path d="M8 20H6a2 2 0 0 1-2-2v-2"></path><path d="M4 12h16"></path></svg>`;
}

/** Speaker with sound waves — auto-play audio is on. */
export function radialAudioOnIcon(): string {
    return `${SVG_OPEN}<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"></path><path d="M15.5 8.5a4.5 4.5 0 0 1 0 7"></path><path d="M18.5 5.5a8.5 8.5 0 0 1 0 13"></path></svg>`;
}

/** Muted speaker — auto-play audio is off. */
export function radialAudioMutedIcon(): string {
    return `${SVG_OPEN}<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"></path><path d="m23 9-6 6"></path><path d="m17 9 6 6"></path></svg>`;
}

/** Video filter — toggle YouTube immersion filtering (YouTube only). */
export function radialYoutubeIcon(): string {
    return `${SVG_OPEN}<rect x="3" y="6" width="18" height="12" rx="3"></rect><path d="M10.2 9.6 14.4 12l-4.2 2.4z" fill="currentColor" stroke="none"></path></svg>`;
}
