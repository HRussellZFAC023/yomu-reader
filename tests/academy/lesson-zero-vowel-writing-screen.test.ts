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

    it('completes all five kana through the no-drawing route without exposing the repair sheet', async () => {
        const definition = createLessonZeroVowelWritingDefinition();
        let persisted = startLessonZeroVowelWritingSession(definition);
        const onComplete = vi.fn();
        const screen = createLessonZeroVowelWritingScreen({
            language: 'en',
            definition,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            rieSprite: '/academy/art/characters/rie/test.png',
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete,
        });

        expect(screen.element.textContent).toContain('Let the five sounds leave a mark');
        buttonByText(screen.element, 'Open the practice book').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        buttonByText(screen.element, 'Choose the stroke plan').click();
        await vi.waitFor(() => expect(persisted.mode).toBe('plan'));

        for (const [index, item] of definition.items.entries()) {
            buttonByText(screen.element, 'Choose its stroke plan').click();
            await vi.waitFor(() => expect(persisted.stage).toBe('attempt'));
            expect(screen.element.querySelector('.academy-vowel-writing-source-sheet')).toBeNull();
            expect(screen.element.querySelector('.academy-vowel-writing-guide')).toBeNull();
            buttonByText(screen.element, item.plans.find(plan => plan.id === item.correctPlanId)!.label.en).click();
            buttonByText(screen.element, 'Check the plan').click();
            await vi.waitFor(() => expect(persisted.completedItemIds).toHaveLength(index + 1));
        }

        expect(persisted).toMatchObject({ status: 'complete', stage: 'complete' });
        expect(screen.element.textContent).toContain('The first line is yours');
        expect(screen.element.querySelectorAll('.academy-vowel-writing-finished-mark')).toHaveLength(5);
        buttonByText(screen.element, 'Carry the line into class').click();
        expect(onComplete).toHaveBeenCalledOnce();
        screen.dispose();
    });

    it('keeps the source and numbered guide hidden until a real lapse', async () => {
        const definition = createLessonZeroVowelWritingDefinition();
        let persisted = startLessonZeroVowelWritingSession(definition);
        const screen = createLessonZeroVowelWritingScreen({
            language: 'en',
            definition,
            initialState: persisted,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            rieSprite: '/academy/art/characters/rie/test.png',
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        buttonByText(screen.element, 'Open the practice book').click();
        await vi.waitFor(() => expect(persisted.status).toBe('active'));
        buttonByText(screen.element, 'Choose the stroke plan').click();
        await vi.waitFor(() => expect(persisted.mode).toBe('plan'));
        buttonByText(screen.element, 'Choose its stroke plan').click();
        await vi.waitFor(() => expect(persisted.stage).toBe('attempt'));
        expect(screen.element.querySelector('.academy-vowel-writing-source-sheet')).toBeNull();

        const item = definition.items[0];
        const wrong = item.plans.find(plan => plan.id !== item.correctPlanId)!;
        buttonByText(screen.element, wrong.label.en).click();
        buttonByText(screen.element, 'Check the plan').click();
        await vi.waitFor(() => expect(persisted.stage).toBe('repair'));

        expect(screen.element.querySelector<HTMLImageElement>('.academy-vowel-writing-source-image')?.alt)
            .toBe("Rie's five-vowel practice sheet");
        expect(screen.element.querySelectorAll('.academy-vowel-writing-stroke-number')).toHaveLength(item.strokeCount);
        buttonByText(screen.element, 'Try this kana again').click();
        await vi.waitFor(() => expect(persisted.stage).toBe('attempt'));
        expect(screen.element.querySelector('.academy-vowel-writing-doodle')).toBeNull();
        screen.dispose();
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

        buttonByText(screen.element, 'Open the practice book').click();
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
