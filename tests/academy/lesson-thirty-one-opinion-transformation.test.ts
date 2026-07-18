import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyOneOpinionTransformationBeat } from '../../src/academy/content/lesson-thirty-one-opinion-transformation';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type OpinionTransformationModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): OpinionTransformationModel {
    return createLessonThirtyOneOpinionTransformationBeat().activity as OpinionTransformationModel;
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 31 Sensei Chapter 21 opinion transformation', () => {
    it('claims the unique l2-l06 package and retains all five verbatim source prompts in order', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l06-sensei-opinion-transformation',
            kind: 'academy-opinion-transformation',
            responseKind: 'moodle-chapter-21-opinion-transformation',
            provenance: {
                packageId: 'l2-l06',
                packageOrder: 33,
                moodle: {
                    moduleId: 6974652,
                    answerKeyBasis: 'yomu-derived-plain-form-transformations-over-verbatim-source-prompts',
                    audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 2, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo I, Lesson 21', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: 'none-verified', reuse: 'none' },
                },
            },
        });
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            'ミラーさんは 9時に 来ます。→',
            'マリアさんは 運転しません。→',
            'あのパブは 人が 多いです。→',
            'あのレストランは 静かです。→',
            'あしたは 雪です。→',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            'ミラーさんは 9時に 来ると 思います。',
            'マリアさんは 運転しないと 思います。',
            'あのパブは 人が 多いと 思います。',
            'あのレストランは 静かだと 思います。',
            'あしたは 雪だと 思います。',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
    });

    it('requires all five derived transformations and schedules only missed rows for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerExpression })),
        });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(activity.payload.rounds.map(round => round.answerExpression));

        const repair = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map((round, index) => ({
                roundId: round.id,
                value: index === 3 ? 'あのレストランは 静かと 思います。' : round.answerExpression,
            })),
        });
        expect(repair.result).toMatchObject({
            outcome: 'lapse',
            score: 4 / 5,
            errorTags: ['l2-l06-opinion-transformation-4'],
        });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6974652:837cd9f8468d50c09902520d196089dc84ee4d435a5e1b7b654c346e9e9d701f:pdf-p2:supposition:q4',
        ]);
    });

    it('teaches and shows source pages before testing, then earns scoped hints only after a lapse', async () => {
        const activity = model();
        const host = document.createElement('main');
        const supportUse = vi.fn();
        const evaluations: unknown[] = [];
        const controller = createAcademyActivityRuntime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
            recordSupportUse: supportUse,
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const sources = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect([...sources.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual([
            '/academy/content/lessons/l2-l06/moodle-chapter-21-1-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l06/moodle-chapter-21-opinion-teaching-page-1.png',
            '/academy/content/lessons/l2-l06/moodle-chapter-21-opinion-task-page-2.png',
        ]);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('.academy-opinion-transformation-hint')).toBeNull();
        expect(key.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            host.querySelector<HTMLInputElement>(`[data-round-id="${round.id}"] input`)!.value = index === 1
                ? 'マリアさんは 運転しませんと 思います。'
                : round.answerExpression;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(host.querySelectorAll<HTMLElement>('.academy-opinion-transformation-round:not([hidden])')).toHaveLength(1);
        const hint = host.querySelector<HTMLButtonElement>('.academy-opinion-transformation-hint')!;
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-opinion-transformation-hint-output')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenCalledWith({
            activityId: 'activity:l2-l06-sensei-opinion-transformation',
            supportKind: 'hint',
            choiceId: 'maria-does-not-drive:hint-1',
        });
        controller.dispose();
    });

    it('restores every source row and hidden answer state on a fresh revisit', () => {
        const firstHost = document.createElement('main');
        const runtime = createAcademyActivityRuntime();
        const first = runtime.mount(model(), { replace(view) { firstHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(firstHost.querySelectorAll('.academy-opinion-transformation-round')).toHaveLength(5);
        first.dispose();

        const revisitedHost = document.createElement('main');
        const revisited = runtime.mount(model(), { replace(view) { revisitedHost.replaceChildren(view); }, announce() {} }, () => {});
        expect(revisitedHost.querySelectorAll('.academy-opinion-transformation-round')).toHaveLength(5);
        expect(revisitedHost.querySelectorAll('.academy-opinion-transformation-round[hidden]')).toHaveLength(0);
        expect(revisitedHost.querySelector('.academy-opinion-transformation-hint')).toBeNull();
        expect(revisitedHost.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        revisited.dispose();
    });

    it('keeps Lesson 27-31 package, order, and module ownership unique and routes Lesson 31 to Shin', async () => {
        const packages = [
            ['029-l2-l02.json', 'l2-l02', 29, 7011918],
            ['030-l2-l03.json', 'l2-l03', 30, 7011919],
            ['031-l2-l04.json', 'l2-l04', 31, 7011920],
            ['032-l2-l05.json', 'l2-l05', 32, 6974651],
            ['033-l2-l06.json', 'l2-l06', 33, 6974652],
        ] as const;
        const identities = packages.map(([filename]) => JSON.parse(readFileSync(
            path.resolve('public/academy/content/lessons', filename), 'utf8',
        )) as { id: string; order: number; identity: { moduleId: number } });
        expect(identities.map(identity => [identity.id, identity.order, identity.identity.moduleId]))
            .toEqual(packages.map(([, id, order, moduleId]) => [id, order, moduleId]));
        expect(new Set(identities.map(identity => identity.id)).size).toBe(5);
        expect(new Set(identities.map(identity => identity.order)).size).toBe(5);
        expect(new Set(identities.map(identity => identity.identity.moduleId)).size).toBe(5);

        const chapter = await loadLessonActivityChapter('l2-l06', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l06',
            host: { id: 'shin' },
            beats: [
                { id: 'sensei-opinion-transformation', activity: { kind: 'academy-opinion-transformation' } },
                { id: 'sensei-minna-072-conversation', activity: { kind: 'academy-conversation-listening-check' } },
            ],
        });
    });

    it('pins byte-identical public mirrors, offline assets, and honest resource-ledger claims', () => {
        const activity = model();
        const visuals = [
            activity.provenance.moodle.vocabularySheet,
            activity.provenance.moodle.teachingSheet,
            activity.provenance.moodle.taskSheet,
        ];
        for (const visual of visuals) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l06', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l06', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l06', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l06')).toMatchObject({
            moodleModuleId: 6974652,
            sourcePackage: { filename: '033-l2-l06.json', sha256: 'f511c246dd35cc6b13486b0b96bb048bfe23a41cca5a61f5272f9bb0ca6a5b38' },
            audio: { status: 'minna-072-exact-worksheet-pairing-audio-reviewed', sourceAudioMembers: 2, sourceAudioTracksDelivered: 1 },
            claims: {
                sourcePromptsDelivered: 9,
                yomuDerivedCompletions: 5,
                sourceAnswerKeysExposed: 0,
                earnedHintsPerMissedRow: 3,
                revisitability: 'fresh-remount-restores-all-five-source-rows',
            },
        });
        const workers = [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ];
        workers.forEach(worker => visuals.forEach(visual => expect(worker).toContain(`'${visual.url}'`)));
    });
});
