// ADR-0003 core import-severing: the mining drawer/deck-picker DOM helpers ship
// in the Yomu Kanji/Study companion; this facade keeps core call sites stable.
import { yomuKanjiStudyCompanion } from '../companions/registry';
import type { JPDBCard } from '../app/types';
import type { CardCommandCapability } from '../dom/private-command-capabilities';
import type { CardActionControl } from '../cards/action-operation';

type MiningControlLabel = (expanded: boolean) => string;
type MiningCardAction = (control: CardActionControl, card: JPDBCard, sentence: string | undefined, command: CardCommandCapability) => Promise<void> | void;

export function toggleMiningControls(button: HTMLButtonElement, label: MiningControlLabel): void {
    yomuKanjiStudyCompanion()?.toggleMiningControls?.(button, label);
}

export function setMiningControlsExpanded(button: HTMLButtonElement, expanded: boolean, label: MiningControlLabel): void {
    yomuKanjiStudyCompanion()?.setMiningControlsExpanded?.(button, expanded, label);
}

/** Call before a popup re-render; the returned function restores open overflows and focus. */
export function preserveMiningControls(root: ParentNode, label: MiningControlLabel): (root: ParentNode) => void {
    return yomuKanjiStudyCompanion()?.preserveMiningControls?.(root, label) ?? (() => undefined);
}

/** Mounts the "Add to deck…" dropdowns a popup render placed in `root`. */
export function mountDeckSelects(root: ParentNode, card: JPDBCard, sentence: string | undefined, performAction: MiningCardAction): void {
    yomuKanjiStudyCompanion()?.mountDeckSelects?.(root, card, sentence, performAction);
}

/** The "Add to deck…" dropdown in use in `root`, if any. */
export function deckSelectInUse(root: ParentNode): HTMLElement | null {
    return yomuKanjiStudyCompanion()?.deckSelectInUse?.(root) ?? null;
}
