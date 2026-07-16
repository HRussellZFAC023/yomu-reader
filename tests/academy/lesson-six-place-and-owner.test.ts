import { readFileSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/007-l1-l06.json';
import {
    createLessonSixPlaceAndOwnerModel,
    createLessonSixSourceVocabularyActivities,
} from '../../src/academy/content/lesson-six-place-and-owner';
import { createActivityRuntime, type ActivityEvaluation } from '../../src/academy/domain/activity-runtime';
import {
    placeOwnerWorkbookPlugin,
    type PlaceOwnerWorkbookModel,
    type PlaceOwnerWorkbookResponse,
} from '../../src/academy/minigames/place-and-owner-workbook';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';

const workbookRuntime = createActivityRuntime([placeOwnerWorkbookPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

function model(): PlaceOwnerWorkbookModel {
    return createLessonSixPlaceAndOwnerModel();
}

function perfectResponse(): PlaceOwnerWorkbookResponse {
    return {
        answers: model().payload.rounds.map(round => round.mode === 'location-choice'
            ? { kind: 'location' as const, roundId: round.id, positionId: round.correctPositionId }
            : { kind: 'owner' as const, roundId: round.id, pointer: round.correctPointer, item: round.correctItem }),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 6 exact source vocabulary and place/owner workbook', () => {
    it('projects all 38 nonblank teacher rows in exact order with omissions and field provenance intact', () => {
        const rows = createLessonSixSourceVocabularyActivities();
        const vocabulary = lessonPackage.components.find(component =>
            component.provenance.payloadSha256 === '29e7e4532cd23ba3153138d0a16b60228a50333d056ae51bd664b8851497b80c') as unknown as {
                items: Array<{
                    source: {
                        itemId: string;
                        exact: { words: string; pronunciation: string | null; meaning: string | null };
                        fieldProvenance: { words: string; reading: string; meaning: string };
                        locus: { page: number; row: number };
                    };
                }>;
            };
        expect(rows).toHaveLength(38);
        expect(rows.map(row => row.sourceQuestionId)).toEqual(vocabulary.items.map(item => item.source.itemId));
        expect(rows.map(row => row.payload.exact)).toEqual(vocabulary.items.map(item => item.source.exact));
        expect(rows.map(row => row.payload.fieldProvenance)).toEqual(
            vocabulary.items.map(item => item.source.fieldProvenance),
        );
        expect(rows.map(row => row.provenance.locus)).toEqual(vocabulary.items.map(item => item.source.locus));
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows[0]).toMatchObject({
            provenance: {
                packageId: 'l1-l06',
                componentId: 'sensei-chapter-3-1-vocabulary',
                sourceTitle: 'Chapter 3-1 Vocabulary Sheet',
                locus: { page: 1, row: 1 },
            },
            payload: { exact: { words: '1)きょうしつ', pronunciation: null, meaning: null } },
        });
        expect(rows[14].payload.exact.words).toBe('*review\n15)かいしゃ');
        expect(rows.some(row => row.provenance.locus.row === 27)).toBe(false);
        expect(rows.at(-1)).toMatchObject({
            provenance: { locus: { page: 3, row: 39 } },
            payload: { exact: { words: 'おくじょう', pronunciation: null, meaning: null } },
        });
        expect(vocabularyRuntime.evaluate(rows[17], 'reveal')).toMatchObject({
            attempt: { sourceQuestionId: rows[17].sourceQuestionId },
            reviewSeeds: [{ sourceQuestionId: rows[17].sourceQuestionId, reason: 'repair' }],
        });
    });

    it('pins exact Moodle, Genki, and Minna source identities without invented transcripts or Minna page loci', () => {
        const activity = model();
        expect(workbookRuntime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l06',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5860335,
                grammar: {
                    payloadSha256: '45db157c1c0c5bdfa5012f238189bdd2f85da3a098acb2d95b2321511fcf573b',
                    member: 'Handouts/Chapter 3-1_Grammar Exercise.pdf',
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2, 3, 4, 5, 6],
                },
                audioMembers: [
                    { title: '9 A-9', payloadSha256: '0449362eb519969bbf72ac6d059e1c3ef344c559b905d1fccfcdf4efe2390460', durationSeconds: 78.013333 },
                    { title: '10 A-10', payloadSha256: 'b19723f688559100d53e2ad71e277bedbea949253c6fc67195f33737fc057d20', durationSeconds: 58.946667 },
                ],
                transcriptStatus: 'not-provided-do-not-invent',
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 3',
                textbook: {
                    payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
                    author: '3A Network',
                    pageCount: 326,
                    locusStatus: 'scanned-pdf-no-text-locus-do-not-invent',
                },
                conversation: {
                    payloadSha256: '7d0e2b3e0f7b66c44719b2a1dedc0f85ea19d8c3edcd6a5b4565f50d3c253460',
                    durationSeconds: 67.413333,
                },
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                taskId: 'genki-2e:l1-l06:lesson-2-workbook-4',
                relativePath: 'lessons/lesson-2/workbook-4/index.html',
                payloadSha256: 'e54d3ea575725cfb771f9d9ed2d6b819c7edaa8850c8af1cdd793613012a7d99',
                scriptSha256: 'e4d41714713102b1c1fe093588c397950fcadeaf1808d679f7bc93a1d56430d3',
                lineLocus: { start: 76, end: 152 },
                engine: 'Genki.generateQuiz',
            },
        });

        const changedMoodle = structuredClone(activity);
        (changedMoodle.provenance.moodle.grammar as { payloadSha256: string }).payloadSha256 = '0'.repeat(64);
        expect(workbookRuntime.validate(changedMoodle)).toContainEqual(expect.objectContaining({ path: 'provenance.moodle' }));
        const changedMinna = structuredClone(activity);
        (changedMinna.provenance.minna.conversation as { payloadSha256: string }).payloadSha256 = '0'.repeat(64);
        expect(workbookRuntime.validate(changedMinna)).toContainEqual(expect.objectContaining({ path: 'provenance.minna' }));
        const changedGenki = structuredClone(activity);
        (changedGenki.provenance.genki as { payloadSha256: string }).payloadSha256 = '0'.repeat(64);
        expect(workbookRuntime.validate(changedGenki)).toContainEqual(expect.objectContaining({ path: 'provenance.genki' }));
        const changedSlot = structuredClone(activity);
        (changedSlot.payload.rounds[4].acceptedAnswers as string[])[0] = 'これはだれのほんですか';
        expect(workbookRuntime.validate(changedSlot)).toContainEqual(expect.objectContaining({ path: 'payload.rounds.4' }));
    });

    it('teaches the place system first and preserves all seven Genki prompts and answer variants in order', () => {
        const activity = model();
        expect(activity.payload.teaching.map(step => [step.pattern, step.source])).toEqual([
            ['ここ・そこ・あそこ', 'moodle-place-rule'],
            ['Noun は どこですか', 'moodle-location-question'],
            ['Lesson 3 place sequence', 'minna-sequence'],
            ['これは／あれは だれの Noun ですか', 'genki-owner-task'],
        ]);
        expect(activity.payload.teaching[0].rule.en).toContain('share one territory');
        expect(activity.payload.teaching[2].rule.en).toContain('no unverified wording');
        expect(activity.payload.rounds.map(round => [round.sourceOrder, round.sourcePrompt, round.mode])).toEqual([
            [1, 'A：たけしさんはどこですか。', 'location-choice'],
            [2, 'A：スーさんはどこですか。', 'location-choice'],
            [3, 'A：ロバートさんはどこですか。', 'location-choice'],
            [4, 'A：トイレはどこですか。', 'location-choice'],
            [5, 'ぼうし — in your hand', 'owner-phrase'],
            [6, 'さいふ — in your hand', 'owner-phrase'],
            [7, 'かさ — far from both', 'owner-phrase'],
        ]);
        expect(activity.payload.rounds.map(round => round.acceptedAnswers)).toEqual([
            ['あそこです', 'たけしさんはあそこです'],
            ['そこです', 'スーさんはそこです'],
            ['ここです', 'ロバートさんはここです'],
            ['あそこです', 'トイレはあそこです'],
            ['これはだれのぼうしですか', 'これはだれの帽子ですか', 'これは誰の帽子ですか', 'これは誰のぼうしですか'],
            ['これはだれのさいふですか', 'これはだれの財布ですか', 'これは誰の財布ですか', 'これは誰のさいふですか'],
            ['あれはだれのかさですか', 'あれはだれの傘ですか', 'あれは誰の傘ですか', 'あれは誰のかさですか'],
        ]);
    });

    it('grades both interaction modes, keeps partial score, and emits only missed repair seeds', () => {
        const passed = workbookRuntime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(7);
        expect(passed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(
            model().payload.rounds.map(round => round.sourceQuestionId),
        );

        const perfect = perfectResponse();
        const response: PlaceOwnerWorkbookResponse = {
            answers: perfect.answers.map((answer, index) => {
                if (index === 1 && answer.kind === 'location') return { ...answer, positionId: 'speaker' };
                if (index === 6 && answer.kind === 'owner') return { ...answer, pointer: 'これ' };
                return answer;
            }),
        };
        const lapsed = workbookRuntime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 5 / 7 });
        expect(lapsed.result.errorTags).toEqual([
            'l1-l06-place-owner-sue-place',
            'l1-l06-place-owner-umbrella-owner',
        ]);
        expect(lapsed.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l06:place-owner:sue-place', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l06:place-owner:umbrella-owner', reason: 'repair' }),
        ]);

        expect(() => workbookRuntime.evaluate(model(), { answers: [] })).toThrow('Every exact Genki source slot');
        const duplicate = perfectResponse();
        expect(() => workbookRuntime.evaluate(model(), {
            answers: duplicate.answers.map((answer, index) => index === 1 ? duplicate.answers[0] : answer),
        })).toThrow('each exact source slot once');
        const unknown = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        unknown.answers[0].positionId = 'unknown';
        expect(() => workbookRuntime.evaluate(model(), unknown)).toThrow('offered place position');
    });

    it('requires teaching before mounting the accessible mixed assessment and conceals source replies', async () => {
        const host = document.createElement('main');
        const evaluations: ActivityEvaluation[] = [];
        const announcements: string[] = [];
        const controller = workbookRuntime.mount(model(), {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce(message) { announcements.push(message); },
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        expect(teaching.textContent).toContain('share one territory');
        expect(teaching.textContent).toContain('Noun は どこですか');
        expect(teaching.textContent).toContain('だれの Noun');
        expect(host.textContent).not.toContain('たけしさんはあそこです');
        expect(host.textContent).not.toContain('それはたけしさんのぼうしです');
        expect(host.querySelector('[data-lesson-phase="assessment"]')).toBeNull();
        expect(host.querySelector('form, input, select')).toBeNull();

        host.querySelector<HTMLButtonElement>('.academy-place-owner-start')!.click();
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(form.querySelectorAll('.academy-place-owner-round-location-choice')).toHaveLength(4);
        expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(12);
        expect(form.querySelectorAll('.academy-place-owner-round-owner-phrase')).toHaveLength(3);
        expect(form.querySelectorAll('select')).toHaveLength(6);
        expect(form.querySelectorAll('fieldset')).toHaveLength(7);
        expect(form.textContent).not.toContain('たけしさんはあそこです');
        expect(form.textContent).not.toContain('それはたけしさんのぼうしです');
        expect(form.querySelector('[role="status"]')).toBeNull();

        for (const round of model().payload.rounds) {
            const fieldset = form.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            if (round.mode === 'location-choice') {
                fieldset.querySelector<HTMLInputElement>(`input[value="${round.correctPositionId}"]`)!.click();
            } else {
                const selects = fieldset.querySelectorAll<HTMLSelectElement>('select');
                selects[0].value = round.correctPointer;
                selects[1].value = round.correctItem;
            }
        }
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(host.querySelector('[data-outcome="pass"]')).not.toBeNull());
        expect(evaluations[0].result.outcome).toBe('pass');
        expect(announcements.at(-1)).toContain('All seven Genki source slots');
        expect([...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')]
            .every(control => control.disabled)).toBe(true);
        controller.dispose();
    });

    it('keeps touch, stable-grid, mobile, and reduced-motion contracts in the plugin stylesheet', () => {
        const css = readFileSync(path.resolve('src/academy/minigames/place-and-owner-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-place-owner-form\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
