import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonL2L29TeaCeremonyBeat } from '../../src/academy/content/lesson-l2-l29-tea-ceremony';
import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { attachLibraryReaderVocabulary } from '../../src/academy/integration/library-reader-vocabulary';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): StateInspectionModel {
    return createLessonL2L29TeaCeremonyBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l29 Chapter 34 means and tea ceremony', () => {
    it('pins the exact package, sources, conservative Track 27 verification, and private-reference boundaries', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l29-sensei-tea-ceremony',
            responseKind: 'moodle-chapter-34-means-and-tea-listening',
            provenance: {
                packageId: 'l2-l29',
                packageOrder: 56,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121295,
                    archiveId: 'archive-000001',
                    media: {
                        status: 'audio-member-verified-by-archive-task-script-identity',
                        sourceAudioMembers: 3,
                        sourceAudioTracksDelivered: 1,
                        durationSeconds: 111.44,
                        audio: {
                            url: '/academy/content/lessons/l2-l29/moodle-track-27.mp3',
                            payloadSha256: '06b35860230b1320c7d68fd0e863363f59f2619a79eef3460368c588a770bd96',
                            transcriptPayloadSha256: 'd79b17c0a31646378f02d7a8ee4ab75a553d0997cfe636a2342f1eb57cba2927',
                            worksheetPayloadSha256: '65aaa460558043b069f759c31a3c0e1663080fbd2f795eb175a8037ad5da2f21',
                            verification: 'same-archive-adjacency-and-exact-task-script-identity',
                        },
                    },
                },
                support: {
                    references: {
                        shinKanzen: { learnerFacingMaterial: false },
                        tobira: { learnerFacingMaterial: false },
                        soya: { rightsState: 'item-review-required', learnerFacingMaterial: false },
                    },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(9);
        expect(activity.payload.teaching).toHaveLength(6);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            'お財布を (持って、持ったら、持たないで) テスコへ 行って、なにも 買えませんでした。',
            'パブで ビールを (飲んだら、飲みながら、飲むと)、食事を しました。',
            '毎日 スーツを (着ると、着ながら、着ないで) 会社へ 行きます。',
            '誰がお茶をたてましたか。',
            'どうして先に甘いお菓子を食べるんですか。',
            'お茶を飲みます。まず何をしますか。',
            'お茶を飲む前に、おちゃわんをどうしますか。',
            'クララさんはお茶についてどう思いましたか。',
        ]);
    });

    it('grades all eight rows and repairs only the missed listening question', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: 'おちゃわんを右手に2回載せます。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l29-means-tea-7'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':track-27:q4');
    });

    it('renders teaching, audio, and nine source pages before eight playable controls', () => {
        const activity = model();
        const host = document.createElement('main');
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => {});
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const audio = host.querySelector<HTMLElement>('.academy-state-inspection-audio')!;
        const sources = host.querySelector<HTMLElement>('.academy-state-inspection-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(audio.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(9);
        expect(host.querySelector<HTMLAudioElement>('audio')?.src).toContain('moodle-track-27.mp3');
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(10);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        controller.dispose();
    });

    it('projects all 32 exact vocabulary rows into Reader and local SRS', () => {
        const lessonPackage = JSON.parse(readFileSync(path.resolve('public/academy/content/lessons/056-l2-l29.json'), 'utf8')) as unknown;
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage, 'l2-l29');
        expect(sheet.sourceStatus).toBe('exact-source');
        expect(sheet.items).toHaveLength(32);
        expect(sheet.items[0]).toMatchObject({ expression: '[傘 を]さします', studyExpression: '傘を差す', source: { page: 1, row: 1 } });
        expect(sheet.items[1]).toMatchObject({ sourceMeaning: 'from evening to night of yesterday = last night' });
        expect(sheet.items[18]).toMatchObject({ studyExpression: '炊く', sourceMeaning: 'boil, cook rice' });
        expect(sheet.items[31]).toMatchObject({ studyExpression: 'できるだけ', source: { page: 2, row: 32 } });
        expect(libraryStudyVocabulary(sheet)).toHaveLength(32);
        expect(libraryVocabularyReviewSeeds(sheet)).toHaveLength(32);

        const surface = document.createElement('span');
        attachLibraryReaderVocabulary(surface, sheet.items[25]!);
        expect(surface.getAttribute('data-yomu-authored-vocabulary')).toContain('健康診断');
    });

    it('is reachable as a single runtime activity', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l29', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l29');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.beats).toHaveLength(1);
        expect(chapter?.title.en).toBe('With this, without that');
    });

    it('pins public/docs mirrors, offline assets, adjacent ownership, and the honest ledger claim', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l29', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l29', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l29', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(sha256File(path.resolve('public/academy/content/lessons/056-l2-l29.json')))
            .toBe('df75b67e6ba13033c76edc83f75630594128a3a35679e7768fa1e0a1cc993817');
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/056-l2-l29.json'), path.resolve('public/academy/content/lessons/056-l2-l29.json'))).toBe(true);
        expect(sha256File(path.resolve('public/academy/content/lessons/l2-l29/moodle-track-27.mp3')))
            .toBe('06b35860230b1320c7d68fd0e863363f59f2619a79eef3460368c588a770bd96');
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/l2-l29/moodle-track-27.mp3'), path.resolve('public/academy/content/lessons/l2-l29/moodle-track-27.mp3'))).toBe(true);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/056-l2-l29.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).toContain("'/academy/content/lessons/l2-l29/moodle-track-27.mp3'");
        }

        expect(activity.payload.rounds.slice(3).every(round => round.sourceQuestionId.startsWith(
            'moodle:8121293:65aaa460558043b069f759c31a3c0e1663080fbd2f795eb175a8037ad5da2f21:',
        ))).toBe(true);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: { lessonId: string; claims: Record<string, unknown>; audio: Record<string, unknown> }[] };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(item => item.lessonId === 'l2-l29');
        expect((slice as { documents?: { payloadSha256: string; ownerPackageId?: string }[] })?.documents)
            .toContainEqual(expect.objectContaining({
                payloadSha256: '65aaa460558043b069f759c31a3c0e1663080fbd2f795eb175a8037ad5da2f21',
                ownerPackageId: 'l2-l28',
            }));
        expect(slice?.claims).toMatchObject({
            verbatimSourcePromptsDelivered: 8,
            originalAudioTracksDelivered: 1,
            independentTranscriptMatchesClaimed: 0,
        });
        expect(slice?.audio.verification).toContain('no-independent-transcript-match');
    });
});
