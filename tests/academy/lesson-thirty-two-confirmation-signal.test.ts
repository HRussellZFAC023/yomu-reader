import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonThirtyTwoConfirmationSignalBeat } from '../../src/academy/content/lesson-thirty-two-confirmation-signal';
import { createAcademyActivityRuntime, type ConfirmationSignalModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): ConfirmationSignalModel {
    return createLessonThirtyTwoConfirmationSignalBeat().activity as ConfirmationSignalModel;
}

function correctSignals(activity: ConfirmationSignalModel) {
    return activity.payload.rounds.map(round => ({
        roundId: round.id,
        optionId: round.correctOptionId,
        rising: true,
    }));
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 32 Sensei Chapter 21 confirmation signal', () => {
    it('claims the unique l2-l07 package and preserves verbatim teaching and source prompts', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l07-sensei-confirmation-signal',
            kind: 'academy-confirmation-signal',
            responseKind: 'moodle-chapter-21-deshou-confirmation-signal',
            provenance: {
                packageId: 'l2-l07',
                packageOrder: 34,
                moodle: {
                    moduleId: 6974653,
                    answerKeyBasis: 'yomu-derived-deshou-transformations-over-verbatim-source-teaching-and-prompts',
                    audio: {
                        status: 'minna-074-recording-embedded-true-false-reviewed',
                        sourceAudioMembers: 8,
                        sourceAudioTracksDelivered: 1,
                        quarantinedSourceAudioMembers: 7,
                    },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo I, Lesson 21', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: 'none-verified', reuse: 'none' },
                },
            },
        });
        expect(activity.payload.teaching.map(step => step.text)).toEqual([
            'Verb Plain form でしょう？(⤴)\nい-adj Plain form でしょう？(⤴)\nな-adj 〜な →〜だ Plain form でしょう？(⤴)\nNoun だ Plain form でしょう？(⤴)',
            'This sentence form is used when seeking agreement or confirmation from the listener.\nでしょう is spoken with a rising intonation. The plain form is used before でしょう, but without the 〜だ in the case of a な-adjective or noun.',
            'Non past affirmative 行くでしょう？\nPast 行ったでしょう？\nNon past negative 行かないでしょう？\nPast negative 行かなかったでしょう？',
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '沖縄は 海が きれいです →',
            'ワットさんの 話は おもしろいです →',
            '木村さんは イーさんを 知りません →',
            'きのう サッカーの 試合が ありました →',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            '沖縄は 海が きれいでしょう？',
            'ワットさんの 話は おもしろいでしょう？',
            '木村さんは イーさんを 知らないでしょう？',
            'きのう サッカーの 試合が あったでしょう？',
        ]);
        expect(activity.payload.rounds.every(round => round.options.length === 3 && round.hints.length === 3)).toBe(true);
    });

    it('grades both completion and rising signal and schedules only missed rows for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, { signals: correctSignals(activity) });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(
            activity.payload.rounds.map(round => round.answerExpression),
        );

        const repair = runtime.evaluate(activity, {
            signals: correctSignals(activity).map((signal, index) => index === 2 ? { ...signal, rising: false } : signal),
        });
        expect(repair.result).toMatchObject({
            outcome: 'lapse',
            score: 3 / 4,
            errorTags: ['l2-l07-confirmation-signal-3'],
        });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6974653:dca619084366be2c1d89de013f3b7b142b83fb5ee7462175bc4d35af9ecd8ab6:pdf-p1:deshou:q3',
        ]);
    });

    it('shows verbatim teaching and source before assessment, then unlocks answers, return, and earned hints', async () => {
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
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-confirmation-signal-return')!;
        expect(teaching.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(teaching.textContent).toContain('without the 〜だ in the case of a な-adjective or noun.');
        expect(source.querySelector('img')?.getAttribute('src')).toBe(
            '/academy/content/lessons/l2-l07/moodle-chapter-21-deshou-teaching-task-page-1.png',
        );
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('.academy-confirmation-signal-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            host.querySelector<HTMLInputElement>(`[data-round-id="${round.id}"] input[value="${round.correctOptionId}"]`)!.checked = true;
            host.querySelector<HTMLInputElement>(`[data-round-id="${round.id}"] input[type="checkbox"]`)!.checked = index !== 1;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(returnButton.hidden).toBe(false);
        expect(host.querySelectorAll<HTMLElement>('.academy-confirmation-signal-round:not([hidden])')).toHaveLength(1);
        const hint = host.querySelector<HTMLButtonElement>('.academy-confirmation-signal-hint')!;
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-confirmation-signal-hint-output')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenCalledWith({
            activityId: 'activity:l2-l07-sensei-confirmation-signal',
            supportKind: 'hint',
            choiceId: 'watt-interesting:hint-1',
        });
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');
        controller.dispose();
    });

    it('restores every source row and hidden post-attempt state on a fresh revisit', () => {
        const runtime = createAcademyActivityRuntime();
        const firstHost = document.createElement('main');
        const first = runtime.mount(model(), { replace(view) { firstHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(firstHost.querySelectorAll('.academy-confirmation-signal-round')).toHaveLength(4);
        first.dispose();

        const revisitedHost = document.createElement('main');
        const revisited = runtime.mount(model(), { replace(view) { revisitedHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(revisitedHost.querySelectorAll('.academy-confirmation-signal-round')).toHaveLength(4);
        expect(revisitedHost.querySelectorAll('.academy-confirmation-signal-round[hidden]')).toHaveLength(0);
        expect(revisitedHost.querySelector('.academy-confirmation-signal-hint')).toBeNull();
        expect(revisitedHost.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        expect(revisitedHost.querySelector<HTMLButtonElement>('.academy-confirmation-signal-return')?.hidden).toBe(true);
        revisited.dispose();
    });

    it('keeps Lesson 27-32 package ownership unique and hands Lesson 32 to Shin in the practice kitchen', async () => {
        const packages = [
            ['029-l2-l02.json', 'l2-l02', 29, 7011918],
            ['030-l2-l03.json', 'l2-l03', 30, 7011919],
            ['031-l2-l04.json', 'l2-l04', 31, 7011920],
            ['032-l2-l05.json', 'l2-l05', 32, 6974651],
            ['033-l2-l06.json', 'l2-l06', 33, 6974652],
            ['034-l2-l07.json', 'l2-l07', 34, 6974653],
        ] as const;
        const identities = packages.map(([filename]) => JSON.parse(readFileSync(
            path.resolve('public/academy/content/lessons', filename), 'utf8',
        )) as { id: string; order: number; identity: { moduleId: number } });
        expect(identities.map(identity => [identity.id, identity.order, identity.identity.moduleId]))
            .toEqual(packages.map(([, id, order, moduleId]) => [id, order, moduleId]));
        expect(new Set(identities.map(identity => identity.id)).size).toBe(6);
        expect(new Set(identities.map(identity => identity.order)).size).toBe(6);
        expect(new Set(identities.map(identity => identity.identity.moduleId)).size).toBe(6);

        const chapter = await loadLessonActivityChapter('l2-l07', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l07',
            canonicalEpisodeId: 's1e08-menu-without-pictures',
            location: { en: 'Academy practice kitchen' },
            host: { id: 'shin' },
            beats: [
                { id: 'sensei-confirmation-signal', activity: { kind: 'academy-confirmation-signal' } },
                { id: 'sensei-minna-074-true-false', activity: { kind: 'academy-minna-true-false-listening' } },
            ],
        });
        expect(chapter?.introduction.en).toContain('Sophie');
        expect(chapter?.conclusion.en).toContain('route back to Sensei’s teaching');
    });

    it('pins byte-identical mirrors, offline assets, and honest ledger claims', () => {
        const activity = model();
        const visual = activity.provenance.moodle.sourceSheet;
        const filename = path.basename(visual.url);
        const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l07', filename));
        const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l07', filename));
        expect(sha256File(path.resolve('public/academy/content/lessons/l2-l07', filename))).toBe(visual.sha256);
        expect(hosted).toEqual(source);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/034-l2-l07.json'), path.resolve('public/academy/content/lessons/034-l2-l07.json'))).toBe(true);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l07')).toMatchObject({
            moodleModuleId: 6974653,
            sourcePackage: { filename: '034-l2-l07.json', sha256: '7edfa0f5430e384f00d6ac2a695c7fa3d8271e266585e2d7c4d889fe5a964a99' },
            audio: {
                status: 'minna-074-recording-embedded-true-false-reviewed',
                sourceAudioMembers: 8,
                sourceAudioTracksDelivered: 1,
                quarantinedSourceAudioMembers: 7,
            },
            claims: {
                sourcePromptsDelivered: 4,
                yomuDerivedCompletions: 4,
                sourceAnswerKeysExposed: 0,
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'fresh-remount-restores-four-confirmation-rows-and-five-concealed-listening-items',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/034-l2-l07.json'");
            expect(worker).toContain(`'${visual.url}'`);
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l07 / Chapter 21 〜でしょう + Minna 074`');
    });
});
