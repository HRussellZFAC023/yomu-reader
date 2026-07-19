import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonL2L36YounarimasuChangeWorkshopBeat,
    L2_L36_LESSON_TEN_AUDIO,
    L2_L36_LESSON_TEN_SOURCE_VISUALS,
    younarimasuChangeWorkshopPlugin,
    type YounarimasuChangeWorkshopModel,
} from '../../src/academy/content/lesson-l2-l36-younarimasu-change-workshop';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): YounarimasuChangeWorkshopModel {
    return createLessonL2L36YounarimasuChangeWorkshopBeat().activity as YounarimasuChangeWorkshopModel;
}

function answers(activity: YounarimasuChangeWorkshopModel) {
    return { answers: activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answer })) };
}

function runtime() {
    return createActivityRuntime([younarimasuChangeWorkshopPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('l2-l36 Level 3+ Lesson 10 source workshop', () => {
    it('pins the new archive, all nineteen source pages, and both numbered recordings', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l36-younarimasu-change-workshop',
            responseKind: 'moodle-lesson-10-chapter-36-change-workshop',
            answerSupport: { id: 'academy-assessed-v1' },
            provenance: {
                packageId: 'l2-l36',
                packageOrder: 63,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8870527,
                    moodleLesson: 'Level 3+ Lesson 10',
                    archiveSha256: '57ca13bfffee06933f2dc4ee47d9b3ce168fd6d37475c12e0e7f243c9658265',
                    media: {
                        status: 'worksheet-numbered-audio-pairing',
                        worksheetPayloadSha256: 'effc91302dfc989ccb21189fdde96a900a50b13c3540a9f8b16748b5424f6fdd',
                        tracks: L2_L36_LESSON_TEN_AUDIO,
                    },
                    answerKeyBasis: 'sensei-verbatim-visible-task-one-transformations',
                    sourceCorrection: 'row-2-zettaini-soon-is-a-visible-source-typo',
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toEqual(L2_L36_LESSON_TEN_SOURCE_VISUALS);
        expect(L2_L36_LESSON_TEN_SOURCE_VISUALS).toHaveLength(19);
    });

    it('teaches before assessing the five printed potential-form transformations', () => {
        const activity = model();
        expect(activity.payload.vocabulary).toHaveLength(15);
        expect(activity.payload.vocabulary.find(entry => entry.expression.includes('絶対'))).toMatchObject({
            meaning: 'absolutely',
        });
        expect(activity.payload.rounds.map(round => round.answer)).toEqual([
            '食べられるように',
            '歩けるように',
            '読めるように',
            'わかるように',
            'できるように',
        ]);
        expect(runtime().evaluate(activity, answers(activity)).result).toMatchObject({
            outcome: 'pass',
            score: 1,
            errorTags: [],
        });
        const response = answers(activity);
        expect(runtime().evaluate(activity, {
            answers: response.answers.map((answer, index) => index === 2 ? { ...answer, value: '読みように' } : answer),
        }).result).toMatchObject({
            outcome: 'lapse',
            score: 4 / 5,
            errorTags: ['l2-l36-younarimasu-change-3'],
        });
    });

    it('renders the vocabulary, originals, real audio, and answer-gated form in that order', () => {
        const activity = model();
        const host = document.createElement('main');
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => {});
        document.body.append(host);

        const vocabulary = host.querySelector<HTMLElement>('[data-lesson-phase="vocabulary"]')!;
        const sources = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const listening = host.querySelector<HTMLElement>('[data-lesson-phase="listening"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(vocabulary.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(listening) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(listening.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-source-visual img')).toHaveLength(19);
        expect(host.querySelectorAll('audio')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(5);
        expect(host.querySelector<HTMLElement>('.academy-state-inspection-key')?.hidden).toBe(true);
        controller.dispose();
    });

    it('is the second reachable and registered Chapter 36 beat', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l36', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual([
            'youni-goal-workshop',
            'younarimasu-change-workshop',
        ]);
        expect(createAcademyActivityRuntime().validate(chapter!.beats[1]!.activity)).toEqual([]);
    });

    it('publishes byte-identical source mirrors and precaches every page and recording', () => {
        for (const visual of L2_L36_LESSON_TEN_SOURCE_VISUALS) {
            const filename = path.basename(visual.url);
            const publicPath = path.resolve('public/academy/content/lessons/l2-l36', filename);
            const docsPath = path.resolve('docs/public/academy/content/lessons/l2-l36', filename);
            expect(sha256File(publicPath)).toBe(visual.sha256);
            expect(filesHaveSameContent(publicPath, docsPath)).toBe(true);
        }
        for (const track of L2_L36_LESSON_TEN_AUDIO) {
            const filename = path.basename(track.url);
            const publicPath = path.resolve('public/academy/content/lessons/l2-l36', filename);
            const docsPath = path.resolve('docs/public/academy/content/lessons/l2-l36', filename);
            expect(sha256File(publicPath)).toBe(track.payloadSha256);
            expect(filesHaveSameContent(publicPath, docsPath)).toBe(true);
        }
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            L2_L36_LESSON_TEN_SOURCE_VISUALS.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            L2_L36_LESSON_TEN_AUDIO.forEach(track => expect(worker).toContain(`'${track.url}'`));
        }
        expect(filesHaveSameContent(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'),
        )).toBe(true);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, any>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(item => item.moodleModuleId === 8870527)).toMatchObject({
            lessonId: 'l2-l36',
            sourceArchive: {
                sha256: '57ca13bfffee06933f2dc4ee47d9b3ce168fd6d37475c12e0e7f243c9658265',
            },
            audio: {
                status: 'worksheet-numbered-audio-pairing',
                sourceAudioTracksDelivered: 2,
            },
            claims: {
                canonicalMoodlePagesRendered: 19,
                deterministicSourceTransformationsAssessed: 5,
                originalAudioTracksDelivered: 2,
            },
        });
    });
});
