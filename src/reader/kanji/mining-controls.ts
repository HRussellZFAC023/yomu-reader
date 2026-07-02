// ADR-0003 core import-severing: the kanji mining-mount DOM helper ships in the
// Yomu Kanji/Study companion; this facade keeps core call sites stable.
import { yomuKanjiStudyCompanion } from '../companions/registry';

export function updateKanjiMiningControlsMount(
    popover: HTMLElement,
    controls: string,
    setMiningControlsExpanded: (button: HTMLButtonElement, expanded: boolean) => void,
): void {
    yomuKanjiStudyCompanion()?.updateKanjiMiningControlsMount?.(popover, controls, setMiningControlsExpanded);
}
