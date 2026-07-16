import { createMegaPackLessonOneBeats } from '../../src/academy/content/mega-pack-lesson-one';
import { createActivityRuntime, type ActivityEvaluation } from '../../src/academy/domain/activity-runtime';
import {
    sentenceBuilderPlugin,
    type SentenceBuilderModel,
} from '../../src/academy/minigames/sentence-builder';

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => document.body.replaceChildren());

describe('sentence builder activity plugin', () => {
    it('validates exact permitted-source provenance and source-preserving token order', () => {
        const model = activity();
        expect(createActivityRuntime([sentenceBuilderPlugin]).validate(model)).toEqual([]);

        const changed = structuredClone(model);
        (changed.payload as { sourceSentence: string }).sourceSentence = 'べつの文です。';
        expect(createActivityRuntime([sentenceBuilderPlugin]).validate(changed)).toContainEqual(expect.objectContaining({
            path: 'payload.sourceSentence',
        }));

        const unlicensed = structuredClone(model) as any;
        unlicensed.payload.source.rights = 'unknown';
        expect(createActivityRuntime([sentenceBuilderPlugin]).validate(unlicensed)).toContainEqual(expect.objectContaining({
            path: 'payload.source.rights',
        }));
    });

    it('grades exact token order, preserves partial score, and emits review evidence', () => {
        const model = activity();
        const runtime = createActivityRuntime([sentenceBuilderPlugin]);
        const passed = runtime.evaluate(model, { order: model.payload.correctOrder });
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.attempt).toMatchObject({
            activityId: model.id,
            sourceQuestionId: model.sourceQuestionId,
            responseKind: 'tapped-token-order',
        });
        expect(passed.reviewSeeds[0]).toMatchObject({
            reason: 'new-learning',
            sourceQuestionId: model.sourceQuestionId,
            content: { expression: model.payload.sourceSentence },
        });

        const reversed = runtime.evaluate(model, { order: [...model.payload.correctOrder].reverse() });
        expect(reversed.result.outcome).toBe('lapse');
        expect(reversed.result.score).toBeLessThan(1);
        expect(reversed.result.errorTags).toEqual([model.payload.errorTag]);
    });

    it('plays as a tappable word bank without revealing the assembled answer before commitment', async () => {
        const model = activity();
        const hostElement = document.createElement('div');
        document.body.append(hostElement);
        const evaluations: ActivityEvaluation[] = [];
        createActivityRuntime([sentenceBuilderPlugin]).mount(model, {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce() {},
        }, evaluation => { evaluations.push(evaluation); });

        expect(hostElement.textContent).not.toContain(model.payload.sourceSentence);
        const check = hostElement.querySelector<HTMLButtonElement>('.academy-button-primary')!;
        expect(check.disabled).toBe(true);

        for (const id of model.payload.correctOrder) {
            hostElement.querySelector<HTMLButtonElement>(`.academy-sentence-builder-bank [data-token-id="${id}"]`)!.click();
        }
        expect(check.disabled).toBe(false);
        expect(hostElement.querySelector('.academy-sentence-builder-answer')?.textContent).toBe(model.payload.sourceSentence);
        check.click();
        await flush();

        expect(evaluations).toHaveLength(1);
        expect(evaluations[0].result.outcome).toBe('pass');
        expect(hostElement.querySelector('.academy-sentence-builder')?.getAttribute('data-outcome')).toBe('pass');
        expect(hostElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).toHaveLength(0);
    });

    it('reveals repair only after a lapse and lets the learner reorder the tiles', async () => {
        const model = activity();
        const hostElement = document.createElement('div');
        document.body.append(hostElement);
        createActivityRuntime([sentenceBuilderPlugin]).mount(model, {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce() {},
        }, () => {});

        for (const token of model.payload.tokens) {
            hostElement.querySelector<HTMLButtonElement>(`.academy-sentence-builder-bank [data-token-id="${token.id}"]`)!.click();
        }
        hostElement.querySelector<HTMLButtonElement>('.academy-button-primary')!.click();
        await flush();

        expect(hostElement.querySelector('.academy-sentence-builder')?.getAttribute('data-outcome')).toBe('lapse');
        expect(hostElement.textContent).not.toContain(model.payload.sourceSentence);
        const hint = hostElement.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        hint.click();
        expect(hostElement.textContent).not.toContain(model.payload.sourceSentence);
        hint.click();
        expect(hostElement.textContent).toContain(model.payload.sourceSentence);
        expect(hostElement.querySelector<HTMLButtonElement>('.academy-sentence-builder-answer button')?.disabled).toBe(false);
    });
});

function activity(): SentenceBuilderModel {
    return createMegaPackLessonOneBeats()[0].activity as SentenceBuilderModel;
}
