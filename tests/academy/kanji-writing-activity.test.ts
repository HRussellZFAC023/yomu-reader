import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    createOpeningKanjiActivity,
    kanjiWritingActivityPlugin,
    type KanjiWritingResponse,
} from '../../src/academy/activities/kanji-writing';
import type { KanjiWritingModel } from '../../src/academy/integration/yomu-bridge';

const TRACE: KanjiWritingModel = {
    character: '一',
    svg: '<svg viewBox="0 0 109 109"><path d="M10 50 L99 50"/></svg>',
    strokeCount: 1,
    strokeShapes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
    source: { name: 'KanjiVG', url: 'https://kanjivg.tagaini.net/', licence: 'CC BY-SA 3.0', revision: 'test' },
};

describe('two-way Kanji writing activity', () => {
    const runtime = createActivityRuntime([kanjiWritingActivityPlugin]);
    const model = createOpeningKanjiActivity(TRACE);

    it('types Doodle as the only handwriting input mode', () => {
        expectTypeOf<Extract<KanjiWritingResponse, { phase: 'writing' }>['inputMode']>()
            .toEqualTypeOf<'doodle'>();
    });

    it('records only a Yomu Doodle assessment as handwriting evidence', () => {
        const response: KanjiWritingResponse = {
            phase: 'writing',
            inputMode: 'doodle',
            assessment: { passed: true, score: 92, expectedStrokes: 1, actualStrokes: 1, message: 'Looks right' },
        };
        const writing = runtime.evaluate(model, response);
        expect(writing.result).toMatchObject({ outcome: 'pass', score: 0.92, errorTags: ['kanji-writing-complete', 'kanji-writing-doodle'] });
        expect(writing.reviewSeeds).toEqual([expect.objectContaining({ id: 'review:kanji-one' })]);
    });

    it('keeps typed reading recall separate from handwriting evidence', () => {
        const reading = runtime.evaluate(model, { phase: 'reading', reading: 'イチ' } satisfies KanjiWritingResponse);
        expect(reading.result).toMatchObject({ outcome: 'pass', errorTags: ['kanji-reading-recalled'] });
        expect(reading.reviewSeeds).toHaveLength(0);
    });

    it('gives a smaller repair and nearby example after a writing lapse', () => {
        const evaluation = runtime.evaluate(model, {
            phase: 'writing',
            inputMode: 'doodle',
            assessment: { passed: false, score: 40, expectedStrokes: 1, actualStrokes: 2, message: 'Check stroke count' },
        });
        expect(evaluation.result.outcome).toBe('lapse');
        expect(evaluation.result.feedback.repairPrompt?.en).toContain('one long line');
        expect(evaluation.result.feedback.nearbyExample?.en).toContain('KanjiVG');
    });

    it('rejects legacy and keyboard-shaped payloads before they reach grading', () => {
        expect(() => runtime.evaluate(model, { phase: 'recognition', character: '一' }))
            .toThrow('Kanji response phase must be writing or reading.');
        expect(() => runtime.evaluate(model, { phase: 'reading' }))
            .toThrow('A typed reading response is required.');
        expect(() => runtime.evaluate(model, {
            phase: 'writing',
            inputMode: 'keyboard',
            assessment: { passed: true, score: 100, expectedStrokes: 1, actualStrokes: 1, message: 'Keyboard trace' },
        })).toThrow('Handwriting evidence must come from the Yomu Doodle canvas.');
    });

    it('mounts the real Doodle-to-freeform-reading flow without a keyboard shortcut', async () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const context = {
            strokeStyle: '', fillStyle: '', lineCap: '', lineJoin: '', lineWidth: 0,
            clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
            quadraticCurveTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
            save: vi.fn(), restore: vi.fn(),
        };
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as unknown as CanvasRenderingContext2D);
        const host = document.createElement('div');
        const evaluations: ReturnType<typeof runtime.evaluate>[] = [];
        const controller = runtime.mount(model, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, evaluation => { evaluations.push(evaluation); });
        try {
            expect(host.querySelector('[data-keyboard-stroke]')).toBeNull();
            expect(host.textContent).not.toContain('いち');

            const stage = host.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
            const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
            const bounds = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
            stage.getBoundingClientRect = bounds;
            canvas.getBoundingClientRect = bounds;
            canvas.dispatchEvent(pointer('pointerdown', 10, 50));
            document.dispatchEvent(pointer('pointermove', 60, 50));
            document.dispatchEvent(pointer('pointerup', 90, 50));

            await vi.waitFor(() => expect(evaluations.at(-1)?.result.errorTags).toContain('kanji-writing-doodle'));
            const next = host.querySelector<HTMLButtonElement>('.academy-kanji-next')!;
            await vi.waitFor(() => expect(next.hidden).toBe(false));
            next.click();

            const input = host.querySelector<HTMLInputElement>('.academy-kanji-recall input')!;
            input.value = 'いち';
            host.querySelector<HTMLFormElement>('.academy-kanji-recall')!.requestSubmit();
            await vi.waitFor(() => expect(evaluations.at(-1)?.result.errorTags).toContain('kanji-reading-recalled'));
            await vi.waitFor(() => expect(input.disabled).toBe(true));
        } finally {
            controller.dispose();
            getContext.mockRestore();
            vi.unstubAllGlobals();
        }
    });
});

function pointer(type: string, clientX: number, clientY: number): Event {
    return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        clientX,
        clientY,
        pointerId: 1,
        pointerType: 'pen',
        pressure: 0.5,
    });
}
