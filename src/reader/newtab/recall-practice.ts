import type { JPDBCard } from '../app/types';
import { activeLearningTarget } from '../languages/target-runtime';
import type { LearningTargetModule } from '../languages/types';
import { newTabCardTarget } from './study-queue';
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
    const target = newTabCardTarget(card);
    const candidates = newTabRecallAnswerCandidates(card, reading, target);
    const normalized = normalizeNewTabRecallAnswer(answer, target);
    if (!normalized) {
        return { outcome: 'empty', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
    }
    if (candidates.primaryAnswers.some(candidate => normalizeNewTabRecallAnswer(candidate, target) === normalized)) {
        return { outcome: 'correct', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
    }
    if (candidates.acceptedAnswers.some(candidate => normalizeNewTabRecallAnswer(candidate, target) === normalized)) {
        return { outcome: 'accepted', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
    }
    return { outcome: 'incorrect', canonicalAnswer: candidates.canonicalAnswer, acceptedAnswers: candidates.acceptedAnswers };
}

export function buildNewTabRecallCloze(card: JPDBCard, sentence: string, reading = card.reading): NewTabRecallCloze {
    const learningTarget = newTabCardTarget(card);
    const normalizedSentence = sentence.replace(/\s+/gu, ' ').trim();
    const candidates = newTabRecallAnswerCandidates(card, reading, learningTarget);
    const target = recallClozeTarget(normalizedSentence, candidates.primaryAnswers)
        || recallClozeTarget(normalizedSentence, candidates.acceptedAnswers);
    if (!normalizedSentence || !target || sameRecallAnswer(normalizedSentence, target, learningTarget)) {
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

function newTabRecallAnswerCandidates(card: JPDBCard, reading: string, target: LearningTargetModule): {
    primaryAnswers: string[];
    acceptedAnswers: string[];
    canonicalAnswer: string;
} {
    const primaryAnswers = uniqueRecallAnswers(splitRecallAnswers(card.spelling), target);
    const acceptedAnswers = uniqueRecallAnswers([
        ...splitRecallAnswers(reading),
        ...(card.fallbackLookupTerms ?? []).flatMap(splitRecallAnswers),
    ], target).filter(candidate => !sameRecallAnswer(candidate, card.spelling, target));
    return {
        primaryAnswers,
        acceptedAnswers,
        canonicalAnswer: primaryAnswers[0] ?? card.spelling.trim(),
    };
}

export function normalizeNewTabRecallAnswer(value: string, target = activeLearningTarget()): string {
    return normalizeLearningTargetAnswer(target, value);
}

function splitRecallAnswers(value: string | undefined): string[] {
    return (value ?? '')
        .split(/[;；/／|｜]/u)
        .flatMap(part => /[。！？!?]/u.test(part) ? [part] : part.split(/[,，、]/u))
        .map(part => part.trim())
        .filter(Boolean);
}

function uniqueRecallAnswers(values: string[], target: LearningTargetModule): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        const normalized = normalizeNewTabRecallAnswer(value, target);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(value);
    }
    return out;
}

function sameRecallAnswer(left: string, right: string, target: LearningTargetModule): boolean {
    return normalizeNewTabRecallAnswer(left, target) === normalizeNewTabRecallAnswer(right, target);
}

function recallClozeTarget(sentence: string, candidates: string[]): string {
    return candidates
        .filter(candidate => candidate && sentence.includes(candidate))
        .sort((a, b) => b.length - a.length)[0] ?? '';
}
