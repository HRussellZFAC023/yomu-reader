import { menuIcon, type MenuIconName } from './menu-icons';
import { applyOverlayPageScale, overlayViewport, sourceRectToOverlay } from './page-scale';
import { isTrustedReaderInteraction } from './trusted-interaction';

export type RadialActionTone = 'on' | 'off' | 'partial' | 'neutral';

export interface RadialAction {
    id: string;
    label: string;
    /** A shape from the shared menu icon set (also drawn by the toolbar menu). */
    icon: MenuIconName;
    tone?: RadialActionTone;
    /** Emphasise this action (slightly larger, accent ring). */
    primary?: boolean;
    /** Action is shown but not interactive. */
    disabled?: boolean;
    /** Keep the menu open after activation (toggles re-render their state). */
    keepOpen?: boolean;
    /** A returned promise settles when the new state is in place. */
    run: (event?: Event) => void | Promise<void>;
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
        // The state label of the primary item stays visible; CSS anchors it on
        // the side facing the open screen so it never runs off the edge.
        backdrop.dataset.fanX = cx > vw / 2 ? 'left' : 'right';
        backdrop.dataset.fanY = cy > vh / 2 ? 'up' : 'down';

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
            if (!isTrustedReaderInteraction(event)) return;
            event.preventDefault();
            event.stopPropagation();
            if (action.disabled) return;
            const settled = action.run(event);
            if (!action.keepOpen) {
                this.close();
                return;
            }
            this.refresh();
            // Resuming from "off" lands only after its save; show that state, not the one before it.
            if (settled) void settled.then(() => this.refresh(), () => this.refresh());
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
        const icon = document.createElement('span');
        icon.className = 'jpdb-reader-fab-radial-icon';
        icon.append(menuIcon(action.icon));
        const label = document.createElement('span');
        label.className = 'jpdb-reader-fab-radial-label';
        label.textContent = action.label;
        item.replaceChildren(icon, label);
    }

    /** Re-derive tone/label/icon for toggles that kept the menu open. */
    refresh(): void {
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
