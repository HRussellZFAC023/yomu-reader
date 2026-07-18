import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonL2L33Chapter35HomeworkReviewBeat } from '../../src/academy/content/lesson-l2-l33-chapter-35-homework-review';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): StateInspectionModel {
    return createLessonL2L33Chapter35HomeworkReviewBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l33 Chapter 35 homework review', () => {
    it('pins the exact package, two homework pages, printed models, and three-audio quarantine', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l33-sensei-chapter-35-homework-review',
            responseKind: 'moodle-chapter-35-nara-guidance-workshop',
            provenance: {
                packageId: 'l2-l33',
                packageOrder: 60,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121301,
                    archiveId: 'archive-000042',
                    media: {
                        status: 'three-audio-members-quarantined-unresolved-pairing',
                        sourceAudioMembers: 3,
                        sourceAudioTracksDelivered: 0,
                    },
                    answerKeyBasis: 'sensei-verbatim-adjective-noun-and-nara-examples-with-no-source-answer-key-claim',
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lessons 35–36', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · parallel N4 scope', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(2);
        expect(activity.provenance.moodle.media.audio).toBeUndefined();
        expect(activity.payload.teaching).toHaveLength(6);
        expect(activity.payload.taskHeadings.map(heading => heading.text)).toEqual([
            '1: You can use the words given or write freely about yourself and create sentences.',
            '2: Please write your about your town. recommendation and the reason why you recommend.',
            '4: Please complete sentences according to the contexts.',
            '4: Read the conversation and create question using interrogatives and conditional form.',
            '5: Put appropriate words in the brackets and choose the reason from the box.',
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            'あなたは どんな服なら、買いますか。',
            '安い →',
            '本屋なら、',
            '本も多いし、',
            'この時計は（　　　）、まだ使えます。',
            'ワット先生に 会いたいんですが、（　　　）ごろ 来れば いいですか。',
            'おいしい すし屋を 探して いるんですが。',
            '[a]',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'state-select', 'typed-report', 'action-choice',
            'state-select', 'typed-report', 'action-choice', 'typed-report',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            'サイズが ちょうど よくて、安ければ、買います。',
            '安ければ',
            '本屋なら、山川ブックがいいです。',
            '本も多いし、店の人も親切ですから。',
            'この時計は（修理すれば）、まだ使えます。',
            'ワット先生に 会いたいんですが、（何時）ごろ 来れば いいですか。',
            '（すし屋）なら、「大黒ずし」が いいですよ。[a]よ。',
            'あまり 高くないです',
        ]);
    });

    it('grades all eight printed loci and repairs only the missed reason mapping', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 7
                ? { ...answer, value: '教え方が 上手です' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l33-chapter-35-homework-8'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':task-5:reason-a');
    });

    it('renders teaching and both source pages before varied retrieval controls without audio', () => {
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
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(2);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.textContent).toContain('Choose the conditional form');
        expect(host.textContent).toContain('Type the conditional response in Japanese');
        expect(host.querySelector('.academy-state-inspection-key h3')?.textContent)
            .toBe('Sensei’s printed examples after your attempt; choices and hints are Yomu scaffolding');
        controller.dispose();
    });

    it('is reachable as one exact-source runtime activity', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l33', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l33');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.beats).toHaveLength(1);
        expect(chapter?.title.en).toBe('Printed models from the Chapter 35 homework');
    });

    it('pins public/docs mirrors, offline assets, the ledger claim, and physical audio absence', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l33', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l33', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l33', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(sha256File(path.resolve('public/academy/content/lessons/060-l2-l33.json')))
            .toBe('766792a660f9f445cb21d23fda504c6403a3d90eaa08ddcf6980cf9a03bdd2d8');
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/060-l2-l33.json'), path.resolve('public/academy/content/lessons/060-l2-l33.json'))).toBe(true);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/060-l2-l33.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toMatch(/\/academy\/content\/lessons\/l2-l33\/[^']+\.mp3/);
        }

        const publicLedger = readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'));
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
        const ledger = JSON.parse(publicLedger.toString('utf8')) as {
            worksheetDigitisation: { additionalSlices: { lessonId: string; claims: Record<string, unknown>; audio: Record<string, unknown>; unconverted: string[] }[] };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(item => item.lessonId === 'l2-l33');
        expect(slice?.audio).toMatchObject({
            status: 'three-audio-members-quarantined-unresolved-pairing-transcript-duration-rights-and-answers',
            sourceAudioMembers: 3,
            sourceAudioTracksDelivered: 0,
        });
        expect(slice?.claims).toMatchObject({
            canonicalMoodlePagesRendered: 2,
            selectedSourceLociAssessed: 8,
            visiblePrintedModelAndMappingRetrievals: 8,
            yomuDerivedDeterministicCompletions: 0,
            originalAudioTracksDelivered: 0,
            sourceAnswerKeysExposed: 0,
            answerVisibility: 'after-attempt',
        });
        expect(slice?.unconverted.join(' ')).toContain('Track 30');
        expect(slice?.unconverted.join(' ')).toContain('Chapter 35_listening-1');
        expect(readdirSync(path.resolve('public/academy/content/lessons/l2-l33'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);
        expect(readdirSync(path.resolve('docs/public/academy/content/lessons/l2-l33'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);
    });
});
