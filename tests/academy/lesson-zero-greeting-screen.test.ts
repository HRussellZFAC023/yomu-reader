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

async function clickPhrase(screen: HTMLElement, phrase: string): Promise<void> {
    const button = [...screen.querySelectorAll<HTMLButtonElement>('.academy-greeting-phrase-bank .academy-greeting-phrase')]
        .find(candidate => candidate.textContent?.includes(phrase));
    if (!button) throw new Error(`Missing phrase: ${phrase}`);
    button.click();
    await vi.waitFor(() => expect(
        [...screen.querySelectorAll<HTMLButtonElement>('.academy-greeting-phrase-bank .academy-greeting-phrase')]
            .some(candidate => candidate.textContent?.includes(phrase)),
    ).toBe(false));
}

describe('Lesson Zero first greeting screen', () => {
    it('teaches the four-part shape, provides a no-mic path, earns repair and completes', async () => {
        const content = definition();
        let persisted = startLessonZeroGreetingSession(content);
        const onTransition = vi.fn(async (_before, transition) => { persisted = transition.state; });
        const onComplete = vi.fn();
        const screen = createLessonZeroGreetingScreen({
            language: 'en',
            definition: content,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            recorder: { supported: false, start: vi.fn(), dispose: vi.fn() },
            onTransition,
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete,
        });

        expect(screen.element.textContent).toContain('Step into the room');
        expect(screen.element.querySelector('.academy-greeting-model-japanese')).toBeNull();
        [...screen.element.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Build my greeting')!.click();
        await vi.waitFor(() => expect(screen.element.querySelector('.academy-greeting-phrase-bank')).not.toBeNull());

        await clickPhrase(screen.element, 'こんばんは');
        await clickPhrase(screen.element, 'はじめまして');
        await clickPhrase(screen.element, 'Henryです');
        await clickPhrase(screen.element, 'よろしくお願いします');
        screen.element.querySelector<HTMLButtonElement>('.academy-greeting-action-primary')!.click();
        await vi.waitFor(() => expect(screen.element.querySelector('[data-mode="typed"]')).not.toBeNull());
        expect(screen.element.textContent).toContain('Private recording is unavailable here');

        screen.element.querySelector<HTMLButtonElement>('[data-mode="typed"]')!.click();
        await vi.waitFor(() => expect(screen.element.querySelector('.academy-greeting-type-input')).not.toBeNull());
        let input = screen.element.querySelector<HTMLTextAreaElement>('.academy-greeting-type-input')!;
        input.value = 'はじめまして。Henryです。';
        input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Keep the turn. Fix one piece.'));
        expect(screen.element.textContent).toContain('Keep the turn. Fix one piece.');
        expect(screen.element.querySelector('.academy-greeting-model-japanese')?.textContent)
            .toContain('こんばんは。はじめまして。Henryです。よろしくお願いします。');

        input = screen.element.querySelector<HTMLTextAreaElement>('.academy-greeting-type-input')!;
        input.value = 'こんばんは。はじめまして。Henryです。よろしくお願いします。';
        input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Good evening, Henry.'));
        expect(screen.element.textContent).toContain('Good evening, Henry.');
        expect(screen.element.querySelectorAll('.academy-greeting-review-phrase')).toHaveLength(4);
        [...screen.element.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Enter the lesson')!.click();
        expect(onComplete).toHaveBeenCalledOnce();
        screen.dispose();
    });

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
