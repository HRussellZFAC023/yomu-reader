import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonL2L31AdjectiveNounConditionalsBeat } from '../../src/academy/content/lesson-l2-l31-adjective-noun-conditionals';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): StateInspectionModel {
    return createLessonL2L31AdjectiveNounConditionalsBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l31 Chapter 35-2 adjective and noun conditionals', () => {
    it('pins the exact package, source wording, derived answers, and quarantined audio', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l31-adjective-noun-conditionals',
            responseKind: 'moodle-chapter-35-adjective-noun-conditionals',
            provenance: {
                packageId: 'l2-l31',
                packageOrder: 58,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121300,
                    archiveId: 'archive-000048',
                    media: {
                        status: 'audio-member-quarantined-pairing-unproven',
                        sourceAudioMembers: 1,
                        sourceAudioTracksDelivered: 0,
                        quarantinedPayloadSha256: '5cfe1762cfec2a9e8f4e62c8c35b6b09685428b9721d373b08b2f7a6668ad7e7',
                    },
                    answerKeyBasis: 'sensei-verbatim-vocabulary-and-prompts-with-yomu-derived-deterministic-adjective-noun-conditionals',
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 35', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · parallel N4 scope', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.media.audio).toBeUndefined();
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(4);
        expect(activity.payload.teaching).toHaveLength(6);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            'In that case',
            'Travel agency',
            'いいです',
            '安いです',
            '静かです',
            '病気です',
            '答えが 正しいです・丸を 付けて ください',
            '富士山に 登れますか。（7月に なります）',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            'それなら',
            'りょこうしゃ（旅行社）',
            'よければ',
            '安ければ',
            '静かなら',
            '病気なら',
            '答えが 正しければ、丸を 付けて ください。',
            '7月に なれば、富士山に 登れます。',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'state-select', 'action-choice', 'typed-report', 'action-choice',
            'state-select', 'typed-report', 'action-choice', 'typed-report',
        ]);
    });

    it('grades all eight rows and repairs only the missed na-adjective condition', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 4
                ? { ...answer, value: '静かければ' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l31-conditional-5'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':task-1:item-12');
    });

    it('renders teaching and all source pages before varied retrieval with the key concealed', () => {
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
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(4);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(key.hidden).toBe(true);
        expect(key.dataset.answerVisibility).toBe('after-attempt');
        controller.dispose();
    });

    it('is reachable as one exact-source runtime activity', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l31', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l31');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.beats).toHaveLength(1);
        expect(chapter?.title.en).toBe('Conditions for qualities and nouns');
    });

    it('pins public/docs mirrors, offline assets, and the honest ledger claim', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l31', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l31', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l31', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(sha256File(path.resolve('public/academy/content/lessons/058-l2-l31.json')))
            .toBe('89545b660280f0570a73c4ae2e66a2c39cab803adea1de638a931048b3114dcf');
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/058-l2-l31.json'), path.resolve('public/academy/content/lessons/058-l2-l31.json'))).toBe(true);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/058-l2-l31.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }

        const publicLedger = readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'));
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
        const ledger = JSON.parse(publicLedger.toString()) as {
            worksheetDigitisation: { additionalSlices: { lessonId: string; claims: Record<string, unknown>; audio: Record<string, unknown> }[] };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(item => item.lessonId === 'l2-l31');
        expect(slice?.audio).toMatchObject({
            status: 'quarantined-no-transcript-or-answer-key',
            sourceAudioMembers: 1,
            sourceAudioTracksDelivered: 0,
        });
        expect(slice?.claims).toMatchObject({
            canonicalMoodlePagesRendered: 4,
            verbatimSourcePromptsDelivered: 8,
            verbatimPrintedRetrievals: 2,
            yomuDerivedDeterministicConditionals: 6,
            originalAudioTracksDelivered: 0,
            sourceAnswerKeysExposed: 0,
            answerVisibility: 'after-attempt',
        });
    });
});
