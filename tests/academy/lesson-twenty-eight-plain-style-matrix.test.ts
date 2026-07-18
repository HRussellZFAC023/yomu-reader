import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonTwentySevenExperiencePostcardListeningBeat } from '../../src/academy/content/lesson-twenty-seven-experience-postcard-listening-core';
import { createLessonTwentyEightPlainStyleMatrixBeat } from '../../src/academy/content/lesson-twenty-eight-plain-style-matrix';
import { createLessonTwentyNineHolidayItineraryTapeBeat } from '../../src/academy/content/lesson-twenty-nine-holiday-itinerary-tape';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createAcademyActivityRuntime,
    type ExperiencePostcardListeningModel,
    type HolidayItineraryTapeModel,
    type PlainStyleMatrixModel,
} from '../../src/academy/minigames';
import { sha256File } from './helpers/hash-memo';

function model(): PlainStyleMatrixModel { return createLessonTwentyEightPlainStyleMatrixBeat().activity as PlainStyleMatrixModel; }

afterEach(() => document.body.replaceChildren());

describe('Lesson 28 Sensei Chapter 20 plain-style matrix', () => {
    it('teaches exact Sensei pages before derived plain-form completion, without claiming source audio or source answers', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l04-sensei-plain-style-matrix', kind: 'academy-plain-style-matrix', responseKind: 'moodle-chapter-20-plain-style-matrix',
            provenance: {
                packageId: 'l2-l04', moodle: { moduleId: 7011920, answerKeyBasis: 'yomu-derived-plain-form-completion-over-verbatim-source-matrix', vocabularySheet: { sha256: 'c0069c4fcc3b1d31df9badbb2f4532078b02d925e2c44303c5e50408e95819f2' }, grammarSheet: { sha256: 'd8d0b2b0ff00c3e6801b4e02d97cde11382a201e85b0ea468b717a448cd9f38f' } },
                support: { minna: { reference: 'Minna no Nihongo I, Lesson 20' }, genki: { payloadSha256: '510418850a44517faf16d384412b5cc90f653bfe7426063cdf616723d4c62f55' } },
            },
        });
        expect(activity.payload.prompts.map(prompt => [prompt.politeForm, prompt.targetColumn, prompt.correctOptionId])).toEqual([
            ['泳ぎます', 'dictionary', 'a'], ['貸します', 'dictionary', 'b'], ['待ちます', 'negative', 'c'], ['遊びます', 'past-negative', 'a'],
        ]);
    });

    it('requires all four derived column choices and repairs only missed rows', () => {
        const activity = model(); const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, { answers: activity.payload.prompts.map(prompt => ({ promptId: prompt.id, optionId: prompt.correctOptionId })) });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(['泳ぐ', '貸す', '待たない', '遊ばなかった']);
        const repair = runtime.evaluate(activity, { answers: activity.payload.prompts.map((prompt, index) => ({ promptId: prompt.id, optionId: index === 2 ? 'a' : prompt.correctOptionId })) });
        expect(repair.result).toMatchObject({ outcome: 'lapse', score: 3 / 4, errorTags: ['l2-l04-plain-matrix-machimasu-negative'] });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:7011920:87f2476a1e1f9701d058f3b761542a0caba4a9b4da9213f919c4373781d8033c:pdf-p3:plain-style-matrix:row-3']);
    });

    it('renders the original pages before the matrix and gates derived feedback until an attempt', async () => {
        const host = document.createElement('main'); const onEvaluation = vi.fn();
        const controller = createAcademyActivityRuntime().mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, onEvaluation); document.body.append(host);
        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!; const sources = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!; const form = host.querySelector<HTMLFormElement>('form')!; const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect([...sources.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/academy/content/lessons/l2-l04/moodle-chapter-20-1-vocabulary-page-1.png', '/academy/content/lessons/l2-l04/moodle-chapter-20-1-plain-style-verb-page-3.png']);
        expect(host.querySelector('audio')).toBeNull(); expect(key.hidden).toBe(true);
        model().payload.prompts.forEach(prompt => host.querySelector<HTMLInputElement>(`input[value="${prompt.correctOptionId}"][name$=":${prompt.id}"]`)!.click()); form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce()); await vi.waitFor(() => expect(key.hidden).toBe(false)); controller.dispose();
    });

    it('keeps Lesson 27, Lesson 28, and Lesson 29 source routes unique and reachable', async () => {
        const lesson27 = createLessonTwentySevenExperiencePostcardListeningBeat().activity as ExperiencePostcardListeningModel;
        const lesson28 = model(); const lesson29 = createLessonTwentyNineHolidayItineraryTapeBeat().activity as HolidayItineraryTapeModel;
        expect(new Set([lesson27.id, lesson28.id, lesson29.id]).size).toBe(3);
        expect([lesson27.provenance.packageId, lesson28.provenance.packageId, lesson29.provenance.packageId]).toEqual(['l2-l02', 'l2-l04', 'l2-l03']);
        expect(new Set([lesson27.provenance.moodle.moduleId, lesson28.provenance.moodle.moduleId, lesson29.provenance.moodle.moduleId]).size).toBe(3);
        const packages = [
            ['029-l2-l02.json', 'l2-l02', 29],
            ['030-l2-l03.json', 'l2-l03', 30],
            ['031-l2-l04.json', 'l2-l04', 31],
        ] as const;
        expect(packages.map(([filename, lessonId, order]) => {
            const source = JSON.parse(readFileSync(path.resolve('public/academy/content/lessons', filename), 'utf8')) as { id: string; order: number };
            return [source.id, source.order, lessonId, order];
        })).toEqual([
            ['l2-l02', 29, 'l2-l02', 29],
            ['l2-l03', 30, 'l2-l03', 30],
            ['l2-l04', 31, 'l2-l04', 31],
        ]);
        ([['moodle-chapter-20-1-vocabulary-page-1.png', lesson28.provenance.moodle.vocabularySheet.sha256], ['moodle-chapter-20-1-plain-style-verb-page-3.png', lesson28.provenance.moodle.grammarSheet.sha256]] as const).forEach(([file, sha256]) => expect(sha256File(path.resolve('public/academy/content/lessons/l2-l04', file))).toBe(sha256));
        const chapter = await loadLessonActivityChapter('l2-l04', { lookup: async () => null }); expect(chapter).toMatchObject({ lessonPackageId: 'l2-l04', host: { id: 'tom' }, beats: [{ id: 'sensei-plain-style-matrix', activity: { kind: 'academy-plain-style-matrix' } }] });
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as { worksheetDigitisation: { additionalSlices: Array<{ lessonId: string; moodleModuleId: number; audio: { sourceAudioTracksDelivered: number } }> } };
        const slices = ledger.worksheetDigitisation.additionalSlices.filter(slice => ['l2-l02', 'l2-l03', 'l2-l04'].includes(slice.lessonId));
        expect(new Set(slices.map(slice => slice.lessonId)).size).toBe(3); expect(new Set(slices.map(slice => slice.moodleModuleId)).size).toBe(3); expect(slices.find(slice => slice.lessonId === 'l2-l04')).toMatchObject({ audio: { sourceAudioTracksDelivered: 0 } });
    });
});
