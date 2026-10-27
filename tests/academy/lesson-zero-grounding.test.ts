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

    it('keeps the existing source-fidelity validator in front of grounding', () => {
        const candidate = packageJson() as {
            sourceLibrary: { documents: Array<{ sha256: string }> };
        };
        candidate.sourceLibrary.documents[0]!.sha256 = '0'.repeat(64);
        expect(() => validateLessonZeroGrounding(candidate)).toThrow(/source hash changed/i);
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
