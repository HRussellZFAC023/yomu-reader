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

    it('repairs the two particle links without exposing an answer first', async () => {
        const onEvaluation = vi.fn(async () => undefined);
        const screen = createLessonZeroMissionScreen({
            language: 'en',
            definition: createLessonZeroMissionDefinition(content, 'activity:lesson-zero-text-input', 'Henry'),
            pronunciation,
            onEvaluation,
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        expect(screen.element.textContent).not.toContain('Use の to join');
        click(screen.element, 'は');
        click(screen.element, 'を');
        click(screen.element, 'Check');
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Use の to join'));

        click(screen.element, 'Try again');
        click(screen.element, 'Clear');
        click(screen.element, 'の');
        click(screen.element, 'も');
        click(screen.element, 'Check');
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Back to the story'));
        screen.dispose();
    });

    it('reuses the chosen class name without asking the learner to choose it again', async () => {
        const onEvaluation = vi.fn(async () => undefined);
        const screen = createLessonZeroMissionScreen({
            language: 'en',
            definition: createLessonZeroMissionDefinition(
                content,
                'activity:lesson-zero-write-name-card',
                'Henry',
                'ヘンリー',
            ),
            pronunciation,
            onEvaluation,
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        expect(screen.element.querySelector('.academy-mission-writing-input')).toBeNull();
        expect(screen.element.querySelector('.academy-mission-name-choices')).toBeNull();
        expect(screen.element.textContent).not.toContain('Henry');
        expect(screen.element.textContent).toContain('ヘンリー');
        expect(screen.element.textContent).not.toMatch(/email|one true role|both lines are true|language you study/iu);
        expect(screen.element.textContent).toContain('ヘンリーです。');
        click(screen.element, 'Hear ヘンリー');
        await vi.waitFor(() => expect(pronunciation.play).toHaveBeenCalledWith('ヘンリー', 'ヘンリー'));
        screen.element.querySelector('form')?.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );

        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    outcome: 'pass',
                    responseKind: 'guided-katakana-name-choice',
                }),
            }),
            { kind: 'written', text: 'ヘンリーです。', entryMode: 'katakana-choice' },
        ));
        screen.dispose();
    });

    it('accepts a spoken turn without requiring a recording upload', async () => {
        const onEvaluation = vi.fn(async () => undefined);
        const screen = createLessonZeroMissionScreen({
            language: 'en',
            definition: createLessonZeroMissionDefinition(content, 'activity:lesson-zero-speaking-input', 'Henry'),
            pronunciation,
            recorder: {
                supported: false,
                start: vi.fn(),
                dispose: vi.fn(),
            },
            onEvaluation,
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        click(screen.element, 'Speak without recording');
        for (const input of screen.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        click(screen.element, 'Keep this turn');

        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledWith(
            expect.objectContaining({ attempt: expect.objectContaining({ outcome: 'pass' }) }),
            expect.objectContaining({ kind: 'spoken', performed: true, recorded: false }),
        ));
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Back to the story'));
        screen.dispose();
    });

    it('keeps implementation and source-provider language out of the learner surface', () => {
        const screen = createLessonZeroMissionScreen({
            language: 'en',
            definition: createLessonZeroMissionDefinition(content, 'activity:lesson-zero-close-room', 'Henry'),
            pronunciation,
            onEvaluation: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        expect(screen.element.textContent).not.toMatch(/moodle|source question|runtime|evidence/iu);
        expect(screen.element.querySelectorAll('.academy-mission-room-action')).toHaveLength(6);
        screen.dispose();
    });
});

function click(root: HTMLElement, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.trim() === label);
    if (!button) throw new TypeError(`Missing button ${label}.`);
    button.click();
}
