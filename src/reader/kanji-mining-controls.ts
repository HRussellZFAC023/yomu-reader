import { setInnerHtml } from './dom';

export function updateKanjiMiningControlsMount(
    popover: HTMLElement,
    controls: string,
    setMiningControlsExpanded: (button: HTMLButtonElement, expanded: boolean) => void,
): void {
    const actions = popover.querySelector<HTMLElement>('[data-kanji-actions]');
    const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
    if (!actions || !miningMount) return;
    const hasControls = Boolean(controls);
    const hasReview = actions.dataset.kanjiHasReview === 'true';
    actions.hidden = !hasControls && !hasReview;
    actions.classList.toggle('jpdb-reader-actions-has-mining', hasControls);
    actions.classList.toggle('jpdb-reader-actions-mining-collapsed', hasControls);
    const gutter = actions.querySelector<HTMLElement>('.jpdb-reader-actions-gutter');
    if (gutter) gutter.hidden = !hasControls;
    const collapseButton = actions.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]');
    if (collapseButton && hasControls) setMiningControlsExpanded(collapseButton, false);
    miningMount.hidden = !hasControls;
    setInnerHtml(miningMount, controls);
}
