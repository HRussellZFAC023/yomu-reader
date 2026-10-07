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

const openPickers = new WeakMap<HTMLButtonElement, HTMLSelectElement>();

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
 * "Add to deck…": opens a picker of the decks its private capability carries,
 * right below the button, and adds the word to the deck the learner picks.
 */
export function openDeckPickerForCardAdd(
    button: HTMLButtonElement,
    card: JPDBCard,
    sentence: string | undefined,
    performAction: MiningCardAction,
): boolean {
    const choices = readCardUiCommandCapability(button)?.choices;
    if (!choices?.length) return false;
    const open = openPickers.get(button);
    if (open?.isConnected) {
        open.focus();
        return true;
    }

    const host = document.createElement('div');
    host.className = 'jpdb-reader-deck-picker';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = DECK_PICKER_STYLE;
    const picker = document.createElement('select');
    const label = button.textContent?.trim() ?? '';
    picker.setAttribute('aria-label', label);
    const placeholder = new Option(label, '', true, true);
    placeholder.disabled = true;
    picker.append(placeholder, ...choices.map(choice => new Option(choice.label)));
    root.append(style, picker);

    const controller = new AbortController();
    const close = (): void => {
        controller.abort();
        openPickers.delete(button);
        host.remove();
        button.setAttribute('aria-expanded', 'false');
    };
    picker.addEventListener('change', trustedReaderEventHandler(() => {
        const choice = choices[picker.selectedIndex - 1];
        close();
        if (!choice) return;
        // Focus goes back to the button that opened the picker, where the
        // save's own focus keeping expects to find it.
        button.focus({ preventScroll: true });
        void performAction(button, card, sentence, { kind: 'card-action', action: 'add', deckSource: choice.source, deckId: choice.id });
    }), { signal: controller.signal });
    picker.addEventListener('blur', () => {
        window.setTimeout(() => {
            if (root.activeElement !== picker) close();
        }, DECK_PICKER_BLUR_DELAY_MS);
    }, { signal: controller.signal });

    button.after(host);
    openPickers.set(button, picker);
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
