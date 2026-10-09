// ADR-0003 core import-severing: the mining drawer/deck-picker DOM helpers ship
// in the Yomu Kanji/Study companion; this facade keeps core call sites stable.
import { preserveMoreDisclosures } from '../sources/more-disclosure';
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

/** Re-renders a popup through `render` without pulling its action rows from under the learner. */
export function rerenderAroundMiningControls(root: ParentNode, label: MiningControlLabel, render: () => void): void {
    const companion = yomuKanjiStudyCompanion()?.rerenderAroundMiningControls;
    // Capture when the render actually runs: the companion can defer it while
    // a deck picker is in use, and disclosure choices can change meanwhile.
    const renderPreservingDisclosures = (): void => {
        const restore = preserveMoreDisclosures(root);
        render();
        restore();
    };
    if (companion) companion(root, label, renderPreservingDisclosures);
    else renderPreservingDisclosures();
}

/** Mounts the "Add to deck…" dropdowns a popup render placed in `root`. */
export function mountDeckSelects(root: ParentNode, card: JPDBCard, sentence: string | undefined, performAction: MiningCardAction): void {
    yomuKanjiStudyCompanion()?.mountDeckSelects?.(root, card, sentence, performAction);
}
