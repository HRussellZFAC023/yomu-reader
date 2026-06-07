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

type YouTubeFilterDecisionRule = (candidate: YouTubeFilterCandidate, options: { revealed: boolean }) => YouTubeFilterDecision | null;

const YOUTUBE_FILTER_DECISION_RULES: YouTubeFilterDecisionRule[] = [
    alwaysHiddenYouTubeFilterDecision,
    missingTitleYouTubeFilterDecision,
    missingFilterTextYouTubeFilterDecision,
    japaneseYouTubeFilterDecision,
];

export function classifyYouTubeFilterCandidates(candidates: YouTubeFilterCandidate[], options: { revealed: boolean }): YouTubeFilterScanDecision {
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

function classifyYouTubeFilterCandidate(candidate: YouTubeFilterCandidate, options: { revealed: boolean }): YouTubeFilterDecision {
    for (const rule of YOUTUBE_FILTER_DECISION_RULES) {
        const decision = rule(candidate, options);
        if (decision) return decision;
    }
    return nonJapaneseYouTubeFilterDecision(candidate, options);
}

function alwaysHiddenYouTubeFilterDecision(candidate: YouTubeFilterCandidate, options: { revealed: boolean }): YouTubeFilterDecision | null {
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

function missingFilterTextYouTubeFilterDecision(candidate: YouTubeFilterCandidate, options: { revealed: boolean }): YouTubeFilterDecision | null {
    if (!candidate.filterText) {
        return {
            candidate,
            kind: options.revealed ? 'skip' : 'hide',
            reason: 'missing-filter-text',
        };
    }
    return null;
}

function japaneseYouTubeFilterDecision(candidate: YouTubeFilterCandidate): YouTubeFilterDecision | null {
    return isProbablyJapaneseYouTubeText(candidate.filterText)
        ? { candidate, kind: 'show', reason: 'japanese' }
        : null;
}

function nonJapaneseYouTubeFilterDecision(candidate: YouTubeFilterCandidate, options: { revealed: boolean }): YouTubeFilterDecision {
    return {
        candidate,
        kind: options.revealed ? 'show' : 'hide',
        reason: options.revealed ? 'revealed' : 'non-japanese',
    };
}

function normalizeYouTubeTitleForLanguageCheck(text: string): string {
    return text
        .replace(/fypシ゚/g, '')
        .replace(/fypシ/g, '')
        .replace(/ミックスリスト/g, '')
        .replace(NIHONGO_TUBE_SYMBOL_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}
