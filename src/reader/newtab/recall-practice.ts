import type { JPDBCard } from '../app/types';

export type NewTabRecallOutcome = 'empty' | 'correct' | 'accepted' | 'incorrect';

export interface NewTabRecallEvaluation {
    outcome: NewTabRecallOutcome;
    canonicalAnswer: string;
    acceptedAnswers: string[];
}

export interface NewTabRecallCloze {
    sentence: string;
    before: string;
    answer: string;
    after: string;
    hasCloze: boolean;
}

export function evaluateNewTabRecallAnswer(card: JPDBCard, answer: string, reading = card.reading): NewTabRecallEvaluation {
    const candidates = newTabRecallAnswerCandidates(card, reading);
    const normalized = normalizeNewTabRecallAnswer(answer);
    if (!normalized) {
        return { outcome: 'empty', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
    }
    if (candidates.primaryAnswers.some(candidate => normalizeNewTabRecallAnswer(candidate) === normalized)) {
        return { outcome: 'correct', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
    }
    if (candidates.acceptedAnswers.some(candidate => normalizeNewTabRecallAnswer(candidate) === normalized)) {
        return { outcome: 'accepted', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
    }
    return { outcome: 'incorrect', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
}

export function buildNewTabRecallCloze(card: JPDBCard, sentence: string, reading = card.reading): NewTabRecallCloze {
    const normalizedSentence = sentence.replace(/\s+/gu, ' ').trim();
    const candidates = newTabRecallAnswerCandidates(card, reading);
    const target = recallClozeTarget(normalizedSentence, candidates.primaryAnswers)
        || recallClozeTarget(normalizedSentence, candidates.acceptedAnswers);
    if (!normalizedSentence || !target || sameRecallAnswer(normalizedSentence, target)) {
        return { sentence: normalizedSentence, before: '', answer: candidates.canonicalAnswer, after: '', hasCloze: false };
    }
    const start = normalizedSentence.indexOf(target);
    return {
        sentence: normalizedSentence,
        before: normalizedSentence.slice(0, start),
        answer: target,
        after: normalizedSentence.slice(start + target.length),
        hasCloze: true,
    };
}

function newTabRecallAnswerCandidates(card: JPDBCard, reading = card.reading): {
    primaryAnswers: string[];
    acceptedAnswers: string[];
    canonicalAnswer: string;
} {
    const primaryAnswers = uniqueRecallAnswers(splitRecallAnswers(card.spelling));
    const acceptedAnswers = uniqueRecallAnswers([
        ...splitRecallAnswers(reading),
        ...(card.fallbackLookupTerms ?? []).flatMap(splitRecallAnswers),
    ]).filter(candidate => !sameRecallAnswer(candidate, card.spelling));
    return {
        primaryAnswers,
        acceptedAnswers,
        canonicalAnswer: primaryAnswers[0] ?? card.spelling.trim(),
    };
}

// Sentence-copy evaluation for the writing step: the learner reproduces the
// WHOLE example sentence — copying the visible context and filling the blank.
// Whitespace and punctuation are forgiving; the filled target decides the
// tier (spelling → correct, reading → accepted). Typing only the missing
// word still earns "accepted": producing the word is the SRS-relevant part.
export function evaluateNewTabSentenceCopyAnswer(
    card: JPDBCard,
    answer: string,
    cloze: NewTabRecallCloze,
    reading = card.reading,
): NewTabRecallEvaluation {
    const wordEvaluation = evaluateNewTabRecallAnswer(card, answer, reading);
    if (!cloze.hasCloze) return wordEvaluation;
    const normalized = normalizeSentenceCopyAnswer(answer);
    if (!normalized) return { ...wordEvaluation, outcome: 'empty' };
    const frame = (fill: string) => normalizeSentenceCopyAnswer(cloze.before + fill + cloze.after);
    // The sentence may cloze the READING (のみもの) rather than the spelling:
    // reproducing kana is only ever "accepted" — "correct" needs the kanji.
    const answerIsSpelling = splitRecallAnswers(card.spelling)
        .some(candidate => normalizeNewTabRecallAnswer(candidate) === normalizeNewTabRecallAnswer(cloze.answer));
    if (normalized === frame(card.spelling) || (answerIsSpelling && normalized === frame(cloze.answer))) {
        return { ...wordEvaluation, outcome: 'correct' };
    }
    const readings = [cloze.answer, reading, ...(card.fallbackLookupTerms ?? [])].flatMap(value => splitRecallAnswers(value));
    if (readings.some(candidate => candidate && normalized === frame(candidate))) {
        return { ...wordEvaluation, outcome: 'accepted' };
    }
    if (wordEvaluation.outcome === 'correct' || wordEvaluation.outcome === 'accepted') {
        return { ...wordEvaluation, outcome: 'accepted' };
    }
    return { ...wordEvaluation, outcome: 'incorrect' };
}

// NOTE: the long-vowel mark ー is meaningful kana and must never be stripped.
function normalizeSentenceCopyAnswer(value: string): string {
    return value
        .normalize('NFKC')
        .replace(/[\s\u3000]/gu, '')
        .replace(/[。、．，,.!！?？・「」『』（）()［］[\]〔〕【】…‥:：;；〜~"'“”‘’]/gu, '')
        .toLowerCase();
}

export function normalizeNewTabRecallAnswer(value: string): string {
    return value
        .normalize('NFKC')
        .replace(/[\s\u3000]/gu, '')
        .toLowerCase();
}

function splitRecallAnswers(value: string | undefined): string[] {
    return (value ?? '')
        .split(/[;；,，、/／|｜]/u)
        .map(part => part.trim())
        .filter(Boolean);
}

function uniqueRecallAnswers(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        const normalized = normalizeNewTabRecallAnswer(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(value);
    }
    return out;
}

function sameRecallAnswer(left: string, right: string): boolean {
    return normalizeNewTabRecallAnswer(left) === normalizeNewTabRecallAnswer(right);
}

function recallClozeTarget(sentence: string, candidates: string[]): string {
    return candidates
        .filter(candidate => candidate && sentence.includes(candidate))
        .sort((a, b) => b.length - a.length)[0] ?? '';
}
