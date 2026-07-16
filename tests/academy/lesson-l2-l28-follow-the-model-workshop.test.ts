import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonL2L28FollowModelBeat,
    followTheModelWorkshopPlugin,
    L2_L28_SOURCE_VISUALS,
    type FollowModelWorkshopModel,
} from '../../src/academy/content/lesson-l2-l28-follow-the-model-workshop';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';

const PACKAGE_SHA256 = 'bf518f6d5141a0ae5195a83ac563789c48774d03e947742080cd8ac039a6a79d';
const AUDIO_PAYLOADS = [
    '5e3d9fcbfd843a730842a2caab870424745d22d8be524b41129f5d34a57c8d84',
    '0c71fe46c3b30f053a46e1d9ab49750992c76dd12a1c870ff8b957312f896fee',
    'be296a3de4f5e02e962ddea398aeeca904b60b0e3b8b6fa2745165fc4d7664bb',
];

function model(): FollowModelWorkshopModel {
    return createLessonL2L28FollowModelBeat().activity as FollowModelWorkshopModel;
}

function answers(activity: FollowModelWorkshopModel) {
    return { answers: activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answer })) };
}

function runtime() {
    return createActivityRuntime([followTheModelWorkshopPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l28 exact-source follow-the-model workshop', () => {
    it('pins the exact package, five source pages, and three-member audio quarantine', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l28-follow-the-model-workshop',
            responseKind: 'moodle-chapter-34-toori-atode-workshop',
            curriculumPhase: 'assessed-production',
            answerSupport: { id: 'academy-assessed-v1' },
            provenance: {
                packageId: 'l2-l28',
                packageOrder: 55,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121293,
                    archiveId: 'archive-000096',
                    media: {
                        status: 'three-audio-members-quarantined-unpaired',
                        sourceAudioMembers: 3,
                        sourceAudioTracksDelivered: 0,
                        quarantinedPayloadSha256: AUDIO_PAYLOADS,
                    },
                    answerKeyBasis: 'sensei-verbatim-visible-examples-only',
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 34', reuse: 'chronology-and-scope-only' },
                    genki: { reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toEqual(L2_L28_SOURCE_VISUALS);
    });

    it('teaches with source wording before seven varied retrieval items', () => {
        const activity = model();
        expect(activity.payload.teaching.slice(0, 5).every(step => step.attribution === 'sensei-source')).toBe(true);
        expect(activity.payload.teaching.map(step => step.text)).toContain(
            '①This indicates doing Verb 2 by the same method or under the same conditions as Verb 1',
        );
        expect(activity.payload.teaching.map(step => step.text)).toContain(
            'This indicates that the action denoted by Verb 2 happens after the action or situation denoted by Verb 1 or Noun.',
        );
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'source-choice', 'pattern-select', 'typed-source', 'source-choice',
            'pattern-select', 'source-choice', 'typed-source',
        ]);
        expect(activity.payload.rounds.map(round => round.answer)).toEqual([
            '母(はは)に おしえてもらったとおりに、作(つく)ります。',
            'Noun の とおりに、 Verb 2 。',
            'この 点線(てんせん)の とおりに、折(お)ってください。',
            '宿題(しゅくだい)を したあとで、テレビを 見(み)ます。',
            'Noun の あとで、 Verb 2.',
            'ここに お金(かね)を 入(い)れてから、ボタンを 押(お)してください。',
            'あたらしい時計(とけい)を 買(か)ったあとで、なくした 時計が 見(み)つかりました。',
        ]);
    });

    it('grades all seven items and limits repair to the missed source locus', () => {
        const activity = model();
        expect(runtime().evaluate(activity, answers(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const response = answers(activity);
        const lapse = runtime().evaluate(activity, {
            answers: response.answers.map((answer, index) => index === 2
                ? { ...answer, value: 'この 線の とおりに、折ってください。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 6 / 7,
            errorTags: ['l2-l28-follow-model-3'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':dotted-line-source');
    });

    it('renders teaching and canonical pages before varied controls without audio or an early key', () => {
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
        expect(host.querySelectorAll('[data-attribution="sensei-source"]')).toHaveLength(5);
        expect(host.querySelectorAll('.academy-source-visual img')).toHaveLength(5);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(7);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(2);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector<HTMLElement>('.academy-state-inspection-key')?.hidden).toBe(true);
        controller.dispose();
    });

    it('is reachable and registered in the Academy runtime', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l28', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l28',
            canonicalEpisodeId: 's1e10-instructions-for-a-cloud',
            host: { id: 'rie' },
            title: { en: 'As shown, then one step more' },
        });
        expect(chapter?.beats).toHaveLength(1);
        expect(createAcademyActivityRuntime().validate(chapter!.beats[0]!.activity)).toEqual([]);
    });

    it('pins mirrors, offline rows, one honest ledger slice, and publishes no audio', () => {
        expect(L2_L28_SOURCE_VISUALS).toHaveLength(5);
        for (const visual of L2_L28_SOURCE_VISUALS) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l28', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l28', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(readdirSync(path.resolve('public/academy/content/lessons/l2-l28'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);

        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/055-l2-l28.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex')).toBe(PACKAGE_SHA256);
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/055-l2-l28.json'))).toEqual(sourcePackage);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/055-l2-l28.json'");
            L2_L28_SOURCE_VISUALS.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toMatch(/l2-l28\/[^']+\.mp3/u);
        }

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, any>> };
        };
        const slices = ledger.worksheetDigitisation.additionalSlices.filter(item => item.lessonId === 'l2-l28');
        expect(slices).toHaveLength(1);
        expect(slices[0]).toMatchObject({
            moodleModuleId: 8121293,
            sourcePackage: { filename: '055-l2-l28.json', sha256: PACKAGE_SHA256 },
            sourceArchive: { id: 'archive-000096' },
            audio: {
                status: 'three-source-audio-members-unpaired-and-quarantined',
                sourceAudioMembers: 3,
                sourceAudioTracksDelivered: 0,
                quarantinedPayloadSha256: AUDIO_PAYLOADS,
            },
            claims: {
                canonicalMoodlePagesRendered: 5,
                verbatimSourceItemsAssessed: 7,
                interactionModesAssessed: ['source-choice', 'pattern-select', 'typed-source'],
                originalAudioTracksDelivered: 0,
                sourceAnswerKeysExposed: 0,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-item-only',
            },
        });
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));
    });
});
