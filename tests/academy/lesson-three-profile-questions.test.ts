import { readFileSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/004-l1-l03.json';
import {
    createLessonThreeProfileQuestionMatchModel,
    createLessonThreeSourceVocabularyActivities,
} from '../../src/academy/content/lesson-three-profile-questions';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    profileQuestionMatchPlugin,
    type ProfileQuestionMatchModel,
    type ProfileQuestionMatchResponse,
} from '../../src/academy/minigames/profile-question-match';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';

const profileRuntime = createActivityRuntime([profileQuestionMatchPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

function model(): ProfileQuestionMatchModel {
    return createLessonThreeProfileQuestionMatchModel();
}

function perfectResponse(): ProfileQuestionMatchResponse {
    return {
        pairs: model().payload.rounds.map(round => ({
            questionId: round.id,
            answerId: round.correctAnswerId,
        })),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 3 exact source vocabulary and profile questions', () => {
    it('projects all 16 teacher vocabulary rows in exact order, including source blanks', () => {
        const rows = createLessonThreeSourceVocabularyActivities();
        const vocabulary = lessonPackage.components.find(component =>
            component.provenance.payloadSha256 === '88d3eb1787c0754800bcc48a9911c4ae870e41e6c8cce781477add3f3b2f2cd8') as unknown as {
                items: Array<{
                    source: {
                        itemId: string;
                        exact: { words: string; pronunciation: string | null; meaning: string | null };
                        fieldProvenance: { words: string; reading: string; meaning: string };
                        locus: { page: number; row: number };
                    };
                }>;
            };
        expect(rows).toHaveLength(16);
        expect(rows.map(row => row.sourceQuestionId)).toEqual(vocabulary.items.map(item => item.source.itemId));
        expect(rows.map(row => row.payload.exact)).toEqual(vocabulary.items.map(item => item.source.exact));
        expect(rows.map(row => row.payload.fieldProvenance)).toEqual(
            vocabulary.items.map(item => item.source.fieldProvenance),
        );
        expect(rows.map(row => row.provenance.locus)).toEqual(vocabulary.items.map(item => item.source.locus));
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows[0]).toMatchObject({
            provenance: {
                packageId: 'l1-l03',
                componentId: 'sensei-chapter-1-3-vocabulary',
                sourceTitle: 'Chapter 1-3 Vocabulary Sheet',
                locus: { page: 1, row: 1 },
            },
            payload: {
                exact: {
                    words: 'あなた',
                    pronunciation: 'anata',
                    meaning: 'You *This is usually omitted or replaced proper noun.',
                },
            },
        });
        expect(rows.slice(8).filter(row => row.payload.exact.pronunciation === null).map(row => row.payload.exact.words)).toEqual([
            '〜くん（〜君）', 'なんさい', 'おいくつ', 'あお', 'あか', 'えき', 'き',
        ]);
        expect(rows.slice(12).every(row => row.payload.exact.meaning === null)).toBe(true);
        expect(rows.at(-1)).toMatchObject({
            provenance: { locus: { page: 1, row: 16 } },
            payload: {
                exact: { words: 'き', pronunciation: null, meaning: null },
                fieldProvenance: { reading: 'yomu-support', meaning: 'yomu-support' },
            },
        });
    });

    it('keeps Moodle, Minna, and Genki identities exact without inventing a Minna transcript', () => {
        const activity = model();
        expect(profileRuntime.validate(activity)).toEqual([]);
        expect(activity.provenance).toEqual({
            packageId: 'l1-l03',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5804931,
                sourceId: 'moodle-payload:4c9b251ade1fc39cd2d9e31a28575e18f894f3425f8b01584d03ee9c8038da2e',
                payloadSha256: '4c9b251ade1fc39cd2d9e31a28575e18f894f3425f8b01584d03ee9c8038da2e',
                sourceTitle: 'Chapter 1-3 Grammar Exercise asking name and state where the person belongs',
                locus: { page: 1, sections: ['の', 'も', 'だれ', 'どなた'] },
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 1',
                relation: 'course-sequence-and-byte-identified-audio-only',
                audioMember: {
                    title: 'minna shokyu 1 001',
                    sourceId: 'moodle-payload:5534e1b822942b8b3806c6555fa2c2355457ed4db3c54442525b65c337644e7f',
                    payloadSha256: '5534e1b822942b8b3806c6555fa2c2355457ed4db3c54442525b65c337644e7f',
                    archiveOrder: 4,
                    durationSeconds: 23.980417,
                },
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                sourceId: 'japanese-genki-interactive:341b1eca3ef498d9c5890601ef4dd5965478675e97fa7dc3a9012bbdd7b292cd:generateQuiz',
                relativePath: 'lessons/lesson-1/workbook-7/index.html',
                payloadSha256: '341b1eca3ef498d9c5890601ef4dd5965478675e97fa7dc3a9012bbdd7b292cd',
                scriptSha256: '474d1b1ae113e6136e9e6b1110804aea1d8637abd91f77992e910d93a96e3949',
                lineLocus: { start: 76, end: 119 },
                engine: 'Genki.generateQuiz',
                responseAdaptation: 'exact-prompts-answers-and-order-with-yomu-one-to-one-matching',
            },
        });
        const sourceMembers = lessonPackage.sourceCoverage.members;
        expect(sourceMembers.find(member => member.payloadSha256 === activity.provenance.minna.audioMember.payloadSha256)).toMatchObject({
            title: 'minna shokyu 1 001',
            kind: 'audio',
        });
        const sourceActivity = lessonPackage.genkiInteractiveActivities[0];
        expect(sourceActivity.source.payloadSha256).toBe(activity.provenance.genki.payloadSha256);
        expect(sourceActivity.source.scriptSha256).toBe(activity.provenance.genki.scriptSha256);
        const quizlet = sourceActivity.exactTask.config.quizlet;
        let previousQuestionIndex = -1;
        activity.payload.rounds.forEach(round => {
            const questionIndex = quizlet.indexOf(round.question);
            expect(questionIndex, round.question).toBeGreaterThan(previousQuestionIndex);
            previousQuestionIndex = questionIndex;
            const answer = activity.payload.answers.find(candidate => candidate.id === round.correctAnswerId)!;
            expect(quizlet, answer.label).toContain(answer.label);
        });
    });

    it('preserves the Moodle teaching order and exact Genki question order', () => {
        const activity = model();
        expect(activity.payload.teaching.map(step => [step.sourceOrder, step.pattern])).toEqual([
            [1, 'Noun 1 は Noun 2 の Noun 3 です。'],
            [2, 'Noun 1 も Noun 2 です。'],
            [3, 'Noun 1 は だれですか。'],
            [4, 'あのかたは どなたですか。'],
        ]);
        expect(activity.payload.rounds.map(round => [round.sourceOrder, round.question, round.clue])).toEqual([
            [1, 'おなまえは？', 'Mary Hart'],
            [2, 'しごとはなんですか。', 'Student'],
            [3, 'なんねんせいですか。', '2nd year'],
            [4, 'なんさいですか。', '19 years old'],
            [5, 'せんこうはなんですか。', 'Major is Japanese'],
            [6, 'でんわばんごうはなんですか。', '020-6921-4236'],
        ]);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual(
            Array.from({ length: 6 }, (_, index) => `genki-2e:l1-l03:lesson-1-workbook-7:problem-${index + 1}`),
        );
    });

    it('grades every one-to-one source pairing and seeds only missed repairs', () => {
        const pass = profileRuntime.evaluate(model(), perfectResponse());
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(6);
        expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const perfect = perfectResponse();
        const lapse: ProfileQuestionMatchResponse = {
            pairs: perfect.pairs.map((pair, index) => {
                if (index === 0) return { ...pair, answerId: perfect.pairs[1].answerId };
                if (index === 1) return { ...pair, answerId: perfect.pairs[0].answerId };
                return pair;
            }),
        };
        const evaluation = profileRuntime.evaluate(model(), lapse);
        expect(evaluation.result).toMatchObject({
            outcome: 'lapse',
            score: 4 / 6,
            errorTags: ['l1-l03-profile-question-name', 'l1-l03-profile-question-occupation'],
        });
        expect(evaluation.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l03:profile-question:name', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l03:profile-question:occupation', reason: 'repair' }),
        ]);
    });

    it('rejects incomplete, duplicate-question, and reused-answer responses', () => {
        expect(() => profileRuntime.evaluate(model(), { pairs: [] })).toThrow('Every exact Genki question');
        const perfect = perfectResponse();
        expect(() => profileRuntime.evaluate(model(), {
            pairs: perfect.pairs.map((pair, index) => index === 1 ? perfect.pairs[0] : pair),
        })).toThrow('exactly once');
        expect(() => profileRuntime.evaluate(model(), {
            pairs: perfect.pairs.map((pair, index) => index === 1 ? { ...pair, answerId: perfect.pairs[0].answerId } : pair),
        })).toThrow('exactly once');
    });

    it('renders instruction and profile reference before the varied non-typing match', async () => {
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const announcements: string[] = [];
        const controller = profileRuntime.mount(model(), {
            replace(view) { host.replaceChildren(view); },
            announce(message) { announcements.push(message); },
        }, onEvaluation);
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const reference = host.querySelector<HTMLElement>('[data-lesson-phase="reference"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(reference.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect([...teaching.querySelectorAll<HTMLElement>('[data-source-order]')].map(item => item.dataset.sourceOrder)).toEqual([
            '1', '2', '3', '4',
        ]);
        expect(teaching.textContent).toContain('Noun 1 は Noun 2 の Noun 3 です');
        expect(teaching.textContent).toContain('あのかたは どなたですか');
        expect(reference.textContent).toContain('Mary Hart');
        expect(host.querySelector('input, textarea')).toBeNull();
        expect(host.querySelectorAll('select')).toHaveLength(6);
        expect(host.querySelectorAll('select option')).toHaveLength(42);
        expect([...form.querySelectorAll<HTMLElement>('.academy-profile-question-match-round')]
            .map(item => item.dataset.sourceOrder)).toEqual(['1', '2', '3', '4', '5', '6']);
        expect(host.textContent).not.toContain('341b1eca');
        expect(host.textContent).not.toContain('moodle-payload');

        for (const pair of perfectResponse().pairs) {
            const select = form.elements.namedItem(pair.questionId) as HTMLSelectElement;
            select.value = pair.answerId;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-outcome="pass"]')).not.toBeNull());
        expect(announcements.at(-1)).toContain('All six questions');
        controller.dispose();
    });

    it('keeps touch, mobile, stable-row, and reduced-motion contracts in the plugin stylesheet', () => {
        const css = readFileSync(path.resolve('src/academy/minigames/profile-question-match/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/\.academy-profile-question-match-round\s*\{[^}]*min-height:\s*68px/s);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-profile-question-match-round\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
