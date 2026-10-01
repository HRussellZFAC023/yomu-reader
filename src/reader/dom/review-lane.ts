import { currentAccountDataSurfaceIsTrusted } from '../app/account-data-surface';
import { renderedWordPrivateValue } from './rendered-word-private-state';
import { forEachScannedShadowRoot } from './shadow-scan-registry';

/**
 * The review lane carries a word's Anki state to the "Anki" colour source on
 * an ordinary page, under a provider-neutral class (ADR-0020). Study keeps its
 * anki-<state> classes instead. Only Anki state joins the lane, and a word
 * carries its lane class only while a colour channel the learner chose paints
 * the "Anki" source: with no Anki colour on screen, the page cannot read which
 * words sit in the learner's Anki collection.
 */
const LANE_CLASS_STEM = 'yomu-review-';
const ORDINARY_PAGE_WORD_SELECTOR = '.jpdb-reader-word[data-yomu-word="true"]';
let lanePainted = false;

export function isReviewLaneClass(className: string): boolean {
    return className.startsWith(LANE_CLASS_STEM);
}

/** Puts a word on the lane for its private Anki state, or takes it off. */
export function syncWordReviewLane(word: HTMLElement): void {
    const lane = laneClassName(renderedWordPrivateValue(word, 'ankiState'));
    Array.from(word.classList)
        .filter(className => isReviewLaneClass(className) && className !== lane)
        .forEach(className => word.classList.remove(className));
    if (lane) word.classList.add(lane);
}

/** Follows the applied colour sources; repaints every word when that changes. */
export function setReviewLanePainted(painted: boolean): void {
    if (painted === lanePainted) return;
    lanePainted = painted;
    if (currentAccountDataSurfaceIsTrusted()) return;
    const roots: ParentNode[] = [document];
    forEachScannedShadowRoot(root => roots.push(root));
    roots.forEach(root => root.querySelectorAll<HTMLElement>(ORDINARY_PAGE_WORD_SELECTOR).forEach(syncWordReviewLane));
}

/** A word Anki holds no card for joins no lane, so nothing marks it. */
function laneClassName(ankiState: string | undefined): string {
    const onLane = [lanePainted, Boolean(ankiState), ankiState !== 'not-in-deck', !currentAccountDataSurfaceIsTrusted()].every(Boolean);
    return onLane ? `${LANE_CLASS_STEM}${ankiState}` : '';
}
