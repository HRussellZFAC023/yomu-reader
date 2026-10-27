import { createLessonZeroVowelBingo, createLessonZeroVowelSoundMap } from '../../src/academy/content/lesson-zero-vowel-sound-map';
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
        buttonByText(screen.element, 'Put on headphones').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        buttonByText(screen.element, 'Play word').click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('No sound. Replay or use Visual.'));
        expect(persisted.learnedItemIds).toHaveLength(0);
        buttonByText(screen.element, 'Visual').click();
        await vi.waitFor(() => expect(persisted.mode).toBe('visual'));
        buttonByText(screen.element, 'Next').click();
        await vi.waitFor(() => expect(persisted.learnedItemIds).toHaveLength(1));
        screen.dispose();
    });
});
