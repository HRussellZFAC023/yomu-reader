import { createLessonZeroVowelWritingDefinition } from '../../src/academy/content/lesson-zero-vowel-writing';
import { startLessonZeroVowelWritingSession } from '../../src/academy/domain/lesson-zero-vowel-writing-session';
import { createLessonZeroVowelWritingScreen } from '../../src/academy/ui/lesson-zero-vowel-writing-screen';

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.trim() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    return button;
}

function canvasContext(): CanvasRenderingContext2D {
    return {
        arc: vi.fn(),
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        fill: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
        stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
}

describe('Lesson Zero five-vowel writing screen', () => {
    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
            unobserve(): void {}
        });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('offers a real canvas, clear control and durable pause on the drawing route', async () => {
        const definition = createLessonZeroVowelWritingDefinition();
        let persisted = startLessonZeroVowelWritingSession(definition);
        const onBack = vi.fn();
        const screen = createLessonZeroVowelWritingScreen({
            language: 'en',
            definition,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            rieSprite: '/academy/art/characters/rie/test.png',
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack,
            onComplete: vi.fn(),
        });

        buttonByText(screen.element, 'Start with あ').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        buttonByText(screen.element, 'Write this kana').click();
        await vi.waitFor(() => expect(persisted.stage).toBe('attempt'));
        expect(screen.element.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas')).not.toBeNull();
        expect(buttonByText(screen.element, 'Clear page').dataset.doodleClear).toBe('');
        buttonByText(screen.element, 'Check my mark').click();
        expect(screen.element.textContent).toContain('Make at least one complete stroke first.');

        screen.element.querySelector<HTMLButtonElement>('.academy-vowel-back')!.click();
        await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
        expect(persisted).toMatchObject({ status: 'paused', stage: 'attempt', mode: 'draw' });
        screen.dispose();
    });
});
