import fs from 'node:fs';
import path from 'node:path';
import {
    createLessonZeroPedagogy,
    LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS,
    LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256,
    LESSON_ZERO_CONTENT_SHA256,
} from '../../src/academy/content/lesson-zero-pedagogy';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { lessonZeroCanonicalReading } from '../../src/academy/content/lesson-zero-pedagogy-definitions';
import type { ClassroomExpressionProbe } from '../../src/academy/domain/classroom-expression-session';
import { LESSON_ZERO_SOUND_RENDERER_SHA256 } from '../../src/academy/domain/lesson-zero-sound-grounding';
import { sha256File } from './helpers/hash-memo';

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
const CLASSROOM_PATH = path.resolve(
    'public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json',
);
const SOUND_SCREEN_PATH = path.resolve('src/academy/ui/lesson-zero-sound-screen.ts');

describe('Lesson 0 pedagogy definition registry', () => {
    it('pins its references to the exact canonical content files', () => {
        expect(digest(LESSON_PATH)).toBe(LESSON_ZERO_CONTENT_SHA256);
        expect(digest(CLASSROOM_PATH)).toBe(LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256);
        expect(digest(SOUND_SCREEN_PATH)).toBe(LESSON_ZERO_SOUND_RENDERER_SHA256);
    });

    it('binds all fourteen source expressions once and resolves real definitions', () => {
        const data = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8')));
        const pedagogy = createLessonZeroPedagogy(data);
        const expressionIds = LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS.flatMap(binding => binding.expressionIds);

        expect(expressionIds).toHaveLength(14);
        expect(new Set(expressionIds).size).toBe(14);
        expect(pedagogy.registry.size).toBeGreaterThan(80);
        expect(pedagogy.registry.resolveId(
            'review:lesson-zero:classroom-09-repeat',
            'review-seed',
        ).value).toEqual({
            conceptId: 'concept:classroom-repair-repeat',
            expressionKey: 'もう一度お願いします',
            readingKey: 'もういちどおねがいします',
        });
    });

    it('refuses to invent a Yomu reading key from kanji', () => {
        expect(() => lessonZeroCanonicalReading({
            id: 'probe:test-reading',
            acceptedAnswers: ['もう一度お願いします'],
            modelAnswer: 'もう一度お願いします',
        } as unknown as ClassroomExpressionProbe)).toThrow(/explicit kana reading/i);
    });
});

function digest(file: string): string {
    return sha256File(file);
}
