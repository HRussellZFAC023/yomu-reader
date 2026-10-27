import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroGreetingDefinition } from '../../src/academy/content/lesson-zero-greeting';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startLessonZeroGreetingSession } from '../../src/academy/domain/lesson-zero-greeting-session';
import { createLessonZeroGreetingScreen } from '../../src/academy/ui/lesson-zero-greeting-screen';

function definition() {
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
        path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
        'utf8',
    ))).lesson;
    return createLessonZeroGreetingDefinition(
        lesson.activities.find(activity => activity.id === 'activity:lesson-zero-greet-rie')!,
        'Henry',
    );
}

describe('Lesson Zero first greeting screen', () => {

    it('saves an active greeting before leaving', async () => {
        const content = definition();
        let persisted = startLessonZeroGreetingSession(content);
        const onBack = vi.fn();
        const screen = createLessonZeroGreetingScreen({
            language: 'en',
            definition: content,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            recorder: { supported: false, start: vi.fn(), dispose: vi.fn() },
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack,
            onComplete: vi.fn(),
        });
        [...screen.element.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Build my greeting')!.click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        screen.element.querySelector<HTMLButtonElement>('.academy-greeting-back')!.click();
        await vi.waitFor(() => expect(persisted.status).toBe('paused'));
        expect(onBack).toHaveBeenCalledOnce();
        screen.dispose();
    });
});
