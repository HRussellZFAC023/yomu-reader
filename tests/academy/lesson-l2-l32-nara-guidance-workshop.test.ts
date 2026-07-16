import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonL2L32NaraGuidanceWorkshopBeat } from '../../src/academy/content/lesson-l2-l32-nara-guidance-workshop';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';

function model(): StateInspectionModel {
    return createLessonL2L32NaraGuidanceWorkshopBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l32 Chapter 35 nara guidance workshop', () => {
    it('pins the exact package, seven source pages, printed answers, and three-audio quarantine', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l32-sensei-nara-guidance-workshop',
            responseKind: 'moodle-chapter-35-nara-guidance-workshop',
            provenance: {
                packageId: 'l2-l32',
                packageOrder: 59,
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
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(7);
        expect(activity.provenance.moodle.media.audio).toBeUndefined();
        expect(activity.payload.teaching).toHaveLength(6);
        expect(activity.payload.taskHeadings.map(heading => heading.text)).toEqual([
            'Basic sentence:',
            '3: Pair work_Create questions and answer to them. Please tell your own thoughts with Yes or No.',
            '1: Please complete a sentence using 〜なら.',
            '2: Please complete a sentence using 〜なら and create your own reason.',
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '安(やす)ければ、',
            '都合(つごう)が よければ、',
            'ひまなら、',
            '雨(あめ)なら、',
            'パリなら、',
            'ユーロスターなら、',
            '中華料理(ちゅうかりょうり)なら、',
            'キングスクロスなら、',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'state-select', 'typed-report', 'action-choice',
            'state-select', 'typed-report', 'action-choice', 'typed-report',
        ]);
    });

    it('grades all eight printed examples and repairs only the missed suggestion', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: '中華料理(ちゅうかりょうり)なら、キングスクロスが いいですよ。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l32-nara-guidance-7'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':example:chinese-food');
    });

    it('renders teaching and all seven source pages before varied retrieval controls without audio', () => {
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
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(7);
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
        const chapter = await loadReachableLessonActivityChapter('l2-l32', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l32');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.beats).toHaveLength(1);
        expect(chapter?.title.en).toBe('From condition to useful guidance');
    });

    it('pins public/docs mirrors, offline assets, the ledger claim, and physical audio absence', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l32', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l32', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/059-l2-l32.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('2c62cac30744372dbc1790806410e647c86baca7695803c3806372f69d09ee23');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/059-l2-l32.json'))).toEqual(sourcePackage);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/059-l2-l32.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toMatch(/\/academy\/content\/lessons\/l2-l32\/[^']+\.mp3/);
        }

        const publicLedger = readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'));
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'))).toEqual(publicLedger);
        const ledger = JSON.parse(publicLedger.toString('utf8')) as {
            worksheetDigitisation: { additionalSlices: { lessonId: string; claims: Record<string, unknown>; audio: Record<string, unknown>; unconverted: string[] }[] };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(item => item.lessonId === 'l2-l32');
        expect(slice?.audio).toMatchObject({
            status: 'three-audio-members-quarantined-unresolved-pairing-transcript-duration-rights-and-answers',
            sourceAudioMembers: 3,
            sourceAudioTracksDelivered: 0,
        });
        expect(slice?.claims).toMatchObject({
            canonicalMoodlePagesRendered: 7,
            selectedSourceLociAssessed: 8,
            verbatimPrintedExampleRetrievals: 8,
            yomuDerivedDeterministicCompletions: 0,
            originalAudioTracksDelivered: 0,
            sourceAnswerKeysExposed: 0,
            answerVisibility: 'after-attempt',
        });
        expect(slice?.unconverted.join(' ')).toContain('Chapter 35_listening-1');
        expect(slice?.unconverted.join(' ')).toContain('HW Chapter 35 grammar review');
        expect(readdirSync(path.resolve('public/academy/content/lessons/l2-l32'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);
        expect(readdirSync(path.resolve('docs/public/academy/content/lessons/l2-l32'))
            .some(filename => filename.endsWith('.mp3'))).toBe(false);
    });
});
