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
    // Typing a deck's name picks it: page shortcuts must not take those keys.
    host.setAttribute(FORM_CONTROL_HOST_ATTRIBUTE, '');
    deckSelects.set(host, select);
    select.addEventListener('change', trustedReaderEventHandler(() => {
        const choice = choices[select.selectedIndex - 1];
        select.selectedIndex = 0;
        if (choice) void addToChosenDeck(host, select, () => performAction(select, card, sentence, {
            kind: 'card-action', action: 'add', deckSource: choice.source, deckId: choice.id,
        }));
    }));
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

/** The dropdown placeholder a learner is using in `root`, if any: a popup must not rebuild under it. */
export function deckSelectInUse(root: ParentNode): HTMLElement | null {
    const active = (root as Node).ownerDocument?.activeElement as HTMLElement | null | undefined;
    return active?.matches(`.${DECK_SELECT_CLASS}`) && root.contains(active) ? active : null;
}

/**
 * A popup re-renders its whole HTML when a provider lands, which rebuilt the action
 * rows under the learner: the ⋯ overflow collapsed and focus fell to the page. Call
 * this before the re-render; the function it returns puts back, on the rebuilt rows,
 * the overflows that were open and focus on a row control. Controls pair up by their
 * order in `root`.
 */
export function preserveMiningControls(root: ParentNode, label: MiningControlLabel): (root: ParentNode) => void {
    const expanded = [...root.querySelectorAll<HTMLButtonElement>(MINING_DRAWER_SELECTOR)].map(drawer => {
        const actions = drawer.closest(`.${MINING_ACTIONS_CLASS}`);
        return Boolean(actions && !actions.classList.contains(MINING_COLLAPSED_CLASS));
    });
    const restoreFocus = focusedActionControl(root);
    return next => {
        const drawers = [...next.querySelectorAll<HTMLButtonElement>(MINING_DRAWER_SELECTOR)];
        expanded.forEach((open, index) => {
            const drawer = drawers[index];
            if (open && drawer) setMiningControlsExpanded(drawer, true, label);
        });
        restoreFocus?.(next);
    };
}

function focusedActionControl(root: ParentNode): ((next: ParentNode) => void) | null {
    const active = (root as Node).ownerDocument?.activeElement ?? null;
    if (!active || !root.contains(active) || !active.closest(`.${MINING_ACTIONS_CLASS}`)) return null;
    const selector = active.matches(`.${DECK_SELECT_CLASS}`)
        ? `.${MINING_ACTIONS_CLASS} .${DECK_SELECT_CLASS}`
        : active instanceof HTMLElement && active.localName === 'button' && active.dataset.action
            ? `.${MINING_ACTIONS_CLASS} button[data-action="${active.dataset.action}"]`
            : '';
    if (!selector) return null;
    const index = [...root.querySelectorAll(selector)].indexOf(active);
    return next => {
        const current = (next as Node).ownerDocument?.activeElement;
        // A learner who moved on during the render keeps their new place.
        if (current && current !== current.ownerDocument.body && current.isConnected) return;
        const control = next.querySelectorAll<HTMLElement>(selector)[index];
        (control && deckSelects.get(control) || control)?.focus({ preventScroll: true });
    };
}
