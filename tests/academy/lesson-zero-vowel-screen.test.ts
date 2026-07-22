import {
    createLessonZeroVowelBingo,
    createLessonZeroVowelSoundMap,
} from '../../src/academy/content/lesson-zero-vowel-sound-map';
import { startLessonZeroVowelSession } from '../../src/academy/domain/lesson-zero-vowel-session';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createLessonZeroVowelScreen } from '../../src/academy/ui/lesson-zero-vowel-screen';

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.trim() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    return button;
}

describe('Lesson Zero five-vowel screen', () => {
    it('teaches, listens, persists, completes and opens repeatable bingo', async () => {
        const model = createLessonZeroVowelSoundMap();
        const bingoModel = createLessonZeroVowelBingo();
        const runtime = createAcademyActivityRuntime();
        let persisted = startLessonZeroVowelSession(model);
        const screen = createLessonZeroVowelScreen({
            language: 'en',
            model,
            bingoModel,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            xingyuSprite: '/academy/art/characters/xingyu/test.png',
            evaluate: (variant, response) => runtime.evaluate(variant === 'bingo' ? bingoModel : model, response),
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        expect(screen.element.textContent).toContain('Five sounds open the language');
        buttonByText(screen.element, 'Take the headphones').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        for (let index = 0; index < 5; index += 1) {
            buttonByText(screen.element, 'Hear this sound').click();
            await vi.waitFor(() => expect(persisted.learnedItemIds).toHaveLength(index + 1));
        }
        expect(screen.element.textContent).toContain('The paper comes away');
        buttonByText(screen.element, 'Listen without the paper').click();
        await vi.waitFor(() => expect(persisted.stage).toBe('attempt'));
        for (let index = 0; index < 5; index += 1) {
            buttonByText(screen.element, 'Play the sound').click();
            await vi.waitFor(() => expect(
                screen.element.querySelectorAll('.academy-vowel-choice').length,
            ).toBe(5));
            const target = persisted.roundOrder[persisted.selections.length];
            const kana = model.payload.items.find(item => item.id === target)!.kana;
            buttonByText(screen.element, kana).click();
            await vi.waitFor(() => expect(persisted.selections).toHaveLength(index + 1));
        }
        await vi.waitFor(() => expect(persisted.status).toBe('complete'));
        expect(screen.element.textContent).toContain('You can hear the room now');
        expect(screen.element.querySelectorAll('.academy-vowel-completed-row')).toHaveLength(1);
        buttonByText(screen.element, 'Play sound bingo').click();
        await vi.waitFor(() => expect(persisted.variant).toBe('bingo'));
        expect(screen.element.querySelectorAll('.academy-vowel-bingo-tile')).toHaveLength(9);
        screen.dispose();
    });

    it('offers the visual route without losing the current teaching position', async () => {
        const model = createLessonZeroVowelSoundMap();
        const bingoModel = createLessonZeroVowelBingo();
        let persisted = startLessonZeroVowelSession(model);
        const screen = createLessonZeroVowelScreen({
            language: 'en',
            model,
            bingoModel,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => { throw new Error('offline'); }) } as never,
            xingyuSprite: '/academy/art/characters/xingyu/test.png',
            evaluate: (variant, response) => createAcademyActivityRuntime().evaluate(
                variant === 'bingo' ? bingoModel : model,
                response,
            ),
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });
        buttonByText(screen.element, 'Take the headphones').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        buttonByText(screen.element, 'Hear this sound').click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('switch to the visual route'));
        expect(persisted.learnedItemIds).toHaveLength(0);
        buttonByText(screen.element, 'Visual cue').click();
        await vi.waitFor(() => expect(persisted.mode).toBe('visual'));
        buttonByText(screen.element, 'Hold this shape').click();
        await vi.waitFor(() => expect(persisted.learnedItemIds).toHaveLength(1));
        screen.dispose();
    });
});
