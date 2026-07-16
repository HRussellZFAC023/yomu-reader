import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    considerateRecommendationPlugin,
    createLessonL2L35ConsiderateRecommendationBeat,
    L2_L35_QUARANTINED_AUDIO,
    L2_L35_SOURCE_VISUALS,
    type ConsiderateRecommendationModel,
} from '../../src/academy/content/lesson-l2-l35-considerate-recommendation';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';

function model(): ConsiderateRecommendationModel {
    return createLessonL2L35ConsiderateRecommendationBeat().activity as ConsiderateRecommendationModel;
}

function answers(activity: ConsiderateRecommendationModel) {
    return { answers: activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answer })) };
}

function runtime() {
    return createActivityRuntime([considerateRecommendationPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l35 exact-source considerate recommendation', () => {
    it('pins the direct archive, source teaching, four pages, and honest audio exclusion', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l35-considerate-recommendation',
            responseKind: 'moodle-chapter-35-arimasenka-conversation-script',
            curriculumPhase: 'assessed-production',
            answerSupport: { id: 'academy-assessed-v1' },
            provenance: {
                packageId: 'l2-l35',
                packageOrder: 62,
                sourcePackageStatus: 'direct-canonical-archive-extension-no-authored-package-json',
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8824742,
                    moodleLesson: 'Level 3+ Lesson 9',
                    archiveId: 'archive-000028',
                    archiveSha256: '5864abfd10047d8084bf67dd6aeb921852a98e2c873d66a47bab32640c7ac174',
                    media: {
                        status: 'two-audio-members-quarantined-unverified-task-binding',
                        sourceAudioMembers: 2,
                        sourceAudioTracksDelivered: 0,
                        quarantinedAudio: L2_L35_QUARANTINED_AUDIO,
                    },
                    answerKeyBasis: 'sensei-verbatim-visible-transcript-segments-only',
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 35', reuse: 'chronology-and-scope-only' },
                    genki: { used: false, learnerFacingPayload: 'none' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toEqual(L2_L35_SOURCE_VISUALS);
        expect(activity.payload.teaching[0]).toEqual({
            title: '〜は ありませんか。＊negative question',
            text: 'The いい ところは ありませんか in example means the same as いい ところは ありますか, but it is a more considerate way of asking something because using ありませんか makes it easier for the listener to answer in the negative.',
            attribution: 'sensei-source',
        });
        expect(activity.payload.teaching.slice(0, 7).every(step => step.attribution === 'sensei-source')).toBe(true);
        expect(activity.payload.teaching.slice(7).every(step => step.attribution === 'yomu-boundary')).toBe(true);
    });

    it('preserves all eight transcript segments and varies the retrieval interaction', () => {
        const activity = model();
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'source-choice', 'pattern-select', 'typed-source', 'source-choice',
            'pattern-select', 'typed-source', 'source-choice', 'typed-source',
        ]);
        expect(activity.payload.rounds.map(round => round.answer)).toEqual([
            '友達(ともだち)と スキーに 行(い)きたいんですが、',
            '３日(みっか)ぐらいです。',
            'それなら、草津(くさつ)か 志賀高原(しがこうげん)が いいと 思(おも)いますよ。',
            '温泉(おんせん)も あるし……。',
            'ＪＲでも 行(い)けますが、夜行(やこう)バスなら、朝(あさ) 着(つ)きますから、便利(べんり)ですよ。',
            'さあ……。旅行社(りょこうしゃ)へ 行(い)けば もっと 詳(くわ)しい ことが わかりますよ。',
            '全部(ぜんぶ) スキー場(じょう)で 借(か)りられますよ。',
            '心配(しんぱい)なら、旅行社(りょこうしゃ)で 予約(よやく)も できるし……。',
        ]);
        expect(activity.payload.rounds.flatMap(round => round.options)
            .filter(option => option.origin === 'sensei-source').map(option => option.value))
            .toEqual(activity.payload.rounds.filter(round => round.interaction !== 'typed-source').map(round => round.answer));
    });

    it('grades all segments and limits lapse review to the missed source segment', () => {
        const activity = model();
        expect(runtime().evaluate(activity, answers(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const response = answers(activity);
        const lapse = runtime().evaluate(activity, {
            answers: response.answers.map((answer, index) => index === 5
                ? { ...answer, value: '旅行社へ行けばわかります。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l35-considerate-recommendation-6'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':agency-line');
    });

    it('accepts typed base text as printed without requiring inline reading annotations', () => {
        const activity = model();
        const response = answers(activity);
        const plainTyped = new Map([
            ['recommendation-line', 'それなら、草津か 志賀高原が いいと 思いますよ。'],
            ['agency-line', 'さあ……。旅行社（りょこうしゃ）へ 行（い）けば もっと 詳（くわ）しい ことが わかりますよ。'],
            ['reservation-line', '心配なら、旅行社で 予約も できるし……。'],
        ]);
        expect(runtime().evaluate(activity, {
            answers: response.answers.map(answer => ({
                ...answer,
                value: plainTyped.get(answer.roundId) ?? answer.value,
            })),
        }).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
    });

    it('renders teaching and four originals before controls, with no early key or audio', () => {
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
        const key = host.querySelector<HTMLElement>('.academy-state-inspection-key')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('[data-attribution="sensei-source"]')).toHaveLength(7);
        expect(host.querySelectorAll('.academy-source-visual img')).toHaveLength(4);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.querySelector('audio')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(key.dataset.answerVisibility).toBe('after-attempt');
        activity.payload.rounds.forEach(round => expect(key.textContent).not.toContain(round.answer));
        controller.dispose();
    });

    it('is reachable in the intended episode and registered in the Academy runtime', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l35', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l35',
            canonicalEpisodeId: 's1e09-the-story-in-two-tenses',
            host: { id: 'jodi' },
            title: { en: 'A considerate recommendation' },
            beats: [{ id: 'considerate-recommendation' }],
        });
        expect(chapter?.beats).toHaveLength(1);
        expect(createAcademyActivityRuntime().validate(chapter!.beats[0]!.activity)).toEqual([]);
    });

    it('pins mirrors, offline rows, one honest ledger slice, and publishes no audio', () => {
        expect(L2_L35_SOURCE_VISUALS).toHaveLength(4);
        for (const visual of L2_L35_SOURCE_VISUALS) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l35', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l35', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(readdirSync(path.resolve('public/academy/content/lessons/l2-l35'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);
        expect(readdirSync(path.resolve('docs/public/academy/content/lessons/l2-l35'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            L2_L35_SOURCE_VISUALS.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toMatch(/l2-l35\/[^']+\.mp3/u);
        }

        const publicLedger = readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'));
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'))).toEqual(publicLedger);
        const ledger = JSON.parse(publicLedger.toString('utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, any>> };
        };
        const slices = ledger.worksheetDigitisation.additionalSlices.filter(item => item.lessonId === 'l2-l35');
        expect(slices).toHaveLength(1);
        expect(slices[0]).toMatchObject({
            moodleModuleId: 8824742,
            sourcePackage: {
                status: 'direct-canonical-archive-extension-no-authored-package-json',
                intendedFilename: '062-l2-l35.json',
            },
            sourceArchive: {
                id: 'archive-000028',
                sha256: '5864abfd10047d8084bf67dd6aeb921852a98e2c873d66a47bab32640c7ac174',
            },
            audio: {
                status: 'two-archive-audio-members-unverified-for-owned-conversation-task',
                sourceAudioMembers: 2,
                sourceAudioTracksDelivered: 0,
                excludedPayloadSha256: L2_L35_QUARANTINED_AUDIO.map(audio => audio.payloadSha256),
            },
            claims: {
                canonicalMoodlePagesRendered: 4,
                verbatimTranscriptSegmentsAssessed: 8,
                yomuDerivedCompletions: 0,
                interactionModesAssessed: ['source-choice', 'pattern-select', 'typed-source'],
                originalAudioTracksDelivered: 0,
                sourceAnswerKeysExposed: 0,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-segment-only',
            },
        });
    });
});
