import { readFileSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/005-l1-l04.json';
import {
    createLessonFourObjectDistanceModel,
    createLessonFourSourceVocabularyActivities,
} from '../../src/academy/content/lesson-four-object-distance';
import { createActivityRuntime, type ActivityEvaluation } from '../../src/academy/domain/activity-runtime';
import {
    objectDistanceBoardPlugin,
    type ObjectDistanceBoardModel,
    type ObjectDistanceBoardResponse,
} from '../../src/academy/minigames/object-distance-board';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';
import { ACADEMY_ACTIVITY_PLUGINS, createAcademyActivityRuntime } from '../../src/academy/minigames';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';

const objectRuntime = createActivityRuntime([objectDistanceBoardPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

function model(): ObjectDistanceBoardModel {
    return createLessonFourObjectDistanceModel();
}

function perfectResponse(): ObjectDistanceBoardResponse {
    return {
        placements: model().payload.rounds.map(round => ({
            roundId: round.id,
            positionId: round.correctPositionId,
        })),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 4 exact source vocabulary and object distance board', () => {
    it('registers the object board for the activity stream and exposes it after the source-backed week', async () => {
        expect(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind)).toEqual(expect.arrayContaining([
            'academy-object-distance-board',
            'academy-picture-vocabulary-board',
            'academy-profile-board',
            'academy-profile-question-match',
        ]));
        expect(createAcademyActivityRuntime().validate(model())).toEqual([]);
        const chapter = await loadLessonActivityChapter('l1-l04', { lookup: vi.fn(async () => null) });
        expect(chapter?.beats.map(beat => beat.activity.id)).toEqual([
            'activity:l1-l04-source-picture-vocabulary',
            'activity:l1-l04-object-distance-board',
        ]);
    });

    it('projects all 42 teacher vocabulary rows in exact order with field provenance', () => {
        const rows = createLessonFourSourceVocabularyActivities();
        const vocabulary = lessonPackage.components.find(component =>
            component.provenance.payloadSha256 === 'a267243216a4c999d8733ed6febeeed938c47b593f0d1841b1dc8c244f37b253') as unknown as {
                items: Array<{
                    source: {
                        itemId: string;
                        exact: { words: string; pronunciation: string | null; meaning: string | null };
                        fieldProvenance: { words: string; reading: string; meaning: string };
                        locus: { page: number; row: number };
                    };
                }>;
            };
        expect(rows).toHaveLength(42);
        expect(rows.map(row => row.sourceQuestionId)).toEqual(vocabulary.items.map(item => item.source.itemId));
        expect(rows.map(row => row.payload.exact)).toEqual(vocabulary.items.map(item => item.source.exact));
        expect(rows.map(row => row.payload.fieldProvenance)).toEqual(
            vocabulary.items.map(item => item.source.fieldProvenance),
        );
        expect(rows.map(row => row.provenance.locus)).toEqual(vocabulary.items.map(item => item.source.locus));
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows[0]).toMatchObject({
            provenance: {
                packageId: 'l1-l04',
                componentId: 'sensei-chapter-2-1-vocabulary',
                sourceTitle: 'Chapter 2-1 Vocabulary Sheet',
                locus: { page: 1, row: 1 },
            },
            payload: { exact: { words: '1）ほん', pronunciation: null, meaning: null } },
        });
        expect(rows.at(-1)).toMatchObject({
            provenance: { locus: { page: 3, row: 43 } },
            payload: {
                exact: {
                    words: 'こちらこそ',
                    pronunciation: 'kochirakoso',
                    meaning: expect.stringContaining('pleased to meet you too'),
                },
            },
        });
        expect(rows.some(row => row.provenance.locus.page === 3 && row.provenance.locus.row === 41)).toBe(false);
        expect(vocabularyRuntime.evaluate(rows[29], 'reveal')).toMatchObject({
            attempt: { sourceQuestionId: rows[29].sourceQuestionId },
            reviewSeeds: [{ sourceQuestionId: rows[29].sourceQuestionId, reason: 'repair' }],
        });
    });

    it('pins exact Moodle, Minna, and Genki provenance with all nine source slots in order', () => {
        const activity = model();
        expect(objectRuntime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l04',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5822243,
                grammar: {
                    payloadSha256: '83bf2695e5760fdf415c31eabf96586a31f373f6b339849467fa7c88dbdde49b',
                    sourceTitle: 'Chapter 2-1 Grammar Exercise',
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2, 3, 4, 5, 6, 7],
                },
                answerKey: {
                    payloadSha256: '0d33601e79064e1d08e46988bab8f1cd7738dabf829ece3efe9ae7e60e575249',
                    page: 1,
                },
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 2',
                audioMember: {
                    title: 'minna shokyu 1 005',
                    payloadSha256: '62f3b96d10028d1eb1d6e39020a76cd72003d5d9cf651a70bc895bd3c66bd450',
                    durationSeconds: 36.884917,
                },
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                relativePath: 'lessons/lesson-2/workbook-2/index.html',
                payloadSha256: '69eb24f468086afac22f58fbac149c4765026d38477926417f42835e0dfa9b53',
                scriptSha256: '52ce8ff929718489eab63f648eb8f82b12f5b7324f3727e76a6bf84d5559474c',
                lineLocus: { start: 76, end: 123 },
                engine: 'Genki.generateQuiz',
                responseAdaptation: expect.stringContaining('exact-prompts-answers-and-order'),
            },
        });
        expect(activity.payload.rounds.map(round => [
            round.sourceOrder,
            round.sourcePrompt,
            round.correctPositionId,
            round.pronoun,
        ])).toEqual([
            [1, 'This is my pen.', 'speaker', 'これ'],
            [2, "That is Ken's book.", 'listener', 'それ'],
            [3, 'What is that? (points to a building in the distance)', 'far', 'あれ'],
            [4, 'Is this meat?', 'speaker', 'これ'],
            [5, 'メアリー：___ はたけしさんのかさですか。', 'speaker', 'これ'],
            [6, 'たけし：いいえ、___ はみちこさんのかさです。', 'listener', 'それ'],
            [7, 'たけし：___ はメアリーさんのさいふですか。', 'speaker', 'これ'],
            [8, 'メアリー：___ はたけしさんのじてんしゃですか。', 'far', 'あれ'],
            [9, 'メアリー：___ はなんですか。', 'far', 'あれ'],
        ]);
        expect(activity.payload.teaching.map(step => [step.pronoun, step.position])).toEqual([
            ['これ', 'speaker'], ['それ', 'listener'], ['あれ', 'far'], ['これ／それ', 'viewpoint'],
        ]);

        const changed = structuredClone(activity);
        (changed.provenance.genki as { payloadSha256: string }).payloadSha256 = '0'.repeat(64);
        expect(objectRuntime.validate(changed)).toContainEqual(expect.objectContaining({ path: 'provenance.genki' }));
    });

    it('grades all source slots, keeps partial score, and emits only missed repair seeds', () => {
        const passed = objectRuntime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(9);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);
        expect(passed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(
            model().payload.rounds.map(round => round.sourceQuestionId),
        );

        const perfect = perfectResponse();
        const response: ObjectDistanceBoardResponse = {
            placements: perfect.placements.map((placement, index) => ({
                ...placement,
                ...(index === 1 || index === 7 ? { positionId: 'speaker' as const } : {}),
            })),
        };
        const lapsed = objectRuntime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 7 / 9 });
        expect(lapsed.result.errorTags).toEqual(['l1-l04-kosoado-bicycle', 'l1-l04-kosoado-book']);
        expect(lapsed.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l04:object-distance:book', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l04:object-distance:bicycle', reason: 'repair' }),
        ]);

        expect(() => objectRuntime.evaluate(model(), { placements: [] })).toThrow('Every exact Genki source slot');
        const duplicate = perfectResponse();
        expect(() => objectRuntime.evaluate(model(), {
            placements: duplicate.placements.map((placement, index) => index === 1 ? duplicate.placements[0] : placement),
        })).toThrow('each source slot');
        const unknown = perfectResponse() as { placements: Array<{ roundId: string; positionId: string }> };
        unknown.placements[0].positionId = 'unknown';
        expect(() => objectRuntime.evaluate(model(), unknown)).toThrow('each source slot');
    });

    it('requires teaching before mounting the accessible, answer-concealed position board', async () => {
        const host = document.createElement('main');
        const evaluations: ActivityEvaluation[] = [];
        const announcements: string[] = [];
        const controller = objectRuntime.mount(model(), {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce(message) { announcements.push(message); },
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const start = host.querySelector<HTMLButtonElement>('.academy-object-distance-start')!;
        expect(teaching.textContent).toContain('near the speaker');
        expect(teaching.textContent).toContain('near the listener');
        expect(teaching.textContent).toContain('far from both people');
        expect(teaching.textContent).toContain('Q: これは なんですか。 A: それは Noun です。');
        expect(host.querySelector('[data-lesson-phase="assessment"]')).toBeNull();
        expect(host.querySelector('form, input[type="radio"]')).toBeNull();

        start.click();
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('fieldset')).toHaveLength(9);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(27);
        expect(host.querySelectorAll('label')).toHaveLength(27);
        expect(host.querySelector('input[type="text"], textarea, select')).toBeNull();
        expect(form.textContent).not.toContain('これはわたしのペンです。');
        expect(form.textContent).not.toContain('いいえ、それはみちこさんのかさです。');
        expect(host.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
        expect([...host.querySelectorAll('fieldset')].every(fieldset => {
            const id = fieldset.getAttribute('aria-describedby');
            return Boolean(id && document.getElementById(id));
        })).toBe(true);

        for (const placement of perfectResponse().placements) {
            host.querySelector<HTMLInputElement>(
                `input[name$="-${placement.roundId}"][value="${placement.positionId}"]`,
            )!.click();
        }
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(host.querySelector('[data-outcome="pass"]')).not.toBeNull());
        expect(evaluations[0].result.outcome).toBe('pass');
        expect(announcements.at(-1)).toContain('All nine source scenarios');
        expect([...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')]
            .every(control => control.disabled)).toBe(true);
        controller.dispose();
    });

    it('keeps touch, mobile, stable-grid, and reduced-motion contracts in the plugin stylesheet', () => {
        const css = readFileSync(path.resolve('src/academy/minigames/object-distance-board/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-object-distance-form\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
