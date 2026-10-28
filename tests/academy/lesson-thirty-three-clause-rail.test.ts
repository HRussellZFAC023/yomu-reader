import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createLessonThirtyThreeClauseRailBeat } from '../../src/academy/content/lesson-thirty-three-clause-rail';
import { createAcademyActivityRuntime, type ClauseRailModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): ClauseRailModel {
    return createLessonThirtyThreeClauseRailBeat().activity as ClauseRailModel;
}

function correctPlacements(activity: ClauseRailModel, attached = true) {
    return activity.payload.rounds.map(round => ({
        roundId: round.id,
        optionId: round.correctOptionId,
        attached,
    }));
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 33 Sensei Chapter 22 clause rail', () => {
    it('claims the exact l2-l08 source and preserves verbatim teaching and prompts', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l08-sensei-clause-rail',
            kind: 'academy-clause-rail',
            responseKind: 'moodle-chapter-22-clause-rail',
            provenance: {
                packageId: 'l2-l08',
                packageOrder: 35,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974656,
                    answerKeyBasis: 'yomu-derived-clause-transformations-over-verbatim-source-teaching-and-prompts',
                    audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 2, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo I · Chapter 22 (source inventory label)', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: 'none-verified', reuse: 'none' },
                },
            },
        });
        expect(activity.payload.teaching).toEqual([
            { title: 'Basic sentence:', text: 'Noun 1 は modifying clause (V plain-form) Noun 2 です。' },
            {
                title: 'Examples:',
                text: [
                    'これは みなさんが 使(つか)う 教科書(きょうかしょ)です。',
                    'これは 去年(きょねん) かったシャツです。',
                    'このワインは フランスで 作(つく)った ワインです。',
                    'ここは 自転車(じてんしゃ)を おく ところです。',
                    'えきは 電車(でんしゃ)に のる ところです。',
                    '小林(こばやし)さんは ふじさんに 登(のぼ)ったことがある ひとです。',
                    'タワポンさんは ふじさんに 登ったことがない ひとです。',
                ].join('\n'),
            },
            { title: 'Sensei’s task', text: '1: Change the sentences and explain what the object is.' },
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '〈母に もらいました〉 コート →',
            '〈京都で 撮りました〉 写真 →',
            '〈マリアさんが 作りました〉 ケーキ →',
            '〈カリナさんが かきました〉 絵 →',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            'これは 母に もらった コートです。',
            'これは 京都で 撮った 写真です。',
            'これは マリアさんが 作った ケーキです。',
            'これは カリナさんが かいた 絵です。',
        ]);
        expect(activity.payload.rounds.every(round => round.options.length === 3 && round.hints.length === 3)).toBe(true);
    });

    it('grades both the plain-form ticket and explicit noun-boundary attachment', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, { placements: correctPlacements(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const unattached = runtime.evaluate(activity, {
            placements: correctPlacements(activity).map((placement, index) => index === 2
                ? { ...placement, attached: false }
                : placement),
        });
        expect(unattached.result).toMatchObject({
            outcome: 'lapse',
            score: 3 / 4,
            errorTags: ['l2-l08-clause-rail-3'],
        });
        expect(unattached.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6974656:262f9da24884b3868c4d87d84fccdffc8be353856f6603072139ef1cec182685:pdf-p1:clause-rail:q3',
        ]);
    });

    it('shows teaching and source first, then unlocks answers, return, and missed-only hints', async () => {
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
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-clause-rail-return')!;
        expect(teaching.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(teaching.textContent).toContain('Noun 1 は modifying clause (V plain-form) Noun 2 です。');
        expect(source.querySelector('img')?.getAttribute('src')).toBe(
            '/academy/content/lessons/l2-l08/moodle-chapter-22-1-clause-rail-page-1.png',
        );
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('.academy-clause-rail-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            row.querySelector<HTMLInputElement>(`input[value="${round.correctOptionId}"]`)!.checked = true;
            if (index !== 1) row.querySelector<HTMLButtonElement>('.academy-clause-rail-attach')!.click();
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(returnButton.hidden).toBe(false);
        expect(host.querySelectorAll<HTMLElement>('.academy-clause-rail-round:not([hidden])')).toHaveLength(1);
        const visibleRail = host.querySelector<HTMLElement>('.academy-clause-rail-round:not([hidden]) .academy-clause-rail-track')!;
        expect(visibleRail.textContent).toContain('clause ticket');

        const hint = host.querySelector<HTMLButtonElement>('.academy-clause-rail-hint')!;
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-clause-rail-hint-output')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenCalledWith({
            activityId: 'activity:l2-l08-sensei-clause-rail',
            supportKind: 'hint',
            choiceId: 'kyoto-photo:hint-1',
        });
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');
        controller.dispose();
    });

    it('restores every source row and hidden post-attempt state on a fresh replay', () => {
        const runtime = createAcademyActivityRuntime();
        const firstHost = document.createElement('main');
        const first = runtime.mount(model(), { replace(view) { firstHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(firstHost.querySelectorAll('.academy-clause-rail-round')).toHaveLength(4);
        first.dispose();

        const replayHost = document.createElement('main');
        const replay = runtime.mount(model(), { replace(view) { replayHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(replayHost.querySelectorAll('.academy-clause-rail-round')).toHaveLength(4);
        expect(replayHost.querySelectorAll('.academy-clause-rail-round[hidden]')).toHaveLength(0);
        expect(replayHost.querySelector('.academy-clause-rail-hint')).toBeNull();
        expect(replayHost.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        expect(replayHost.querySelector<HTMLButtonElement>('.academy-clause-rail-return')?.hidden).toBe(true);
        expect(replayHost.querySelectorAll('.academy-clause-rail-slot[data-empty]')).toHaveLength(4);
        replay.dispose();
    });

    it('keeps Lesson 27-33 ownership unique and hands the route from Shin to Felix in the glasshouse', async () => {
        const packages = [
            ['029-l2-l02.json', 'l2-l02', 29, 7011918],
            ['030-l2-l03.json', 'l2-l03', 30, 7011919],
            ['031-l2-l04.json', 'l2-l04', 31, 7011920],
            ['032-l2-l05.json', 'l2-l05', 32, 6974651],
            ['033-l2-l06.json', 'l2-l06', 33, 6974652],
            ['034-l2-l07.json', 'l2-l07', 34, 6974653],
            ['035-l2-l08.json', 'l2-l08', 35, 6974656],
        ] as const;
        const identities = packages.map(([filename]) => JSON.parse(readFileSync(
            path.resolve('public/academy/content/lessons', filename), 'utf8',
        )) as { id: string; order: number; identity: { moduleId: number } });
        expect(identities.map(identity => [identity.id, identity.order, identity.identity.moduleId]))
            .toEqual(packages.map(([, id, order, moduleId]) => [id, order, moduleId]));
        expect(new Set(identities.map(identity => identity.id)).size).toBe(7);
        expect(new Set(identities.map(identity => identity.order)).size).toBe(7);
        expect(new Set(identities.map(identity => identity.identity.moduleId)).size).toBe(7);

        const chapter = await loadLessonActivityChapter('l2-l08', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l08',
            canonicalEpisodeId: 's1e17-catwalk-clue',
            location: { en: 'Fictional glasshouse word walk' },
            host: { id: 'felix' },
            beats: [{ id: 'sensei-clause-rail', activity: { kind: 'academy-clause-rail' } }],
        });
        expect(chapter?.introduction.en).toContain('Shin');
        expect(chapter?.introduction.en).toContain('Felix');
        expect(chapter?.conclusion.en).toContain('fresh replay');
    });

    it('pins byte-identical mirrors, offline assets, and honest ledger claims', () => {
        const activity = model();
        const visual = activity.provenance.moodle.sourceSheet;
        const filename = path.basename(visual.url);
        const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l08', filename));
        const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l08', filename));
        expect(sha256File(path.resolve('public/academy/content/lessons/l2-l08', filename))).toBe(visual.sha256);
        expect(hosted).toEqual(source);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/035-l2-l08.json'), path.resolve('public/academy/content/lessons/035-l2-l08.json'))).toBe(true);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l08')).toMatchObject({
            moodleModuleId: 6974656,
            sourcePackage: { filename: '035-l2-l08.json', sha256: '99e60d70579c368a1611bdb6058bdd9e4ee0ccee350c8e0f25c8c4cffc4c22fd' },
            audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 2, sourceAudioTracksDelivered: 0 },
            claims: {
                sourcePromptsDelivered: 4,
                yomuDerivedCompletions: 4,
                clauseBoundaryAttachmentsAssessed: 4,
                sourceAnswerKeysExposed: 0,
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'fresh-remount-restores-all-four-source-rows',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/035-l2-l08.json'");
            expect(worker).toContain(`'${visual.url}'`);
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l08 / Chapter 22-1 modifying clauses`');
    });
});
