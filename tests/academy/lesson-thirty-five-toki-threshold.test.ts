import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonThirtyFiveTokiThresholdBeat } from '../../src/academy/content/lesson-thirty-five-toki-threshold';
import { createAcademyActivityRuntime, type TokiThresholdModel } from '../../src/academy/minigames';

const SOURCE_PAYLOAD_SHA256 = '7f88544f889d1c316fb911a2b67d5fe78893f6f2344e29aee25689994646c381';

function model(): TokiThresholdModel {
    return createLessonThirtyFiveTokiThresholdBeat().activity as TokiThresholdModel;
}

function correctThresholds(activity: TokiThresholdModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, timing: round.correctTiming }));
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 35 Sensei Chapter 23-1 toki threshold', () => {
    it('claims the exact next package and preserves verbatim teaching and source prompts', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l10-sensei-toki-threshold',
            kind: 'academy-toki-threshold',
            responseKind: 'moodle-chapter-23-toki-threshold',
            provenance: {
                packageId: 'l2-l10',
                packageOrder: 37,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974659,
                    answerKeyBasis: 'yomu-derived-timing-completions-over-verbatim-source-teaching-and-prompts',
                    audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo I · Lessons 22–23', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · L16', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching).toEqual([
            {
                title: 'Basic sentence:',
                text: 'Verb dictionary- form とき、〜。\nVerb た- form とき、〜。',
            },
            {
                title: 'Sensei’s timing rule',
                text: 'When the verb in front of とき is the dictionary form, whatever is described in the main clause happened before whatever is described in the 〜とき clause. When the verb in front of とき is in the た-form, whatever is described in the main clause happened after whatever is described in the 〜とき clause.',
            },
            {
                title: 'Examples:',
                text: [
                    '日本へ 帰(かえ)ったとき、友達(ともだち)に お土産(みやげ)を あげます。',
                    '会社(かいしゃ)へ 行ったとき、社長(しゃちょう)に 会(あ)いました。',
                    'ごはんを 食(た)べるとき、「いただきます」と 言(い)います。',
                    'ごはんを 食(た)べたとき、「ごちそうさま」と 言(い)います。',
                    '電車(でんしゃ)を 降(お)りたとき、傘(かさ)を 忘(わす)れました。',
                ].join('\n'),
            },
            {
                title: 'For example：',
                text: '① means that the bag was bought before arriving in Paris, i.e. it was bought on the way there,\nwhile ② means that the bag was bought after arriving in Paris, i.e. it was bought in Paris.\n①パリへ 行くとき、 新(あたら)しい かばんを 買(か)いました。\nI bought a bag when going to Paris.\n②パリへ 行ったとき、 新しい かばんを 買いました。\nI bought a bag when I went to Paris.',
            },
        ]);
        expect(activity.payload.taskHeading).toBe('7: Look at the picture below and create sentences.');
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '1) 「お休みなさい」 →',
            '2) 「おはよう ございます」 →',
            '3) 「ありがとう ございます」 →',
            '4) 「失礼します」 →',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            '寝るとき、「お休みなさい」と 言います。',
            '朝、友達に 会ったとき、「おはよう ございます」と 言います。',
            'プレゼントを もらったとき、「ありがとう ございます」と 言います。',
            '部屋に 入るとき、「失礼します」と 言います。',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
    });

    it('grades the before/after threshold and seeds only missed source rows for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, { thresholds: correctThresholds(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const wrongTiming = runtime.evaluate(activity, {
            thresholds: correctThresholds(activity).map((threshold, index) => index === 2
                ? { ...threshold, timing: 'before' as const }
                : threshold),
        });
        expect(wrongTiming.result).toMatchObject({
            outcome: 'lapse',
            score: 3 / 4,
            errorTags: ['l2-l10-toki-threshold-3'],
        });
        expect(wrongTiming.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:6974659:${SOURCE_PAYLOAD_SHA256}:pdf-p5:task-7:q3`,
        ]);
    });

    it('teaches before assessment, gates derived answers, bounds hints, and supports return and replay', async () => {
        const activity = model();
        const host = document.createElement('main');
        const supportUse = vi.fn();
        const announce = vi.fn();
        const evaluations: unknown[] = [];
        const controller = createAcademyActivityRuntime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce,
            recordSupportUse: supportUse,
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const source = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-toki-threshold-return')!;
        const replayButton = host.querySelector<HTMLButtonElement>('.academy-toki-threshold-replay')!;
        expect(teaching.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.querySelectorAll('img')).toHaveLength(2);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('.academy-toki-threshold-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            const timing = index === 0 ? 'after' : round.correctTiming;
            row.querySelector<HTMLInputElement>(`input[value="${timing}"]`)!.checked = true;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(returnButton.hidden).toBe(false);
        expect(replayButton.hidden).toBe(false);
        expect(host.querySelectorAll<HTMLElement>('.academy-toki-threshold-round:not([hidden])')).toHaveLength(1);

        const hint = host.querySelector<HTMLButtonElement>('.academy-toki-threshold-hint')!;
        hint.click();
        hint.click();
        hint.click();
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-toki-threshold-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l2-l10-sensei-toki-threshold',
            supportKind: 'hint',
            choiceId: 'good-night:hint-3',
        });
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');

        replayButton.click();
        expect(host.querySelectorAll('.academy-toki-threshold-round[hidden]')).toHaveLength(0);
        expect(host.querySelector('.academy-toki-threshold-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        controller.dispose();
    });

    it('restores all rows on remount and hands Ruparna’s media pages to Onke’s control desk', async () => {
        const runtime = createAcademyActivityRuntime();
        const firstHost = document.createElement('main');
        const first = runtime.mount(model(), { replace(view) { firstHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(firstHost.querySelectorAll('.academy-toki-threshold-round')).toHaveLength(4);
        first.dispose();

        const replayHost = document.createElement('main');
        const replay = runtime.mount(model(), { replace(view) { replayHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(replayHost.querySelectorAll('.academy-toki-threshold-round[hidden]')).toHaveLength(0);
        expect(replayHost.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        replay.dispose();

        const chapter = await loadLessonActivityChapter('l2-l10', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l10',
            canonicalEpisodeId: 's1e16-the-night-the-map-went-dark',
            location: { en: 'Atlas control desk' },
            host: { id: 'angel' },
            beats: [
                { id: 'sensei-toki-threshold', activity: { kind: 'academy-toki-threshold' } },
                { id: 'sensei-minna-077-true-false', activity: { kind: 'academy-minna-true-false-listening' } },
            ],
        });
        expect(chapter?.introduction.en).toContain('Ruparna');
        expect(chapter?.introduction.en).toContain('Onke');
        expect(chapter?.introduction.en).toContain('station route');
        expect(chapter?.conclusion.en).toContain('fresh replay');
    });

    it('keeps the replay monitor localized in Japanese mode', async () => {
        const activity = model();
        const host = document.createElement('main');
        const runtime = createAcademyActivityRuntime();
        const controller = runtime.mount(activity, {
            language: 'ja',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => {});
        activity.payload.rounds.forEach(round => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            row.querySelector<HTMLInputElement>(`input[value="${round.correctTiming}"]`)!.checked = true;
        });
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('.academy-toki-threshold-replay')?.hidden).toBe(false));
        host.querySelector<HTMLButtonElement>('.academy-toki-threshold-replay')!.click();
        expect(host.querySelector<HTMLElement>('.academy-toki-threshold-monitor')?.textContent)
            .toBe('境目の前／後を選びます。');
        controller.dispose();
    });

    it('pins unique source ownership, byte-identical mirrors, offline assets, and honest ledgers', () => {
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
        expect(owners).toEqual([{ filename: '037-l2-l10.json', id: 'l2-l10', order: 37 }]);

        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l10', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l10', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/037-l2-l10.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('716f456e47d812855f5e5f67a7f704fa93c6a37a2256798588403d36feb28034');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/037-l2-l10.json'))).toEqual(sourcePackage);
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l10')).toMatchObject({
            moodleModuleId: 6974659,
            sourcePackage: { filename: '037-l2-l10.json', sha256: '716f456e47d812855f5e5f67a7f704fa93c6a37a2256798588403d36feb28034' },
            audio: {
                status: 'minna-077-mondai-2-reviewed-packaged-static',
                sourceAudioMembers: 4,
                sourceAudioTracksDelivered: 1,
                quarantinedSourceAudioMembers: 3,
            },
            claims: {
                sourcePromptsDelivered: 9,
                yomuDerivedCompletions: 4,
                beforeAfterThresholdsAssessed: 4,
                sourceAudioTrueFalsePromptsDelivered: 5,
                sourceAnswerKeysExposed: 0,
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-all-four-timing-rows-and-five-listening-items',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/037-l2-l10.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l10 / Chapter 23-1 〜とき`');
    });
});
