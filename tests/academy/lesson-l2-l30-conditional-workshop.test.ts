import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonL2L30ConditionalWorkshopBeat } from '../../src/academy/content/lesson-l2-l30-conditional-workshop';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';

function model(): StateInspectionModel {
    return createLessonL2L30ConditionalWorkshopBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l30 Chapter 35 conditional workshop', () => {
    it('pins the exact package, source pages, answer provenance, and zero-audio quarantine', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l30-sensei-conditional-workshop',
            responseKind: 'moodle-chapter-35-conditional-workshop',
            provenance: {
                packageId: 'l2-l30',
                packageOrder: 57,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121299,
                    archiveId: 'archive-000025',
                    media: {
                        status: 'no-audio-members-in-package',
                        sourceAudioMembers: 0,
                        sourceAudioTracksDelivered: 0,
                    },
                    answerKeyBasis: 'sensei-verbatim-tables-proverb-and-example-with-yomu-derived-deterministic-conditional-joins',
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 35', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · parallel N4 scope', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(8);
        expect(activity.payload.teaching).toHaveLength(6);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            'いいます',
            'たべます',
            'しません',
            'いい',
            'Wherever you live, once you get used to living there, it becomes your home.',
            'おじいさんに 聞きます・昔の ことが わかります',
            '眼鏡を かけません・辞書の 字が 読めません',
            '日本語を 入力したいんですが。',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'state-select', 'typed-report', 'action-choice',
            'state-select', 'typed-report', 'action-choice', 'typed-report',
        ]);
    });

    it('grades all eight rows and repairs only the missed negative join', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: '眼鏡を かければ、辞書の 字が 読めません。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l30-conditional-7'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':task-3:q1');
    });

    it('renders teaching and all eight source pages before the varied retrieval controls', () => {
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
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(8);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.textContent).toContain('Choose the conditional form');
        expect(host.textContent).toContain('Type the conditional response in Japanese');
        expect(host.textContent).not.toContain('resulting-state report');
        controller.dispose();
    });

    it('is reachable as one exact-source runtime activity', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l30', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l30');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.beats).toHaveLength(1);
        expect(chapter?.title.en).toBe('From condition to consequence');
    });

    it('pins public/docs mirrors, offline assets, and the honest ledger claim', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l30', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l30', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/057-l2-l30.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('4c0690c2c041497cb102b6ab9d94edbf3bbb7238710ba24c8fdf326e3d6a19bb');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/057-l2-l30.json'))).toEqual(sourcePackage);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/057-l2-l30.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: { lessonId: string; claims: Record<string, unknown>; audio: Record<string, unknown> }[] };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(item => item.lessonId === 'l2-l30');
        expect(slice?.audio).toMatchObject({
            status: 'no-audio-members-in-package',
            sourceAudioMembers: 0,
            sourceAudioTracksDelivered: 0,
        });
        expect(slice?.claims).toMatchObject({
            canonicalMoodlePagesRendered: 8,
            verbatimPrintedRetrievals: 6,
            yomuDerivedDeterministicJoins: 2,
            originalAudioTracksDelivered: 0,
            sourceAnswerKeysExposed: 0,
            answerVisibility: 'after-attempt',
        });
    });
});
