import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonSevenShopCounterBeat } from '../../src/academy/content/lesson-seven-shop-counter';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import type { KanjiWritingService } from '../../src/academy/integration/yomu-bridge';
import { createAcademyActivityRuntime, shopCounterPlugin, type ShopCounterModel } from '../../src/academy/minigames';

const noKanji: KanjiWritingService = { lookup: async () => null };

function model(): ShopCounterModel {
    return createLessonSevenShopCounterBeat().activity as ShopCounterModel;
}

function perfectResponse() {
    return { answers: [
        { roundId: 'aakash-shirt', productId: 'shirt', priceId: '3000' },
        { roundId: 'tom-cd', productId: 'cd', priceId: '1000' },
        { roundId: 'bag-checkout', productId: 'bag', priceId: '8000', requestId: 'buy-bag' },
    ] } as const;
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 7 visual shop counter', () => {
    it('registers centrally, validates, and is reachable from the real l1-l07 chapter', async () => {
        const runtime = createAcademyActivityRuntime();
        expect(shopCounterPlugin.kind).toBe('academy-shop-counter');
        expect(runtime.validate(model())).toEqual([]);
        const chapter = await loadLessonActivityChapter('l1-l07', noKanji);
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l07',
            canonicalEpisodeId: 's1e06-invitation-chain',
            host: { id: 'robert' },
        });
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual(['academy-shop-counter']);
    });

    it('grades every criterion deterministically and emits exact-source new-learning seeds', () => {
        const evaluation = createAcademyActivityRuntime().evaluate(model(), perfectResponse());
        expect(evaluation.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(evaluation.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l07:shirt-price', reason: 'new-learning', sourceQuestionId: 'l1-l07/ex-listen-detail' }),
            expect.objectContaining({ id: 'review:l1-l07:cd-price', reason: 'new-learning', sourceQuestionId: 'l1-l07/ex-read-price' }),
            expect.objectContaining({ id: 'review:l1-l07:bag-price', reason: 'new-learning', sourceQuestionId: 'l1-l07/ex-ikura-cloze' }),
            expect.objectContaining({ id: 'review:l1-l07:kudasai', reason: 'new-learning', sourceQuestionId: 'l1-l07/ex-kudasai' }),
        ]);
    });

    it('scores a partial lapse and schedules repair only for missed concepts', () => {
        const response = { answers: [
            { roundId: 'aakash-shirt', productId: 'shirt', priceId: '8000' },
            { roundId: 'tom-cd', productId: 'cd', priceId: '1000' },
            { roundId: 'bag-checkout', productId: 'bag', priceId: '8000', requestId: 'how-much' },
        ] };
        const evaluation = createAcademyActivityRuntime().evaluate(model(), response);
        expect(evaluation.result.outcome).toBe('lapse');
        expect(evaluation.result.score).toBeCloseTo(5 / 7);
        expect(evaluation.result.errorTags).toEqual(['shop-bag-request', 'shop-shirt-price']);
        expect(evaluation.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l07:shirt-price', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l07:kudasai', reason: 'repair' }),
        ]);
    });

    it('rejects missing, duplicated, unknown, and extra authored choices', () => {
        const runtime = createAcademyActivityRuntime();
        expect(() => runtime.evaluate(model(), { answers: [] })).toThrow('Every shop ticket');
        expect(() => runtime.evaluate(model(), { answers: [
            perfectResponse().answers[0],
            perfectResponse().answers[0],
            perfectResponse().answers[2],
        ] })).toThrow('each authored ticket');
        expect(() => runtime.evaluate(model(), { answers: [
            { ...perfectResponse().answers[0], priceId: 'unknown' },
            perfectResponse().answers[1],
            perfectResponse().answers[2],
        ] })).toThrow('each authored ticket');
        expect(() => runtime.evaluate(model(), { answers: [
            { ...perfectResponse().answers[0], requestId: 'buy-bag' },
            perfectResponse().answers[1],
            perfectResponse().answers[2],
        ] })).toThrow('each authored ticket');
    });

    it('provides labelled native controls, a live status, and a complete no-typing path', async () => {
        const runtime = createAcademyActivityRuntime();
        const host = document.createElement('main');
        const announced: string[] = [];
        const onEvaluation = vi.fn();
        const controller = runtime.mount(model(), {
            replace(view) { host.replaceChildren(view); },
            announce(message) { announced.push(message); },
        }, onEvaluation);
        document.body.append(host);

        expect(host.querySelectorAll('fieldset')).toHaveLength(7);
        expect(host.querySelectorAll('legend')).toHaveLength(7);
        expect(host.querySelectorAll('.academy-shop-ticket-copy')).toHaveLength(3);
        expect([...host.querySelectorAll('fieldset')].every(fieldset => {
            const describedBy = fieldset.getAttribute('aria-describedby');
            return describedBy !== null && document.getElementById(describedBy) !== null;
        })).toBe(true);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(21);
        expect(host.querySelectorAll('label')).toHaveLength(21);
        expect(host.querySelector('input[type="text"], textarea')).toBeNull();
        expect(host.textContent).not.toContain('bag checkout');
        expect(host.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
        const names = [...host.querySelectorAll<HTMLInputElement>('input')].map(input => input.name);
        expect(new Set(names).size).toBe(7);

        for (const answer of perfectResponse().answers) {
            host.querySelector<HTMLInputElement>(`input[name$="${answer.roundId}-product"][value="${answer.productId}"]`)!.click();
            host.querySelector<HTMLInputElement>(`input[name$="${answer.roundId}-price"][value="${answer.priceId}"]`)!.click();
            if ('requestId' in answer) host.querySelector<HTMLInputElement>(`input[name$="${answer.roundId}-request"][value="${answer.requestId}"]`)!.click();
        }
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-outcome="pass"]')).not.toBeNull());
        expect(announced.at(-1)).toContain('All three tickets');
        controller.dispose();
    });

    it('binds the existing authored Japanese exactly and keeps a single-column mobile contract', () => {
        const lesson = JSON.parse(readFileSync(path.resolve('public/academy/content/lessons/008-l1-l07.json'), 'utf8')) as {
            components: Array<{ exercises?: Array<Record<string, any>> }>;
        };
        const exercises = lesson.components.flatMap(component => component.exercises ?? []);
        const byId = (id: string) => exercises.find(exercise => exercise.id === id)!;
        expect(byId('ex-listen-detail').options).toContainEqual(expect.objectContaining({ label: { en: 'The shirt is 3,000 yen', ja: 'シャツは ３，０００えん' }, correct: true }));
        expect(byId('ex-read-price').options).toContainEqual(expect.objectContaining({ label: { en: '1,000 yen each', ja: 'どれも １，０００えん' }, correct: true }));
        expect(byId('ex-ikura-cloze').japanese).toBe('この かばんは ＿＿① ですか。 — ８，０００ ＿＿② です。');
        expect(byId('ex-kudasai').answer.primary).toBe('このかばんをください');
        expect(byId('ex-kudasai').answer.alternatives).toContain('この かばんを ください');
        expect(model().payload.reviewTargets.map(target => target.expression)).toEqual([
            'シャツは ３，０００えん',
            'どれも １，０００えん',
            'この かばんは いくらですか。８，０００えんです。',
            'この かばんを ください',
        ]);

        const css = readFileSync(path.resolve('src/academy/minigames/shop-counter/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-shop-choices\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
