import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFortyThreeMessageHandoffBeat } from '../../src/academy/content/lesson-forty-three-message-handoff';
import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { createReachableLessonActivityExtension } from '../../src/academy/ui/lesson-activity-chapter';
import { attachLibraryReaderVocabulary } from '../../src/academy/integration/library-reader-vocabulary';

function model(): StateInspectionModel {
    return createLessonFortyThreeMessageHandoffBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 43 Sensei Chapter 30 message handoff', () => {
    it('pins exact order 45, teaches first, and delivers only the script-verified Track 13 pairing', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l18-sensei-message-handoff',
            responseKind: 'moodle-chapter-30-message-handoff',
            provenance: {
                packageId: 'l2-l18',
                packageOrder: 45,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121271,
                    archiveId: 'archive-000044',
                    media: {
                        status: 'audio-member-verified-script-and-worksheet-pairing',
                        sourceAudioMembers: 1,
                        sourceAudioTracksDelivered: 1,
                        durationSeconds: 50.12,
                        audio: {
                            url: '/academy/content/lessons/l2-l18/moodle-track-13.mp3',
                            payloadSha256: 'aca35dbabfc34bac27deef4f328382718a57734e5ef67c2f73e348616fd8494c',
                            transcriptPayloadSha256: '38a9974c41c43cea05d332ce504149b6614f1cd6069fe00570a2a447ae1d3c13',
                            worksheetPayloadSha256: 'e63689d47daab01e6e21698fc5f0267f17cdabe00cad3f25cc63ceb701b594c6',
                            verification: 'exact-script-and-independent-transcript-match',
                        },
                    },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lessons 26 and 30 review', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Examples, explanations, and careful requests', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(11);
        expect(activity.provenance.moodle.answerSheets).toHaveLength(1);
        expect(activity.payload.teaching).toHaveLength(7);
        expect(activity.payload.teaching[0]?.title).toBe('Sensei vocabulary first');
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'action-choice', 'typed-report', 'action-choice',
            'state-select', 'typed-report', 'typed-report', 'action-choice',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
    });

    it('grades all eight prompts and repairs only the missed source row', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: '晩ごはんを食べることです。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l18-message-handoff-7'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':pdf-p1:task-2:q5');
    });

    it('renders teaching and exact source pages before varied assessment, then supports replay', async () => {
        const activity = model();
        const host = document.createElement('main');
        const outcomes: string[] = [];
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, evaluation => { outcomes.push(evaluation.result.outcome); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const audio = host.querySelector<HTMLElement>('.academy-state-inspection-audio')!;
        const sources = host.querySelector<HTMLElement>('.academy-state-inspection-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(audio.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-state-inspection-sources .academy-state-inspection-source img')).toHaveLength(11);
        expect(host.querySelector<HTMLAudioElement>('.academy-state-inspection-audio audio')?.src).toContain('moodle-track-13.mp3');
        expect(host.querySelector<HTMLButtonElement>('.academy-state-inspection-check')?.textContent)
            .toBe('Check the eight Chapter 30 responses');
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(1);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        expect(host.querySelector('.academy-state-inspection-answer-source')).not.toBeNull();

        activity.payload.rounds.forEach(round => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            if (round.interaction === 'state-select') row.querySelector<HTMLSelectElement>('select')!.value = round.answerValue;
            else if (round.interaction === 'action-choice') row.querySelector<HTMLInputElement>(`input[value="${round.answerValue}"]`)!.checked = true;
            else row.querySelector<HTMLInputElement>('input[type="text"]')!.value = round.answerValue;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(outcomes).toEqual(['pass']));
        await vi.waitFor(() => expect(
            host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden,
        ).toBe(false));
        host.querySelector<HTMLButtonElement>('.academy-state-inspection-replay')!.click();
        expect(host.querySelectorAll('.academy-state-inspection-round[hidden]')).toHaveLength(0);
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        controller.dispose();
    });

    it('projects all twenty exact vocabulary rows through Reader and local SRS without advancing missing frontiers', () => {
        const lessonPackage = JSON.parse(readFileSync(path.resolve('public/academy/content/lessons/045-l2-l18.json'), 'utf8')) as unknown;
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage, 'l2-l18');
        expect(sheet.sourceStatus).toBe('exact-source');
        expect(sheet.items).toHaveLength(20);
        expect(sheet.items[0]).toMatchObject({ expression: 'たいふう（台⾵）', studyExpression: '台風', source: { page: 1, row: 1 } });
        expect(sheet.items[4]).toMatchObject({ sourceMeaning: 'a verbale message', fieldProvenance: { meaning: 'source-provided' } });
        expect(sheet.items[15]).toMatchObject({ studyExpression: '非常袋', sourceMeaning: null, fieldProvenance: { meaning: 'yomu-support' } });
        expect(sheet.items[19]).toMatchObject({ studyExpression: '生活する', source: { page: 2, row: 20 } });

        expect(libraryStudyVocabulary(sheet)).toHaveLength(20);
        const seeds = libraryVocabularyReviewSeeds(sheet);
        expect(seeds).toHaveLength(20);
        expect(seeds[17]?.sourceQuestionId).toContain(':p2:row-18');

        const torch = sheet.items[17]!;
        const surface = document.createElement('span');
        attachLibraryReaderVocabulary(surface, torch);
        expect(surface.getAttribute('data-yomu-authored-vocabulary')).toContain('懐中電灯');
    });

    it('is reachable as one runtime activity and continues the Lesson 42 story', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l18', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l18');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.introduction.en).toContain('Angel');
        expect(chapter?.introduction.en).toContain('Chapter 30-3');
        const extension = createReachableLessonActivityExtension({
            language: 'en', chapter: chapter!, runtime: createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS),
            pronunciation: { async play() { return { dispose() {} }; } }, onEvaluation() {},
        });
        expect(extension?.activityCount).toBe(1);
    });

    it('pins mirrored source pages, exact package identity, and offline delivery', () => {
        const activity = model();
        for (const visual of [...activity.provenance.moodle.sourceSheets, ...(activity.provenance.moodle.answerSheets ?? [])]) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l18', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l18', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/045-l2-l18.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('79331b534ae7a45d12307262656da71d8c52e2d80d8c067f267a5259e4ee3443');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/045-l2-l18.json'))).toEqual(sourcePackage);
        const audio = readFileSync(path.resolve('public/academy/content/lessons/l2-l18/moodle-track-13.mp3'));
        expect(createHash('sha256').update(audio).digest('hex'))
            .toBe('aca35dbabfc34bac27deef4f328382718a57734e5ef67c2f73e348616fd8494c');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l18/moodle-track-13.mp3'))).toEqual(audio);
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/045-l2-l18.json'");
            [...activity.provenance.moodle.sourceSheets, ...(activity.provenance.moodle.answerSheets ?? [])]
                .forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).toContain("'/academy/content/lessons/l2-l18/moodle-track-13.mp3'");
        }
    });
});
