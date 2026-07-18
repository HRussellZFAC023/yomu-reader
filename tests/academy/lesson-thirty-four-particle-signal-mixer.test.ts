import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonThirtyFourParticleSignalMixerBeat } from '../../src/academy/content/lesson-thirty-four-particle-signal-mixer';
import { createAcademyActivityRuntime, type ParticleSignalMixerModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): ParticleSignalMixerModel {
    return createLessonThirtyFourParticleSignalMixerBeat().activity as ParticleSignalMixerModel;
}

function correctSignals(activity: ParticleSignalMixerModel) {
    return activity.payload.rounds.map(round => ({
        roundId: round.id,
        optionId: round.correctOptionId,
        particle: round.correctParticle,
    }));
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 34 Sensei Chapter 22-2 particle signal mixer', () => {
    it('claims exact l2-l09 sources and preserves verbatim teaching and prompts', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l09-sensei-particle-signal-mixer',
            kind: 'academy-particle-signal-mixer',
            responseKind: 'moodle-chapter-22-particle-signal-mixer',
            provenance: {
                packageId: 'l2-l09',
                packageOrder: 36,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974657,
                    answerKeyBasis: 'yomu-derived-transformations-over-verbatim-source-teaching-and-prompts',
                    audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 1, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo I · Lesson 22', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · L15', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching).toEqual([
            {
                title: 'Basic sentence:',
                text: 'modifying clause (V plain-form) Noun を Verb ます。\nmodifying clause (V plain-form) Noun が ～です/ます。',
            },
            {
                title: 'Sensei’s particle rule',
                text: 'When noun-modifying clause + Noun is used as an object of the sentence, it’s marked by “を”.\nWhen a predicate takes such as すきな, きらいな, じょうずな, へたな, ほしい, Verb+たいです, わかります, いります and etc, noun-modifying clause + Noun is marked by “が”.',
            },
            {
                title: 'Sensei’s time rule',
                text: 'When talking about the time required for doing something or describing an appointment, errand, etc., the verb is put in the dictionary form and is placed in front of the noun じかん,やくそく,ようじ, etc.',
            },
            {
                title: 'Examples:',
                text: [
                    '日本の ともだちに あげる お土産(みやげ)を 買(か)います。',
                    'ウェイトローズで 売っていた ケーキを 食(た)べました。',
                    'わたしは このシェフが 作(つく)った ケーキが 好(す)きです。',
                    'おいしい ケーキを 作(つく)る ロボットが 欲(ほ)しいです。',
                    'わたしは ケーキを 焼(や)く 時間(じかん)が ありません。',
                    'ともだちと 映画(えいが)を 見(み)る 約束(やくそく)が あります。',
                ].join('\n'),
            },
        ]);
        expect(activity.payload.taskHeadings).toEqual([
            '1: Following examples, create noun-modifying clause sentences.',
            '4: Following examples, create sentences.',
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '1) 〈奈良で 撮りました〉 写真を 見せて ください →',
            '2) 〈要りません〉 物を 捨てます →',
            '1) 〈ユーモアが あります〉 人が 好きです →',
            '2) 〈料理を 作ります〉 ロボットが 欲しいです →',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            '奈良で 撮った 写真を 見せて ください。',
            '要らない 物を 捨てます。',
            'ユーモアが ある 人が 好きです。',
            '料理を 作る ロボットが 欲しいです。',
        ]);
        expect(activity.payload.rounds.every(round => round.options.length === 3 && round.hints.length === 3)).toBe(true);
    });

    it('grades both the plain-form fader and outer-particle channel', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, { signals: correctSignals(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const wrongParticle = runtime.evaluate(activity, {
            signals: correctSignals(activity).map((signal, index) => index === 2
                ? { ...signal, particle: 'を' }
                : signal),
        });
        expect(wrongParticle.result).toMatchObject({
            outcome: 'lapse',
            score: 3 / 4,
            errorTags: ['l2-l09-particle-signal-3'],
        });
        expect(wrongParticle.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6974657:e2e34dd1605354d4e533c936105f391125a6db82f4610365b286ad6f8286c213:pdf-p3:task-4:q1',
        ]);
    });

    it('teaches before assessment, gates answers, bounds hints, and supports return and replay', async () => {
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
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-particle-signal-return')!;
        const replayButton = host.querySelector<HTMLButtonElement>('.academy-particle-signal-replay')!;
        expect(teaching.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.querySelectorAll('img')).toHaveLength(2);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('.academy-particle-signal-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            row.querySelector<HTMLInputElement>(`input[value="${round.correctOptionId}"]`)!.checked = true;
            row.querySelectorAll<HTMLInputElement>(`input[value="${round.correctParticle}"]`)[0]!.checked = true;
            if (index === 1) {
                row.querySelector<HTMLInputElement>('input[value="が"]')!.checked = true;
            }
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(returnButton.hidden).toBe(false);
        expect(replayButton.hidden).toBe(false);
        expect(host.querySelectorAll<HTMLElement>('.academy-particle-signal-round:not([hidden])')).toHaveLength(1);

        const hint = host.querySelector<HTMLButtonElement>('.academy-particle-signal-hint')!;
        hint.click();
        hint.click();
        hint.click();
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-particle-signal-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l2-l09-sensei-particle-signal-mixer',
            supportKind: 'hint',
            choiceId: 'unneeded-things:hint-3',
        });
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');

        replayButton.click();
        expect(host.querySelectorAll('.academy-particle-signal-round[hidden]')).toHaveLength(0);
        expect(host.querySelector('.academy-particle-signal-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        controller.dispose();
    });

    it('restores all rows on fresh remount and hands Felix’s glasshouse pages to Ruparna’s media room', async () => {
        const runtime = createAcademyActivityRuntime();
        const firstHost = document.createElement('main');
        const first = runtime.mount(model(), { replace(view) { firstHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(firstHost.querySelectorAll('.academy-particle-signal-round')).toHaveLength(4);
        first.dispose();

        const replayHost = document.createElement('main');
        const replay = runtime.mount(model(), { replace(view) { replayHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(replayHost.querySelectorAll('.academy-particle-signal-round[hidden]')).toHaveLength(0);
        expect(replayHost.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        replay.dispose();

        const chapter = await loadLessonActivityChapter('l2-l09', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l09',
            canonicalEpisodeId: 's1e07-no-spoilers',
            location: { en: 'Academy media room' },
            host: { id: 'ruparna' },
            beats: [
                { id: 'sensei-particle-signal-mixer', activity: { kind: 'academy-particle-signal-mixer' } },
                { id: 'sensei-minna-075-conversation', activity: { kind: 'academy-conversation-listening-check' } },
            ],
        });
        expect(chapter?.introduction.en).toContain('glasshouse word walk');
        expect(chapter?.introduction.en).toContain('Felix');
        expect(chapter?.introduction.en).toContain('Ruparna');
        expect(chapter?.conclusion.en).toContain('fresh replay');
    });

    it('pins byte-identical mirrors, offline assets, and honest ledger claims', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l09', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l09', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l09', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/036-l2-l09.json'), path.resolve('public/academy/content/lessons/036-l2-l09.json'))).toBe(true);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l09')).toMatchObject({
            moodleModuleId: 6974657,
            sourcePackage: { filename: '036-l2-l09.json', sha256: '951cedfa65d24865c12731438d63679c27b5e65fed8efd9abb4984370ac929fd' },
            audio: { status: 'minna-075-conversation-reviewed-packaged-static', sourceAudioMembers: 1, sourceAudioTracksDelivered: 1 },
            claims: {
                sourcePromptsDelivered: 8,
                yomuDerivedCompletions: 4,
                plainFormSignalsAssessed: 4,
                outerParticleSignalsAssessed: 4,
                sourceAudioConversationPromptsDelivered: 4,
                sourceAnswerKeysExposed: 0,
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-grammar-and-listening-questions',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/036-l2-l09.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l09 / Chapter 22-2 modifying clauses + Minna 075`');
    });
});
