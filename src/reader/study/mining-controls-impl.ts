import type { JPDBCard } from '../app/types';
import type { CardActionControl } from '../cards/action-operation';
import { readCardUiCommandCapability, type CardCommandCapability } from '../dom/private-command-capabilities';
import { trustedReaderEventHandler } from '../ui/trusted-interaction';
import { FORM_CONTROL_HOST_ATTRIBUTE } from '../ui/form-control-host';
import type { DeckChoice } from '../cards/deck-choice';

type MiningControlLabel = (expanded: boolean) => string;
type MiningCardAction = (control: CardActionControl, card: JPDBCard, sentence: string | undefined, command: CardCommandCapability) => Promise<void> | void;

const MINING_ACTIONS_CLASS = 'jpdb-reader-actions';
const MINING_COLLAPSED_CLASS = 'jpdb-reader-actions-mining-collapsed';
const MINING_DRAWER_SELECTOR = '[data-action="mining-collapse"]';
const DECK_SELECT_CLASS = 'jpdb-reader-deck-select';
// The dropdown lives in a closed shadow root: its deck names never reach the page's DOM (ADR-0020).
const DECK_SELECT_STYLE = ':host{display:block;min-width:0}'
    + 'select{box-sizing:border-box;width:100%;min-height:36px;padding:0 10px;border:1px solid var(--jpdb-reader-accent);border-radius:8px;'
    + 'background:var(--jpdb-reader-surface);color:var(--jpdb-reader-accent-readable);font:600 13px/1.2 var(--jpdb-reader-font,system-ui);cursor:pointer}'
    + 'select:focus-visible{outline:2px solid var(--jpdb-reader-accent);outline-offset:2px}select:disabled{opacity:.6;cursor:progress}';

const deckSelects = new WeakMap<Element, HTMLSelectElement>();

export function toggleMiningControls(button: HTMLButtonElement, label: MiningControlLabel): void {
    const actions = button.closest<HTMLElement>(`.${MINING_ACTIONS_CLASS}`);
    if (!actions) return;
    setMiningControlsExpanded(button, actions.classList.contains(MINING_COLLAPSED_CLASS), label);
}

export function setMiningControlsExpanded(button: HTMLButtonElement, expanded: boolean, label: MiningControlLabel): void {
    const actions = button.closest<HTMLElement>(`.${MINING_ACTIONS_CLASS}`);
    if (!actions) return;
    actions.classList.toggle(MINING_COLLAPSED_CLASS, !expanded);
    button.setAttribute('aria-expanded', String(expanded));
    const text = label(expanded);
    button.setAttribute('aria-label', text);
    button.title = text;
}

/**
 * "Add to deck…" is one dropdown of the decks its private capability carries:
 * choosing a deck saves the word there, and nothing is saved before a choice.
 * Mounts every dropdown placeholder in `root` that has none yet.
 */
export function mountDeckSelects(root: ParentNode, card: JPDBCard, sentence: string | undefined, performAction: MiningCardAction): void {
    for (const host of root.querySelectorAll<HTMLElement>(`.${DECK_SELECT_CLASS}`)) {
        const choices = readCardUiCommandCapability(host)?.choices;
        if (!deckSelects.has(host) && choices?.length) mountDeckSelect(host, choices, card, sentence, performAction);
    }
}

function mountDeckSelect(host: HTMLElement, choices: readonly DeckChoice[], card: JPDBCard, sentence: string | undefined, performAction: MiningCardAction): void {
    const label = host.textContent?.trim() ?? '';
    // delegatesFocus: focusing the host (a modal's focus trap does) lands on the dropdown.
    const root = host.attachShadow({ mode: 'closed', delegatesFocus: true });
    const style = document.createElement('style');
    style.textContent = DECK_SELECT_STYLE;
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    const placeholder = new Option(label, '', true, true);
    placeholder.disabled = true;
    select.append(placeholder, ...choices.map(choice => new Option(choice.label)));
    root.append(style, select);
    host.replaceChildren();
    // Keys typed into the dropdown browse its decks: page shortcuts must not take them.
    host.setAttribute(FORM_CONTROL_HOST_ATTRIBUTE, '');
    deckSelects.set(host, select);
    const choose = (): void => {
        const choice = choices[select.selectedIndex - 1];
        select.selectedIndex = 0;
        if (choice) void addToChosenDeck(host, select, () => performAction(select, card, sentence, {
            kind: 'card-action', action: 'add', deckSource: choice.source, deckId: choice.id,
        }));
    };
    // A closed dropdown moves to the deck a typed letter or an arrow reaches and reports
    // each move as a change, so a save there would go to whichever deck the first letter
    // found. Those moves only browse; Enter saves the deck reached. A deck picked in the
    // open list (a click, a tap, or Enter there) saves at once.
    let browsing = false;
    select.addEventListener('keydown', trustedReaderEventHandler((event: KeyboardEvent) => {
        if (event.key === 'Enter' && select.selectedIndex > 0) {
            event.preventDefault();
            choose();
            return;
        }
        browsing = true;
        setTimeout(() => { browsing = false; });
    }));
    select.addEventListener('change', trustedReaderEventHandler(() => {
        if (!browsing) choose();
    }));
    // A deck browsed to and left unsaved is let go: the list opens on no deck, so picking
    // any deck there is a change that saves.
    const letGo = (): void => { select.selectedIndex = 0; };
    select.addEventListener('pointerdown', letGo);
    select.addEventListener('blur', letGo);
}

async function addToChosenDeck(host: HTMLElement, select: HTMLSelectElement, add: () => Promise<void> | void): Promise<void> {
    // The popup may live in a shadow root (Desktop's OCR layer), so focus is read there.
    const scope = host.getRootNode() as Document | ShadowRoot;
    const focused = scope.activeElement === host;
    await add();
    // The save disables the dropdown, which drops focus, and its refresh may replace
    // it: a keyboard learner keeps their place, unless they moved on meanwhile.
    const active = scope.activeElement;
    if (!focused || (active && active !== host.ownerDocument.body && !active.matches('.jpdb-reader-popover'))) return;
    const hosts = scope.querySelectorAll(`.jpdb-reader-popover .${DECK_SELECT_CLASS}`);
    const current = select.isConnected ? host : hosts[hosts.length - 1];
    // A refreshed popup opens with its overflow closed: the ⋯ toggle is then the place.
    const collapsed = current?.closest(`.${MINING_COLLAPSED_CLASS}`);
    const target = collapsed ? collapsed.querySelector<HTMLElement>(MINING_DRAWER_SELECTOR) : current && deckSelects.get(current);
    target?.focus({ preventScroll: true });
}

const waitingRenders = new WeakMap<ParentNode, { host: Element; render: () => void }>();

/**
 * A popup re-renders its whole HTML when a provider lands, which rebuilt the action rows
 * under the learner. `render` does that here without losing their place: while they are
 * in a deck dropdown in `root` it waits until they leave it (a rebuild would close its
 * list mid-choice), and only the newest waiting render runs, so a caller queues only a
 * render that will still draw. A render that runs puts back the ⋯ overflows that were
 * open, and focus on the rebuilt control that had it, wherever it is in `root`.
 */
export function rerenderAroundMiningControls(root: ParentNode, label: MiningControlLabel, render: () => void): void {
    const choosing = deckSelectInUse(root);
    if (choosing) {
        waitForDeckChoice(root, choosing, () => rerenderAroundMiningControls(root, label, render));
        return;
    }
    waitingRenders.delete(root);
    const restore = preserveMiningControls(root, label);
    render();
    restore();
}

function deckSelectInUse(root: ParentNode): HTMLElement | null {
    const active = (root as Node).ownerDocument?.activeElement as HTMLElement | null | undefined;
    return active?.matches(`.${DECK_SELECT_CLASS}`) && root.contains(active) ? active : null;
}

function waitForDeckChoice(root: ParentNode, host: HTMLElement, render: () => void): void {
    const listening = waitingRenders.get(root)?.host === host;
    waitingRenders.set(root, { host, render });
    if (listening) return;
    // Focus reaches the next control only after focusout. Waiting a task lets the render
    // rebuild that control with focus kept on it, instead of out from under it.
    host.addEventListener('focusout', () => setTimeout(() => {
        const waiting = waitingRenders.get(root);
        if (waiting?.host !== host) return;
        waitingRenders.delete(root);
        waiting.render();
    }), { once: true });
}

// Open overflows pair up with their rebuilt counterparts by order in `root`.
function preserveMiningControls(root: ParentNode, label: MiningControlLabel): () => void {
    const expanded = [...root.querySelectorAll<HTMLButtonElement>(MINING_DRAWER_SELECTOR)].map(drawer => {
        const actions = drawer.closest(`.${MINING_ACTIONS_CLASS}`);
        return Boolean(actions && !actions.classList.contains(MINING_COLLAPSED_CLASS));
    });
    const restoreFocus = preserveFocus(root);
    return () => {
        const drawers = [...root.querySelectorAll<HTMLButtonElement>(MINING_DRAWER_SELECTOR)];
        expanded.forEach((open, index) => {
            const drawer = drawers[index];
            if (open && drawer) setMiningControlsExpanded(drawer, true, label);
        });
        restoreFocus?.();
    };
}

// Whichever control in `root` has focus (Tab from the dropdown may reach the heading or a
// sheet's handle) pairs up with its rebuilt counterpart: the same kind of control, by its
// class, action and link, at the same place. Until that takes focus the popup itself holds
// it, never the page: a rebuilt sheet handle is a control only once the sheet's observer
// has run.
function preserveFocus(root: ParentNode): (() => void) | null {
    const scope = (root as Node).getRootNode() as Document | ShadowRoot;
    const active = scope.activeElement;
    if (!(active instanceof HTMLElement) || active === root || !root.contains(active)) return null;
    const sameKind = (node: Element): boolean => node.classList[0] === active.classList[0]
        && node.getAttribute('data-action') === active.getAttribute('data-action')
        && node.getAttribute('href') === active.getAttribute('href');
    const controls = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(active.localName)].filter(sameKind);
    const index = controls().indexOf(active);
    const focus = (target: HTMLElement): boolean => {
        target.focus({ preventScroll: true });
        return scope.activeElement === target;
    };
    return () => {
        const current = scope.activeElement;
        // A learner who moved on during the render keeps their new place.
        if (current && current !== active.ownerDocument.body && current.isConnected) return;
        const counterpart = controls()[index];
        if (counterpart && focus(counterpart)) return;
        focus(root as HTMLElement);
        if (counterpart) queueMicrotask(() => { if (scope.activeElement === root) focus(counterpart); });
    };
}
