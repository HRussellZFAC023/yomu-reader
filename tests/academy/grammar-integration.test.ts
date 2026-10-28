import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    adaptAuthoredWeek,
    AUTHORED_WEEK_HASHES,
    type AuthoredChoiceEvaluation,
    type LearnerAuthoredChoice,
} from '../../src/academy/content/authored-week-adapter';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import {
    ACADEMY_GRAMMAR_CONCEPTS,
    ACADEMY_GRAMMAR_PLAYABLE_SLICE,
    grammarConceptId,
    grammarRuleIdForConcept,
} from '../../src/academy/integration/grammar-concepts';
import type { ReviewQueueService } from '../../src/academy/integration/yomu-bridge';
import {
    readGrammarKnowledge,
    readGrammarPreferences,
    setGrammarRuleKnowledge,
} from '../../src/reader/study/grammar-knowledge';
import { renderGrammarHints, type GrammarHint } from '../../src/reader/study/tools-impl';
import { YOMU_GRAMMAR_REGISTRY } from '../../src/reader/study/grammar-registry';
import { sha256File } from './helpers/hash-memo';

function firstWeek() {
    const file = path.resolve('public/academy/content/lessons/002-l1-l01.json');
    const bytes = fs.readFileSync(file);
    return {
        source: { path: file, sha256: sha256File(file) },
        json: JSON.parse(bytes.toString('utf8')) as {
            components: Array<{ exercises?: Array<{ id: string; options?: Array<{ id: string; correct: boolean }> }> }>;
        },
    };
}

function reviewService(): ReviewQueueService {
    return {
        async ingest() {},
        async due() { return []; },
        async rate() {},
    };
}

function grammarAttempt(activity: LearnerAuthoredChoice, evaluation: AuthoredChoiceEvaluation) {
    return {
        result: evaluation.result,
        attempt: {
            kind: 'attempt-recorded' as const,
            activityId: activity.id,
            sourceQuestionId: activity.sourceQuestionId,
            conceptIds: activity.conceptIds,
            responseKind: activity.responseKind,
            outcome: evaluation.result.outcome,
            score: evaluation.result.score,
            errorTags: evaluation.result.errorTags,
        },
        reviewSeeds: evaluation.reviewSeeds,
    };
}

const PARTICLE_WA_HINT: GrammarHint = {
    ruleId: 'particle-wa',
    name: 'は',
    level: 'N5',
    kind: 'Particle',
    short: 'marks the topic',
    detail: 'Use は to mark the topic.',
    url: '',
    match: '私は',
    confidence: 'high',
    index: 1,
};

describe('Academy grammar integration', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('projects every real Yomu grammar rule into one reversible Academy concept identity', () => {
        expect(YOMU_GRAMMAR_REGISTRY).toHaveLength(307);
        expect(ACADEMY_GRAMMAR_CONCEPTS).toHaveLength(YOMU_GRAMMAR_REGISTRY.length);
        expect(new Set(ACADEMY_GRAMMAR_CONCEPTS.map(concept => concept.conceptId)).size).toBe(307);
        for (const rule of YOMU_GRAMMAR_REGISTRY) {
            const conceptId = grammarConceptId(rule.ruleId);
            expect(grammarRuleIdForConcept(conceptId)).toBe(rule.ruleId);
        }
        expect(grammarRuleIdForConcept('concept:grammar:not-real')).toBeUndefined();
    });

    it('declares only the focused l1-l01 homes and emits their canonical concepts', () => {
        const loaded = firstWeek();
        expect(loaded.source.sha256).toBe(AUTHORED_WEEK_HASHES['l1-l01']);
        const week = adaptAuthoredWeek(loaded.json, loaded.source);

        expect(ACADEMY_GRAMMAR_PLAYABLE_SLICE.map(home => [home.sourceQuestionId, home.conceptId, home.role])).toEqual([
            ['l1-l01/ex-grammar-particle', 'concept:grammar:particle-wa', 'guided-practice'],
            ['l1-l01/ex-grammar-negative', 'concept:grammar:negative-copula-dewa-nai', 'guided-practice'],
            ['l1-l01/ex-review-desu', 'concept:grammar:copula-desu-da', 'cumulative-review'],
        ]);
        for (const home of ACADEMY_GRAMMAR_PLAYABLE_SLICE) {
            expect(week.activities.find(activity => activity.sourceQuestionId === home.sourceQuestionId)?.conceptIds)
                .toEqual([home.conceptId]);
        }
    });

    it('records a real lesson pass once and exposes it immediately to Reader known-state rendering', async () => {
        const loaded = firstWeek();
        const week = adaptAuthoredWeek(loaded.json, loaded.source);
        const activity = week.activities.find(candidate => candidate.sourceQuestionId === 'l1-l01/ex-grammar-particle') as LearnerAuthoredChoice;
        const sourceExercise = loaded.json.components.flatMap(component => component.exercises ?? [])
            .find(exercise => exercise.id === 'ex-grammar-particle')!;
        const correct = sourceExercise.options!.find(option => option.correct)!.id;
        const evaluated = week.evaluate(activity.id, correct);
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();

        await evidence.recordActivity(grammarAttempt(activity, evaluated), 'authored-week:l1-l01');
        await evidence.recordActivity(grammarAttempt(activity, evaluated), 'authored-week:l1-l01');

        expect(evidence.projection.grammarKnowledge['concept:grammar:particle-wa']).toBe('known');
        expect(readGrammarPreferences().knownRuleIds).toContain('particle-wa');
        const hints = await renderGrammarHints([PARTICLE_WA_HINT], '私は学生です。');
        expect(hints).toContain('All detected grammar is marked known.');
        expect(hints).not.toContain('data-grammar-rule-id');
        expect((await repository.readAll()).filter(event => event.kind === 'grammar-known-changed')).toHaveLength(1);
    });

    it('imports a newer Reader toggle into the Academy learner event projection', async () => {
        setGrammarRuleKnowledge('particle-wa', 'known', {
            at: 123,
            changeId: 'grammar-known:reader-test',
        });
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());

        await evidence.initialize();
        await evidence.refresh();

        expect(evidence.projection.grammarKnowledge['concept:grammar:particle-wa']).toBe('known');
        expect(readGrammarKnowledge().entries['particle-wa']?.changeId).toBe('grammar-known:reader-test');
        expect((await repository.readAll()).filter(event => event.kind === 'grammar-known-changed')).toEqual([
            expect.objectContaining({
                eventId: 'grammar-known:reader-test',
                at: 123,
                conceptId: 'concept:grammar:particle-wa',
                knowledge: 'known',
            }),
        ]);
    });

    it('fast-forwards a Reader-known rule that changes after Academy opens without adding a second fact', async () => {
        const loaded = firstWeek();
        const week = adaptAuthoredWeek(loaded.json, loaded.source);
        const activity = week.activities.find(candidate => candidate.sourceQuestionId === 'l1-l01/ex-grammar-particle') as LearnerAuthoredChoice;
        const sourceExercise = loaded.json.components.flatMap(component => component.exercises ?? [])
            .find(exercise => exercise.id === 'ex-grammar-particle')!;
        const correct = sourceExercise.options!.find(option => option.correct)!.id;
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();

        setGrammarRuleKnowledge('particle-wa', 'known', {
            at: 456,
            changeId: 'grammar-known:reader-open-academy',
        });
        await evidence.recordActivity(grammarAttempt(activity, week.evaluate(activity.id, correct)), 'authored-week:l1-l01');

        expect(evidence.projection.grammarKnowledge['concept:grammar:particle-wa']).toBe('known');
        expect(readGrammarKnowledge().entries['particle-wa']).toEqual({
            knowledge: 'known',
            at: 456,
            changeId: 'grammar-known:reader-open-academy',
        });
        expect((await repository.readAll()).filter(event => event.kind === 'grammar-known-changed')).toEqual([
            expect.objectContaining({
                eventId: 'grammar-known:reader-open-academy',
                at: 456,
                conceptId: 'concept:grammar:particle-wa',
                knowledge: 'known',
            }),
        ]);
    });
});
