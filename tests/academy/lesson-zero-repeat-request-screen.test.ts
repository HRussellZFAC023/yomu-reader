import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroRepeatRequestDefinition, LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID } from '../../src/academy/content/lesson-zero-repeat-request';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startLessonZeroRepeatRequestSession } from '../../src/academy/domain/lesson-zero-repeat-request-session';
import { createLessonZeroRepeatRequestScreen } from '../../src/academy/ui/lesson-zero-repeat-request-screen';

const CLASSROOM_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function definition() {
    const classroom = validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')));
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
    const activity = lesson.activities.find(candidate =>
        candidate.id === LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID)!;
    return createLessonZeroRepeatRequestDefinition(classroom, activity);
}

function buttonContaining(root: HTMLElement, text: string): HTMLButtonElement {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.includes(text));
    if (!button) throw new Error(`Could not find button containing ${text}.`);
    return button;
}

function chunkButton(root: HTMLElement, chunkId: string): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>(`[data-chunk-id="${chunkId}"]`);
    if (!button) throw new Error(`Could not find chunk button ${chunkId}.`);
    return button;
}

describe('Lesson Zero repetition-request screen', () => {

    it('shows only the slipped sound after a reversed attempt and can persist a pause', async () => {
        const content = definition();
        let persisted = startLessonZeroRepeatRequestSession(content);
        const onBack = vi.fn(async () => undefined);
        const screen = createLessonZeroRepeatRequestScreen({
            language: 'en',
            definition: content,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack,
            onComplete: vi.fn(),
        });

        buttonContaining(screen.element, 'Build the request').click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('practice'));
        chunkButton(screen.element, 'please').click();
        await vi.waitFor(() => expect(persisted.selectedChunkIds).toEqual(['please']));
        chunkButton(screen.element, 'once-more').click();
        await vi.waitFor(() => expect(persisted.selectedChunkIds).toEqual(['please', 'once-more']));
        buttonContaining(screen.element, 'Ask Rie').click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('One small fix'));
        expect(screen.element.textContent).toContain('もう一度');
        expect(screen.element.textContent).not.toContain('もう一度お願いします。');
        expect(screen.element.textContent).not.toContain('onegaishimasu turns');

        buttonContaining(screen.element, 'Save and leave').click();
        await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
        expect(persisted.status).toBe('paused');
        screen.dispose();
    });
});
