import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroNameCardDefinition } from '../../src/academy/content/lesson-zero-name-card';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startLessonZeroNameCardSession } from '../../src/academy/domain/lesson-zero-name-card-session';
import { createLessonZeroNameCardScreen } from '../../src/academy/ui/lesson-zero-name-card-screen';

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function definition() {
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
    return createLessonZeroNameCardDefinition(
        lesson.activities.find(activity => activity.id === 'activity:lesson-zero-name-card-draft')!,
        'Henry',
    );
}

describe('Lesson Zero name-card screen', () => {
    it('uses the saved name once, keeps kana input out, and completes an earned repair', async () => {
        const content = definition();
        const transitions: Array<{ evaluation?: { result: { outcome: string } } }> = [];
        const play = vi.fn(async () => ({ dispose() {} }));
        const screen = createLessonZeroNameCardScreen({
            language: 'en',
            definition: content,
            initialState: startLessonZeroNameCardSession(content),
            pronunciation: { play } as never,
            onTransition: async (_before, transition) => { transitions.push(transition); },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });
        document.body.append(screen.element);

        expect(screen.element.textContent).toContain('I wrote the name you chose. Put it before です.');
        expect(screen.element.textContent).not.toMatch(/One true role|language you study|truth|boundary/i);
        expect(screen.element.querySelector('input')).toBeNull();
        click(screen.element, "Hear Rie's example");
        await vi.waitFor(() => expect(play).toHaveBeenCalledWith('りえです。', 'りえです'));

        token(screen.element, 'desu').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(1));
        token(screen.element, 'learner-name').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(2));
        click(screen.element, 'Check');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('result'));
        expect(screen.element.textContent).not.toContain('1. your name');

        click(screen.element, 'Show the pattern');
        await vi.waitFor(() => expect(screen.element.textContent).toContain('1. your name'));
        click(screen.element, 'Try again');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('build'));
        token(screen.element, 'learner-name').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(1));
        token(screen.element, 'desu').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(2));
        click(screen.element, 'Check');

        await vi.waitFor(() => expect(screen.element.dataset.sessionStatus).toBe('complete'));
        expect(screen.element.textContent).toContain('Henryです。');
        expect(transitions.filter(value => value.evaluation).map(value => value.evaluation?.result.outcome))
            .toEqual(['lapse', 'pass']);
        screen.dispose();
    });
});

function token(root: HTMLElement, id: string): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>(`.academy-name-card-token[data-token-id="${id}"]`);
    if (!button) throw new TypeError(`Missing token ${id}.`);
    return button;
}

function click(root: HTMLElement, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.includes(label));
    if (!button) throw new TypeError(`Missing button ${label}.`);
    button.click();
}
