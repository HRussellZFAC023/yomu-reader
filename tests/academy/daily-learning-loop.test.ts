import {
    projectDailyLearningRoute,
    type CrossYomuEvidence,
    type DailyLearningCandidate,
    type DiegeticIncentive,
} from '../../src/academy/domain/daily-learning-loop';
import type { LearnerEvent } from '../../src/academy/domain/learner-record';

const DAY = 86_400_000;
const BOUNDARY = { timeZone: 'Europe/London', dayBoundaryHour: 4 } as const;

describe('projectDailyLearningRoute', () => {
    it('builds one bounded route in due-repair, grounded-lesson, n+1 order', () => {
        const route = projectDailyLearningRoute({
            events: [scheduled('schedule:b', 'review:b', 'known:b', DAY, 0), scheduled('schedule:a', 'review:a', 'known:a', DAY, 0)],
            evidence: [],
            candidates: [encounter('world:a', ['known:a', 'new:a']), lesson('lesson:a', 1, ['lesson:a'])],
            now: DAY,
            dayBoundary: BOUNDARY,
        });

        expect(route.primaryAction).toMatchObject({
            kind: 'repair',
            reason: 'due-srs',
        });
        expect(route.primaryAction).toMatchObject({
            reviewItemIds: ['review:a', 'review:b'],
            conceptIds: ['known:a', 'known:b'],
        });
        expect(route.supportingActions.map((action) => action.kind)).toEqual(['lesson', 'encounter']);
        expect([route.primaryAction, ...route.supportingActions]).toHaveLength(3);
        expect('primary' in route.supportingActions[0]!).toBe(false);
        expect(route.motivation).toMatchObject({
            anticipation: { actionId: route.primaryAction.id },
            connection: {
                kind: 'world',
                actionId: 'world:a',
                incentiveId: 'reward:world:a',
            },
            closure: {
                afterActionId: route.primaryAction.id,
                nextActionId: 'lesson:a',
            },
        });
    });

    it('grounds one relevant relationship or world hook in a selected candidate incentive', () => {
        const bondRoute = projectDailyLearningRoute({
            events: [],
            evidence: [],
            candidates: [encounter('encounter:bond', ['bond:a'], 'bond')],
            now: 0,
            dayBoundary: BOUNDARY,
        });
        expect(bondRoute.motivation.connection).toEqual({
            kind: 'relationship',
            actionId: 'encounter:bond',
            incentiveId: 'reward:encounter:bond',
            characterId: 'rie',
            message: 'This action can continue a grounded relationship thread.',
        });

        const worldRoute = projectDailyLearningRoute({
            events: [],
            evidence: [],
            candidates: [encounter('encounter:world', ['world:a'])],
            now: 0,
            dayBoundary: BOUNDARY,
        });
        expect(worldRoute.motivation.connection).toMatchObject({
            kind: 'world',
            actionId: 'encounter:world',
            incentiveId: 'reward:encounter:world',
        });
    });

    it('derives one deterministic due repair from the latest active schedules and ratings', () => {
        const events = [
            scheduled('old', 'review:a', 'old:a', 0, 0),
            rated('old-rating', 'review:a', 'good', 5),
            scheduled('new', 'review:a', 'new:a', 10, 10),
            scheduled('neutralized', 'review:b', 'known:b', 0, 0),
            neutralized('neutralizer', 'neutralized', 1),
        ];
        const input = {
            events,
            evidence: [],
            candidates: [] as readonly DailyLearningCandidate[],
            now: 20,
            dayBoundary: BOUNDARY,
        };

        const route = projectDailyLearningRoute(input);
        expect(route.primaryAction).toMatchObject({
            kind: 'repair',
            reviewItemIds: ['review:a'],
            conceptIds: ['new:a'],
        });
        expect(projectDailyLearningRoute({ ...input, events: [...events].reverse() })).toEqual(route);
    });

    it('omits a repair resolved after scheduling and ignores future schedules', () => {
        const events = [
            scheduled('schedule:a', 'review:a', 'known:a', 0, 0),
            rated('rating:a', 'review:a', 'again', 1),
            scheduled('future', 'review:b', 'known:b', 0, 30),
        ];
        const route = projectDailyLearningRoute({
            events,
            evidence: [],
            candidates: [lesson('lesson:a', 1, ['lesson:a'])],
            now: 20,
            dayBoundary: BOUNDARY,
        });
        expect(route.primaryAction.kind).toBe('lesson');
        expect(route.motivation).toMatchObject({
            competence: { basis: 'ready' },
            connection: null,
        });

        const rescheduled = projectDailyLearningRoute({
            events,
            evidence: [],
            candidates: [lesson('lesson:a', 1, ['lesson:a'])],
            now: 40,
            dayBoundary: BOUNDARY,
        });
        expect(rescheduled.primaryAction).toMatchObject({
            kind: 'repair',
            reviewItemIds: ['review:b'],
        });
    });

    it('chooses the earliest unfinished grounded lesson, independent of candidate order', () => {
        const events = [
            academyEvidence('complete:first', 1, ['lesson:first'], {
                activityId: 'complete:lesson:first',
            }),
        ];
        const candidates = [
            lesson('lesson:third', 3, ['lesson:third']),
            lesson('lesson:second', 2, ['lesson:second']),
            lesson('lesson:first', 1, ['lesson:first']),
        ];
        const route = projectDailyLearningRoute({
            events,
            evidence: [],
            candidates,
            now: 2,
            dayBoundary: BOUNDARY,
        });

        expect(route.primaryAction).toMatchObject({
            kind: 'lesson',
            id: 'lesson:second',
            grounding: { sourceId: 'source:lesson:second' },
        });
        expect(
            projectDailyLearningRoute({
                events,
                evidence: [],
                candidates: [...candidates].reverse(),
                now: 2,
                dayBoundary: BOUNDARY,
            }),
        ).toEqual(route);
    });

    it('advances after the canonical class encounter even when a week has no synthetic completion activity', () => {
        const first = {
            ...lesson('lesson:first', 1, ['lesson:first']),
            completionEncounterIds: ['class-week:first', 'class-week:lesson:first'],
        };
        const route = projectDailyLearningRoute({
            events: [
                {
                    kind: 'characters-encountered',
                    eventId: 'encounter:first',
                    at: 1,
                    encounterId: 'class-week:lesson:first',
                    sceneId: 'scene:class-week:first',
                    attendeeIds: ['rie'],
                },
            ],
            evidence: [],
            candidates: [first, lesson('lesson:second', 2, ['lesson:second'])],
            now: 2,
            dayBoundary: BOUNDARY,
        });

        expect(route.primaryAction).toMatchObject({
            kind: 'lesson',
            id: 'lesson:second',
        });
    });

    it('never recommends the opt-in pressure mode', () => {
        const pressure = {
            ...lesson('lesson:pressure', 1, ['pressure']),
            modeId: 'inferno-pressure' as const,
        };
        const pressureEncounter = {
            ...encounter('encounter:pressure', ['pressure']),
            modeId: 'inferno-pressure' as const,
        };
        const route = projectDailyLearningRoute({
            events: [],
            evidence: [],
            candidates: [pressure, pressureEncounter, lesson('lesson:humane', 2, ['humane'])],
            now: 0,
            dayBoundary: BOUNDARY,
        });
        expect(route.primaryAction.id).toBe('lesson:humane');
        expect(route.supportingActions).toEqual([]);
    });

    it('recognizes sustained Japanese subtitles, active Reader modes, reading, recall, and spaced returns', () => {
        const evidence: CrossYomuEvidence[] = [
            cross('subtitle', 1, 'japanese-subtitle-viewing', ['video:a'], incentive('journal-memory', 'video')),
            cross('japanese-only', 2, 'reader-mode-use', ['reader:a'], incentive('source-unlock', 'reader-ja'), {
                mode: 'japanese-only',
                engagement: 'active-reading',
            }),
            cross('immersion', 3, 'reader-mode-use', ['reader:b'], incentive('place-discovery', 'reader-filter'), {
                mode: 'immersion-filter',
                engagement: 'active-reading',
            }),
            cross('passage', 4, 'passage-read', ['passage:a'], incentive('journal-memory', 'passage')),
            cross('mine', 5, 'vocabulary-mined', ['word:a'], incentive('source-unlock', 'mine')),
            cross('recall', 6, 'later-recall', ['word:a'], incentive('bond-scene', 'recall'), {
                priorEvidenceId: 'mine',
                outcome: 'pass',
                independent: true,
            }),
            cross('return', 7, 'spaced-passage-return', ['passage:a'], incentive('source-unlock', 'return'), {
                priorEvidenceId: 'passage',
                outcome: 'lapse',
                independent: true,
                sourceId: 'source:passage-read',
            }),
        ];
        const route = projectDailyLearningRoute({
            events: [],
            evidence,
            candidates: [lesson('lesson:a', 1, ['lesson:a'])],
            now: 7,
            dayBoundary: BOUNDARY,
        });

        expect(route.earnedIncentives.map((item) => item.id)).toEqual(['recall', 'passage', 'video', 'reader-filter', 'reader-ja', 'return']);
        expect(route.earnedIncentives.map((item) => item.id)).not.toContain('mine');
    });

    it('does not reward passive toggles, incomplete viewing/reading, mining, or unlinked recall', () => {
        const unverified: CrossYomuEvidence[] = [
            cross('short-video', 1, 'japanese-subtitle-viewing', ['video:a'], incentive('journal-memory', 'short'), { sustained: false }),
            cross('toggle', 2, 'reader-mode-use', ['reader:a'], incentive('source-unlock', 'toggle'), {
                mode: 'japanese-only',
                engagement: 'toggle',
            }),
            cross('opened', 3, 'passage-read', ['passage:a'], incentive('journal-memory', 'opened'), { completed: false }),
            cross('mine', 4, 'vocabulary-mined', ['word:a'], incentive('source-unlock', 'mine')),
            cross('recall', 5, 'later-recall', ['word:a'], incentive('bond-scene', 'recall'), {
                priorEvidenceId: 'missing',
                outcome: 'pass',
                independent: true,
            }),
            cross('passive-prior', 6, 'reader-mode-use', ['word:b'], undefined, {
                mode: 'immersion-filter',
                engagement: 'toggle',
                sourceId: 'source:shared',
            }),
            cross('passive-recall', 7, 'later-recall', ['word:b'], incentive('bond-scene', 'passive-recall'), {
                priorEvidenceId: 'passive-prior',
                outcome: 'pass',
                independent: true,
            }),
            cross('not-a-passage-return', 8, 'spaced-passage-return', ['word:b'], incentive('source-unlock', 'false-return'), {
                priorEvidenceId: 'passive-prior',
                outcome: 'pass',
                independent: true,
                sourceId: 'source:shared',
            }),
        ];
        const route = projectDailyLearningRoute({
            events: [],
            evidence: unverified,
            candidates: [lesson('lesson:a', 1, ['lesson:a'])],
            now: 8,
            dayBoundary: BOUNDARY,
        });
        expect(route.earnedIncentives).toEqual([]);
    });

    it('keeps recognition binary under repetition and ignores raw duration', () => {
        const repeated = Array.from({ length: 40 }, (_, index) =>
            cross(`read:${index}`, index, 'passage-read', ['passage:a'], incentive('journal-memory', 'same-memory')),
        );
        const withRawDuration = repeated.map((item) => ({
            ...item,
            durationMs: 99_999_999,
        })) as CrossYomuEvidence[];
        const input = {
            events: [academyEvidence('academy', 1, ['known:a'], { durationMs: 1 })],
            candidates: [encounter('encounter:a', ['known:a', 'new:a'])],
            now: 50,
            dayBoundary: BOUNDARY,
        };

        const normal = projectDailyLearningRoute({ ...input, evidence: repeated });
        const single = projectDailyLearningRoute({
            ...input,
            evidence: repeated.slice(0, 1),
        });
        const inflated = projectDailyLearningRoute({
            ...input,
            events: [academyEvidence('academy', 1, ['known:a'], { durationMs: DAY * 100 })],
            evidence: withRawDuration,
        });
        expect(normal.earnedIncentives).toEqual([incentive('journal-memory', 'same-memory')]);
        expect(normal.earnedIncentives).toEqual(single.earnedIncentives);
        expect(normal.motivation).toEqual(single.motivation);
        expect(normal.motivation.competence.basis).toBe('verified-practice');
        expect(inflated.primaryAction).toEqual(normal.primaryAction);
        expect(inflated.earnedIncentives).toEqual(normal.earnedIncentives);
    });

    it('recognizes an independent lapsed recall attempt without treating it as known', () => {
        const route = projectDailyLearningRoute({
            events: [],
            evidence: [
                cross('mine', 1, 'vocabulary-mined', ['word:a']),
                cross('recall', 2, 'later-recall', ['word:a'], incentive('journal-memory', 'tried-recall'), {
                    priorEvidenceId: 'mine',
                    outcome: 'lapse',
                    independent: true,
                }),
            ],
            candidates: [encounter('encounter:a', ['word:a', 'word:b'])],
            now: 2,
            dayBoundary: BOUNDARY,
        });
        expect(route.earnedIncentives).toEqual([incentive('journal-memory', 'tried-recall')]);
        expect(route.primaryAction).toMatchObject({
            coverage: { knownConceptIds: [] },
        });
    });

    it('prefers a true n+1 encounter over fully-known and too-hard alternatives', () => {
        const candidates = [
            encounter('encounter:known', ['known:a', 'known:b']),
            encounter('encounter:hard', ['known:a', 'new:a', 'new:b']),
            encounter('encounter:n-plus-one', ['known:a', 'known:b', 'new:c'], 'bond'),
        ];
        const route = projectDailyLearningRoute({
            events: [academyEvidence('known', 1, ['known:a', 'known:b'])],
            evidence: [],
            candidates,
            targetConceptIds: ['known:a', 'new:c'],
            now: 2,
            dayBoundary: BOUNDARY,
        });
        expect(route.primaryAction).toMatchObject({
            id: 'encounter:n-plus-one',
            reason: 'n-plus-one',
            coverage: {
                knownConceptIds: ['known:a', 'known:b'],
                newConceptIds: ['new:c'],
                targetConceptIds: ['new:c'],
            },
        });
        expect(route.motivation.competence.basis).toBe('n-plus-one');
    });

    it('does not route an encounter whose encounter or scene completion is already recorded', () => {
        const completed: LearnerEvent[] = [encounteredEvent('encounter-event', 1, 'encounter:a'), sceneEvent('scene-event', 1, 'encounter:b')];
        const route = projectDailyLearningRoute({
            events: completed,
            evidence: [],
            candidates: [encounter('encounter:a', ['new:a']), encounter('encounter:b', ['new:b']), encounter('encounter:c', ['new:c'])],
            now: 2,
            dayBoundary: BOUNDARY,
        });
        expect(route.primaryAction.id).toBe('encounter:c');
    });

    it('uses explicit targets and set-based learner evidence to break equal n+1 fits', () => {
        const candidates = [encounter('encounter:a', ['known:a', 'new:a']), encounter('encounter:b', ['known:a', 'new:b'])];
        const mined = cross('mine', 1, 'vocabulary-mined', ['new:b']);
        const byEvidence = projectDailyLearningRoute({
            events: [academyEvidence('known', 0, ['known:a'])],
            evidence: [mined, { ...mined, evidenceId: 'mine:again', at: 2 }],
            candidates,
            now: 3,
            dayBoundary: BOUNDARY,
        });
        expect(byEvidence.primaryAction.id).toBe('encounter:b');

        const byTarget = projectDailyLearningRoute({
            events: [academyEvidence('known', 0, ['known:a'])],
            evidence: [],
            candidates,
            targetConceptIds: ['new:b'],
            now: 3,
            dayBoundary: BOUNDARY,
        });
        expect(byTarget.primaryAction.id).toBe('encounter:b');
    });

    it('lets later successful recall establish knowledge while mining alone remains a target', () => {
        const candidates = [encounter('encounter:word', ['known:a', 'word:a']), encounter('encounter:other', ['known:a', 'word:b'])];
        const mine = cross('mine', 1, 'vocabulary-mined', ['word:a']);
        const beforeRecall = projectDailyLearningRoute({
            events: [academyEvidence('known', 0, ['known:a'])],
            evidence: [mine],
            candidates,
            now: 1,
            dayBoundary: BOUNDARY,
        });
        expect(beforeRecall.primaryAction.id).toBe('encounter:word');

        const afterRecall = projectDailyLearningRoute({
            events: [academyEvidence('known', 0, ['known:a'])],
            evidence: [
                mine,
                cross('recall', 2, 'later-recall', ['word:a'], undefined, {
                    priorEvidenceId: 'mine',
                    outcome: 'pass',
                    independent: true,
                }),
            ],
            candidates,
            now: 2,
            dayBoundary: BOUNDARY,
        });
        expect(afterRecall.primaryAction.id).toBe('encounter:other');
        expect(afterRecall.primaryAction).toMatchObject({
            coverage: { knownConceptIds: ['known:a'], newConceptIds: ['word:b'] },
        });
    });

    it('keeps the full route and motivational arc deterministic across input permutations', () => {
        const events = Object.freeze([academyEvidence('known', 0, ['known:a'])]);
        const evidence = Object.freeze([cross('mine', 1, 'vocabulary-mined', ['new:a'])]);
        const candidates = Object.freeze([encounter('encounter:z', ['known:a', 'new:z']), encounter('encounter:a', ['known:a', 'new:a'])]);
        const input = {
            events,
            evidence,
            candidates,
            now: 2,
            dayBoundary: BOUNDARY,
        };
        const route = projectDailyLearningRoute(input);
        const permuted = projectDailyLearningRoute({
            ...input,
            events: [...events].reverse(),
            evidence: [...evidence].reverse(),
            candidates: [...candidates].reverse(),
        });
        expect(permuted).toEqual(route);
        expect(permuted.motivation).toEqual(route.motivation);
        expect(candidates.map((candidate) => candidate.id)).toEqual(['encounter:z', 'encounter:a']);
    });

    it('offers calendar-aware welcome-back recovery with every earned reward intact', () => {
        const lastActivity = Date.UTC(2026, 6, 13, 12);
        const now = Date.UTC(2026, 6, 17, 12);
        const rewardedRead = cross('read', lastActivity, 'passage-read', ['read:a'], incentive('journal-memory', 'read:a'));
        const events: LearnerEvent[] = [
            academyEvidence('learn', lastActivity, ['known:a']),
            journalEvent('journal', lastActivity, 'line:a'),
            relationshipEvent('bond', lastActivity, 'rie', 2),
            assetEvent('place', lastActivity, 'place:a'),
        ];
        const route = projectDailyLearningRoute({
            events,
            evidence: [rewardedRead],
            candidates: [lesson('lesson:a', 1, ['lesson:a'])],
            now,
            dayBoundary: BOUNDARY,
        });

        expect(route.recovery).toEqual({
            mode: 'welcome-back',
            missedDays: 3,
            message: 'Welcome back. Continue from where you left off.',
            rewardsPreserved: true,
            preservedAcademyRewardEventIds: ['bond', 'journal', 'place'],
        });
        expect(route.earnedIncentives).toEqual([incentive('journal-memory', 'read:a')]);
        expect(JSON.stringify(route.recovery)).not.toMatch(/broken|guilt|lost|streak/i);
        expect(route.motivation.competence).toEqual({
            basis: 'welcome-back',
            message: 'Welcome back. Everything already earned is still here; continue at your own pace.',
        });
        expect(JSON.stringify(route.motivation)).not.toMatch(/broken|guilt|lost|streak|hurry|expire/i);
    });

    it('counts qualified cross-Yomu activity for recovery but not a toggle or mining alone', () => {
        const now = Date.UTC(2026, 6, 17, 12);
        const yesterday = Date.UTC(2026, 6, 16, 12);
        const passive = [
            cross('toggle', yesterday, 'reader-mode-use', ['reader:a'], undefined, {
                mode: 'immersion-filter',
                engagement: 'toggle',
            }),
            cross('mine', yesterday, 'vocabulary-mined', ['word:a']),
        ];
        const input = {
            events: [academyEvidence('old', Date.UTC(2026, 6, 12, 12), ['known:a'])],
            candidates: [lesson('lesson:a', 1, ['lesson:a'])],
            now,
            dayBoundary: BOUNDARY,
        };
        expect(projectDailyLearningRoute({ ...input, evidence: passive }).recovery.mode).toBe('welcome-back');
        expect(
            projectDailyLearningRoute({
                ...input,
                evidence: [...passive, cross('video', yesterday, 'japanese-subtitle-viewing', ['video:a'])],
            }).recovery,
        ).toMatchObject({ mode: 'continue', missedDays: 0 });

        expect(
            projectDailyLearningRoute({
                ...input,
                events: [...input.events, closedDayEvent('closed', yesterday)],
                evidence: passive,
            }).recovery,
        ).toMatchObject({ mode: 'continue', missedDays: 0 });
    });

    it('rejects ambiguous ids and incentives outside the closed diegetic set', () => {
        const duplicate = lesson('same', 1, ['lesson:a']);
        expect(() =>
            projectDailyLearningRoute({
                events: [],
                evidence: [],
                candidates: [duplicate, { ...duplicate }],
                now: 0,
                dayBoundary: BOUNDARY,
            }),
        ).toThrow('candidate ids must be unique');

        const canonical = {
            ...duplicate,
            incentive: { kind: 'canonical-story', id: 'chapter:2' },
        } as unknown as DailyLearningCandidate;
        expect(() =>
            projectDailyLearningRoute({
                events: [],
                evidence: [],
                candidates: [canonical],
                now: 0,
                dayBoundary: BOUNDARY,
            }),
        ).toThrow('diegetic');

        const duplicateEvidence = cross('same-evidence', 0, 'passage-read', ['read:a']);
        expect(() =>
            projectDailyLearningRoute({
                events: [],
                evidence: [duplicateEvidence, { ...duplicateEvidence }],
                candidates: [lesson('lesson:a', 1, ['lesson:a'])],
                now: 0,
                dayBoundary: BOUNDARY,
            }),
        ).toThrow('evidence ids must be unique');

        const missingCharacter = {
            ...encounter('encounter:bond', ['bond:a'], 'bond'),
            characterId: undefined,
        } as DailyLearningCandidate;
        expect(() =>
            projectDailyLearningRoute({
                events: [],
                evidence: [],
                candidates: [missingCharacter],
                now: 0,
                dayBoundary: BOUNDARY,
            }),
        ).toThrow('characterId');
    });

    it('fails explicitly when no humane action is available', () => {
        expect(() =>
            projectDailyLearningRoute({
                events: [],
                evidence: [],
                candidates: [],
                now: 0,
                dayBoundary: BOUNDARY,
            }),
        ).toThrow('at least one available action');
    });
});

function lesson(id: string, sequence: number, conceptIds: readonly string[]): DailyLearningCandidate {
    return {
        kind: 'lesson',
        id,
        label: `Continue ${id}`,
        modeId: 'normal-challenge',
        skill: 'reading',
        format: 'reading',
        conceptIds,
        incentive: incentive('source-unlock', `source:${id}`),
        sequence,
        completionActivityId: `complete:${id}`,
        grounding: { sourceId: `source:${id}` },
    };
}

function encounter(id: string, conceptIds: readonly string[], encounterKind: 'world' | 'bond' = 'world'): DailyLearningCandidate {
    return {
        kind: 'encounter',
        encounterKind,
        id,
        label: `Visit ${id}`,
        modeId: 'normal-challenge',
        skill: 'transfer',
        format: 'mixed',
        conceptIds,
        incentive: incentive(encounterKind === 'bond' ? 'bond-scene' : 'place-discovery', `reward:${id}`),
        ...(encounterKind === 'bond' ? { characterId: 'rie' } : {}),
    };
}

function cross(
    evidenceId: string,
    at: number,
    kind: CrossYomuEvidence['kind'],
    conceptIds: readonly string[],
    reward?: DiegeticIncentive,
    details: Record<string, unknown> = {},
): CrossYomuEvidence {
    const defaults: Record<CrossYomuEvidence['kind'], Record<string, unknown>> = {
        'japanese-subtitle-viewing': { sustained: true },
        'reader-mode-use': { mode: 'japanese-only', engagement: 'active-reading' },
        'passage-read': { completed: true },
        'vocabulary-mined': { collectionItemId: `collection:${evidenceId}` },
        'later-recall': {
            priorEvidenceId: 'prior',
            outcome: 'pass',
            independent: true,
        },
        'spaced-passage-return': {
            priorEvidenceId: 'prior',
            outcome: 'pass',
            independent: true,
        },
    };
    return {
        evidenceId,
        at,
        kind,
        sourceId: `source:${kind}`,
        conceptIds,
        ...(reward ? { incentive: reward } : {}),
        ...defaults[kind],
        ...details,
    } as CrossYomuEvidence;
}

function incentive(kind: DiegeticIncentive['kind'], id: string): DiegeticIncentive {
    return { kind, id };
}

function academyEvidence(
    eventId: string,
    at: number,
    conceptIds: readonly string[],
    extra: Partial<Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }>> = {},
): Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }> {
    return {
        schemaVersion: 1,
        kind: 'learning-evidence-recorded',
        eventId,
        at,
        activityId: `activity:${eventId}`,
        modeId: 'normal-challenge',
        skill: 'reading',
        action: 'read',
        outcome: 'pass',
        conceptIds,
        independent: true,
        ...extra,
    };
}

function scheduled(eventId: string, reviewItemId: string, conceptId: string, dueAt: number, at: number): Extract<LearnerEvent, { kind: 'review-scheduled' }> {
    return {
        schemaVersion: 1,
        kind: 'review-scheduled',
        eventId,
        at,
        reviewItemId,
        conceptId,
        dueAt,
        provenance: { source: 'test' },
    };
}

function rated(eventId: string, reviewItemId: string, rating: 'again' | 'good', at: number): Extract<LearnerEvent, { kind: 'review-rated' }> {
    return {
        schemaVersion: 1,
        kind: 'review-rated',
        eventId,
        at,
        reviewItemId,
        rating,
    };
}

function neutralized(eventId: string, scheduledEventId: string, at: number): Extract<LearnerEvent, { kind: 'review-schedule-neutralized' }> {
    return {
        schemaVersion: 1,
        kind: 'review-schedule-neutralized',
        eventId,
        at,
        scheduledEventId,
        reason: 'legacy-ungrounded-academy',
    };
}

function journalEvent(eventId: string, at: number, journalLineId: string): Extract<LearnerEvent, { kind: 'journal-line-recorded' }> {
    return {
        schemaVersion: 1,
        kind: 'journal-line-recorded',
        eventId,
        at,
        journalLineId,
        characterId: 'rie',
        text: { ja: 'またね', en: 'See you' },
        activityId: 'activity:journal',
    };
}

function relationshipEvent(
    eventId: string,
    at: number,
    characterId: string,
    chapter: number,
): Extract<LearnerEvent, { kind: 'relationship-chapter-unlocked' }> {
    return {
        schemaVersion: 1,
        kind: 'relationship-chapter-unlocked',
        eventId,
        at,
        characterId,
        chapter,
    };
}

function assetEvent(eventId: string, at: number, assetId: string): Extract<LearnerEvent, { kind: 'asset-unlocked' }> {
    return { schemaVersion: 1, kind: 'asset-unlocked', eventId, at, assetId };
}

function encounteredEvent(eventId: string, at: number, encounterId: string): Extract<LearnerEvent, { kind: 'characters-encountered' }> {
    return {
        schemaVersion: 1,
        kind: 'characters-encountered',
        eventId,
        at,
        encounterId,
        sceneId: `scene:${encounterId}`,
        attendeeIds: ['rie'],
    };
}

function sceneEvent(eventId: string, at: number, sceneId: string): Extract<LearnerEvent, { kind: 'scene-completed' }> {
    return { schemaVersion: 1, kind: 'scene-completed', eventId, at, sceneId };
}

function closedDayEvent(eventId: string, at: number): Extract<LearnerEvent, { kind: 'academy-day-closed' }> {
    return {
        schemaVersion: 1,
        kind: 'academy-day-closed',
        eventId,
        at,
        dayId: `day:${eventId}`,
        mainLessonCompleted: true,
        optionalActivityIds: [],
        elapsedMs: 0,
    };
}
