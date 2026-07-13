import fs from 'node:fs';
import path from 'node:path';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { createLessonZeroPedagogy } from '../../src/academy/content/lesson-zero-pedagogy';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { assertGroundedLessonDefinitionsResolve } from '../../src/academy/domain/grounded-definition-registry';

const CONTENT_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function packageJson(): unknown {
    return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
}

describe('Lesson 0 grounding audit', () => {
    it('covers every authored activity and reports the current package honestly', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        const source = packageJson() as { lesson: { activities: Array<{ id: string }> } };

        expect(grounding.lessonId).toBe('lesson:foundation-00');
        expect(grounding.activities.map(activity => activity.id))
            .toEqual(source.lesson.activities.map(activity => activity.id));
        expect(grounding.activities).toHaveLength(18);
        expect(grounding.status).toBe('review-blocked');
        expect(grounding.activities.every(activity => activity.status === 'review-blocked')).toBe(true);
        expect(grounding.blockerIds).toEqual(expect.arrayContaining([
            'blocker:lesson-zero-grounded-prerequisites',
            'blocker:lesson-zero-grounded-authored-language-review',
            'blocker:lesson-zero-grounded-instruction',
            'blocker:lesson-zero-grounded-assessment-definitions',
            'blocker:lesson-zero-grounded-repair',
            'blocker:lesson-zero-grounded-review-seeds',
            'blocker:lesson-zero-grounded-accessibility',
            'blocker:lesson-zero-grounded-transfer-context',
            'blocker:lesson-zero-verified-dialogue-audio',
        ]));
    });

    it('preserves exact source provenance and blocks unreviewed authored language', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        const overviewInput = grounding.overview.proofs.input;
        expect(overviewInput.state).toBe('ready');
        if (overviewInput.state !== 'ready' || overviewInput.evidence.kind !== 'source') return;
        expect(overviewInput.evidence.sourceQuestionIds).toHaveLength(14);
        expect(overviewInput.evidence.documents).toEqual([
            expect.objectContaining({
                id: 'document:moodle-1e58967e',
                sha256: '1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba',
            }),
        ]);

        const sourced = grounding.activities.find(activity => activity.id === 'activity:lesson-zero-vowel-doodle')
            ?.proofs.input;
        expect(sourced?.state).toBe('ready');
        if (sourced?.state !== 'ready') return;
        expect(sourced.evidence).toMatchObject({
            kind: 'source',
            sourceQuestionIds: ['source-question:classroom-phrase-07'],
        });

        const authored = grounding.activities.find(activity => activity.id === 'activity:lesson-zero-greet-rie')
            ?.proofs.input;
        expect(authored).toEqual({
            state: 'review-blocked',
            blockerIds: ['blocker:lesson-zero-grounded-authored-language-review'],
        });
    });

    it('does not invent changed-context transfer evidence from section names', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        expect(grounding.overview.productionSequence).toEqual({
            state: 'review-blocked',
            blockerIds: ['blocker:lesson-zero-grounded-transfer-context'],
        });
        expect(grounding.status).toBe('review-blocked');
    });

    it('keeps the existing source-fidelity validator in front of grounding', () => {
        const candidate = packageJson() as {
            sourceLibrary: { documents: Array<{ sha256: string }> };
        };
        candidate.sourceLibrary.documents[0]!.sha256 = '0'.repeat(64);
        expect(() => validateLessonZeroGrounding(candidate)).toThrow(/source hash changed/i);
    });

    it('does not promote rubric ids, blocked audio, or expected evidence into release proof', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        const rubricActivity = grounding.activities.find(activity =>
            activity.id === 'activity:lesson-zero-written-transfer');
        expect(rubricActivity?.proofs.assessment).toEqual({
            state: 'review-blocked',
            blockerIds: ['blocker:lesson-zero-grounded-assessment-definitions'],
        });
        const listening = grounding.activities.find(activity =>
            activity.id === 'activity:lesson-zero-sound-input');
        expect(listening?.proofs.media).toEqual({
            state: 'review-blocked',
            blockerIds: ['blocker:lesson-zero-verified-dialogue-audio'],
        });
        expect(listening?.proofs.learnerEvidence.state).toBe('review-blocked');
    });

    it('keeps concealment blocked until the shipped pre-commit surface is audited', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        for (const activity of grounding.activities) {
            expect(activity.proofs.answerConcealment).toEqual({
                state: 'review-blocked',
                blockerIds: ['blocker:lesson-zero-answer-concealment-surface-audit'],
            });
        }
    });

    it('keeps speech and handwriting blocked until construct-preserving access is mapped', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        for (const activityId of [
            'activity:lesson-zero-greet-rie',
            'activity:lesson-zero-vowel-doodle',
            'activity:lesson-zero-speaking-transfer',
        ]) {
            const activity = grounding.activities.find(candidate => candidate.id === activityId);
            expect(activity?.proofs.accessibility).toEqual({
                state: 'review-blocked',
                blockerIds: ['blocker:lesson-zero-grounded-accessibility'],
            });
            expect(activity?.status).toBe('review-blocked');
        }
    });

    it('grounds the fourteen source expressions without pretending scene actions are text answers', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        const classroom = [
            'activity:lesson-zero-follow-instructions',
            'activity:lesson-zero-reconstruct-repair',
            'activity:lesson-zero-desk-language',
        ].map(id => grounding.activities.find(activity => activity.id === id)!);

        expect(classroom.every(activity => activity.proofs.instruction.state === 'ready')).toBe(true);
        expect(classroom.every(activity => activity.proofs.repair.state === 'ready')).toBe(true);
        expect(classroom.every(activity => activity.proofs.learnerEvidence.state === 'ready')).toBe(true);
        const reviewItems = classroom.flatMap(activity => activity.proofs.learnerEvidence.state === 'ready'
            ? activity.proofs.learnerEvidence.evidence.reviewItems
            : []);
        expect(reviewItems).toHaveLength(17);
        expect(new Set(reviewItems.map(item => item.seedId)).size).toBe(17);
        expect(reviewItems).toContainEqual(expect.objectContaining({
            expressionKey: 'もう一度お願いします',
            readingKey: 'もういちどおねがいします',
        }));

        expect(classroom[0]!.proofs.assessment).toEqual({
            state: 'review-blocked',
            blockerIds: ['blocker:lesson-zero-scene-action-grader'],
        });
        expect(classroom[1]!.proofs.assessment.state).toBe('ready');
        expect(classroom[2]!.proofs.assessment.state).toBe('ready');
    });

    it('resolves the defensible local prerequisite and keeps the lesson-level transfer blocker', () => {
        const grounding = validateLessonZeroGrounding(packageJson());
        const repair = grounding.activities.find(activity =>
            activity.id === 'activity:lesson-zero-reconstruct-repair')!;
        expect(repair.proofs.curriculum).toMatchObject({
            state: 'ready',
            evidence: {
                prerequisites: {
                    kind: 'resolved',
                    conceptIds: [
                        'concept:classroom-start-stop-break',
                        'concept:classroom-look-say-listen-write',
                    ],
                },
            },
        });
        expect(grounding.overview.productionSequence).toEqual({
            state: 'review-blocked',
            blockerIds: ['blocker:lesson-zero-grounded-transfer-context'],
        });
    });

    it('rejects dangling and digest-mismatched definition references', () => {
        const value = packageJson();
        const grounding = validateLessonZeroGrounding(value);
        const pedagogy = createLessonZeroPedagogy(validateLessonZeroPackage(value));
        const repair = grounding.activities.find(activity =>
            activity.id === 'activity:lesson-zero-reconstruct-repair')!;
        const instruction = repair.proofs.instruction;
        if (instruction.state !== 'ready') throw new Error('Expected grounded classroom instruction.');
        const reference = instruction.evidence.conceptCoverage[0]!.explanationRefs[0]!;

        (reference as { id: string }).id = 'explanation:lesson-zero:missing';
        expect(() => assertGroundedLessonDefinitionsResolve(grounding, pedagogy.registry))
            .toThrow(/dangling grounded definition/i);

        (reference as { id: string; sha256: string }).id = 'explanation:lesson-zero:classroom-understanding';
        (reference as { sha256: string }).sha256 = '0'.repeat(64);
        expect(() => assertGroundedLessonDefinitionsResolve(grounding, pedagogy.registry))
            .toThrow(/does not match its registered revision and digest/i);
    });
});
