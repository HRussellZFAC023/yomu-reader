import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createLessonL2L34KanjiMenuReadingBeat,
    createLessonL2L34RiWritingBeat,
    L2_L34_SOURCE_PAGES,
} from '../../src/academy/content/lesson-l2-l34-kanji-menu-workshop';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';

const SOURCE_PACKAGE_SHA256 = 'bea04efb2eba6ef59b9a5bbd198f5f74db3ed91e6335c710a6cfc9df2462b7a6';

function model(): StateInspectionModel {
    return createLessonL2L34KanjiMenuReadingBeat().activity as StateInspectionModel;
}

function trace() {
    return {
        character: '理',
        svg: '<svg viewBox="0 0 1 1"><path d="M0 0" /></svg>',
        strokeCount: 1,
        strokeShapes: [
            [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
            ],
        ],
        source: {
            name: 'KanjiVG',
            url: 'https://kanjivg.tagaini.net/',
            licence: 'CC BY-SA 3.0',
            revision: 'test',
        },
    } as const;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map((round) => ({
        roundId: round.id,
        value: round.answerValue,
    }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l34 exact-source Kanji 7 menu workshop', () => {
    it('pins source-provided readings, varied retrieval, zero audio, and scoped support provenance', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l34-kanji-menu-reading',
            responseKind: 'moodle-kanji-7-menu-reading',
            provenance: {
                packageId: 'l2-l34',
                packageOrder: 61,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121293,
                    archiveId: 'archive-000096',
                    media: {
                        status: 'no-audio-members-in-package',
                        sourceAudioMembers: 0,
                        sourceAudioTracksDelivered: 0,
                    },
                    answerKeyBasis: 'source-provided-readings-with-yomu-derived-deterministic-reading-pairing',
                },
                support: {
                    minna: {
                        reference: 'Minna no Nihongo II · food and quantity vocabulary',
                        reuse: 'chronology-and-scope-only',
                    },
                    genki: {
                        crosswalk: '≈ Genki II · parallel N4 kanji scope',
                        reuse: 'sequence-only',
                    },
                },
            },
        });
        expect(activity.provenance.moodle.media.audio).toBeUndefined();
        expect(activity.payload.rounds.map((round) => round.sourcePrompt)).toEqual([
            '肉',
            '料理',
            '野菜',
            '半額',
            '<大人>',
            '小鳥',
            '魚',
            '酒',
        ]);
        expect(activity.payload.rounds.map((round) => round.answerExpression)).toEqual([
            'にく',
            'りょうり',
            'やさい',
            'はんがく',
            'おとな',
            'ことり',
            'さかな',
            'さけ',
        ]);
        expect(activity.payload.rounds.map((round) => round.interaction)).toEqual([
            'state-select',
            'action-choice',
            'typed-report',
            'action-choice',
            'typed-report',
            'state-select',
            'typed-report',
            'action-choice',
        ]);
        expect(activity.payload.teaching).toEqual(
            expect.arrayContaining([
                {
                    title: '1: 漢字の 練習をしましょう。',
                    text: 'Please practice those Kanji above.',
                },
                {
                    title: '2: 漢字を 読んでみましょう。',
                    text: 'Please read those Kanji below.',
                },
            ]),
        );
    });

    it('grades all eight readings and repairs only the missed whole word', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result).toMatchObject({
            outcome: 'pass',
            score: 1,
            errorTags: [],
        });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) =>
                index === 3 ? { ...answer, value: 'はんぶん' } : answer,
            ),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l34-reading-4'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':word-table:半額');
    });

    it('renders canonical teaching and source pages before retrieval with answers concealed', () => {
        const activity = model();
        const host = document.createElement('main');
        const controller = runtime().mount(
            activity,
            {
                language: 'en',
                replace(view) {
                    host.replaceChildren(view);
                },
                announce() {},
            },
            () => {},
        );
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const sources = host.querySelector<HTMLElement>('.academy-state-inspection-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('.academy-state-inspection-key')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(2);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(key.hidden).toBe(true);
        expect(key.dataset.answerVisibility).toBe('after-attempt');
        controller.dispose();
    });

    it('uses a real handwriting canvas model for 理 after source reading instruction', () => {
        const writing = createLessonL2L34RiWritingBeat(trace()).activity;
        expect(writing).toMatchObject({
            id: 'activity:l2-l34-source-ri-writing',
            kind: 'kanji-writing',
            responseKind: 'doodle-then-reading',
            sourceQuestionId:
                'moodle:8121293:0139b9a8eac967df4d2f159a9a64077b23e3225a04159eff6f601751d8ff9fbd:pdf-p1:practice-panel:理',
            curriculumPhase: 'assessed-production',
            payload: {
                trace: {
                    character: '理',
                    source: { name: 'KanjiVG', licence: 'CC BY-SA 3.0' },
                },
                reading: 'り',
                review: { expression: '理', reading: 'り' },
            },
        });
        expect(() => createLessonL2L34RiWritingBeat({ ...trace(), character: '料' })).toThrow(/pinned 理/);
    });

    it('is reachable as reading then handwriting, replacing the generic menu fallback', async () => {
        const chapter = await loadLessonActivityChapter('l2-l34', {
            lookup: async (character) => (character === '理' ? trace() : null),
        });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l34',
            canonicalEpisodeId: 's1e08-menu-without-pictures',
            host: { id: 'shin' },
            title: { en: 'Seven kanji on the menu' },
            beats: [
                {
                    id: 'pictureless-menu-story',
                    activity: { kind: 'academy-story-reader' },
                },
                {
                    id: 'kanji-menu-reading',
                    activity: { kind: 'academy-state-inspection' },
                },
                { id: 'source-ri-writing', activity: { kind: 'kanji-writing' } },
            ],
        });
        expect(chapter?.introduction.en).toContain('no audio');
    });

    it('pins public/docs mirrors, offline assets, and an honest ledger claim', () => {
        expect(L2_L34_SOURCE_PAGES).toHaveLength(2);
        for (const visual of L2_L34_SOURCE_PAGES) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l34', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l34', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }

        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/061-l2-l34.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex')).toBe(SOURCE_PACKAGE_SHA256);
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/061-l2-l34.json'))).toEqual(
            sourcePackage,
        );
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'))).toEqual(
            readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')),
        );

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/061-l2-l34.json'");
            L2_L34_SOURCE_PAGES.forEach((visual) => expect(worker).toContain(`'${visual.url}'`));
        }

        const ledger = JSON.parse(
            readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8'),
        ) as {
            worksheetDigitisation: {
                additionalSlices: Array<Record<string, unknown>>;
            };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(
            (candidate) => candidate.lessonId === 'l2-l34',
        );
        expect(slice).toMatchObject({
            moodleModuleId: 8121293,
            sourcePackage: {
                filename: '061-l2-l34.json',
                sha256: SOURCE_PACKAGE_SHA256,
            },
            sourceArchive: {
                id: 'archive-000096',
                sha256: 'fef6a7e4dab4bfc85a5f02e7713837f771ab4a32b316522c5640896d94063c02',
            },
            audio: {
                status: 'no-audio-members-in-package',
                sourceAudioMembers: 0,
                sourceAudioTracksDelivered: 0,
            },
            claims: {
                canonicalMoodlePagesRendered: 2,
                sourceProvidedReadingsAssessed: 8,
                handwritingCharactersAssessed: 1,
                originalAudioTracksDelivered: 0,
                sourceAnswerKeysExposed: 0,
                answerVisibility: 'after-attempt',
            },
        });
    });
});
