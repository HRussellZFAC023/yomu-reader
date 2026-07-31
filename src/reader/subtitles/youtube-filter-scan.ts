import { HAS_JAPANESE } from '../dom/index';

const HIRAGANA_RE = /\p{Script=Hiragana}/u;
const KATAKANA_RE = /\p{Script=Katakana}/u;
const HAN_RE = /\p{Script=Han}/u;
const NIHONGO_TUBE_SYMBOL_RE = /[≧≦°ಠ●◕○◯⊙▽△_∩∪ﾟ∇♪ω◇◆◎⌒※☆★♡♥︶︸ಥ¬╯╰┻┳━┛┗┓┏┫┣╋╂┃━─┌┐└┘├┤┴┬╱╲╳]/u;
const JAPANESE_LEARNING_INTENT_RE = /\b(?:comprehensible\s+(?:input|japanese)|japanese\s+comprehensible\s+input|learn(?:ing)?\s+japanese|japanese\s+(?:daily\s+conversation|listening|conversation|conversations|grammar|vocabulary|shadowing|immersion|input|lesson|lessons|podcast|podcasts|phrases?|story|stories|practice|words?)|beginner\s+japanese|complete\s+beginner\s+japanese|absolute\s+beginner\s+japanese|nihongo|jlpt|n[1-5](?:\s*[/-]\s*n[1-5])?)\b|#(?:learnjapanese|japanese|nihongo)\b/i;

export type YouTubeFilterDecisionKind = 'hide' | 'show' | 'skip';

export interface YouTubeFilterCandidate {
    card: HTMLElement;
    title: string;
    videoId: string;
    filterText: string;
    alwaysHidden: boolean;
}

export interface YouTubeFilterDecision {
    candidate: YouTubeFilterCandidate;
    kind: YouTubeFilterDecisionKind;
    reason: 'always-hidden' | 'always-hidden-revealed' | 'japanese' | 'missing-filter-text' | 'missing-title' | 'non-japanese' | 'revealed';
}

export interface YouTubeFilterScanDecision {
    decisions: YouTubeFilterDecision[];
    filteredCount: number;
    shownCount: number;
    visibleVideoIds: Set<string>;
}

/**
 * Everything a decision needs. `matchesTargetLanguage` is what makes this filter work
 * for a learner who is not studying Japanese (A48).
 *
 * The filter used to ask, literally, "is this text Japanese?" and hide everything else.
 * For a learner studying Russian with the filter at its default of ON, that hid their
 * Russian videos as `non-japanese` — the feature actively worked against them, which is
 * the worst kind of default. It now asks the ACTIVE STUDY TARGET whether the text is
 * its language, and Japanese is simply the target that happens to be default.
 *
 * Defaults to `isProbablyJapaneseYouTubeText` so any caller that has not been taught
 * about targets keeps byte-identical Japanese behaviour rather than silently filtering
 * on nothing.
 */
export interface YouTubeFilterOptions {
    revealed: boolean;
    matchesTargetLanguage?: (text: string) => boolean;
}

type YouTubeFilterDecisionRule = (candidate: YouTubeFilterCandidate, options: YouTubeFilterOptions) => YouTubeFilterDecision | null;

const YOUTUBE_FILTER_DECISION_RULES: YouTubeFilterDecisionRule[] = [
    alwaysHiddenYouTubeFilterDecision,
    missingTitleYouTubeFilterDecision,
    missingFilterTextYouTubeFilterDecision,
    japaneseYouTubeFilterDecision,
];

export function classifyYouTubeFilterCandidates(candidates: YouTubeFilterCandidate[], options: YouTubeFilterOptions): YouTubeFilterScanDecision {
    const decisions: YouTubeFilterDecision[] = [];
    const visibleVideoIds = new Set<string>();
    let filteredCount = 0;
    let shownCount = 0;

    for (const candidate of candidates) {
        const decision = classifyYouTubeFilterCandidate(candidate, options);
        decisions.push(decision);

        if (candidate.alwaysHidden || decision.reason === 'non-japanese' || decision.reason === 'revealed') filteredCount += 1;
        if (decision.kind === 'show') {
            shownCount += 1;
            if (!candidate.alwaysHidden && candidate.videoId) visibleVideoIds.add(candidate.videoId);
        }
    }

    return { decisions, filteredCount, shownCount, visibleVideoIds };
}

export function isProbablyJapaneseYouTubeText(text: string): boolean {
    const compact = normalizeYouTubeTitleForLanguageCheck(text);
    if (JAPANESE_LEARNING_INTENT_RE.test(compact)) return true;
    if (!HAS_JAPANESE.test(compact)) return false;

    return HIRAGANA_RE.test(compact) || KATAKANA_RE.test(compact) || HAN_RE.test(compact);
}

function classifyYouTubeFilterCandidate(candidate: YouTubeFilterCandidate, options: YouTubeFilterOptions): YouTubeFilterDecision {
    for (const rule of YOUTUBE_FILTER_DECISION_RULES) {
        const decision = rule(candidate, options);
        if (decision) return decision;
    }
    return nonJapaneseYouTubeFilterDecision(candidate, options);
}

function alwaysHiddenYouTubeFilterDecision(candidate: YouTubeFilterCandidate, options: YouTubeFilterOptions): YouTubeFilterDecision | null {
    if (candidate.alwaysHidden) {
        return {
            candidate,
            kind: options.revealed ? 'show' : 'hide',
            reason: options.revealed ? 'always-hidden-revealed' : 'always-hidden',
        };
    }
    return null;
}

function missingTitleYouTubeFilterDecision(candidate: YouTubeFilterCandidate): YouTubeFilterDecision | null {
    return candidate.title ? null : { candidate, kind: 'skip', reason: 'missing-title' };
}

function missingFilterTextYouTubeFilterDecision(candidate: YouTubeFilterCandidate, options: YouTubeFilterOptions): YouTubeFilterDecision | null {
    if (!candidate.filterText) {
        return {
            candidate,
            kind: options.revealed ? 'skip' : 'hide',
            reason: 'missing-filter-text',
        };
    }
    return null;
}

// `reason: 'japanese'` is kept as the wire value so nothing downstream has to change,
// but it now means "matches the active study target". Renaming it would ripple through
// the filter's telemetry and tests for no behavioural gain; the meaning is recorded here.
function japaneseYouTubeFilterDecision(candidate: YouTubeFilterCandidate, options: YouTubeFilterOptions): YouTubeFilterDecision | null {
    const matches = options.matchesTargetLanguage ?? isProbablyJapaneseYouTubeText;
    return matches(candidate.filterText)
        ? { candidate, kind: 'show', reason: 'japanese' }
        : null;
}

function nonJapaneseYouTubeFilterDecision(candidate: YouTubeFilterCandidate, options: YouTubeFilterOptions): YouTubeFilterDecision {
    return {
        candidate,
        kind: options.revealed ? 'show' : 'hide',
        reason: options.revealed ? 'revealed' : 'non-japanese',
    };
}

// Japanese-locale UI metadata that leaks into whole-card title fallbacks
// (view counts, upload age, live badges, the ad/watch CTA). It is chrome, not
// content: an English card whose only Japanese characters come from
// 「7.2万回視聴・4時間前」or a 視聴する CTA must still classify non-Japanese
// (2026-07-11 "EN videos should be hidden" report — shelf/ad lockup cards
// with no recognizable title node).
const YOUTUBE_UI_METADATA_RE = new RegExp([
    /視聴回数\s*[\d.,]+\s*(?:万|億)?\s*回/.source,
    /[\d.,]+\s*(?:万|億)?\s*回視聴/.source,
    /[\d.,]+\s*(?:万|億)?\s*人が視聴中/.source,
    /\d+\s*(?:秒|分|時間|日|週間|か月|カ月|ヶ月|年)前/.source,
    /(?:ライブ配信中|配信済み|プレミア公開|視聴する|再生リスト|ミックスリスト|ミックス)/.source,
].join('|'), 'g');

function normalizeYouTubeTitleForLanguageCheck(text: string): string {
    return text
        .replace(/fypシ゚/g, '')
        .replace(/fypシ/g, '')
        .replace(YOUTUBE_UI_METADATA_RE, '')
        .replace(NIHONGO_TUBE_SYMBOL_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * A detector for any study target, reusing the chrome stripping the Japanese path
 * needs. `normalizeYouTubeTitleForLanguageCheck` removes YouTube's own UI furniture —
 * view counts, upload age, live badges, the watch CTA, decorative kaomoji — so a card
 * is judged on its title rather than on the surrounding interface. That mattered for
 * Japanese (an English card whose only Japanese came from 「7.2万回視聴」had to classify
 * as non-Japanese) and it matters the same way for every other target, because the
 * chrome is rendered in the viewer's UI language whatever they are studying.
 *
 * Japanese keeps `isProbablyJapaneseYouTubeText` rather than the generic path, because
 * that function also recognises English-titled Japanese-learning content
 * ("comprehensible japanese", "JLPT N3") which no script detector can see.
 */
export function youTubeTargetLanguageDetector(
    isJapaneseTarget: boolean,
    isTargetText: (text: string) => boolean,
): (text: string) => boolean {
    if (isJapaneseTarget) return isProbablyJapaneseYouTubeText;
    return text => isTargetText(normalizeYouTubeTitleForLanguageCheck(text));
}
