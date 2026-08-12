// ADR-0003 core import-severing: the mining drawer/deck-picker DOM helpers ship
// in the Yomu Kanji/Study companion; this facade keeps core call sites stable.
import { yomuKanjiStudyCompanion } from '../companions/registry';
import type { JPDBCard } from '../app/types';
import type { CardCommandCapability } from '../dom/private-command-capabilities';

type MiningControlLabel = (expanded: boolean) => string;
type MiningCardAction = (button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, command: CardCommandCapability) => Promise<void> | void;

export function toggleMiningControls(button: HTMLButtonElement, label: MiningControlLabel): void {
    yomuKanjiStudyCompanion()?.toggleMiningControls?.(button, label);
}

export function setMiningControlsExpanded(button: HTMLButtonElement, expanded: boolean, label: MiningControlLabel): void {
    yomuKanjiStudyCompanion()?.setMiningControlsExpanded?.(button, expanded, label);
}

export function openDeckPickerForCardAdd(
    button: HTMLButtonElement,
    card: JPDBCard,
    sentence: string | undefined,
    performAction: MiningCardAction,
): boolean {
    return yomuKanjiStudyCompanion()?.openDeckPickerForCardAdd?.(button, card, sentence, performAction) ?? false;
}
