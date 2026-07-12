import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createOpeningKanjiActivity, kanjiWritingActivityPlugin } from '../../src/academy/activities/kanji-writing';
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

    it('records recognition evidence separately from writing evidence', () => {
        const recognition = runtime.evaluate(model, { phase: 'recognition', character: '一' });
        expect(recognition.result).toMatchObject({ outcome: 'pass', errorTags: ['kanji-recognition-complete'] });
        expect(recognition.reviewSeeds).toHaveLength(0);

        const writing = runtime.evaluate(model, {
            phase: 'writing',
            inputMode: 'doodle',
            assessment: { passed: true, score: 92, expectedStrokes: 1, actualStrokes: 1, message: 'Looks right' },
        });
        expect(writing.result).toMatchObject({ outcome: 'pass', score: 0.92, errorTags: ['kanji-writing-complete', 'kanji-writing-doodle'] });
        expect(writing.reviewSeeds).toEqual([expect.objectContaining({ id: 'review:kanji-one' })]);
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

    it('marks the keyboard-equivalent writing evidence transparently', () => {
        const evaluation = runtime.evaluate(model, {
            phase: 'writing',
            inputMode: 'keyboard',
            assessment: { passed: true, score: 100, expectedStrokes: 1, actualStrokes: 1, message: 'Keyboard trace' },
        });
        expect(evaluation.result.errorTags).toEqual(['kanji-writing-complete', 'kanji-writing-keyboard']);
        expect(evaluation.reviewSeeds).toHaveLength(1);
    });

    it('completes the production phase with three keyboard activations', async () => {
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
        const host = document.createElement('div');
        const evaluations: ReturnType<typeof runtime.evaluate>[] = [];
        const controller = runtime.mount(model, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, evaluation => { evaluations.push(evaluation); });
        host.querySelector<HTMLButtonElement>('button[data-character="一"]')?.click();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        const keyboard = host.querySelector<HTMLButtonElement>('[data-keyboard-stroke]')!;
        for (let step = 0; step < 3; step += 1) {
            keyboard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        }
        await vi.waitFor(() => expect(evaluations.at(-1)?.result.errorTags).toContain('kanji-writing-keyboard'));
        expect(keyboard.disabled).toBe(true);
        controller.dispose();
        getContext.mockRestore();
    });
});
