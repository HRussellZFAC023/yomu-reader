import { readFileSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/009-l1-l08.json';
import {
    createLessonEightSourceVocabularyActivities,
    createLessonEightTimeWorkbookBeat,
    createLessonEightTimeWorkbookModel,
} from '../../src/academy/content/lesson-eight-time-workbook';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';
import {
    timeWorkbookPlugin,
    type TimeWorkbookModel,
    type TimeWorkbookResponse,
} from '../../src/academy/minigames/time-workbook';

const workbookRuntime = createActivityRuntime([timeWorkbookPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

function model(): TimeWorkbookModel {
    return createLessonEightTimeWorkbookModel();
}

function perfectResponse(): TimeWorkbookResponse {
    return {
        answers: model().payload.rounds.map(round => {
            if (round.mode === 'range-build') {
                return { mode: round.mode, roundId: round.id, startId: round.correctStartId, endId: round.correctEndId };
            }
            if (round.mode === 'typed-clock') {
                return { mode: round.mode, roundId: round.id, value: round.acceptedAnswers[0] ?? '' };
            }
            return { mode: round.mode, roundId: round.id, optionId: round.correctOptionId };
        }),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 8 exact source time workbook', () => {
    it('projects both Moodle vocabulary sheets in exact row order with source cells and support provenance intact', () => {
        const rows = createLessonEightSourceVocabularyActivities();
        expect(rows).toHaveLength(36);
        const components = lessonPackage.components.filter(component =>
            component.provenance.payloadSha256 === '036a057edcccc409c987027b0a4d3fef00dc8134fd0e4bb0bc5341c2cdc2dadd'
            || component.provenance.payloadSha256 === 'c69d083fd61bcc6d179c70b9da81a68eb759d483ab9c66614ffa3c63ec0780ab') as unknown as Array<{
                items: Array<{
                    source: {
                        itemId: string;
                        exact: { words: string; pronunciation: string | null; meaning: string | null };
                        fieldProvenance: { words: string; reading: string; meaning: string };
                        locus: { page: number; row: number };
                    };
                }>;
            }>;
        const sourceRows = components.flatMap(component => component.items);
        expect(rows.map(row => row.sourceQuestionId)).toEqual(sourceRows.map(row => row.source.itemId));
        expect(rows.map(row => row.payload.exact)).toEqual(sourceRows.map(row => row.source.exact));
        expect(rows.map(row => row.payload.fieldProvenance)).toEqual(sourceRows.map(row => row.source.fieldProvenance));
        expect(rows.map(row => row.provenance.locus)).toEqual(sourceRows.map(row => row.source.locus));
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows[0]).toMatchObject({
            provenance: { componentId: 'chapter-4-1-vocabulary', locus: { page: 1, row: 1 } },
            payload: { exact: { words: 'ふくしゅう', pronunciation: null, meaning: null } },
        });
        expect(rows[11].payload.exact.words).toBe('*review しごと');
        expect(rows[23]).toMatchObject({ provenance: { locus: { page: 2, row: 24 } }, payload: { exact: { words: 'えいが' } } });
        expect(rows[24]).toMatchObject({
            provenance: { componentId: 'time-expression-days', locus: { page: 1, row: 1 } },
            payload: { exact: { words: 'きょう' } },
        });
        expect(rows.at(-1)).toMatchObject({ provenance: { locus: { page: 1, row: 12 } }, payload: { exact: { words: 'にちようび' } } });
    });

    it('pins exact Moodle, Genki, and Minna identities and fails closed when any source drifts', () => {
        const activity = model();
        expect(workbookRuntime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l08',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5866381,
                timeGrammar: {
                    payloadSha256: 'a38a8e1f686876ba1b6bc109ce0e5e0f9ddc70f4b18b520d43241f54256406e0',
                    pages: [1, 2],
                },
                rangeGrammar: {
                    payloadSha256: '26f0f7c3397e7a4903e8c62fc79bdd3ecceca09bb7302826c5e7497dbd83ccd7',
                    pages: [1, 2],
                },
            },
            genki: {
                taskId: 'genki-2e:l1-l08:lesson-1-workbook-2',
                payloadSha256: '6e6c804c56797542057ad96a56ed65dc0de3c90e066e67586e8cf85ce65a09e4',
                scriptSha256: 'ecbac7a25b6cefdd604afda0ee11c0ac3ff177440487aadb7ebdae650def7c0b',
                lineLocus: { start: 76, end: 108 },
            },
            minna: {
                payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
                author: '3A Network',
                pdfPages: [55, 56, 57],
                printedPages: [35, 36, 37],
            },
        });

        const changedMoodle = structuredClone(activity);
        (changedMoodle.provenance.moodle.rangeGrammar as { payloadSha256: string }).payloadSha256 = '0'.repeat(64);
        expect(workbookRuntime.validate(changedMoodle)).toContainEqual(expect.objectContaining({ path: 'provenance.moodle' }));
        const changedGenki = structuredClone(activity);
        (changedGenki.provenance.genki as { scriptSha256: string }).scriptSha256 = '0'.repeat(64);
        expect(workbookRuntime.validate(changedGenki)).toContainEqual(expect.objectContaining({ path: 'provenance.genki' }));
        const changedMinna = structuredClone(activity);
        (changedMinna.provenance.minna as unknown as { pdfPages: number[] }).pdfPages = [54, 55, 56];
        expect(workbookRuntime.validate(changedMinna)).toContainEqual(expect.objectContaining({ path: 'provenance.minna' }));
        const changedSourceItem = structuredClone(activity);
        (changedSourceItem.payload.rounds[3] as { sourcePrompt: string }).sourcePrompt = 'いまなんじですか。（Current Time: 06:00pm）';
        expect(workbookRuntime.validate(changedSourceItem)).toContainEqual(expect.objectContaining({ path: 'payload.rounds.3' }));
        const changedGenkiAnswer = structuredClone(activity);
        (changedGenkiAnswer.payload.rounds[3] as unknown as { acceptedAnswers: string[] }).acceptedAnswers[0] = 'ごごろくじです';
        expect(workbookRuntime.validate(changedGenkiAnswer)).toContainEqual(expect.objectContaining({ path: 'payload.rounds.3.acceptedAnswers' }));
    });

    it('teaches first and preserves exact Moodle, Genki, and Minna task content in source order', () => {
        const activity = model();
        expect(activity.payload.teaching.map(step => [step.pattern, step.sourceLabel])).toEqual([
            ['いまは なんじですか。— time です。', 'Moodle · Chapter 4-1 time Grammar Exercise · page 1'],
            ['Noun は time1 から time2 まで です。', 'Moodle · New Chapter 4-1 from time to time Grammar Exercise · page 1'],
            ['Noun は 何時から 何時までですか。', 'Minna no Nihongo I · Lesson 4 · PDF page 55 / printed page 35'],
        ]);
        expect(activity.payload.teaching[1]?.example).toBe('パーティは ごご6じから 10じまでです。');
        expect(activity.payload.teaching[2]?.example).toBe('銀行は 何時から 何時までですか。— 9時から 3時までです。');
        expect(activity.payload.rounds.map(round => [round.sourceOrder, round.mode, round.sourcePrompt])).toEqual([
            [1, 'range-build', 'かいぎ 1 p.m. - 3:30 p.m.'],
            [2, 'range-build', 'しけん 10 a.m. - 12:45 p.m.'],
            [3, 'range-build', 'ひるやすみ 12:30 p.m. - 1 p.m.'],
            [4, 'typed-clock', 'いまなんじですか。（Current Time: 05:00pm）'],
            [5, 'typed-clock', 'いまなんじですか。（Current Time: 09:00am）'],
            [6, 'typed-clock', 'いまなんじですか。（Current Time: 12:30pm）'],
            [7, 'typed-clock', 'いまなんじですか。（Current Time: 04:30am）'],
            [8, 'typed-clock', 'いまなんじですか。（Current Time: 07:30pm）'],
            [9, 'opening-hours-choice', 'ゆうびんきょく (9:00-5:00)'],
            [10, 'opening-hours-choice', 'デパート (10:00-8:30)'],
            [11, 'opening-hours-choice', 'としょかん (9:00-6:30)'],
            [12, 'opening-hours-choice', 'かいしゃ (9:15-5:45)'],
        ]);
        const typed = activity.payload.rounds.filter(round => round.mode === 'typed-clock');
        expect(typed.map(round => round.acceptedAnswers[0])).toEqual([
            'ごごごじです', 'ごぜんくじです', 'ごごじゅうにじはんです', 'ごぜんよじはんです', 'ごごしちじはんです',
        ]);
        expect(typed.slice(2).every(round => round.acceptedAnswers.length === 8)).toBe(true);
        const genkiQuizlet = lessonPackage.genkiInteractiveActivities[0]!.exactTask.config.quizlet;
        expect(typed.every(round => round.acceptedAnswers.every(answer => genkiQuizlet.includes(answer)))).toBe(true);
    });

    it('grades all three modes, keeps partial score, and emits repair seeds only for missed source items', () => {
        const passed = workbookRuntime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(12);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning' && seed.sourceQuestionId)).toBe(true);
        const alternativeResponse = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        model().payload.rounds.forEach((round, index) => {
            if (round.mode === 'typed-clock') alternativeResponse.answers[index]!.value = round.acceptedAnswers.at(-1)!;
        });
        expect(workbookRuntime.evaluate(model(), alternativeResponse as unknown as TimeWorkbookResponse).result.outcome).toBe('pass');

        const response = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        response.answers[0]!.endId = 'gogo-1';
        response.answers[4]!.value = 'ごぜんはちじです';
        response.answers[11]!.optionId = '9-5';
        const lapsed = workbookRuntime.evaluate(model(), response as unknown as TimeWorkbookResponse);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 9 / 12 });
        expect(lapsed.result.errorTags).toEqual([
            'l1-l08-source-time-company',
            'l1-l08-source-time-genki-9am',
            'l1-l08-source-time-meeting',
        ]);
        expect(lapsed.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l08:source-time:meeting', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l08:source-time:genki-9am', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l08:source-time:company', reason: 'repair' }),
        ]);
    });

    it('rejects missing, duplicate, wrong-mode, unknown-option, and blank typed answers', () => {
        expect(() => workbookRuntime.evaluate(model(), { answers: [] })).toThrow('Every exact Lesson 8 source item');
        const duplicate = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        duplicate.answers[1] = duplicate.answers[0]!;
        expect(() => workbookRuntime.evaluate(model(), duplicate as unknown as TimeWorkbookResponse)).toThrow('each exact source item once');
        const wrongMode = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        wrongMode.answers[0]!.mode = 'typed-clock';
        expect(() => workbookRuntime.evaluate(model(), wrongMode as unknown as TimeWorkbookResponse)).toThrow('interaction mode');
        const unknown = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        unknown.answers[0]!.startId = 'unknown';
        expect(() => workbookRuntime.evaluate(model(), unknown as unknown as TimeWorkbookResponse)).toThrow('offered start and finish');
        const blank = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        blank.answers[3]!.value = '   ';
        expect(() => workbookRuntime.evaluate(model(), blank as unknown as TimeWorkbookResponse)).toThrow('non-empty typed answer');
    });

    it('mounts teaching before any controls, then exposes a labelled native mixed assessment path', async () => {
        const hostElement = document.createElement('main');
        const announcements: string[] = [];
        const onEvaluation = vi.fn();
        const controller = workbookRuntime.mount(model(), {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce(message) { announcements.push(message); },
        }, onEvaluation);
        document.body.append(hostElement);

        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.textContent).toContain('Hours take じ');
        expect(hostElement.querySelector('[data-lesson-phase="assessment"]')).toBeNull();
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        hostElement.querySelector<HTMLButtonElement>('.academy-time-continue')!.click();

        expect(hostElement.querySelector('[data-lesson-phase="assessment"]')).not.toBeNull();
        expect(hostElement.querySelectorAll('fieldset')).toHaveLength(12);
        expect(hostElement.querySelectorAll('legend')).toHaveLength(12);
        expect(hostElement.querySelectorAll('select')).toHaveLength(6);
        expect(hostElement.querySelectorAll('input[type="text"]')).toHaveLength(5);
        expect(hostElement.querySelectorAll('input[type="radio"]')).toHaveLength(16);
        expect(hostElement.querySelectorAll('label')).toHaveLength(27);
        expect(hostElement.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
        expect(hostElement.textContent).not.toContain('ごごごじです');
        expect([...hostElement.querySelectorAll('select option')].some(option => option.textContent?.includes('p.m.'))).toBe(false);

        for (const round of model().payload.rounds) {
            if (round.mode === 'range-build') {
                const start = hostElement.querySelector<HTMLSelectElement>(`select[name$="${round.id}-start"]`)!;
                const end = hostElement.querySelector<HTMLSelectElement>(`select[name$="${round.id}-end"]`)!;
                start.value = round.correctStartId;
                end.value = round.correctEndId;
            } else if (round.mode === 'typed-clock') {
                hostElement.querySelector<HTMLInputElement>(`input[name$="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!;
            } else {
                hostElement.querySelector<HTMLInputElement>(`input[name$="${round.id}-option"][value="${round.correctOptionId}"]`)!.click();
            }
        }
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(hostElement.querySelector('form')?.getAttribute('data-outcome')).toBe('pass'));
        expect(announcements.at(-1)).toContain('source order');
        controller.dispose();
    });

    it('wraps the source model as a lesson beat and keeps mobile/accessibility CSS contracts', () => {
        const beat = createLessonEightTimeWorkbookBeat();
        expect(beat).toMatchObject({
            id: 'source-time-workbook',
            activity: { id: 'activity:l1-l08-source-time-workbook', kind: 'academy-time-workbook' },
        });
        const css = readFileSync(path.resolve('src/academy/minigames/time-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-time-range-builder\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
