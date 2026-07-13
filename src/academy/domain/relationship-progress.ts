import type { LearnerEvent } from './learner-record';

export interface RelationshipJournalProgress {
    readonly characterId: string;
    readonly unlockedChapters: readonly number[];
    readonly completedChapters: number;
    readonly totalChapters: 10;
    readonly ratio: number;
    readonly majorTurns: readonly ('recognition' | 'friction' | 'support')[];
    readonly nextChapter: number | null;
}

export function projectRelationshipJournal(events: readonly LearnerEvent[]): readonly RelationshipJournalProgress[] {
    const journals = new Map<string, {
        chapters: Set<number>;
        turns: Set<'recognition' | 'friction' | 'support'>;
    }>();
    events.forEach(event => {
        if (event.kind !== 'relationship-chapter-unlocked') return;
        const journal = journals.get(event.characterId) ?? { chapters: new Set(), turns: new Set() };
        journal.chapters.add(event.chapter);
        if (event.majorTurn) journal.turns.add(event.majorTurn);
        journals.set(event.characterId, journal);
    });
    return [...journals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([characterId, journal]) => {
        const unlockedChapters = [...journal.chapters].sort((left, right) => left - right);
        const nextChapter = Array.from({ length: 10 }, (_, index) => index + 1).find(chapter => !journal.chapters.has(chapter)) ?? null;
        return {
            characterId,
            unlockedChapters,
            completedChapters: unlockedChapters.length,
            totalChapters: 10,
            ratio: unlockedChapters.length / 10,
            majorTurns: [...journal.turns].sort(),
            nextChapter,
        };
    });
}
