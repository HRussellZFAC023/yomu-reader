import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonL2L27ReportedMessageBeat,
    L2_L27_SOURCE_VISUALS,
    reportedMessageWorkshopPlugin,
    type ReportedMessageWorkshopModel,
} from '../../src/academy/content/lesson-l2-l27-reported-message-workshop';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): ReportedMessageWorkshopModel {
    return createLessonL2L27ReportedMessageBeat().activity as ReportedMessageWorkshopModel;
}

function answers(activity: ReportedMessageWorkshopModel) {
    return { answers: activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answer })) };
}

function runtime() {
    return createActivityRuntime([reportedMessageWorkshopPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l27 exact-source reported-message workshop', () => {
    it('pins the exact package, four source pages, and six-member audio quarantine', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l27-reported-message-workshop',
            responseKind: 'moodle-chapter-33-reported-message-workshop',
            curriculumPhase: 'assessed-production',
            provenance: {
                packageId: 'l2-l27',
                packageOrder: 54,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121291,
                    archiveId: 'archive-000059',
                    media: {
                        status: 'six-audio-members-quarantined-unpaired',
                        sourceAudioMembers: 6,
                        sourceAudioTracksDelivered: 0,
                    },
                    answerKeyBasis: 'sensei-verbatim-message-and-meaning-examples',
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toEqual(L2_L27_SOURCE_VISUALS);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'message-choice', 'typed-quote', 'register-select', 'typed-quote',
            'message-choice', 'register-select', 'message-choice', 'typed-quote',
        ]);
        expect(activity.payload.rounds.map(round => round.answer)).toEqual([
            'さとうさんに あした 休(やす)む と 伝(つた)えて いただけませんか。',
            'さとうさんに「あした 休みます」と 伝えて いただけませんか。',
            'さとうさんに あとで 電話(でんわ)して と 伝(つた)えて いただけませんか',
            'さとうさんに「 あとで 電話を ください」と 伝えて いただけませんか。',
            'たなかさんが あした 休(やす)む と 言(い)っていました。',
            'たなかさんが「あした 休みます」と 言(い)っていました。',
            'このマークは どういう 意味ですか。',
            '写真(しゃしん) を 撮っては いけない と いう 意味です。',
        ]);
    });

    it('grades all eight source lines and limits repair seeds to the missed line', () => {
        const activity = model();
        expect(runtime().evaluate(activity, answers(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const response = answers(activity);
        const lapse = runtime().evaluate(activity, {
            answers: response.answers.map((answer, index) => index === 3
                ? { ...answer, value: 'さとうさんに あとで 電話を ください。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l27-reported-message-4'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':relay-call-quote');
    });

    it('renders teaching and canonical pages before varied retrieval controls with no audio', () => {
        const activity = model();
        const host = document.createElement('main');
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => {});
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const sources = host.querySelector<HTMLElement>('.academy-state-inspection-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-source-visual img')).toHaveLength(4);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector<HTMLElement>('.academy-state-inspection-key')?.hidden).toBe(true);
        controller.dispose();
    });

    it('is reachable and registered in the Academy runtime', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l27', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l27',
            canonicalEpisodeId: 's1e07-no-spoilers',
            title: { en: 'Pass the message, keep the meaning' },
        });
        expect(chapter?.beats).toHaveLength(1);
        expect(createAcademyActivityRuntime().validate(chapter!.beats[0]!.activity)).toEqual([]);
    });

    it('pins public/docs mirrors, offline rows, and the honest ledger claim', () => {
        for (const visual of L2_L27_SOURCE_VISUALS) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l27', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l27', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l27', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(sha256File(path.resolve('public/academy/content/lessons/054-l2-l27.json')))
            .toBe('06148a863fd7e75864ca04d90eb90800d28eb728904bc8b62b330b6038355776');
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/054-l2-l27.json'), path.resolve('public/academy/content/lessons/054-l2-l27.json'))).toBe(true);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/054-l2-l27.json'");
            L2_L27_SOURCE_VISUALS.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: { lessonId: string; claims: Record<string, unknown>; audio: Record<string, unknown> }[] };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(item => item.lessonId === 'l2-l27');
        expect(slice?.claims).toMatchObject({
            canonicalMoodlePagesRendered: 4,
            verbatimSourceExamplesAssessed: 8,
            originalAudioTracksDelivered: 0,
            sourceAnswerKeysExposed: 0,
            answerVisibility: 'after-attempt',
        });
        expect(slice?.audio).toMatchObject({
            status: 'six-source-audio-members-unpaired-and-quarantined',
            sourceAudioMembers: 6,
            sourceAudioTracksDelivered: 0,
        });
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
    });
});
