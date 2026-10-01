import type { ReaderColorSource } from '../app/types';

type ClassedColorSource = Exclude<ReaderColorSource, 'auto'>;

/**
 * Ordinary pages own the DOM Yomu decorates, so the colour vocabulary they can
 * read names roles, never review providers (ADR-0019). The "anki" colour source
 * is the review lane: its root classes end in -review, the stylesheet's lane
 * variables are --jpdb-reader-review-*, and a word joins the lane through
 * anki-<state> on Study or the provider-neutral yomu-review-<state> elsewhere.
 */
const COLOR_SOURCE_CLASS_TOKENS: Record<ClassedColorSource, string> = {
    status: 'status',
    jpdb: 'jpdb',
    anki: 'review',
    pitch: 'pitch',
    off: 'off',
};

export const REVIEW_LANE_CLASS_PREFIX = 'yomu-review-';

export function colorSourceClassName(scope: 'word' | 'subtitle', channel: string, source: ClassedColorSource): string {
    return `jpdb-reader-${scope}-${channel}-${COLOR_SOURCE_CLASS_TOKENS[source]}`;
}

/** A word the review app holds no card for joins no lane, so nothing marks it. */
export function reviewLaneClassName(state: string): string | null {
    return state && state !== 'not-in-deck' ? `${REVIEW_LANE_CLASS_PREFIX}${state}` : null;
}
