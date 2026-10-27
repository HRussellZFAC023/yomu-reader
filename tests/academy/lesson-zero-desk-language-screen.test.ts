import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroDeskLanguageDefinition, LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID } from '../../src/academy/content/lesson-zero-desk-language';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startLessonZeroDeskLanguageSession } from '../../src/academy/domain/lesson-zero-desk-language-session';
import { createLessonZeroDeskLanguageScreen } from '../../src/academy/ui/lesson-zero-desk-language-screen';

const CLASSROOM_PATH = path.resolve(
    'public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json',
);

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function definition() {
    const classroom = validateLessonZeroClassroomExpressions(
        JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')),
    );
    const lesson = validateLessonZeroPackage(
        JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8')),
    ).lesson;
    const activity = lesson.activities.find(candidate =>
        candidate.id === LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID)!;
    return createLessonZeroDeskLanguageDefinition(classroom, activity);
}

function button(
    root: HTMLElement,
    selector: string,
): HTMLButtonElement {
    const match = root.querySelector<HTMLButtonElement>(selector);
    if (!match) throw new Error(`Missing button ${selector}.`);
    return match;
}

describe('Lesson Zero desk-language screen', () => {

    it('persists a pause without turning the focused screen into a global navigation panel', async () => {
        const content = definition();
        let persisted = startLessonZeroDeskLanguageSession(content);
        const onBack = vi.fn(async () => undefined);
        const screen = createLessonZeroDeskLanguageScreen({
            language: 'en',
            definition: content,
            initialState: persisted,
            pronunciation: { play: vi.fn() } as never,
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack,
            onComplete: vi.fn(),
        });

        button(screen.element, '[data-desk-action="next-introduction"]').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        button(screen.element, '.academy-desk-language-back').click();
        await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
        expect(persisted.status).toBe('paused');
        expect(screen.element.querySelector('main')).toBeNull();
        screen.dispose();
    });
});
