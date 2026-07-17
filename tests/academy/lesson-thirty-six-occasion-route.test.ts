import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtySixOccasionRouteBeat } from '../../src/academy/content/lesson-thirty-six-occasion-route';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { occasionRoutePlugin, type OccasionRouteModel } from '../../src/academy/minigames/occasion-route';

const SOURCE_PAYLOAD_SHA256 = 'f3c29a4d4a9ffd140494c10a8908de1f09aa6387f2172ab8edd65749fd1b3533';
const SOURCE_VISUAL_SHA256 = 'ad277c6188de6603a9cd2fcb3ba33263dd12ddf88340f9c3b79c71bc585fd890';

function model(): OccasionRouteModel {
    return createLessonThirtySixOccasionRouteBeat().activity as OccasionRouteModel;
}

function correctRoutes(activity: OccasionRouteModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, mode: round.correctMode }));
}

function runtime() {
    return createActivityRuntime([occasionRoutePlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 36 Sensei Chapter 23-1 occasion route', () => {
    it('claims the exact next package and preserves verbatim teaching and task 1-1 prompts', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l11-sensei-occasion-route',
            kind: 'academy-occasion-route',
            responseKind: 'moodle-chapter-23-occasion-route',
            provenance: {
                packageId: 'l2-l11',
                packageOrder: 38,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974661,
                    answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts',
                    media: { status: 'no-audio-members-in-package', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo I · Lessons 20, 23 and 25', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · L17', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching[0]).toEqual({
            title: 'Basic sentence:',
            text: 'Verb dictionary- form とき、〜。\nVerb ない- form とき、〜。\nい adjective 〜い とき、〜。\nな adjective 〜な とき、〜。\nNoun の とき、〜。\n(when…/at that occasion)\n↑ after とき is main clause',
        });
        expect(activity.payload.teaching[1]?.text).toBe('とき is used to connect two sentences while expressing a time or occasion when the state or action described in the main sentence exists or occurs. The form of the word preceding とき is the same as the form that modifies a noun.\n*The tense of the clause modifying とき is NOT affected by the tense of the main clause.');
        expect(activity.payload.teaching[2]?.text.split('\n')).toHaveLength(11);
        expect(activity.payload.taskHeading).toBe('1-1: Using 〜とき, change the sentences to one sentence.');
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '1) 病院へ 行きます・保険証を 忘れないで ください →',
            '2) 出かけます・いつも 傘を 持って 行きます →',
            '3) 漢字が わかりません・この 辞書を 使います →',
            '4) 時間が ありません・朝ごはんを 食べません →',
        ]);
        expect(activity.payload.rounds.map(round => round.answerExpression)).toEqual([
            '病院へ 行くとき、保険証を 忘れないで ください。',
            '出かけるとき、いつも 傘を 持って 行きます。',
            '漢字が わからないとき、この 辞書を 使います。',
            '時間が ないとき、朝ごはんを 食べません。',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([1, 2, 3, 4].map(item =>
            `moodle:6974661:${SOURCE_PAYLOAD_SHA256}:pdf-p1:task-1-1:q${item}`));
    });

    it('grades the affirmative/negative route and seeds only missed rows for repair', () => {
        const activity = model();
        const activityRuntime = runtime();
        expect(activityRuntime.evaluate(activity, { routes: correctRoutes(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = activityRuntime.evaluate(activity, {
            routes: correctRoutes(activity).map((route, index) => index === 2
                ? { ...route, mode: 'affirmative' as const }
                : route),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 3 / 4,
            errorTags: ['l2-l11-occasion-route-3'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:6974661:${SOURCE_PAYLOAD_SHA256}:pdf-p1:task-1-1:q3`,
        ]);
    });

    it('teaches before assessment, gates answers, bounds hints, repairs missed rows, and replays', async () => {
        const activity = model();
        const host = document.createElement('main');
        const supportUse = vi.fn();
        const announce = vi.fn();
        const evaluations: unknown[] = [];
        const controller = runtime().mount(activity, {
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
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-occasion-route-return')!;
        const replayButton = host.querySelector<HTMLButtonElement>('.academy-occasion-route-replay')!;
        expect(teaching.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.querySelectorAll('img')).toHaveLength(1);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('.academy-occasion-route-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            const mode = index === 0 ? 'negative' : round.correctMode;
            row.querySelector<HTMLInputElement>(`input[value="${mode}"]`)!.checked = true;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(host.querySelectorAll<HTMLElement>('.academy-occasion-route-round:not([hidden])')).toHaveLength(1);

        const hint = host.querySelector<HTMLButtonElement>('.academy-occasion-route-hint')!;
        hint.click();
        hint.click();
        hint.click();
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-occasion-route-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l2-l11-sensei-occasion-route',
            supportKind: 'hint',
            choiceId: 'hospital-card:hint-3',
        });
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');

        replayButton.click();
        expect(host.querySelectorAll('.academy-occasion-route-round[hidden]')).toHaveLength(0);
        expect(host.querySelector('.academy-occasion-route-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        controller.dispose();
    });

    it('restores all rows on remount and records the Onke-to-Rie station handoff in the chapter catalog', () => {
        const activityRuntime = runtime();
        for (let index = 0; index < 2; index += 1) {
            const host = document.createElement('main');
            const controller = activityRuntime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, () => {});
            expect(host.querySelectorAll('.academy-occasion-route-round')).toHaveLength(4);
            expect(host.querySelectorAll('.academy-occasion-route-round[hidden]')).toHaveLength(0);
            expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
            controller.dispose();
        }

        const beat = createLessonThirtySixOccasionRouteBeat();
        expect(beat.narrative.en).toContain('Onke');
        expect(beat.narrative.en).toContain('Rie');
        expect(beat.narrative.en).toContain('station concourse');
        const catalog = readFileSync(path.resolve('src/academy/content/lesson-activity-catalog.ts'), 'utf8');
        expect(catalog).toContain("case 'l2-l11':");
        expect(catalog).toContain("chapter('l2-l11', 's1e16-the-night-the-map-went-dark', 'rie'");
        expect(catalog).toContain('fresh replay of all four routes remain open');
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
        expect(owners).toEqual([{ filename: '038-l2-l11.json', id: 'l2-l11', order: 38 }]);

        const visual = model().provenance.moodle.sourceSheets[0];
        const filename = path.basename(visual.url);
        const sourceImage = readFileSync(path.resolve('public/academy/content/lessons/l2-l11', filename));
        const hostedImage = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l11', filename));
        expect(createHash('sha256').update(sourceImage).digest('hex')).toBe(SOURCE_VISUAL_SHA256);
        expect(hostedImage).toEqual(sourceImage);
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/038-l2-l11.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('56e2fcdb5952819c2a3958121d23cdd3e75fd8c8eec0a6593165ae990be3dfd6');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/038-l2-l11.json'))).toEqual(sourcePackage);
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l11')).toMatchObject({
            moodleModuleId: 6974661,
            sourcePackage: { filename: '038-l2-l11.json', sha256: '56e2fcdb5952819c2a3958121d23cdd3e75fd8c8eec0a6593165ae990be3dfd6' },
            audio: { status: 'no-audio-members-in-exact-package', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
            claims: {
                sourcePromptsDelivered: 4,
                yomuDerivedCompletions: 4,
                affirmativeNegativeRoutesAssessed: 4,
                sourceAnswerKeysExposed: 0,
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-all-four-source-rows',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/038-l2-l11.json'");
            expect(worker).toContain(`'${visual.url}'`);
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l11 / New Chapter 23-1 〜とき`');
    });
});
