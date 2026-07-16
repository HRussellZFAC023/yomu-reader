import { readFileSync } from 'node:fs';
import path from 'node:path';
import storySource from '../../src/academy/content/story-sources/s1e01-the-blank-atlas.v2.json';
import {
    createLessonZeroVowelSoundMap,
    LESSON_ZERO_VOWEL_SOUND_MAP_ID,
} from '../../src/academy/content/lesson-zero-vowel-sound-map';
import {
    createAcademyActivityRuntime,
    kanaSoundMapManifest,
    type KanaSoundMapResponse,
} from '../../src/academy/minigames';

afterEach(() => document.body.replaceChildren());

function correctResponse(): KanaSoundMapResponse {
    const model = createLessonZeroVowelSoundMap();
    return { selections: model.payload.items.map(item => ({ roundId: item.id, kanaId: item.id })) };
}

describe('Lesson Zero kana sound map', () => {
    it('binds the reusable plugin to the exact permitted A-row and authored story hook', () => {
        const model = createLessonZeroVowelSoundMap();
        const scene = storySource.scenes.find(item => item.id === 'scene:blank-atlas:sound-script-map');
        const activity = scene?.nodes.find(node => node.kind === 'activity'
            && node.id === 'activity-node:blank-atlas:vowel-listen');

        expect(kanaSoundMapManifest).toMatchObject({
            kind: 'kana-sound-map',
            content: 'injected',
            evaluation: 'deterministic',
            input: ['audio', 'keyboard', 'touch'],
            reducedMotion: true,
        });
        expect(model.id).toBe(LESSON_ZERO_VOWEL_SOUND_MAP_ID);
        expect(model.payload.items.map(item => `${item.kana}:${item.romaji}`)).toEqual([
            'あ:a', 'い:i', 'う:u', 'え:e', 'お:o',
        ]);
        expect(model.payload.source).toMatchObject({
            sourceId: 'moodle-raw',
            role: 'kana-a-row-writing',
            runtimeUrl: '/academy/content/lessons/lesson-zero/moodle-hiragana-a-row-page-1.png',
            sourceSha256: 'fe962ee2dc21478ffe53a24ba77ef0abb5a7685ab7a6eda8f79ac63817ad7dd6',
            locus: 'page 1',
            answerGate: 'after-attempt',
            storyHook: {
                sceneId: scene?.id,
                activityId: activity?.hook?.exerciseId,
            },
        });
        expect(createAcademyActivityRuntime().validate(model)).toEqual([]);
        expect(Object.isFrozen(model)).toBe(true);
        expect(Object.isFrozen(model.payload.items)).toBe(true);
    });

    it('grades deterministically and emits five source-linked SRS review seeds', () => {
        const runtime = createAcademyActivityRuntime();
        const model = createLessonZeroVowelSoundMap();
        const pass = runtime.evaluate(model, correctResponse());
        expect(pass).toEqual(runtime.evaluate(model, correctResponse()));
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.attempt).toMatchObject({
            kind: 'attempt-recorded',
            activityId: LESSON_ZERO_VOWEL_SOUND_MAP_ID,
            sourceQuestionId: 'source-question:lesson-zero-hiragana-a-row',
            responseKind: 'kana-listening-choice',
            outcome: 'pass',
        });
        expect(pass.reviewSeeds).toHaveLength(5);
        expect(pass.reviewSeeds.map(seed => ({
            id: seed.id,
            expression: seed.content.expression,
            reading: seed.content.reading,
            meaning: seed.content.meanings[0],
            reason: seed.reason,
            sourceQuestionId: seed.sourceQuestionId,
        }))).toEqual([
            ['a', 'i', 'u', 'e', 'o'].map((romaji, index) => ({
                id: `review:lesson-zero:vowel-sound:hira-${romaji}`,
                expression: ['あ', 'い', 'う', 'え', 'お'][index],
                reading: ['あ', 'い', 'う', 'え', 'お'][index],
                meaning: `hiragana vowel ${romaji}`,
                reason: 'new-learning',
                sourceQuestionId: 'source-question:lesson-zero-hiragana-a-row',
            })),
        ].flat());

        const lapseResponse = correctResponse();
        const lapse = runtime.evaluate(model, {
            selections: lapseResponse.selections.map((selection, index) => index === 0
                ? { ...selection, kanaId: 'hira-i' }
                : selection),
        });
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 0.8, errorTags: ['vowel-sound-a'] });
        expect(lapse.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
    });

    it('rejects missing, reordered, duplicate-round, and unauthored responses', () => {
        const runtime = createAcademyActivityRuntime();
        const model = createLessonZeroVowelSoundMap();
        const valid = correctResponse().selections;
        expect(() => runtime.evaluate(model, { selections: valid.slice(0, 4) })).toThrow(/exactly one selection/i);
        expect(() => runtime.evaluate(model, { selections: [valid[1], valid[0], ...valid.slice(2)] })).toThrow(/out of round order/i);
        expect(() => runtime.evaluate(model, { selections: [valid[0], valid[0], ...valid.slice(2)] })).toThrow(/duplicated or out of round order/i);
        expect(() => runtime.evaluate(model, {
            selections: valid.map((selection, index) => index === 2 ? { ...selection, kanaId: 'hira-x' } : selection),
        })).toThrow(/unknown kana choice/i);
    });

    it('keeps committed positions without revealing correctness before all five answers', async () => {
        const runtime = createAcademyActivityRuntime();
        const model = createLessonZeroVowelSoundMap();
        const host = document.createElement('main');
        const announce = vi.fn();
        const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
        let evaluationCount = 0;
        document.body.append(host);
        const controller = runtime.mount(model, {
            replace(view) { host.replaceChildren(view); },
            announce,
            playPronunciation,
        }, () => { evaluationCount += 1; });

        const play = host.querySelector<HTMLButtonElement>('.academy-kana-sound-map-play')!;
        expect(play.getAttribute('aria-label')).toBe('Play current sound');
        expect(play.title).toBe('Play current sound');
        expect(play.dataset.tooltip).toBe('Play current sound');
        play.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith('あ', 'あ'));
        host.querySelector<HTMLButtonElement>('[data-kana-id="hira-i"]')!.click();
        expect(evaluationCount).toBe(0);
        expect(host.querySelector('[data-state="committed"] .academy-kana-sound-map-value')?.textContent).toBe('い');
        expect(host.textContent).not.toMatch(/did not match|正しく|incorrect/i);
        expect(host.querySelectorAll('[data-state="committed"]')).toHaveLength(1);
        expect(play).toBe(document.activeElement);

        for (const id of ['hira-i', 'hira-u', 'hira-e', 'hira-o']) {
            host.querySelector<HTMLButtonElement>(`[data-kana-id="${id}"]`)!.click();
        }
        await vi.waitFor(() => expect(
            host.querySelector('.academy-kana-sound-map')?.getAttribute('data-outcome'),
        ).toBe('lapse'));
        expect(evaluationCount).toBe(1);
        expect(host.querySelectorAll('[data-state="committed"]')).toHaveLength(5);
        controller.dispose();
    });

    it('provides grouped named choices, atomic status, and arrow-key traversal', () => {
        const host = document.createElement('main');
        document.body.append(host);
        const controller = createAcademyActivityRuntime().mount(createLessonZeroVowelSoundMap(), {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        const group = host.querySelector<HTMLElement>('.academy-kana-sound-map-choices')!;
        const choices = [...group.querySelectorAll<HTMLButtonElement>('button')];
        expect(group.getAttribute('role')).toBe('group');
        expect(group.getAttribute('aria-labelledby')).toBeTruthy();
        expect(choices).toHaveLength(5);
        expect(choices.every(choice => choice.getAttribute('aria-label'))).toBe(true);
        expect(host.querySelectorAll('[role="status"][aria-live="polite"][aria-atomic="true"]')).toHaveLength(3);
        expect(host.querySelector('.academy-kana-sound-map-route')?.getAttribute('aria-label')).toBe('Five-sound progress');
        choices[0].focus();
        choices[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement).toBe(choices[1]);
        choices[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement).toBe(choices[4]);
        controller.dispose();
    });

    it('retries a failed evidence submission without discarding committed answers', async () => {
        const host = document.createElement('main');
        document.body.append(host);
        let attempts = 0;
        createAcademyActivityRuntime().mount(createLessonZeroVowelSoundMap(), {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => {
            attempts += 1;
            if (attempts === 1) throw new Error('Evidence store is temporarily unavailable.');
        });
        for (const id of ['hira-a', 'hira-i', 'hira-u', 'hira-e', 'hira-o']) {
            host.querySelector<HTMLButtonElement>(`[data-kana-id="${id}"]`)!.click();
        }
        const retry = await vi.waitFor(() => {
            const button = host.querySelector<HTMLButtonElement>('.academy-kana-sound-map-retry');
            expect(button?.textContent).toBe('Try submitting again');
            return button!;
        });
        expect(document.activeElement).toBe(retry);
        expect([...host.querySelectorAll<HTMLButtonElement>('[data-kana-id]')].every(button => button.disabled)).toBe(true);
        expect(host.querySelectorAll('[data-state="committed"]')).toHaveLength(5);
        retry.click();
        await vi.waitFor(() => expect(
            host.querySelector('.academy-kana-sound-map')?.getAttribute('data-outcome'),
        ).toBe('pass'));
        expect(attempts).toBe(2);
    });

    it('ships stable touch targets, a mobile layout, visible focus, and reduced motion', () => {
        const css = readFileSync(path.join(process.cwd(), 'src/academy/minigames/kana-sound-map/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*(52|64)px/);
        expect(css).toContain('min-width: 44px');
        expect(css).toContain('touch-action: manipulation');
        expect(css).toContain(':focus-visible');
        expect(css).toContain('@media (max-width: 600px)');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('animation-duration: 0.01ms');
        expect(css).toContain('color: var(--academy-paper-ink)');
    });
});
