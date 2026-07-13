import type { LearningAction, LearningSkill } from './learner-record';
import type { PracticePlan } from './practice-session';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from './activity-runtime';

export interface LearnerDeckCard {
    readonly id: string;
    readonly prompt: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptIds: readonly string[];
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly source?: {
        readonly id: string;
        readonly exposure: 'learner-authored' | 'practice-cleared' | 'secure-assessment';
    };
}

export interface LearnerDeck {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly cards: readonly LearnerDeckCard[];
}

export interface LearnerDeckIssue {
    readonly path: string;
    readonly message: string;
}

const MAX_DECK_CARDS = 500;

export function validateLearnerDeck(deck: LearnerDeck): readonly LearnerDeckIssue[] {
    const issues: LearnerDeckIssue[] = [];
    if (deck.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: 'Learner deck schemaVersion must be 1.' });
    if (!deck.id.trim()) issues.push({ path: 'id', message: 'A stable deck id is required.' });
    if (!deck.title.trim() || deck.title.trim().length > 60) issues.push({ path: 'title', message: 'Deck title must be 1–60 characters.' });
    if (deck.description.length > 500) issues.push({ path: 'description', message: 'Deck description must be at most 500 characters.' });
    if (!deck.cards.length || deck.cards.length > MAX_DECK_CARDS) issues.push({ path: 'cards', message: `A learner deck needs 1–${MAX_DECK_CARDS} cards.` });
    const ids = new Set<string>();
    const prompts = new Set<string>();
    deck.cards.forEach((card, index) => {
        if (!card.id.trim() || ids.has(card.id)) issues.push({ path: `cards[${index}].id`, message: 'Card ids must be non-empty and unique.' });
        if (!card.prompt.trim() || prompts.has(normalized(card.prompt))) issues.push({ path: `cards[${index}].prompt`, message: 'Card prompts must be non-empty and unique.' });
        if (!card.acceptedAnswers.some(answer => answer.trim())) issues.push({ path: `cards[${index}].acceptedAnswers`, message: 'At least one accepted answer is required.' });
        if (!card.conceptIds.length) issues.push({ path: `cards[${index}].conceptIds`, message: 'At least one Concept is required.' });
        if (card.source?.exposure === 'secure-assessment') issues.push({ path: `cards[${index}].source.exposure`, message: 'Secure assessment content cannot enter a learner deck.' });
        ids.add(card.id);
        prompts.add(normalized(card.prompt));
    });
    return issues;
}

export function buildLearnerDeckPracticePlan(deck: LearnerDeck, sessionId: string): PracticePlan {
    const issues = validateLearnerDeck(deck);
    if (issues.length) throw new TypeError(`Invalid learner deck: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
    return {
        sessionId,
        modeId: 'learner-deck',
        decks: [{ deckId: deck.id, weight: 1 }],
        items: deck.cards.map((card, index) => ({
            id: card.id,
            deckId: deck.id,
            ordinal: index + 1,
            prompt: card.prompt,
            acceptedAnswers: [...card.acceptedAnswers],
            conceptIds: [...card.conceptIds],
            skill: card.skill,
            action: card.action,
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            ...(card.source ? { sourceId: card.source.id } : {}),
        })),
    };
}

function normalized(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
}
