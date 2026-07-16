import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonL2L36YouniGoalWorkshopBeat,
    L2_L36_SOURCE_VISUALS,
    youniGoalWorkshopPlugin,
    type YouniGoalWorkshopModel,
} from '../../src/academy/content/lesson-l2-l36-youni-goal-workshop';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';

const AUDIO_PAYLOADS = [
    '0de2c7abfe3c7857c9def04b5be3f00a85a60d198c208f116c4660a8d9c7c78e',
    '4fe8f7973ea49725d3bb76988bd5c85f32a2e405bd54280be9806952931ca6aa',
];

function model(): YouniGoalWorkshopModel {
    return createLessonL2L36YouniGoalWorkshopBeat().activity as YouniGoalWorkshopModel;
}

function answers(activity: YouniGoalWorkshopModel) {
    return { answers: activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answer })) };
}

function runtime() {
    return createActivityRuntime([youniGoalWorkshopPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l36 exact-source ように goal workshop', () => {
    it('pins the direct canonical archive, four pages, and honest audio exclusion', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l36-youni-goal-workshop',
            responseKind: 'moodle-chapter-36-youni-goal-workshop',
            curriculumPhase: 'assessed-production',
            answerSupport: { id: 'academy-assessed-v1' },
            provenance: {
                packageId: 'l2-l36',
                packageOrder: 63,
                sourcePackageStatus: 'direct-canonical-archive-extension-no-authored-package-json',
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8824742,
                    archiveId: 'archive-000028',
                    archiveSha256: '5864abfd10047d8084bf67dd6aeb921852a98e2c873d66a47bab32640c7ac174',
                    media: {
                        status: 'archive-audio-not-attributed-to-chapter-36-slice',
                        archiveAudioMembers: 2,
                        sourceAudioTracksDelivered: 0,
                        excludedPayloadSha256: AUDIO_PAYLOADS,
                    },
                    answerKeyBasis: 'sensei-verbatim-visible-examples-only',
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 36', reuse: 'chronology-and-scope-only' },
                    genki: { reference: 'not-used', reuse: 'no-learner-facing-payload' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toEqual(L2_L36_SOURCE_VISUALS);
    });

    it('teaches with source wording before eight varied verbatim retrievals', () => {
        const activity = model();
        expect(activity.payload.teaching.slice(0, 4).every(step => step.attribution === 'sensei-source')).toBe(true);
        expect(activity.payload.teaching.map(step => step.text)).toContain(
            'The usage indicates taking the action denoted by verb 2 in order to achieve the situation expressed by 〜ように.',
        );
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'source-choice', 'pattern-select', 'typed-source', 'source-choice',
            'pattern-select', 'typed-source', 'source-choice', 'typed-source',
        ]);
        expect(activity.payload.rounds.map(round => round.answer)).toEqual([
            '自転車(じてんしゃ)に 乗(の)れる ように、毎日(まいにち) 練習(れんしゅう)しました。',
            'もっと日本語(にほんご)が はなせるように、毎日(まいにち) 勉強(べんきょう)しています。',
            '会議(かいぎ)に 間(ま)に合(あ)うように、タクシーで 会社へ 行きます。',
            '風邪(かぜ)を ひかないように、いろいろと 気(き)を つけています。',
            '風邪(かぜ)を ひかないように、必(かなら)ず マスクを します。',
            '買(か)うものを わすれないように、メモします。',
            'ラッシュに 遭(あ)わないように、早(はや)く うちを 出(で)ます。',
            '日本語の 新聞が 読めるように、漢字を 勉強します。',
        ]);
    });

    it('grades all examples and limits repair to the missed source locus', () => {
        const activity = model();
        expect(runtime().evaluate(activity, answers(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const response = answers(activity);
        const lapse = runtime().evaluate(activity, {
            answers: response.answers.map((answer, index) => index === 5
                ? { ...answer, value: '買うものを忘れないように、ノートします。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l36-youni-goal-6'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':memo-avoidance');
    });

    it('renders teaching and four source pages before controls with no early key or audio', () => {
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
        expect(host.querySelectorAll('[data-attribution="sensei-source"]')).toHaveLength(4);
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
        const chapter = await loadReachableLessonActivityChapter('l2-l36', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l36',
            canonicalEpisodeId: 's1e10-instructions-for-a-cloud',
            host: { id: 'rie' },
            title: { en: 'Goals you can act toward' },
        });
        expect(chapter?.beats).toHaveLength(1);
        expect(createAcademyActivityRuntime().validate(chapter!.beats[0]!.activity)).toEqual([]);
    });

    it('pins mirrors, offline rows, one honest ledger slice, and publishes no audio', () => {
        expect(L2_L36_SOURCE_VISUALS).toHaveLength(4);
        for (const visual of L2_L36_SOURCE_VISUALS) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l36', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l36', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(readdirSync(path.resolve('public/academy/content/lessons/l2-l36'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);
        expect(readdirSync(path.resolve('docs/public/academy/content/lessons/l2-l36'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            L2_L36_SOURCE_VISUALS.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toMatch(/l2-l36\/[^']+\.mp3/u);
        }

        const publicLedger = readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'));
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'))).toEqual(publicLedger);
        const ledger = JSON.parse(publicLedger.toString('utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, any>> };
        };
        const slices = ledger.worksheetDigitisation.additionalSlices.filter(item => item.lessonId === 'l2-l36');
        expect(slices).toHaveLength(1);
        expect(slices[0]).toMatchObject({
            moodleModuleId: 8824742,
            sourcePackage: { status: 'direct-canonical-archive-extension-no-authored-package-json' },
            sourceArchive: { id: 'archive-000028', sha256: '5864abfd10047d8084bf67dd6aeb921852a98e2c873d66a47bab32640c7ac174' },
            audio: {
                status: 'archive-audio-not-attributed-to-chapter-36-slice',
                archiveAudioMembers: 2,
                sourceAudioTracksDelivered: 0,
                excludedPayloadSha256: AUDIO_PAYLOADS,
            },
            claims: {
                canonicalMoodlePagesRendered: 4,
                verbatimPrintedExamplesAssessed: 8,
                yomuDerivedCompletions: 0,
                interactionModesAssessed: ['source-choice', 'pattern-select', 'typed-source'],
                originalAudioTracksDelivered: 0,
                sourceAnswerKeysExposed: 0,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-example-only',
            },
        });
        expect(slices[0]?.unconverted.join(' ')).toContain('Reading practice 動物の目');
    });
});
