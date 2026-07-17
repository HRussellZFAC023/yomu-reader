import { createLessonZeroVowelDictation } from '../../src/academy/content/lesson-zero-vowel-dictation';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';

afterEach(() => document.body.replaceChildren());

describe('Lesson Zero vowel dictation', () => {
    it('binds exact Moodle A-row evidence while keeping audio provenance honest', () => {
        const model = createLessonZeroVowelDictation();
        expect(model).toMatchObject({
            id: 'activity:lesson-zero-vowel-dictation',
            kind: 'academy-typed-response',
            responseKind: 'kana-input',
            curriculumPhase: 'assessed-production',
            sourceQuestionId: 'source-question:lesson-zero-hiragana-a-row',
            payload: { source: {
                runtimeUrl: '/academy/content/lessons/lesson-zero/moodle-hiragana-a-row-page-1.png',
                sha256: 'fe962ee2dc21478ffe53a24ba77ef0abb5a7685ab7a6eda8f79ac63817ad7dd6',
                locus: 'page 1',
                audioClaim: expect.stringContaining('not claimed to contain audio'),
            } },
        });
        expect(createAcademyActivityRuntime().validate(model)).toEqual([]);
    });

    it('grades typed sound-to-kana production and emits canonical repair seeds', () => {
        const runtime = createAcademyActivityRuntime();
        const model = createLessonZeroVowelDictation();
        const pass = runtime.evaluate(model, 'あいうえお');
        expect(pass.attempt).toMatchObject({
            activityId: model.id, responseKind: 'kana-input', outcome: 'pass', score: 1,
        });
        expect(pass.reviewSeeds).toHaveLength(5);
        expect(pass.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([
            ['あ', 'new-learning'], ['い', 'new-learning'], ['う', 'new-learning'],
            ['え', 'new-learning'], ['お', 'new-learning'],
        ]);
        const lapse = runtime.evaluate(model, 'あいえうお');
        expect(lapse.result).toMatchObject({ outcome: 'lapse', errorTags: ['vowel-dictation-order'] });
        expect(lapse.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
    });

    it('plays each authored sound and commits only through the keyboard-accessible form', async () => {
        const host = document.createElement('main');
        const playPronunciation = vi.fn(async () => ({ dispose() {} }));
        const evaluations = vi.fn();
        document.body.append(host);
        createAcademyActivityRuntime().mount(createLessonZeroVowelDictation(), {
            replace(view) { host.replaceChildren(view); }, announce() {}, playPronunciation,
        }, evaluations);
        const plays = [...host.querySelectorAll<HTMLButtonElement>('.academy-typed-response-play')];
        expect(plays).toHaveLength(5);
        plays[2]!.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith('う', 'う'));
        const input = host.querySelector<HTMLInputElement>('.academy-typed-response-input')!;
        input.value = 'あいうえお';
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(
            host.querySelector('.academy-typed-response')?.getAttribute('data-outcome'),
        ).toBe('pass'));
        expect(evaluations).toHaveBeenCalledOnce();
    });
});
