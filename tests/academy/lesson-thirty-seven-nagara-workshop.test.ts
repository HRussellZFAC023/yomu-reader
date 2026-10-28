import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtySevenNagaraWorkshopBeat } from '../../src/academy/content/lesson-thirty-seven-nagara-workshop';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { nagaraWorkshopPlugin, type NagaraWorkshopModel } from '../../src/academy/minigames/nagara-workshop';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const SOURCE_PAYLOAD_SHA256 = 'b5a1d39c3306a5e7b1c55b108d906bdbf697caea45bdb28746cf5661e772bf48';
const SOURCE_VISUAL_SHA256 = [
    'a0e5167eafeacd2316aa60681c14d4de5da5eb8970b3198f335d441d8b3f088f',
    'c21841db30455c7bd40b0a8b05382d53e17e857b3d9518e830b88887a18dd241',
] as const;

function model(): NagaraWorkshopModel {
    return createLessonThirtySevenNagaraWorkshopBeat().activity as NagaraWorkshopModel;
}

function correctAnswers(activity: NagaraWorkshopModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([nagaraWorkshopPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 37 Sensei Chapter 28-1 nagara workshop', () => {
    it('claims the exact next package and preserves teaching plus all task 2 prompts', () => {
        const activity = model();
        expect(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind)).toContain('academy-nagara-workshop');
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l12-sensei-nagara-workshop',
            kind: 'academy-nagara-workshop',
            responseKind: 'moodle-chapter-28-nagara-varied-join',
            provenance: {
                packageId: 'l2-l12',
                packageOrder: 39,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121261,
                    archiveId: 'archive-000032',
                    answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts',
                    media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 28', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Simultaneous actions and routines', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching[0]).toEqual({
            title: 'Basic sentence:',
            text: 'Verb 1 ます-form ながら Verb 2 。',
        });
        expect(activity.payload.teaching[1]?.text).toBe('①This sentence pattern indicates that someone performing an action indicated by Verb 1 is simultaneously performing a separate action indicated by verb 2, where verb 2 indicates this main action.');
        expect(activity.payload.teaching[2]?.text).toBe('②It is also used to describe someone doing two things continuously over a period of time.');
        expect(activity.payload.teaching[3]?.text.split('\n')).toHaveLength(6);
        expect(activity.payload.taskHeading).toBe('2: please change two sentences to one long sentence.');
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '1） 話を 聞きます・メモして ください →',
            '2） 運転します・電話を しないで ください →',
            '3） お茶を 飲みます・話しましょう →',
            '4） ピアノを 弾きます・歌えますか →',
            '5） ボランティアを します・世界を 旅行して います →',
            '6） 絵を 教えます・マンガを かいて います →',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'stem-select', 'stem-select',
            'main-clause-choice', 'main-clause-choice',
            'typed-join', 'typed-join',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([1, 2, 3, 4, 5, 6].map(item =>
            `moodle:8121261:${SOURCE_PAYLOAD_SHA256}:pdf-p1:task-2:q${item}`));
    });

    it('grades all three interaction modes and seeds only missed source rows for repair', () => {
        const activity = model();
        const activityRuntime = runtime();
        expect(activityRuntime.evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = activityRuntime.evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 4
                ? { ...answer, value: 'ボランティアをしながら世界を旅行します' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 5 / 6,
            errorTags: ['l2-l12-nagara-join-5'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:8121261:${SOURCE_PAYLOAD_SHA256}:pdf-p1:task-2:q5`,
        ]);
    });

    it('teaches before assessment, varies controls, gates answers, repairs one miss, bounds hints, and replays', async () => {
        const activity = model();
        const host = document.createElement('main');
        const supportUse = vi.fn();
        const announce = vi.fn();
        const evaluations: string[] = [];
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce,
            recordSupportUse: supportUse,
        }, evaluation => { evaluations.push(evaluation.result.outcome); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const source = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-nagara-workshop-return')!;
        const replayButton = host.querySelector<HTMLButtonElement>('.academy-nagara-workshop-replay')!;
        expect(teaching.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.querySelectorAll('img')).toHaveLength(2);
        expect(host.querySelector('audio')).toBeNull();
        expect(form.querySelectorAll('select')).toHaveLength(2);
        expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(4);
        expect(form.querySelectorAll('input[type="text"]')).toHaveLength(2);
        expect(host.querySelector('.academy-nagara-workshop-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(key.getAttribute('hidden')).not.toBeNull();

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            if (round.interaction === 'stem-select') {
                const select = row.querySelector<HTMLSelectElement>('select')!;
                select.value = index === 0 ? round.options[1]!.value : round.answerValue;
            } else if (round.interaction === 'main-clause-choice') {
                row.querySelector<HTMLInputElement>(`input[value="${round.answerValue}"]`)!.checked = true;
            } else {
                row.querySelector<HTMLInputElement>('input[type="text"]')!.value = round.answerValue;
            }
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse']));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(host.querySelectorAll<HTMLElement>('.academy-nagara-workshop-round:not([hidden])')).toHaveLength(1);

        const hint = host.querySelector<HTMLButtonElement>('.academy-nagara-workshop-hint')!;
        hint.click();
        hint.click();
        hint.click();
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-nagara-workshop-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l2-l12-sensei-nagara-workshop',
            supportKind: 'hint',
            choiceId: 'listen-and-note:hint-3',
        });
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');

        host.querySelector<HTMLSelectElement>('[data-round-id="listen-and-note"] select')!.value = activity.payload.rounds[0]!.answerValue;
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse', 'pass']));
        await vi.waitFor(() => expect(host.querySelector<HTMLElement>('.academy-nagara-workshop')?.dataset.outcome).toBe('pass'));

        replayButton.click();
        expect(host.querySelectorAll('.academy-nagara-workshop-round[hidden]')).toHaveLength(0);
        expect(host.querySelector('.academy-nagara-workshop-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        expect([...form.querySelectorAll<HTMLInputElement>('input[type="text"]')].map(input => input.value)).toEqual(['', '']);
        controller.dispose();
    });

    it('restores all rows on remount and continues the Rie-to-Aakash handoff in the chapter catalog', () => {
        const activityRuntime = runtime();
        for (let index = 0; index < 2; index += 1) {
            const host = document.createElement('main');
            const controller = activityRuntime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, () => {});
            expect(host.querySelectorAll('.academy-nagara-workshop-round')).toHaveLength(6);
            expect(host.querySelectorAll('.academy-nagara-workshop-round[hidden]')).toHaveLength(0);
            expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
            controller.dispose();
        }

        const beat = createLessonThirtySevenNagaraWorkshopBeat();
        expect(beat.narrative.en).toContain('Rie');
        expect(beat.narrative.en).toContain('Aakash');
        expect(beat.narrative.en).toContain('shared kitchen');
        const catalog = readFileSync(path.resolve('src/academy/content/lesson-activity-catalog.ts'), 'utf8');
        expect(catalog).toContain("case 'l2-l12':");
        expect(catalog).toContain("chapter('l2-l12', 's1e16-the-night-the-map-went-dark', 'aakash'");
        expect(catalog).toContain('fresh replay of all six joins remain open');
    });

    it('pins unique source ownership, exact mirrors, offline assets, and honest ledgers', () => {
        const lessonRoot = path.resolve('public/academy/content/lessons');
        const owners = readdirSync(lessonRoot).filter(filename => filename.endsWith('.json')).flatMap(filename => {
            const lesson = JSON.parse(readFileSync(path.join(lessonRoot, filename), 'utf8')) as {
                id?: string;
                order?: number;
                sourceCoverage?: { members?: Array<{ payloadSha256?: string }> };
            };
            return lesson.sourceCoverage?.members?.some(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256)
                ? [{ filename, id: lesson.id, order: lesson.order }]
                : [];
        });
        expect(owners).toEqual([{ filename: '039-l2-l12.json', id: 'l2-l12', order: 39 }]);

        model().provenance.moodle.sourceSheets.forEach((visual, index) => {
            const filename = path.basename(visual.url);
            const sourceImage = readFileSync(path.resolve('public/academy/content/lessons/l2-l12', filename));
            const hostedImage = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l12', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l12', filename))).toBe(SOURCE_VISUAL_SHA256[index]);
            expect(hostedImage).toEqual(sourceImage);
        });
        expect(sha256File(path.resolve('public/academy/content/lessons/039-l2-l12.json')))
            .toBe('55b200a9a89971ed0f4272bfc53c95c8e318677d9c649d41dc90ad909044af30');
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/039-l2-l12.json'), path.resolve('public/academy/content/lessons/039-l2-l12.json'))).toBe(true);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l12')).toMatchObject({
            moodleModuleId: 8121261,
            sourcePackage: { filename: '039-l2-l12.json', sha256: '55b200a9a89971ed0f4272bfc53c95c8e318677d9c649d41dc90ad909044af30' },
            sourceArchive: { id: 'archive-000032', sha256: '62c3a814d3590157a8498d34e5ca172c5afa6608d9f9be1ad149a4ca4b99d4fe' },
            audio: { status: 'track-78-and-79-reviewed-packaged-static', sourceAudioMembers: 4, sourceAudioTracksDelivered: 2, quarantinedSourceAudioMembers: 2 },
            claims: {
                sourcePromptsDelivered: 6,
                yomuDerivedCompletions: 6,
                interactionModesAssessed: ['stem-select', 'main-clause-choice', 'typed-join', 'beneficiary-direction-and-typed-phrase'],
                sourceAnswerKeysExposed: 0,
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-all-six-nagara-rows-nine-track-78-items-and-three-track-79-items',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/039-l2-l12.json'");
            model().provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l12 / Chapter 28-1 〜ながら + Tracks 78/79`');
    });
});
