import type { JPDBCard } from '../app/types';
import { readDeckChoiceCapability, type CardCommandCapability } from '../dom/private-command-capabilities';
import { trustedReaderEventHandler } from '../ui/trusted-interaction';

type MiningControlLabel = (expanded: boolean) => string;
type MiningCardAction = (button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, command: CardCommandCapability) => Promise<void> | void;

const MINING_ACTIONS_CLASS = 'jpdb-reader-actions';
const MINING_COLLAPSED_CLASS = 'jpdb-reader-actions-mining-collapsed';
const DECK_PICKER_OPEN_CLASS = 'jpdb-reader-add-deck-select-open';
const DECK_PICKER_WRAPPER_OPEN_CLASS = 'jpdb-reader-deck-picker-open';
const DECK_PICKER_BLUR_DELAY_MS = 180;

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

export function openDeckPickerForCardAdd(
    button: HTMLButtonElement,
    card: JPDBCard,
    sentence: string | undefined,
    performAction: MiningCardAction,
): boolean {
    const picker = deckPickerForButton(button);
    if (!picker) return false;
    const wrapper = picker.closest<HTMLElement>('.jpdb-reader-mining-details');
    const toggle = wrapper?.querySelector<HTMLButtonElement>('.jpdb-reader-mining-title');
    if (picker.classList.contains(DECK_PICKER_OPEN_CLASS)) {
        picker.hidden = false;
        picker.focus();
        return true;
    }

    const controller = new AbortController();
    const cleanup = (): void => closeDeckPicker(picker, wrapper, toggle, controller);
    picker.addEventListener('change', trustedReaderEventHandler(() => {
        const option = picker.selectedOptions[0];
        const deck = readDeckChoiceCapability(option);
        if (!deck?.id) {
            cleanup();
            return;
        }
        cleanup();
        void performAction(button, card, sentence, {
            kind: 'card-action',
            action: 'add',
            deckSource: deck.source,
            deckId: deck.id,
        });
    }), { signal: controller.signal });
    picker.addEventListener('blur', () => {
        window.setTimeout(() => {
            if (document.activeElement !== picker) cleanup();
        }, DECK_PICKER_BLUR_DELAY_MS);
    }, { once: true, signal: controller.signal });

    showDeckPicker(picker, wrapper, toggle);
    return true;
}

function deckPickerForButton(button: HTMLButtonElement): HTMLSelectElement | null {
    return button
        .closest<HTMLElement>('.jpdb-reader-mining-details')
        ?.querySelector<HTMLSelectElement>('[data-add-deck-select]') ?? null;
}

function closeDeckPicker(
    picker: HTMLSelectElement,
    wrapper: HTMLElement | null | undefined,
    toggle: HTMLButtonElement | null | undefined,
    controller: AbortController,
): void {
    controller.abort();
    picker.classList.remove(DECK_PICKER_OPEN_CLASS);
    picker.hidden = true;
    wrapper?.classList.remove(DECK_PICKER_WRAPPER_OPEN_CLASS);
    toggle?.setAttribute('aria-expanded', 'false');
    picker.selectedIndex = 0;
}

function showDeckPicker(
    picker: HTMLSelectElement,
    wrapper: HTMLElement | null | undefined,
    toggle: HTMLButtonElement | null | undefined,
): void {
    picker.hidden = false;
    picker.classList.add(DECK_PICKER_OPEN_CLASS);
    wrapper?.classList.add(DECK_PICKER_WRAPPER_OPEN_CLASS);
    toggle?.setAttribute('aria-expanded', 'true');
    picker.focus();
    tryShowNativePicker(picker);
}

function tryShowNativePicker(picker: HTMLSelectElement): void {
    const showPicker = (picker as HTMLSelectElement & { showPicker?: () => void }).showPicker;
    if (!showPicker) return;
    try {
        showPicker.call(picker);
    } catch {
        // The temporary visible select remains as the fallback on browsers without a native picker.
    }
}
