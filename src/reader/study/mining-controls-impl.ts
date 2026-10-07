import type { JPDBCard } from '../app/types';
import { readCardUiCommandCapability, type CardCommandCapability } from '../dom/private-command-capabilities';
import { trustedReaderEventHandler } from '../ui/trusted-interaction';

type MiningControlLabel = (expanded: boolean) => string;
type MiningCardAction = (button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, command: CardCommandCapability) => Promise<void> | void;

const MINING_ACTIONS_CLASS = 'jpdb-reader-actions';
const MINING_COLLAPSED_CLASS = 'jpdb-reader-actions-mining-collapsed';
const DECK_PICKER_BLUR_DELAY_MS = 180;
// The picker lives in a closed shadow root: its deck names never reach the page's DOM (ADR-0020).
const DECK_PICKER_STYLE = 'select{box-sizing:border-box;width:100%;height:36px;margin-top:6px;padding:0 8px;border:1px solid var(--jpdb-reader-border);border-radius:8px;background:var(--jpdb-reader-surface);color:var(--jpdb-reader-text);font:600 13px/1 var(--jpdb-reader-font,system-ui)}';

const MINING_DRAWER_SELECTOR = '[data-action="mining-collapse"]';
const DECK_PICKER_SELECTOR = '[data-action="deck-picker"]';
const DECK_PICKER_HOST_CLASS = 'jpdb-reader-deck-picker';

type OpenDeckPicker = {
    readonly host: HTMLElement;
    readonly picker: HTMLSelectElement;
    /** Re-seats the open picker beside the button a re-render put in its owner's place. */
    adopt(button: HTMLButtonElement): void;
    close(): void;
};

const openPickers = new WeakMap<HTMLButtonElement, OpenDeckPicker>();

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
 * A popup re-renders its whole HTML when a provider lands, which rebuilt the action
 * rows under a learner who was mid-choice: the ⋯ overflow collapsed, an open deck
 * picker went with the old button and the next click hit a detached control. Call this
 * before the re-render; the function it returns puts back, on the rebuilt rows, the
 * overflows that were open, every open deck picker (the same element, so its closed
 * shadow root and listeners stay, rebound to the new button) and focus on a row control.
 * Controls pair up by their order in `root`.
 */
export function preserveMiningControls(root: ParentNode, label: MiningControlLabel): (root: ParentNode) => void {
    const drawers = [...root.querySelectorAll<HTMLButtonElement>(MINING_DRAWER_SELECTOR)];
    const expanded = drawers.map(drawer => {
        const actions = drawer.closest(`.${MINING_ACTIONS_CLASS}`);
        return Boolean(actions && !actions.classList.contains(MINING_COLLAPSED_CLASS));
    });
    const pickers = [...root.querySelectorAll<HTMLButtonElement>(DECK_PICKER_SELECTOR)]
        .map(button => openPickers.get(button));
    const focus = focusedActionControl(root, pickers);
    return next => {
        const nextDrawers = [...next.querySelectorAll<HTMLButtonElement>(MINING_DRAWER_SELECTOR)];
        expanded.forEach((open, index) => {
            const drawer = nextDrawers[index];
            if (open && drawer) setMiningControlsExpanded(drawer, true, label);
        });
        const nextAdds = [...next.querySelectorAll<HTMLButtonElement>(DECK_PICKER_SELECTOR)];
        pickers.forEach((open, index) => {
            if (!open) return;
            const button = nextAdds[index];
            if (button) open.adopt(button);
            else open.close();
        });
        focus?.(next);
    };
}

function focusedActionControl(root: ParentNode, pickers: readonly (OpenDeckPicker | undefined)[]): ((next: ParentNode) => void) | null {
    const active = (root as Node).ownerDocument?.activeElement ?? null;
    if (!active || !root.contains(active)) return null;
    const picker = pickers.find(open => open?.host === active);
    if (picker) return () => picker.picker.focus({ preventScroll: true });
    const action = active instanceof HTMLButtonElement && active.closest(`.${MINING_ACTIONS_CLASS}`) ? active.dataset.action : undefined;
    if (!action) return null;
    const selector = `.${MINING_ACTIONS_CLASS} button[data-action="${action}"]`;
    const index = [...root.querySelectorAll(selector)].indexOf(active);
    return next => {
        const current = (next as Node).ownerDocument?.activeElement;
        // A learner who moved on during the render keeps their new place.
        if (current && current !== current.ownerDocument.body && current.isConnected) return;
        next.querySelectorAll<HTMLButtonElement>(selector)[index]?.focus({ preventScroll: true });
    };
}

/**
 * "Add to deck…": opens a picker of the decks its private capability carries,
 * right below the button, and adds the word to the deck the learner picks.
 */
export function openDeckPickerForCardAdd(
    button: HTMLButtonElement,
    card: JPDBCard,
    sentence: string | undefined,
    performAction: MiningCardAction,
): boolean {
    let choices = readCardUiCommandCapability(button)?.choices;
    if (!choices?.length) return false;
    const open = openPickers.get(button);
    if (open?.host.isConnected) {
        open.picker.focus();
        return true;
    }

    const host = document.createElement('div');
    host.className = DECK_PICKER_HOST_CLASS;
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = DECK_PICKER_STYLE;
    const picker = document.createElement('select');
    root.append(style, picker);
    let owner = button;
    const fill = (): void => {
        const label = owner.textContent?.trim() ?? '';
        picker.setAttribute('aria-label', label);
        const placeholder = new Option(label, '', true, true);
        placeholder.disabled = true;
        picker.replaceChildren(placeholder, ...(choices ?? []).map(choice => new Option(choice.label)));
    };
    fill();

    const controller = new AbortController();
    const close = (): void => {
        controller.abort();
        openPickers.delete(owner);
        host.remove();
        owner.setAttribute('aria-expanded', 'false');
    };
    const entry: OpenDeckPicker = {
        host,
        picker,
        close,
        adopt(next) {
            const nextChoices = readCardUiCommandCapability(next)?.choices;
            if (!nextChoices?.length) {
                close();
                return;
            }
            openPickers.delete(owner);
            owner = next;
            choices = nextChoices;
            fill();
            owner.after(host);
            openPickers.set(owner, entry);
            owner.setAttribute('aria-expanded', 'true');
        },
    };
    picker.addEventListener('change', trustedReaderEventHandler(() => {
        const choice = choices?.[picker.selectedIndex - 1];
        close();
        if (!choice) return;
        // Focus goes back to the button that opened the picker, where the
        // save's own focus keeping expects to find it.
        owner.focus({ preventScroll: true });
        void performAction(owner, card, sentence, { kind: 'card-action', action: 'add', deckSource: choice.source, deckId: choice.id });
    }), { signal: controller.signal });
    picker.addEventListener('blur', () => {
        window.setTimeout(() => {
            if (root.activeElement !== picker) close();
        }, DECK_PICKER_BLUR_DELAY_MS);
    }, { signal: controller.signal });

    button.after(host);
    openPickers.set(button, entry);
    button.setAttribute('aria-expanded', 'true');
    picker.focus();
    tryShowNativePicker(picker);
    return true;
}

function tryShowNativePicker(picker: HTMLSelectElement): void {
    const showPicker = (picker as HTMLSelectElement & { showPicker?: () => void }).showPicker;
    if (!showPicker) return;
    try {
        showPicker.call(picker);
    } catch {
        // The visible select stays as the fallback on browsers without a native picker.
    }
}
