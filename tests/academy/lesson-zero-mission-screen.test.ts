import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroMissionDefinition } from '../../src/academy/content/lesson-zero-mission-activity';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { createSourceLibrary } from '../../src/academy/domain/source-library';
import { createLessonZeroMissionScreen } from '../../src/academy/ui/lesson-zero-mission-screen';

const lessonData = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
    'utf8',
)));

const content = {
    sourceLibrary: createSourceLibrary(lessonData.sourceLibrary),
    lesson: lessonData.lesson,
    grounding: validateLessonZeroGrounding(lessonData),
};

const pronunciation = { play: vi.fn(async () => ({ dispose() {} })) };

describe('Lesson Zero story mission screen', () => {
    beforeEach(() => pronunciation.play.mockClear());

    it('keeps a written repair draft and accepts the Japanese-studying line taught in class', async () => {
        const onEvaluation = vi.fn(async () => undefined);
        const screen = createLessonZeroMissionScreen({
            language: 'en',
            definition: createLessonZeroMissionDefinition(content, 'activity:lesson-zero-text-transfer', 'Henry'),
            pronunciation, onEvaluation, onBack: vi.fn(), onComplete: vi.fn(),
        });
        const submitLine = (text: string): void => {
            const input = screen.element.querySelector<HTMLTextAreaElement>('textarea')!;
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            screen.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        };
        try {
            submitLine('aaaaのです');
            await vi.waitFor(() => expect(screen.element.dataset.attempted).toBe('true'));
            expect(screen.element.dataset.complete).toBe('false');
            expect(screen.element.querySelector('textarea')?.value).toBe('aaaaのです');
            expect(screen.element.textContent).toContain('not every Japanese sentence');
            expect(onEvaluation).not.toHaveBeenCalled();
            expect(screen.element.querySelector('[data-outcome="unassessed"]')).not.toBeNull();
            click(screen.element, 'Try again');
            expect(screen.element.querySelector('textarea')?.value).toBe('aaaaのです');
            submitLine('わたしも日本語を勉強しています。');
            await vi.waitFor(() => expect(screen.element.dataset.complete).toBe('true'));
            expect(onEvaluation).toHaveBeenLastCalledWith(expect.objectContaining({ result: expect.objectContaining({ outcome: 'pass' }), reviewSeeds: [] }), expect.objectContaining({ text: 'わたしも日本語を勉強しています。' }));
        } finally { screen.dispose(); }
    });
});

function click(root: HTMLElement, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.trim() === label);
    if (!button) throw new TypeError(`Missing button ${label}.`);
    button.click();
}
