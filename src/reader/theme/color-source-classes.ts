import type { ReaderColorSource } from '../app/types';

type ClassedColorSource = Exclude<ReaderColorSource, 'auto'>;

/**
 * Ordinary pages own the DOM Yomu decorates, so the colour vocabulary they can
 * read names roles, never a review provider the learner chose (ADR-0020). Each
 * colour source has one page-readable token, used for the <html> channel class
 * and the stylesheet's --jpdb-reader-source-<token>-* variables. The "anki"
 * source is the review lane (dom/review-lane.ts), so its token is "review".
 *
 * scripts/subtitle-highlight-layers-smoke.mjs imports this file directly under
 * Node, so it keeps no runtime imports.
 */
const COLOR_SOURCE_CLASS_TOKENS: Record<ClassedColorSource, string> = {
    status: 'status',
    jpdb: 'jpdb',
    anki: 'review',
    pitch: 'pitch',
    off: 'off',
};

export function colorSourceClassName(scope: 'word' | 'subtitle', channel: string, source: ClassedColorSource): string {
    return `jpdb-reader-${scope}-${channel}-${COLOR_SOURCE_CLASS_TOKENS[source]}`;
}

/**
 * The token of the last of `sources` (cascade order) that any of `channels`
 * selects on `root`, or null when none does.
 */
export function selectedWordColorSourceToken(
    root: Element,
    channels: readonly string[],
    sources: readonly ClassedColorSource[],
): string | null {
    let selected: string | null = null;
    for (const source of sources) {
        if (channels.some(channel => root.classList.contains(colorSourceClassName('word', channel, source)))) {
            selected = COLOR_SOURCE_CLASS_TOKENS[source];
        }
    }
    return selected;
}
