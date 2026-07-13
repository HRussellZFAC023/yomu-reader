import { CLASS_BOARD_METRICS, projectClassBoardEntry } from '../../src/academy/domain/class-board';
import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import {
    projectCurriculumProgress,
    projectKanjiGarden,
    projectReviewHealth,
    projectSkillProgress,
    projectSourceCompletion,
    projectStreak,
    projectTodayProgress,
} from '../../src/academy/domain/progress-projections';
import { projectRelationshipJournal } from '../../src/academy/domain/relationship-progress';

const DAY = 86_400_000;

describe('pure progress projections', () => {
    it('projects today, skills, curriculum, sources, review health, and kanji from the same immutable log', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            evidence('e1', DAY, 'pass', 'reading', 'read', ['concept:a'], { sourceId: 'source:1', durationMs: 5 * 60_000 }),
            evidence('e2', DAY + 1, 'lapse', 'kanji', 'write', ['concept:kanji:日'], { kanji: '日', durationMs: 60_000 }),
            evidence('e3', DAY * 2, 'pass', 'kanji', 'write', ['concept:kanji:日'], { kanji: '日' }),
            evidence('e4', DAY * 3, 'pass', 'kanji', 'write', ['concept:kanji:日'], { kanji: '日' }),
            { kind: 'review-scheduled', eventId: 'scheduled', at: DAY, reviewItemId: 'review:1', conceptId: 'concept:a', dueAt: DAY, provenance: { source: 'source:1' } },
            { kind: 'review-rated', eventId: 'rated', at: DAY + 2, reviewItemId: 'review:2', rating: 'again' },
            { kind: 'academy-day-closed', eventId: 'closed', at: DAY + 3, dayId: 'day:1', mainLessonCompleted: true, optionalActivityIds: [], elapsedMs: 6 * 60_000 },
        ]);
        const events = await record.history();
        expect(projectTodayProgress(events, { startAt: DAY, endAt: DAY * 2 }, { minutes: 15, items: 5 })).toMatchObject({
            activeMinutes: 6, completedItems: 2, mainLessonCompleted: true,
        });
        expect(projectSkillProgress(events).find(skill => skill.skill === 'kanji')).toMatchObject({ attempts: 3, independentPasses: 2, lapses: 1, evidence: 'practised' });
        expect(projectCurriculumProgress(events, [{ id: 'week:1', conceptIds: ['concept:a', 'concept:b'] }])[0]).toMatchObject({
            demonstratedConceptIds: ['concept:a'], ratio: 0.5,
        });
        expect(projectSourceCompletion(events)).toEqual([{ sourceId: 'source:1', attempts: 1, passedActivities: 1, explicitlyCompleted: false }]);
        expect(projectReviewHealth(events, DAY + 10)).toMatchObject({ scheduled: 1, due: 1, repairNeeded: 2 });
        expect(projectKanjiGarden(events)[0]).toMatchObject({ kanji: '日', state: 'produced', heat: 0.8 });
    });

    it('makes streak policy explicit and non-punitive across a local day boundary', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            evidence('d1', Date.UTC(2026, 0, 1, 12), 'pass', 'vocabulary', 'recall', ['word:a']),
            evidence('d2', Date.UTC(2026, 0, 2, 12), 'pass', 'vocabulary', 'recall', ['word:a']),
            { kind: 'review-rated', eventId: 'd3', at: Date.UTC(2026, 0, 3, 12), reviewItemId: 'r', rating: 'good' },
        ]);
        const policy = {
            timeZone: 'Europe/London',
            dayBoundaryHour: 4,
            qualifyingEventKinds: ['learning-evidence-recorded', 'review-rated'] as const,
        };
        expect(projectStreak(await record.history(), Date.UTC(2026, 0, 3, 18), policy)).toEqual({
            currentDays: 3,
            longestDays: 3,
            lastQualifyingLocalDay: '2026-01-03',
            timeZone: 'Europe/London',
            dayBoundaryHour: 4,
            qualifyingEventKinds: ['learning-evidence-recorded', 'review-rated'],
            punitive: false,
        });
    });

    it('projects ten relationship-journal chapters and authored turns without bond points or romance rank', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            { kind: 'bond-changed', eventId: 'legacy-points', characterId: 'rie', delta: 100 },
            { kind: 'relationship-chapter-unlocked', eventId: 'rie:chapter:1', characterId: 'rie', chapter: 1, majorTurn: 'recognition' },
            { kind: 'relationship-chapter-unlocked', eventId: 'rie:chapter:2', characterId: 'rie', chapter: 2 },
        ]);
        expect(projectRelationshipJournal(await record.history())).toEqual([{
            characterId: 'rie',
            unlockedChapters: [1, 2],
            completedChapters: 2,
            totalChapters: 10,
            ratio: 0.2,
            majorTurns: ['recognition'],
            nextChapter: 3,
        }]);
    });
});

describe('privacy-safe Class Board projection', () => {
    it('is account-required, opt-in per aggregate, and uses Academy identity only', async () => {
        expect(CLASS_BOARD_METRICS.every(metric => metric.accountRequired && metric.optInRequired && metric.aggregateOnly)).toBe(true);
        expect(CLASS_BOARD_METRICS.every(metric => metric.excludes.includes('answers') && metric.excludes.includes('word-lists'))).toBe(true);
        const record = createLearnerRecord();
        await record.recordMany([
            evidence('w1', DAY, 'pass', 'vocabulary', 'recall', ['word:a']),
            evidence('w2', DAY + 1, 'pass', 'vocabulary', 'recall', ['word:a']),
            evidence('w3', DAY * 2, 'pass', 'vocabulary', 'recall', ['word:a']),
            { kind: 'review-rated', eventId: 'review', at: DAY, reviewItemId: 'r', rating: 'again' },
        ]);
        const policy = { timeZone: 'UTC', dayBoundaryHour: 0, qualifyingEventKinds: ['learning-evidence-recorded'] as const };
        expect(projectClassBoardEntry(null, ['known-word-count'], await record.history(), DAY * 2, policy)).toBeNull();
        const board = projectClassBoardEntry({ displayName: 'Aakash', discriminator: '419213' }, ['known-word-count'], await record.history(), DAY * 2, policy);
        expect(board).toEqual({
            identity: { displayName: 'Aakash', discriminator: '419213', label: 'Aakash#419213' },
            metrics: { 'known-word-count': 1 },
        });
        expect(JSON.stringify(board)).not.toContain('again');
        expect(JSON.stringify(board)).not.toContain('word:a');
    });
});

function evidence(
    eventId: string,
    at: number,
    outcome: 'pass' | 'lapse',
    skill: 'reading' | 'kanji' | 'vocabulary',
    action: 'read' | 'write' | 'recall',
    conceptIds: readonly string[],
    extra: { sourceId?: string; durationMs?: number; kanji?: string } = {},
) {
    return {
        kind: 'learning-evidence-recorded' as const,
        eventId,
        at,
        activityId: `activity:${eventId}`,
        modeId: 'normal-challenge',
        skill,
        action,
        outcome,
        conceptIds,
        independent: true,
        ...extra,
    };
}
