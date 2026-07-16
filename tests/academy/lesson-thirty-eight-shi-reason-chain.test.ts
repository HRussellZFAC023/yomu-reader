import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyEightShiReasonChainBeat } from '../../src/academy/content/lesson-thirty-eight-shi-reason-chain';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { reasonChainPlugin, type ReasonChainModel } from '../../src/academy/minigames/reason-chain';

const SOURCE_PAYLOAD_SHA256 = 'f04f3f4e3e7fa483f5fa8f5fedc5a33c3d3be2b48eaa028de084b7c137362125';
const SOURCE_VISUAL_SHA256 = [
    '4327dd0ab969ee7b0cb96673ae4d3d3cc497d76da2e4461bec2883e07b991f5d',
    '5295e4d4ec26ab038abd880747cb0f46daba60cda3c0cc8ac1ce25fd62b95cc2',
] as const;

function model(): ReasonChainModel {
    return createLessonThirtyEightShiReasonChainBeat().activity as ReasonChainModel;
}

function correctAnswers(activity: ReasonChainModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([reasonChainPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 38 Sensei Chapter 28-2 shi reason chain', () => {
    it('claims exact order 40 and preserves both teaching uses plus all eight source prompts', () => {
        const activity = model();
        expect(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind)).toContain('academy-reason-chain');
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l13-sensei-shi-reason-chain',
            kind: 'academy-reason-chain',
            responseKind: 'moodle-chapter-28-shi-varied-chain',
            provenance: {
                packageId: 'l2-l13',
                packageOrder: 40,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121266,
                    archiveId: 'archive-000092',
                    answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts',
                    media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 5, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 28', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Listing reasons and soft refusal', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching.map(step => step.text)).toEqual(expect.arrayContaining([
            'verb/adj/noun Plain-form し、 verb/adj/noun Plain-form し、〜。',
            'This sentence pattern is used when mentioning two or more similar things once after the other about the topic. In examples, the things mentioned are similar because they are all accomplishments.',
            'Since the sentence pattern expresses the speaker’s desire to mention more than just one thing about the topic, も is also often used instead of が. それに can also be used to make this meaning even clearer.',
            'This sentence pattern is also be used when 〜し、〜し part gives the reasons for what follows.\nそれで can also be used to make this meaning even clearer.\nNote. the conclusion may be omitted if it is obvious, leaving only reasons.',
        ]));
        expect(activity.payload.taskHeadings).toEqual([
            '1: please connect the phrases using 〜し、〜し.',
            '2: please connect the phrases using 〜し、〜し, then telling the conclusions.',
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '1）北海道は 涼しいです・景色が きれいです・食べ物が おいしいです →',
            '2）あの 美容院は 上手です・速いです・安いです →',
            '3）新しい 台所は きれいです・広いです・便利です →',
            '4）この 車は 形が いいです・色が きれいです・値段が そんなに 高くないです →',
            '1）この 店は 安いです・品物が 多いです・いつも ここで 買い物して います →',
            '2）あしたは 休みです・用事が ありません・うちで ゆっくり 映画を 見ます →',
            '3）デザインが すてきです・サイズが ちょうど いいです・この 靴を 買います →',
            '4）この マンションは 景色が すばらしいです・ペットが 飼えます・よく 売れて います →',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'plain-form-select', 'plain-form-select', 'plain-form-select',
            'reason-order-choice', 'reason-order-choice', 'reason-order-choice',
            'typed-chain', 'typed-chain',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([
            ...[1, 2, 3, 4].map(item => `moodle:8121266:${SOURCE_PAYLOAD_SHA256}:pdf-p1:task-1:q${item}`),
            ...[1, 2, 3, 4].map(item => `moodle:8121266:${SOURCE_PAYLOAD_SHA256}:pdf-p2:task-2:q${item}`),
        ]);
    });

    it('grades all interaction modes and seeds only missed source rows for repair', () => {
        const activity = model();
        const activityRuntime = runtime();
        expect(activityRuntime.evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = activityRuntime.evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: 'デザインがすてきです。サイズがちょうどいいです。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l13-shi-chain-7'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:8121266:${SOURCE_PAYLOAD_SHA256}:pdf-p2:task-2:q3`,
        ]);
    });

    it('teaches before assessment, gates answers, repairs one miss, bounds hints, returns, and replays', async () => {
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

        const teaching = host.querySelector<HTMLElement>('.academy-reason-chain-teaching')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-reason-chain-return')!;
        const replayButton = host.querySelector<HTMLButtonElement>('.academy-reason-chain-replay')!;
        expect(teaching.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-reason-chain-sources img')).toHaveLength(2);
        expect(host.querySelectorAll('.academy-reason-chain-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(3);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(2);
        expect(key.hidden).toBe(true);
        expect(key.dataset.answerVisibility).toBe('after-attempt');

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            if (round.interaction === 'plain-form-select') {
                row.querySelector<HTMLSelectElement>('select')!.value = index === 0 ? round.options[1]!.value : round.answerValue;
            } else if (round.interaction === 'reason-order-choice') {
                row.querySelector<HTMLInputElement>(`input[value="${round.answerValue}"]`)!.checked = true;
            } else {
                row.querySelector<HTMLInputElement>('input[type="text"]')!.value = round.answerValue;
            }
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse']));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(host.querySelectorAll<HTMLElement>('.academy-reason-chain-round:not([hidden])')).toHaveLength(1);

        const hint = host.querySelector<HTMLButtonElement>('.academy-reason-chain-hint')!;
        hint.click();
        hint.click();
        hint.click();
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-reason-chain-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l2-l13-sensei-shi-reason-chain',
            supportKind: 'hint',
            choiceId: 'hokkaido:hint-3',
        });
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');

        host.querySelector<HTMLSelectElement>('[data-round-id="hokkaido"] select')!.value = activity.payload.rounds[0]!.answerValue;
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse', 'pass']));
        await vi.waitFor(() => expect(host.querySelector<HTMLElement>('.academy-reason-chain')?.dataset.outcome).toBe('pass'));

        replayButton.click();
        expect(host.querySelectorAll('.academy-reason-chain-round[hidden]')).toHaveLength(0);
        expect(host.querySelector('.academy-reason-chain-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        expect([...form.querySelectorAll<HTMLInputElement>('input[type="text"]')].map(input => input.value)).toEqual(['', '']);
        controller.dispose();
    });

    it('restores all rows on remount and continues the Aakash-to-Robert handoff', () => {
        const activityRuntime = runtime();
        for (let index = 0; index < 2; index += 1) {
            const host = document.createElement('main');
            const controller = activityRuntime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, () => {});
            expect(host.querySelectorAll('.academy-reason-chain-round')).toHaveLength(8);
            expect(host.querySelectorAll('.academy-reason-chain-round[hidden]')).toHaveLength(0);
            expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
            controller.dispose();
        }

        const beat = createLessonThirtyEightShiReasonChainBeat();
        expect(beat.narrative.en).toContain('Aakash');
        expect(beat.narrative.en).toContain('Robert');
        expect(beat.narrative.en).toContain('cafe');
        const catalog = readFileSync(path.resolve('src/academy/content/lesson-activity-catalog.ts'), 'utf8');
        expect(catalog).toContain("case 'l2-l13':");
        expect(catalog).toContain("chapter('l2-l13', 's1e06-invitation-chain', 'robert'");
        expect(catalog).toContain('fresh replay of all eight chains');
    });

    it('pins unique source ownership, exact mirrors, offline assets, and honest lesson ledgers', () => {
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
        expect(owners).toEqual([{ filename: '040-l2-l13.json', id: 'l2-l13', order: 40 }]);

        model().provenance.moodle.sourceSheets.forEach((visual, index) => {
            const filename = path.basename(visual.url);
            const sourceImage = readFileSync(path.resolve('public/academy/content/lessons/l2-l13', filename));
            const hostedImage = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l13', filename));
            expect(createHash('sha256').update(sourceImage).digest('hex')).toBe(SOURCE_VISUAL_SHA256[index]);
            expect(hostedImage).toEqual(sourceImage);
        });
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/040-l2-l13.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('7fd25568ae5a57f7ce553fedce51594edbea77c6360efaa92f8492a61af5bcfe');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/040-l2-l13.json'))).toEqual(sourcePackage);
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l13')).toMatchObject({
            moodleModuleId: 8121266,
            sourcePackage: { filename: '040-l2-l13.json', sha256: '7fd25568ae5a57f7ce553fedce51594edbea77c6360efaa92f8492a61af5bcfe' },
            sourceArchive: { id: 'archive-000092', sha256: 'f1ce9163abbe23a99c1e0fbe29973c8f3f68630cc6cbcd872a6e91ea75fe4217' },
            audio: { status: 'a11-reviewed-packaged-static-four-members-quarantined', sourceAudioMembers: 5, sourceAudioTracksDelivered: 1 },
            claims: {
                sourcePromptsDelivered: 15,
                yomuDerivedCompletions: 8,
                interactionModesAssessed: ['plain-form-select', 'reason-order-choice', 'typed-chain', 'meal-survey-choice', 'meal-survey-text'],
                sourceAnswerKeysExposed: 0,
                repairScope: 'missed-source-shi-chains-or-a11-items-only',
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-all-eight-reason-rows-or-seven-a11-items',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/040-l2-l13.json'");
            model().provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l13 / Chapter 28-2 〜し、〜し`');
    });
});
