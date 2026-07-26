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
        const play = vi.fn(async () => ({ dispose() {} }));
        const playLine = vi.fn(async (_identity: { japanese: string }) => ({
            status: 'playing' as const,
            playback: { dispose() {} },
        }));
        let persisted = startLessonZeroVowelSession(model);
        const screen = createLessonZeroVowelScreen({
            language: 'en',
            model,
            bingoModel,
            initialState: persisted,
            pronunciation: { play, playLine } as never,
            xingyuSprite: '/academy/art/characters/xingyu/test.png',
            evaluate: (variant, response) => runtime.evaluate(variant === 'bingo' ? bingoModel : model, response),
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        expect(screen.element.textContent).toContain('Studio A');
        expect(screen.element.textContent).toContain('Five vowel sounds');
        expect(screen.element.textContent).toContain('Listen. Then choose.');
        expect(screen.element.textContent).not.toMatch(/First sound lab|sound lab|Stay with the sound that slipped|Compare the neighbours/u);
        expect(screen.element.querySelectorAll('.academy-vowel-choice')).toHaveLength(0);
        buttonByText(screen.element, 'Put on headphones').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        const anchorImages: string[] = [];
        for (let index = 0; index < 5; index += 1) {
            expect(screen.element.querySelectorAll('.academy-vowel-teaching-note')).toHaveLength(1);
            const image = screen.element.querySelector<HTMLImageElement>('[data-vowel-anchor-image]');
            expect(image?.alt).toBeTruthy();
            expect(image?.src).toContain(`/academy/art/lesson-zero/hiragana-anchors/hira-${['a', 'i', 'u', 'e', 'o'][index]}.webp`);
            anchorImages.push(image!.alt);
            buttonByText(screen.element, 'Play word').click();
            await vi.waitFor(() => expect(persisted.learnedItemIds).toHaveLength(index + 1));
        }
        expect(anchorImages).toEqual([
            'The morning sun rising over rooftops.',
            'A friendly dog sitting down.',
            'An ocean wave beneath a blue sky.',
            'An open picture book with colourful pictures.',
            'A warm cup of Japanese tea.',
        ]);
        expect(play).not.toHaveBeenCalled();
        expect(playLine.mock.calls.map(([identity]) => identity.japanese)).toEqual([
            'あさです',
            'いぬです',
            'うみです',
            'えほんです',
            'おちゃです',
        ]);
        expect(screen.element.textContent).toContain('Ready?');
        buttonByText(screen.element, 'Start').click();
        await vi.waitFor(() => expect(persisted.stage).toBe('attempt'));
        for (let index = 0; index < 5; index += 1) {
            buttonByText(screen.element, 'Play').click();
            await vi.waitFor(() => expect(
                screen.element.querySelectorAll('.academy-vowel-choice').length,
            ).toBe(5));
            const target = persisted.roundOrder[persisted.selections.length];
            const kana = model.payload.items.find(item => item.id === target)!.kana;
            buttonByText(screen.element, kana).click();
            await vi.waitFor(() => expect(persisted.selections).toHaveLength(index + 1));
        }
        await vi.waitFor(() => expect(persisted.status).toBe('complete'));
        expect(screen.element.textContent).toContain('Five vowel sounds: done');
        expect(screen.element.querySelectorAll('.academy-vowel-completed-row')).toHaveLength(1);
        expect(buttonByText(screen.element, 'Continue').disabled).toBe(false);
        buttonByText(screen.element, 'Play bingo').click();
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

    it('uses natural Japanese place and task labels', () => {
        const model = createLessonZeroVowelSoundMap();
        const bingoModel = createLessonZeroVowelBingo();
        const screen = createLessonZeroVowelScreen({
            language: 'ja',
            model,
            bingoModel,
            initialState: startLessonZeroVowelSession(model),
            pronunciation: { play: vi.fn() } as never,
            xingyuSprite: '/academy/art/characters/xingyu/test.png',
            evaluate: (variant, response) => createAcademyActivityRuntime().evaluate(
                variant === 'bingo' ? bingoModel : model,
                response,
            ),
            onTransition: vi.fn(),
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        expect(screen.element.textContent).toContain('スタジオA');
        expect(screen.element.textContent).toContain('五つの母音');
        expect(screen.element.textContent).toContain('聞いて、選んでください。');
        expect(screen.element.textContent).not.toContain('音ラボ');
        screen.dispose();
    });
});
