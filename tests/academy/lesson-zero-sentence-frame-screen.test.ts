import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroSentenceFrameDefinition } from '../../src/academy/content/lesson-zero-sentence-frames';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startLessonZeroSentenceFrameSession } from '../../src/academy/domain/lesson-zero-sentence-frame-session';
import { createLessonZeroSentenceFrameScreen } from '../../src/academy/ui/lesson-zero-sentence-frame-screen';

function definition() {
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
        path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
        'utf8',
    ))).lesson;
    return createLessonZeroSentenceFrameDefinition(
        lesson.activities.find(activity => activity.id === 'activity:lesson-zero-build-sentence-frames')!,
        'Henry',
    );
}

describe('Lesson Zero sentence-frame screen', () => {
    it('keeps the exact target out of the DOM until the learner commits and asks for it', async () => {
        const content = definition();
        const target = content.frames[0]!.target.japanese;
        const transitions: unknown[] = [];
        const screen = createLessonZeroSentenceFrameScreen({
            language: 'en',
            definition: content,
            initialState: startLessonZeroSentenceFrameSession(content),
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition: async (_before, transition) => { transitions.push(transition); },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });
        document.body.append(screen.element);
        expect(screen.element.textContent).not.toContain(target);

        click(screen.element, 'Make the first sentence');
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Sophie is a student.'));
        click(screen.element, 'Try this turn');
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-sentence-frame-token')).toHaveLength(5));
        expect(screen.element.textContent).not.toContain(target);

        for (const tokenId of content.frames[0]!.target.bankOrder) {
            screen.element.querySelector<HTMLButtonElement>(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`)!.click();
            await vi.waitFor(() => expect(
                screen.element.querySelector(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`),
            ).toBeNull());
        }
        click(screen.element, 'Let Rie read it');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('result'));
        expect(screen.element.textContent).not.toContain(target);

        click(screen.element, 'Show Rie’s sentence');
        await vi.waitFor(() => expect(screen.element.textContent).toContain(target));
        expect(transitions).toHaveLength(9);
        screen.dispose();
    });
});

function click(root: HTMLElement, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.trim() === label);
    if (!button) throw new TypeError(`Missing button ${label}.`);
    button.click();
}
