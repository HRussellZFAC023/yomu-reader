import type { LearnerEvent } from '../../src/academy/domain/learner-record';
import {
    ACADEMY_LEARNER_MODELS,
    createAdaptiveLearnerModel,
    createLearnerModelRegistry,
    type LearningCandidate,
} from '../../src/academy/personalization';

const DAY = 24 * 60 * 60 * 1_000;
const NOW = 10 * DAY;

describe('adaptive learner model', () => {
    const model = createAdaptiveLearnerModel();

    it('offers a cold-start test-out, with an n=0 lesson fallback', () => {
        const learn = candidate('learn-kana', { purpose: 'learn', challengeLevel: 1 });
        const testOut = candidate('test-kana', { purpose: 'test-out', challengeLevel: 2 });

        expect(model.selectNext({ events: [], candidates: [learn, testOut], now: NOW }).primary)
            .toMatchObject({ candidate: { id: 'test-kana' }, reasons: ['test-out'] });
        expect(model.selectNext({ events: [], candidates: [learn], now: NOW }).primary)
            .toMatchObject({ candidate: { id: 'learn-kana' }, reasons: ['n-plus-one'] });
    });

    it('selects the next challenge above demonstrated storage strength', () => {
        const events = [
            evidence('pass-1', DAY, { outcome: 'pass' }),
            evidence('pass-2', 2 * DAY, { outcome: 'pass' }),
        ];
        const selection = model.selectNext({
            events,
            candidates: [
                candidate('consolidate', { purpose: 'practice', challengeLevel: 2 }),
                candidate('n-plus-one', { purpose: 'learn', challengeLevel: 3 }),
            ],
            now: NOW,
        });

        expect(model.projectEvidence(events, NOW).find(item => item.skill === 'kana'))
            .toMatchObject({ storageLevel: 2, distinctIndependentDays: 2 });
        expect(selection.primary).toMatchObject({ candidate: { id: 'n-plus-one' }, reasons: ['n-plus-one'] });
    });

    it('prioritizes due retrieval without surfacing retrieval scheduled for the future', () => {
        const selection = model.selectNext({
            events: [evidence('pass', DAY, { outcome: 'pass' })],
            candidates: [
                candidate('learn', { purpose: 'learn', challengeLevel: 2 }),
                candidate('future-review', { purpose: 'retrieval', dueAt: NOW + DAY }),
                candidate('due-review', { purpose: 'retrieval', dueAt: NOW - DAY }),
            ],
            now: NOW,
        });

        expect(selection.primary).toMatchObject({ candidate: { id: 'due-review' }, reasons: ['retrieval-due'] });
        expect([selection.primary, ...selection.alternatives].map(action => action?.candidate.id))
            .not.toContain('future-review');
    });

    it('keeps repair due until an independent success resolves the lapse', () => {
        const lapse = evidence('lapse', DAY, { outcome: 'lapse' });
        const supported = evidence('supported', 2 * DAY, { outcome: 'pass', independent: false });
        const repair = candidate('repair', { purpose: 'repair' });
        const events = [lapse, supported];

        expect(model.projectEvidence(events, NOW).find(item => item.skill === 'kana'))
            .toMatchObject({ repairDebt: 1, supportedPasses: 1, independentPasses: 0, storageLevel: 0 });
        expect(model.selectNext({ events, candidates: [candidate('learn'), repair], now: NOW }).primary)
            .toMatchObject({ candidate: { id: 'repair' }, reasons: ['repair-due'] });

        const repaired = [...events, evidence('independent', 3 * DAY, { outcome: 'pass' })];
        expect(model.projectEvidence(repaired, NOW).find(item => item.skill === 'kana')?.repairDebt).toBe(0);
        expect(model.selectNext({ events: repaired, candidates: [candidate('learn'), repair], now: NOW }).primary?.candidate.id)
            .toBe('learn');
    });

    it('fades post-attempt scaffolding only after independent evidence across days', () => {
        const supported = Array.from({ length: 8 }, (_, index) =>
            evidence(`supported-${index}`, index * DAY, { outcome: 'pass', independent: false }));
        const supportedAction = model.selectNext({
            events: supported,
            candidates: [candidate('next')],
            now: NOW,
        }).primary;
        expect(supportedAction?.scaffold).toMatchObject({ intensity: 'guided' });

        const independent = [0, 0, 1, 1, 2, 3].map((day, index) =>
            evidence(`independent-${index}`, day * DAY, { outcome: 'pass' }));
        const faded = model.selectNext({
            events: independent,
            candidates: [candidate('next', { challengeLevel: 5 })],
            now: NOW,
        }).primary?.scaffold;
        expect(model.projectEvidence(independent, NOW).find(item => item.skill === 'kana')?.storageLevel).toBe(4);
        expect(faded).toEqual({
            intensity: 'minimal',
            stages: [{ kind: 'strategy-reminder', availableAfter: 'first-attempt', answerBearing: false }],
        });
        expect(supportedAction?.scaffold.stages.every(stage => stage.availableAfter !== undefined)).toBe(true);
    });

    it('emits bounded expanding retrieval hooks and resets after lapses or support', () => {
        const base = { skill: 'kana' as const, conceptIds: ['kana:a'], at: NOW, successfulRetrievals: 3 };
        expect(model.retrievalHook({ ...base, outcome: 'pass', independent: true })).toMatchObject({
            schemaVersion: 1,
            intervalDays: 14,
            dueAt: NOW + 14 * DAY,
            reason: 'retrieval-success',
        });
        expect(model.retrievalHook({ ...base, successfulRetrievals: 99, outcome: 'pass', independent: true }).intervalDays)
            .toBe(30);
        expect(model.retrievalHook({ ...base, outcome: 'lapse', independent: true }))
            .toMatchObject({ intervalDays: 1, reason: 'lapse-reset' });
        expect(model.retrievalHook({ ...base, outcome: 'pass', independent: false }))
            .toMatchObject({ intervalDays: 1, reason: 'supported-reinforcement' });
    });

    it('returns one deterministic primary and at most one meaningful alternative', () => {
        const candidates = [
            candidate('b-kana'),
            candidate('a-kana'),
            candidate('reading', { skill: 'reading', conceptIds: ['reading:a'] }),
            candidate('pressure', { purpose: 'test-out', recommendation: 'opt-in-only' }),
        ];
        const first = model.selectNext({ events: [], candidates, now: NOW });
        const second = model.selectNext({ events: [], candidates: [...candidates].reverse(), now: NOW });

        expect(first).toEqual(second);
        expect(first.primary?.candidate.id).toBe('a-kana');
        expect(first.alternatives).toHaveLength(1);
        expect(first.alternatives[0]?.candidate.id).toBe('reading');
        expect([first.primary, ...first.alternatives].map(action => action?.candidate.id)).not.toContain('pressure');
    });

    it('uses explicit mission tags as a prior without parsing profile prose', () => {
        const selection = model.selectNext({
            events: [],
            candidates: [
                candidate('general'),
                candidate('travel', { missionTags: ['travel'] }),
            ],
            missionTags: ['travel'],
            now: NOW,
        });
        expect(selection.primary).toMatchObject({
            candidate: { id: 'travel' },
            reasons: ['n-plus-one', 'mission-aligned'],
        });
    });

    it('does not leak future evidence and rejects ambiguous candidate ids', () => {
        const future = evidence('future', NOW + DAY, { outcome: 'pass' });
        expect(model.projectEvidence([future], NOW).find(item => item.skill === 'kana'))
            .toMatchObject({ attempts: 0, storageLevel: 0 });
        expect(() => model.selectNext({
            events: [],
            candidates: [candidate('duplicate'), candidate('duplicate')],
            now: NOW,
        })).toThrow(/candidate ids must be unique/i);
        expect(() => model.selectNext({
            events: [],
            candidates: [candidate('undated-retrieval', { purpose: 'retrieval' })],
            now: NOW,
        })).toThrow(/needs dueAt/i);
    });
});

describe('learner-model registry', () => {
    it('wires the default plugin and rejects duplicate ids', () => {
        expect(ACADEMY_LEARNER_MODELS.ids).toEqual(['academy-adaptive-learner-v1']);
        expect(ACADEMY_LEARNER_MODELS.resolve('academy-adaptive-learner-v1').id)
            .toBe('academy-adaptive-learner-v1');
        const plugin = createAdaptiveLearnerModel();
        expect(() => createLearnerModelRegistry([plugin, plugin])).toThrow(/duplicate learner-model plugin/i);
        expect(() => createLearnerModelRegistry([{ ...plugin, id: ' padded ' }])).toThrow(/without surrounding whitespace/i);
        expect(() => ACADEMY_LEARNER_MODELS.resolve('missing')).toThrow(/unknown learner-model plugin/i);
    });
});

function candidate(id: string, overrides: Partial<LearningCandidate> = {}): LearningCandidate {
    return {
        id,
        skill: 'kana',
        purpose: 'learn',
        challengeLevel: 1,
        conceptIds: ['kana:a'],
        ...overrides,
    };
}

function evidence(
    eventId: string,
    at: number,
    overrides: Partial<Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }>> = {},
): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId,
        at,
        kind: 'learning-evidence-recorded',
        activityId: eventId,
        modeId: 'normal-challenge',
        skill: 'kana',
        action: 'recall',
        outcome: 'pass',
        conceptIds: ['kana:a'],
        independent: true,
        ...overrides,
    } as LearnerEvent;
}
