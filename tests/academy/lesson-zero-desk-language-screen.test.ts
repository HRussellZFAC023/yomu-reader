import fs from 'node:fs';
import path from 'node:path';
import {
    createLessonZeroDeskLanguageDefinition,
    LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID,
} from '../../src/academy/content/lesson-zero-desk-language';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    startLessonZeroDeskLanguageSession,
    type LessonZeroDeskLanguageSessionState,
} from '../../src/academy/domain/lesson-zero-desk-language-session';
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
    it('teaches with real prop cues, repairs one label, then swaps the papers for transfer', async () => {
        const content = definition();
        let persisted: LessonZeroDeskLanguageSessionState =
            startLessonZeroDeskLanguageSession(content);
        const playLine = vi.fn(async () => ({
            status: 'playing' as const,
            playback: {
                failure: new Promise<void>(() => undefined),
                completion: new Promise<void>(() => undefined),
                dispose() {},
            },
        }));
        const onComplete = vi.fn(async () => undefined);
        const screen = createLessonZeroDeskLanguageScreen({
            language: 'en',
            definition: content,
            initialState: persisted,
            pronunciation: { playLine, play: vi.fn() } as never,
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete,
        });

        expect(screen.element.dataset.academyPresentation).toBe('focus');
        expect(screen.element.textContent).toContain('This sheet goes home with you.');
        expect(screen.element.textContent).toContain('You do not need to read the kana yet.');
        expect(screen.element.textContent).toContain('Work for later');
        expect(screen.element.querySelector<HTMLImageElement>('.academy-desk-language-scene-image')?.src)
            .toContain('/academy/art/');

        button(screen.element, '[data-desk-action="replay"]').click();
        await vi.waitFor(() => expect(playLine).toHaveBeenCalledWith(
            expect.objectContaining({
                lineId: 'rie-lesson-zero-homework',
                japanese: 'しゅくだい。しゅくだいです。',
                sourceSha256: '6d79b7fadcc1887054829bb886255dc2eaced84e8021a528ecb3a82fa9c0ac29',
            }),
            expect.any(AbortSignal),
        ));

        button(screen.element, '[data-desk-action="next-introduction"]').click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('meet-example'));
        expect(screen.element.textContent).toContain('already shows how the answer works');
        button(screen.element, '[data-desk-action="next-introduction"]').click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('practice'));

        const practiceChoices = screen.element.querySelectorAll<HTMLButtonElement>('[data-choice]');
        expect(practiceChoices).toHaveLength(2);
        expect([...practiceChoices].map(choice => choice.dataset.choice)).toEqual(['option-0', 'option-1']);
        expect(screen.element.innerHTML).not.toContain('data-prop-id');
        practiceChoices[1]!.click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('practice-repair'));
        expect(screen.element.textContent).toContain('Shukudai is the work you take away.');
        expect(screen.element.textContent).not.toContain('Rei is the worked model');

        button(screen.element, '[data-desk-action="retry"]').click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('practice'));
        button(screen.element, '[data-choice="option-0"]').click();
        await vi.waitFor(() => expect(persisted.practicePassedWordIds).toEqual(['homework']));
        button(screen.element, '[data-choice="option-1"]').click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('transfer-ready'));

        button(screen.element, '[data-desk-action="begin-transfer"]').click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('transfer'));
        expect(screen.element.textContent).not.toContain('Work for later');
        expect(screen.element.textContent).not.toContain('A model to follow');
        expect(button(screen.element, '[data-choice="option-0"]').getAttribute('aria-label'))
            .toContain('worked answer');
        button(screen.element, '[data-choice="option-0"]').click();
        await vi.waitFor(() => expect(persisted.transferPassedWordIds).toEqual(['example']));
        button(screen.element, '[data-choice="option-1"]').click();
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('complete'));

        button(screen.element, '[data-desk-action="complete"]').click();
        await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
        screen.dispose();
    });

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
