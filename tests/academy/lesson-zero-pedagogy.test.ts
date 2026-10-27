import { lessonZeroCanonicalReading } from '../../src/academy/content/lesson-zero-pedagogy-definitions';
import type { ClassroomExpressionProbe } from '../../src/academy/domain/classroom-expression-session';

describe('Lesson 0 pedagogy definition registry', () => {

    it('refuses to invent a Yomu reading key from kanji', () => {
        expect(() => lessonZeroCanonicalReading({
            id: 'probe:test-reading',
            acceptedAnswers: ['もう一度お願いします'],
            modelAnswer: 'もう一度お願いします',
        } as unknown as ClassroomExpressionProbe)).toThrow(/explicit kana reading/i);
    });
});
