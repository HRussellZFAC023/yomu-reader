import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/003-l1-l02.json';
import {
    createLessonTwoProfileBoardModel,
    createLessonTwoSourceVocabularyActivities,
} from '../../src/academy/content/lesson-two-profile-board';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    profileBoardPlugin,
    type ProfileBoardModel,
    type ProfileBoardResponse,
} from '../../src/academy/minigames/profile-board';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';

const profileRuntime = createActivityRuntime([profileBoardPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

function model(): ProfileBoardModel {
    return createLessonTwoProfileBoardModel();
}

function perfectResponse(): ProfileBoardResponse {
    return {
        answers: model().payload.rounds.map(round => ({
            roundId: round.id,
            nationalityId: round.nationality.correctOptionId,
            occupationId: round.occupation.correctOptionId,
        })),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 2 source vocabulary and profile board', () => {
    it('projects all 32 teacher vocabulary rows in exact order with field provenance', () => {
        const rows = createLessonTwoSourceVocabularyActivities();
        const vocabulary = lessonPackage.components.find(component =>
            component.provenance.payloadSha256 === '67d2f2f85ee3a0a5e0044ae31d2aa1ad870ab051c0ff2676cbc7540bd2fb372d') as unknown as {
                items: Array<{
                    source: {
                        itemId: string;
                        exact: { words: string; pronunciation: string | null; meaning: string | null };
                        fieldProvenance: { words: string; reading: string; meaning: string };
                        locus: { page: number; row: number };
                    };
                }>;
            };
        expect(rows).toHaveLength(32);
        expect(rows.map(row => row.sourceQuestionId)).toEqual(vocabulary.items.map(item => item.source.itemId));
        expect(rows.map(row => row.payload.exact)).toEqual(vocabulary.items.map(item => item.source.exact));
        expect(rows.map(row => row.payload.fieldProvenance)).toEqual(
            vocabulary.items.map(item => item.source.fieldProvenance),
        );
        expect(rows.map(row => row.provenance.locus)).toEqual(vocabulary.items.map(item => item.source.locus));
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows[0]).toMatchObject({
            provenance: {
                packageId: 'l1-l02',
                componentId: 'sensei-chapter-1-2-vocabulary',
                sourceTitle: 'Chapter 1-2 Vocabulary Sheet',
                locus: { page: 1, row: 1 },
            },
            payload: {
                exact: {
                    words: 'げんきな',
                    pronunciation: 'genki na',
                    meaning: '*na-adjective\nhealthy, lively, spirited, energetic, vigorous',
                },
            },
        });
        expect(rows.at(-1)).toMatchObject({
            provenance: { locus: { page: 2, row: 32 } },
            payload: { exact: { words: 'しつれいですが', pronunciation: 'shitsureidesuga', meaning: 'Excuse me, but,,,' } },
        });
        expect(vocabularyRuntime.evaluate(rows[31], 'reveal')).toMatchObject({
            attempt: { sourceQuestionId: rows[31].sourceQuestionId },
            reviewSeeds: [{ sourceQuestionId: rows[31].sourceQuestionId, reason: 'repair' }],
        });
    });

    it('binds the exact four Moodle profiles and labels Yomu framing separately', () => {
        const activity = model();
        expect(profileRuntime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            sourceId: 'moodle-payload:501846818390b51c277bd67ea9b929dfcf41e06f4af2a26bd1836ae479184115',
            payloadSha256: '501846818390b51c277bd67ea9b929dfcf41e06f4af2a26bd1836ae479184115',
            sourceTitle: 'Chapter 1-2 Grammar Exercise nationality and occupation',
            author: 'Rie Tsuruta-Barratt',
            moodleModuleId: 5792908,
            locus: { page: 2, tasks: ['A', 'B'] },
            answerVisibility: 'after-attempt',
            exactFields: ['name', 'country', 'occupation'],
            yomuFraming: expect.stringContaining('Yomu support'),
        });
        expect(activity.provenance.sourceReference).toMatchObject({
            imageUrl: '/academy/content/lessons/l1-l02/moodle-chapter-1-2-grammar-nationality-occupation-page-2.png',
            imageSha256: 'c474a7aa7bb950d60deb1d84bbcfb3abbf15c0db682f16202f10ac3088d83dcc',
            caption: { en: expect.stringContaining('A and B'), ja: expect.stringContaining('AとB') },
        });
        expect(activity.provenance.support).toEqual({
            phase: 'after-moodle-source',
            minna: {
                sourceId: 'source-minna-no-nihongo',
                reference: 'Minna no Nihongo I · Lesson 1',
                reuse: 'sequence-only',
            },
            genki: {
                sourceId: 'japanese-genki-interactive:767fd25715c28186006797f40d77fb6bfd5cd4d420d31c4d3c276c77887ca6b6:generateQuiz',
                title: 'Workbook: Question Sentences - Lesson 1 | Genki Study Resources - 2nd Edition',
                relation: 'post-instruction-guided-fill',
                prerequisitePolicy: 'deliver-only-after-the-mapped-Moodle-Minna-instruction-and-worked-example',
            },
        });
        expect(activity.payload.rounds.map(round => [
            round.name,
            round.country,
            round.nationality.correctOptionId,
            round.occupation.correctOptionId,
        ])).toEqual([
            ['やまださん', 'にほん', 'nihon-jin', 'ginkouin'],
            ['ワットさん', 'イギリス', 'igirisu-jin', 'sensei'],
            ['タワポンさん', 'タイ', 'tai-jin', 'gakusei'],
            ['シュミットさん', 'ドイツ', 'doitsu-jin', 'kaishain'],
        ]);
        expect(activity.payload.nationalityOptions.map(option => option.label)).toEqual([
            'にほんじん', 'イギリスじん', 'タイじん', 'ドイツじん',
        ]);
        expect(activity.payload.occupationOptions.map(option => option.label)).toEqual([
            'ぎんこういん', 'せんせい', 'がくせい', 'かいしゃいん',
        ]);
        expect(activity.payload.rounds.every(round => round.occupationClue.en.startsWith('Yomu accessibility clue:'))).toBe(true);
    });

    it('grades every source criterion and seeds exact-source new learning', () => {
        const evaluation = profileRuntime.evaluate(model(), perfectResponse());
        expect(evaluation.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(evaluation.reviewSeeds).toHaveLength(8);
        expect(evaluation.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);
        expect(evaluation.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            expect.stringContaining(':p2:task-a:yamada'),
            expect.stringContaining(':p2:task-b:yamada'),
            expect.stringContaining(':p2:task-a:watt'),
            expect.stringContaining(':p2:task-b:watt'),
            expect.stringContaining(':p2:task-a:tawapon'),
            expect.stringContaining(':p2:task-b:tawapon'),
            expect.stringContaining(':p2:task-a:schmidt'),
            expect.stringContaining(':p2:task-b:schmidt'),
        ]);
    });

    it('returns only missed criteria as repair seeds and rejects malformed answers', () => {
        const perfect = perfectResponse();
        const response: ProfileBoardResponse = { answers: perfect.answers.map((answer, index) => ({
            ...answer,
            ...(index === 0 ? { occupationId: 'sensei' } : {}),
            ...(index === 2 ? { nationalityId: 'doitsu-jin' } : {}),
        })) };
        const evaluation = profileRuntime.evaluate(model(), response);
        expect(evaluation.result.outcome).toBe('lapse');
        expect(evaluation.result.score).toBe(0.75);
        expect(evaluation.result.errorTags).toEqual([
            'l1-l02-profile-tawapon-nationality',
            'l1-l02-profile-yamada-occupation',
        ]);
        expect(evaluation.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l02:profile-board:yamada:occupation', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l02:profile-board:tawapon:nationality', reason: 'repair' }),
        ]);

        expect(() => profileRuntime.evaluate(model(), { answers: [] })).toThrow('Every source profile');
        const duplicatePerfect = perfectResponse();
        const duplicate: ProfileBoardResponse = {
            answers: duplicatePerfect.answers.map((answer, index) => index === 1 ? duplicatePerfect.answers[0] : answer),
        };
        expect(() => profileRuntime.evaluate(model(), duplicate)).toThrow('each authored profile');
        const unknownPerfect = perfectResponse();
        const unknown: ProfileBoardResponse = {
            answers: unknownPerfect.answers.map((answer, index) =>
                index === 0 ? { ...answer, nationalityId: 'unknown' } : answer),
        };
        expect(() => profileRuntime.evaluate(model(), unknown)).toThrow('each authored profile');
    });

    it('renders the exact worksheet reference after teaching and before the no-typing assessment', async () => {
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const announcements: string[] = [];
        const controller = profileRuntime.mount(model(), {
            replace(view) { host.replaceChildren(view); },
            announce(message) { announcements.push(message); },
        }, onEvaluation);
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const sourceReference = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(teaching.compareDocumentPosition(sourceReference) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sourceReference.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const sourceImage = sourceReference.querySelector<HTMLImageElement>('img')!;
        expect(sourceImage.src).toContain('/academy/content/lessons/l1-l02/moodle-chapter-1-2-grammar-nationality-occupation-page-2.png');
        expect(sourceImage.alt).toContain('Teacher grammar worksheet page 2');
        expect(sourceReference.textContent).toContain('Complete A and B next');
        expect(teaching.textContent).toContain('Noun 1 は Noun 2 です');
        expect(teaching.textContent).toContain('国 + じん');
        for (const name of ['やまださん', 'ワットさん', 'タワポンさん', 'シュミットさん']) {
            expect(teaching.textContent).not.toContain(name);
        }
        expect(host.querySelectorAll('fieldset')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(32);
        expect(host.querySelectorAll('label')).toHaveLength(32);
        expect(host.querySelector('input[type="text"], textarea')).toBeNull();
        expect(host.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
        expect([...host.querySelectorAll('fieldset')].every(fieldset => {
            const ids = fieldset.getAttribute('aria-describedby')?.split(' ') ?? [];
            return ids.length === 2 && ids.every(id => document.getElementById(id));
        })).toBe(true);

        for (const answer of perfectResponse().answers) {
            host.querySelector<HTMLInputElement>(`input[name$="${answer.roundId}-nationality"][value="${answer.nationalityId}"]`)!.click();
            host.querySelector<HTMLInputElement>(`input[name$="${answer.roundId}-occupation"][value="${answer.occupationId}"]`)!.click();
        }
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-outcome="pass"]')).not.toBeNull());
        expect(announcements.at(-1)).toContain('All four nationalities');
        controller.dispose();
    });

    it('keeps touch, mobile, and reduced-motion contracts in the plugin stylesheet', () => {
        const css = readFileSync(path.resolve('src/academy/minigames/profile-board/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/\.academy-profile-board-source-reference img\s*\{[^}]*width:\s*100%/s);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-profile-board-choices\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('keeps the source image, reachable profile board, and honest local ledger in sync', async () => {
        const asset = path.resolve('public/academy/content/lessons/l1-l02/moodle-chapter-1-2-grammar-nationality-occupation-page-2.png');
        expect(createHash('sha256').update(readFileSync(asset)).digest('hex')).toBe(
            model().provenance.sourceReference.imageSha256,
        );
        const chapter = await loadLessonActivityChapter('l1-l02', {} as never);
        expect(chapter?.beats.map(beat => beat.activity.id)).toContain('activity:l1-l02-source-profile-board');

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<{ lessonId: string; claims: Record<string, number> }> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l1-l02');
        expect(slice?.claims).toEqual({
            sourceVocabularyRowsPreserved: 32,
            worksheetPagesRendered: 1,
            visibleSourceProfileCriteriaDelivered: 8,
            sourceAnswerKeysVerified: 0,
            sourceVisibleFieldKeys: 8,
            yomuContextualAnswerKeys: 0,
            listeningLinksVerified: 0,
        });
    });
});
