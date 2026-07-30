import type { JPDBCard } from '../app/types';
import { activeLearningTarget } from '../languages/active';
import { normalizeLearningTargetAnswer } from './typing-input';

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

export function normalizeNewTabRecallAnswer(value: string): string {
    return normalizeLearningTargetAnswer(activeLearningTarget(), value);
}

function splitRecallAnswers(value: string | undefined): string[] {
    return (value ?? '')
        .split(/[;；/／|｜]/u)
        .flatMap(part => /[。！？!?]/u.test(part) ? [part] : part.split(/[,，、]/u))
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
