import { readFileSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/006-l1-l05.json';
import {
    createLessonFivePossessionPhraseModel,
    createLessonFiveSourceVocabularyActivities,
} from '../../src/academy/content/lesson-five-possession-phrases';
import { createActivityRuntime, type ActivityEvaluation } from '../../src/academy/domain/activity-runtime';
import {
    possessionPhraseBuilderPlugin,
    type PossessionPhraseBuilderModel,
    type PossessionPhraseBuilderResponse,
} from '../../src/academy/minigames/possession-phrase-builder';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';

const phraseRuntime = createActivityRuntime([possessionPhraseBuilderPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

function model(): PossessionPhraseBuilderModel {
    return createLessonFivePossessionPhraseModel();
}

function perfectResponse(): PossessionPhraseBuilderResponse {
    return {
        phrases: model().payload.rounds.map(round => ({
            roundId: round.id,
            a: round.correctA,
            b: round.correctB,
        })),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 5 exact source vocabulary and possession phrase builder', () => {
    it('projects all 25 teacher vocabulary rows in exact order with field provenance', () => {
        const rows = createLessonFiveSourceVocabularyActivities();
        const vocabulary = lessonPackage.components.find(component =>
            component.provenance.payloadSha256 === 'e735014a4abb2cd2e281f7a608a546d24a3586e55958c78e515450075fcf3dbe') as unknown as {
                items: Array<{
                    source: {
                        itemId: string;
                        exact: { words: string; pronunciation: string | null; meaning: string | null };
                        fieldProvenance: { words: string; reading: string; meaning: string };
                        locus: { page: number; row: number };
                    };
                }>;
            };
        expect(rows).toHaveLength(25);
        expect(rows.map(row => row.sourceQuestionId)).toEqual(vocabulary.items.map(item => item.source.itemId));
        expect(rows.map(row => row.payload.exact)).toEqual(vocabulary.items.map(item => item.source.exact));
        expect(rows.map(row => row.payload.fieldProvenance)).toEqual(
            vocabulary.items.map(item => item.source.fieldProvenance),
        );
        expect(rows.map(row => row.provenance.locus)).toEqual(vocabulary.items.map(item => item.source.locus));
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows[0]).toMatchObject({
            provenance: {
                packageId: 'l1-l05',
                componentId: 'sensei-chapter-2-2-vocabulary',
                sourceTitle: 'Chapter 2-2 Vocabulary Sheet',
                locus: { page: 1, row: 1 },
            },
            payload: { exact: { words: 'でんしじしょ', pronunciation: null, meaning: null } },
        });
        expect(rows[1].payload.exact).toEqual({
            words: 'の',
            pronunciation: 'no',
            meaning: 'Other use of the particle の.\nN1 explains what N2 is about.',
        });
        expect(rows.at(-1)).toMatchObject({
            provenance: { locus: { page: 2, row: 25 } },
            payload: { exact: { words: 'しろ', pronunciation: null, meaning: null } },
        });
        expect([rows[17], rows[20]].map(row => [row.payload.exact.words, row.provenance.locus.row])).toEqual([
            ['いぬ', 18], ['いぬ', 21],
        ]);
        expect(rows[17].sourceQuestionId).not.toBe(rows[20].sourceQuestionId);
        expect(vocabularyRuntime.evaluate(rows[11], 'reveal')).toMatchObject({
            attempt: { sourceQuestionId: rows[11].sourceQuestionId },
            reviewSeeds: [{ sourceQuestionId: rows[11].sourceQuestionId, reason: 'repair' }],
        });
    });

    it('pins exact Moodle, Minna, and Genki provenance without inventing Minna transcripts', () => {
        const activity = model();
        expect(phraseRuntime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l05',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5834212,
                contentRule: {
                    payloadSha256: '3215f31fc58ce0ff7310ee16098e1fb0149f6c09a6fc972415150fc146934915',
                    sourceTitle: 'Chapter 2-2 Grammar Exercise-1 What the object is about',
                    member: 'handouts/Chapter 2-2 Grammar Exercise-1_What the object is about.pdf',
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2],
                },
                ownerRule: {
                    payloadSha256: '7d71238e487d8c77d5f618e8529921533ceaea2497e8edd3cc9490220f0ed56f',
                    sourceTitle: 'Chapter 2-2 Grammar Exercise-2 Whose belongings the object is',
                    member: 'handouts/Chapter 2-2 Grammar Exercise-2_Whose belongings the object is.pdf',
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2],
                },
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 2',
                relation: 'course-sequence-and-byte-identified-audio-only',
                audioMembers: [
                    {
                        title: 'minna shokyu 1 007',
                        payloadSha256: 'bd797762c73da698d89151f48e3823aea7845064378d0d534f6bbce1af6ba570',
                        archiveOrder: 13,
                        durationSeconds: 36.257958,
                    },
                    {
                        title: 'minna shokyu 1 008',
                        payloadSha256: 'e71fa2268bce1d88bbe84e7c7dbf5febe663cf7406180afda6ceb6960edfd174',
                        archiveOrder: 14,
                        durationSeconds: 45.505333,
                    },
                ],
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                taskId: 'genki-2e:l1-l05:lesson-1-workbook-4',
                relativePath: 'lessons/lesson-1/workbook-4/index.html',
                payloadSha256: '97cabde5351fca03f498279c245c50f598abb6d4d10165fa732b297b9eda4c06',
                scriptSha256: '44caf8d237764275ac255ab37de85bb007b4250790555ce09b58999c25d64d7d',
                lineLocus: { start: 76, end: 107 },
                engine: 'Genki.generateQuiz',
                sourceType: 'fill',
                responseAdaptation: 'exact-prompts-answer-variants-and-order-with-yomu-two-menu-phrase-assembly',
            },
        });

        const changed = structuredClone(activity);
        (changed.provenance.minna.audioMembers[0] as { payloadSha256: string }).payloadSha256 = '0'.repeat(64);
        expect(phraseRuntime.validate(changed)).toContainEqual(expect.objectContaining({ path: 'provenance.minna' }));
    });

    it('preserves all five Genki prompts and answer variants after source teaching', () => {
        const activity = model();
        expect(activity.payload.teaching.map(step => [step.pattern, step.source])).toEqual([
            ['Noun 1 の Noun 2', 'moodle-content-rule'],
            ['Owner の Thing', 'moodle-owner-rule'],
            ['A の B', 'genki-order-warning'],
        ]);
        expect(activity.payload.teaching[0].rule.en).toContain('cannot be omitted');
        expect(activity.payload.teaching[1].rule.en).toContain('only when the thing is obvious');
        expect(activity.payload.teaching[2].rule.en).toContain('different order');
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            'Japanese student',
            "Takeshi's telephone number",
            'My friend',
            'English-language teacher',
            "Michiko's major",
        ]);
        expect(activity.payload.rounds.map(round => round.acceptedAnswers)).toEqual([
            ['にほんじんのがくせい', '日本人の学生', '日本人のがくせい', 'にほんじんの学生'],
            ['たけしさんのでんわばんごう', 'たけしさんの電話番号'],
            [
                'わたしのともだち', '私の友だち', '私の友達', '私のとも達', '私のともだち',
                'わたしの友達', 'わたしの友だち', 'わたしのとも達',
            ],
            ['えいごのせんせい', '英語の先生', '英語のせんせい', 'えいごの先生'],
            ['みちこさんのせんこう', 'みちこさんの専攻'],
        ]);
    });

    it('grades all source slots, preserves partial score, and emits only missed repair seeds', () => {
        const passed = phraseRuntime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(5);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);
        expect(passed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(
            model().payload.rounds.map(round => round.sourceQuestionId),
        );

        const perfect = perfectResponse();
        const response: PossessionPhraseBuilderResponse = {
            phrases: perfect.phrases.map((phrase, index) => index === 1
                ? { ...phrase, b: 'せんこう' }
                : index === 4 ? { ...phrase, a: 'たけしさん' } : phrase),
        };
        const lapsed = phraseRuntime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 3 / 5 });
        expect(new Set(lapsed.result.errorTags)).toEqual(new Set([
            'l1-l05-no-phrase-takeshi-phone',
            'l1-l05-no-phrase-michiko-major',
        ]));
        expect(lapsed.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l05:possession-phrase:takeshi-phone', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l05:possession-phrase:michiko-major', reason: 'repair' }),
        ]);

        expect(() => phraseRuntime.evaluate(model(), { phrases: [] })).toThrow('Every exact Genki source slot');
        const duplicate = perfectResponse();
        expect(() => phraseRuntime.evaluate(model(), {
            phrases: duplicate.phrases.map((phrase, index) => index === 1 ? duplicate.phrases[0] : phrase),
        })).toThrow('each exact source slot once');
        const unknown = perfectResponse() as { phrases: Array<{ roundId: string; a: string; b: string }> };
        unknown.phrases[0].a = 'unknown';
        expect(() => phraseRuntime.evaluate(model(), unknown)).toThrow('only the offered A and B parts');
    });

    it('requires teaching before mounting the accessible, answer-concealed phrase menus', async () => {
        const host = document.createElement('main');
        const evaluations: ActivityEvaluation[] = [];
        const announcements: string[] = [];
        const controller = phraseRuntime.mount(model(), {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce(message) { announcements.push(message); },
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const start = host.querySelector<HTMLButtonElement>('.academy-possession-start')!;
        expect(teaching.textContent).toContain('cannot be omitted');
        expect(teaching.textContent).toContain('only when the thing is obvious');
        expect(teaching.textContent).toContain('different order');
        expect(host.querySelector('[data-lesson-phase="assessment"]')).toBeNull();
        expect(host.querySelector('form, select')).toBeNull();

        start.click();
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('fieldset')).toHaveLength(5);
        expect(host.querySelectorAll('select')).toHaveLength(10);
        expect(host.querySelectorAll('.academy-possession-select')).toHaveLength(10);
        expect([...host.querySelectorAll('select')].every(select => select.options.length === 6)).toBe(true);
        expect(form.textContent).not.toContain('にほんじんのがくせい');
        expect(form.textContent).not.toContain('たけしさんのでんわばんごう');
        expect(form.textContent).not.toContain('みちこさんのせんこう');
        expect(host.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();

        for (const phrase of perfectResponse().phrases) {
            const a = host.querySelector<HTMLSelectElement>(`select[name$="-${phrase.roundId}-a"]`)!;
            const b = host.querySelector<HTMLSelectElement>(`select[name$="-${phrase.roundId}-b"]`)!;
            a.value = phrase.a;
            b.value = phrase.b;
        }
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(host.querySelector('[data-outcome="pass"]')).not.toBeNull());
        expect(evaluations[0].result.outcome).toBe('pass');
        expect(announcements.at(-1)).toContain('All five AのB phrases');
        expect([...form.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select, button')]
            .every(control => control.disabled)).toBe(true);
        controller.dispose();
    });

    it('keeps touch, mobile, stable-grid, and reduced-motion contracts in the plugin stylesheet', () => {
        const css = readFileSync(path.resolve('src/academy/minigames/possession-phrase-builder/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-possession-form\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
