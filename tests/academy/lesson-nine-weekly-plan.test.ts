import { readFileSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/010-l1-l09.json';
import {
    createLessonNineWeeklyPlanBeat,
    createLessonNineWeeklyPlanModel,
} from '../../src/academy/content/lesson-nine-weekly-plan';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    weeklyPlanWorkbookPlugin,
    type WeeklyPlanAnswer,
    type WeeklyPlanRound,
    type WeeklyPlanWorkbookModel,
    type WeeklyPlanWorkbookResponse,
} from '../../src/academy/minigames/weekly-plan-workbook';

const runtime = createActivityRuntime([weeklyPlanWorkbookPlugin]);

function model(): WeeklyPlanWorkbookModel {
    return createLessonNineWeeklyPlanModel();
}

function answerFor(round: WeeklyPlanRound): WeeklyPlanAnswer {
    if (round.mode === 'weekday-pair') {
        return {
            mode: round.mode,
            roundId: round.id,
            tomorrowId: round.correctTomorrowId,
            yesterdayId: round.correctYesterdayId,
        };
    }
    if (round.mode === 'day-answer') {
        return {
            mode: round.mode,
            roundId: round.id,
            polarity: round.correctPolarity,
            dayId: round.correctDayId,
        };
    }
    return { mode: round.mode, roundId: round.id, value: round.acceptedAnswers[0] ?? '' };
}

function perfectResponse(): WeeklyPlanWorkbookResponse {
    return { answers: model().payload.rounds.map(answerFor) };
}

function fillForm(form: HTMLFormElement, activity: WeeklyPlanWorkbookModel): void {
    for (const round of activity.payload.rounds) {
        if (round.mode === 'weekday-pair') {
            const tomorrow = form.querySelector<HTMLSelectElement>(`select[name$="${round.id}-tomorrow"]`)!;
            const yesterday = form.querySelector<HTMLSelectElement>(`select[name$="${round.id}-yesterday"]`)!;
            tomorrow.value = round.correctTomorrowId;
            yesterday.value = round.correctYesterdayId;
        } else if (round.mode === 'day-answer') {
            if (round.correctPolarity !== 'none') {
                form.querySelector<HTMLInputElement>(
                    `input[name$="${round.id}-polarity"][value="${round.correctPolarity}"]`,
                )!.click();
            }
            form.querySelector<HTMLSelectElement>(`select[name$="${round.id}-day"]`)!.value = round.correctDayId;
        } else {
            form.querySelector<HTMLInputElement>(`input[name$="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!;
        }
    }
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 9 exact weekly-plan workbook', () => {
    it('pins the exact Moodle, Genki, and limited Minna source identities and fails closed on drift', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toEqual({
            packageId: 'l1-l09',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5889535,
                grammar: {
                    sourceId: 'moodle-payload:4c9419150055497b0771d56b98eccfadbdf10a7506293090701312eeebf3b306',
                    payloadSha256: '4c9419150055497b0771d56b98eccfadbdf10a7506293090701312eeebf3b306',
                    sourceTitle: 'New Chapter 4-2 days and weekly plans desu conjugation Grammar Exercise',
                    member: 'Handouts/New Chapter 4-2_days and weekly plans_desu conjugation_Grammar Exercise.pdf',
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2],
                },
            },
            genki: {
                taskId: 'genki-2e:l1-l09:lesson-4-workbook-3',
                sourceId: 'japanese-genki-interactive:d4193e4a18bfef9dc69c58656759405b1fe013fc5d9d4599d3c74a9cd7fe7569:generateQuiz',
                relativePath: 'lessons/lesson-4/workbook-3/index.html',
                payloadSha256: 'd4193e4a18bfef9dc69c58656759405b1fe013fc5d9d4599d3c74a9cd7fe7569',
                scriptSha256: '8a377ce898a0067131d5b8345e88b20f229508435e1265f8b739deb6e469eb0b',
                lineLocus: { start: 76, end: 130 },
                engine: 'Genki.generateQuiz',
                sourceType: 'fill',
            },
            minna: {
                sourceId: 'minna-i:66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229:lesson-4',
                reference: 'Minna no Nihongo I, Lesson 4',
                title: 'Minna no Nihongo 2nd Edition Shokyu I',
                author: '3A Network',
                payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
                pageCount: 326,
                pdfPages: [55, 56, 57],
                printedPages: [35, 36, 37],
                relation: 'verified-sequence-and-page-55-model-only',
            },
        });

        const moodleDrift = structuredClone(activity);
        (moodleDrift.provenance.moodle.grammar as { payloadSha256: string }).payloadSha256 = '0'.repeat(64);
        expect(runtime.validate(moodleDrift)).toContainEqual(expect.objectContaining({ path: 'provenance.moodle' }));
        const genkiDrift = structuredClone(activity);
        (genkiDrift.provenance.genki as { scriptSha256: string }).scriptSha256 = '0'.repeat(64);
        expect(runtime.validate(genkiDrift)).toContainEqual(expect.objectContaining({ path: 'provenance.genki' }));
        const minnaDrift = structuredClone(activity);
        (minnaDrift.provenance.minna as unknown as { relation: string }).relation = 'verbatim-reuse';
        expect(runtime.validate(minnaDrift)).toContainEqual(expect.objectContaining({ path: 'provenance.minna' }));
    });

    it('teaches first, preserves each source order, and never invents a new Minna locus', () => {
        const activity = model();
        expect(activity.payload.teaching.map(step => [step.sourceOrder, step.pattern, step.example])).toEqual([
            [1, 'Noun 1 は Noun 2 (day) です。', 'あさって は きんようび です。'],
            [2, 'non past: Noun です／じゃ ありません。 past: Noun でした／じゃ ありませんでした。', 'きのう は かようび でした。'],
            [3, 'question: Noun ですか／でしたか。', 'おととい は なんようび でしたか。— げつようび でした。'],
            [4, 'きょう は すいようび です。あした は もくようび ですか。', 'はい、もくようび です。'],
            [5, 'Noun は 何時から 何時までですか。', '銀行は 何時から 何時までですか。— 9時から 3時までです。'],
            [6, 'Complete the following problems using past tense nouns.', 'Yesterday was Sunday. — きのうは日曜日でした。'],
        ]);
        expect(activity.provenance.minna.relation).toBe('verified-sequence-and-page-55-model-only');
        expect(activity.payload.rounds.map(round => [round.sourceOrder, round.mode, round.sourceQuestionId])).toEqual([
            [1, 'weekday-pair', 'moodle:4c9419150055497b0771d56b98eccfadbdf10a7506293090701312eeebf3b306:p1:section-1:item-1'],
            [2, 'weekday-pair', 'moodle:4c9419150055497b0771d56b98eccfadbdf10a7506293090701312eeebf3b306:p1:section-1:item-2'],
            ...Array.from({ length: 5 }, (_, index) => [
                index + 3,
                'day-answer',
                `moodle:4c9419150055497b0771d56b98eccfadbdf10a7506293090701312eeebf3b306:p2:section-2:item-${index + 1}`,
            ]),
            ...Array.from({ length: 8 }, (_, index) => [
                index + 8,
                'typed-past',
                `genki-2e:l1-l09:lesson-4-workbook-3:slot-${index + 1}`,
            ]),
        ]);
        expect(activity.payload.rounds.slice(2, 7).map(round => round.answerExpression)).toEqual([
            'はい、げつようび です。',
            'はい、きんようび でした。',
            'かようび です。',
            'いいえ、にちようび です。',
            'いいえ、げつようび でした。',
        ]);
        const quizlet = lessonPackage.genkiInteractiveActivities[0]!.exactTask.config.quizlet;
        let cursor = -1;
        for (const round of activity.payload.rounds.filter(round => round.mode === 'typed-past')) {
            const marker = round.sourcePrompt.split('\n')[0]!;
            const next = quizlet.indexOf(marker, cursor + 1);
            expect(next).toBeGreaterThan(cursor);
            expect(round.acceptedAnswers[0]).toSatisfy((answer: string) => quizlet.includes(answer));
            cursor = next;
        }
    });

    it('grades all three modes, keeps partial score, and emits repair seeds only for missed items', () => {
        const passed = runtime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(15);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);
        const sourceVariants = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        for (const [index, round] of model().payload.rounds.entries()) {
            if (round.mode === 'typed-past') sourceVariants.answers[index]!.value = ` ${round.acceptedAnswers.at(-1)!}。 `;
        }
        expect(runtime.evaluate(model(), sourceVariants as unknown as WeeklyPlanWorkbookResponse).result.outcome).toBe('pass');

        const response = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        response.answers[0]!.tomorrowId = 'getsu';
        response.answers[5]!.polarity = 'hai';
        response.answers[13]!.value = 'きのうはげつようびでした';
        const lapsed = runtime.evaluate(model(), response as unknown as WeeklyPlanWorkbookResponse);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 12 / 15 });
        expect(lapsed.result.errorTags).toEqual([
            'l1-l09-weekly-plan-genki-7',
            'l1-l09-weekly-plan-monday-today',
            'l1-l09-weekly-plan-saturday-tomorrow',
        ]);
        expect(lapsed.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:l1-l09:weekly-plan:monday-today', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l09:weekly-plan:saturday-tomorrow', reason: 'repair' }),
            expect.objectContaining({ id: 'review:l1-l09:weekly-plan:genki-7', reason: 'repair' }),
        ]);
    });

    it('rejects missing, duplicate, wrong-mode, unknown-option, wrong-polarity-shape, and blank typed answers', () => {
        expect(() => runtime.evaluate(model(), { answers: [] })).toThrow('Every exact Lesson 9 source item');
        const duplicate = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        duplicate.answers[1] = duplicate.answers[0]!;
        expect(() => runtime.evaluate(model(), duplicate as unknown as WeeklyPlanWorkbookResponse)).toThrow('each exact source item once');
        const wrongMode = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        wrongMode.answers[0]!.mode = 'typed-past';
        expect(() => runtime.evaluate(model(), wrongMode as unknown as WeeklyPlanWorkbookResponse)).toThrow('interaction mode');
        const unknown = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        unknown.answers[0]!.tomorrowId = 'unknown';
        expect(() => runtime.evaluate(model(), unknown as unknown as WeeklyPlanWorkbookResponse)).toThrow('offered weekdays');
        const wrongPolarity = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        wrongPolarity.answers[4]!.polarity = 'hai';
        expect(() => runtime.evaluate(model(), wrongPolarity as unknown as WeeklyPlanWorkbookResponse)).toThrow('offered polarity');
        const blank = structuredClone(perfectResponse()) as unknown as { answers: Array<Record<string, string>> };
        blank.answers[7]!.value = '   ';
        expect(() => runtime.evaluate(model(), blank as unknown as WeeklyPlanWorkbookResponse)).toThrow('non-empty typed answer');
    });

    it('gates controls behind teaching, gives progressive hints, then repairs only missed rounds before passing', async () => {
        const activity = model();
        const hostElement = document.createElement('main');
        const evaluations: Array<{ outcome: string; errorTags: readonly string[] }> = [];
        const controller = runtime.mount(activity, {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce() {},
        }, evaluation => { evaluations.push(evaluation.result); });
        document.body.append(hostElement);

        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.querySelector('[data-lesson-phase="assessment"]')).toBeNull();
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        expect(hostElement.textContent).not.toContain('いいえ、げつようび でした。');
        hostElement.querySelector<HTMLButtonElement>('.academy-weekly-plan-start')!.click();

        const form = hostElement.querySelector<HTMLFormElement>('form')!;
        expect(form.querySelectorAll('fieldset.academy-weekly-plan-round')).toHaveLength(15);
        expect(form.querySelectorAll('select')).toHaveLength(9);
        expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(8);
        expect(form.querySelectorAll('input[type="text"]')).toHaveLength(8);
        expect(form.querySelectorAll('.academy-weekly-plan-hint')).toHaveLength(15);
        expect(form.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();

        const firstHint = form.querySelector<HTMLButtonElement>('.academy-weekly-plan-hint')!;
        firstHint.click();
        expect(form.querySelector('.academy-weekly-plan-hint-output')?.textContent).toContain('one day later');
        expect(firstHint.textContent).toBe('Next hint');
        firstHint.click();
        expect(firstHint.disabled).toBe(true);
        expect(form.querySelector('.academy-weekly-plan-hint-output')?.textContent).toContain('cycle');
        expect(form.textContent).not.toContain('あした は かようび です。きのう は にちようび でした。');

        fillForm(form, activity);
        form.querySelector<HTMLSelectElement>('select[name$="monday-today-tomorrow"]')!.value = 'getsu';
        form.querySelector<HTMLInputElement>('input[name$="genki-7-value"]')!.value = 'きのうはげつようびでした';
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(form.dataset.outcome).toBe('lapse'));

        const visibleRounds = [...form.querySelectorAll<HTMLFieldSetElement>('.academy-weekly-plan-round')]
            .filter(round => !round.hidden);
        expect(visibleRounds.map(round => round.dataset.roundId)).toEqual([
            'monday-today', 'genki-7',
        ]);
        expect([...form.querySelectorAll<HTMLElement>('.academy-weekly-plan-group')]
            .filter(group => !group.hidden)).toHaveLength(2);
        expect(form.querySelector<HTMLButtonElement>('.academy-weekly-plan-check')?.textContent).toBe('Check 2 repaired answers');

        form.querySelector<HTMLSelectElement>('select[name$="monday-today-tomorrow"]')!.value = 'ka';
        form.querySelector<HTMLInputElement>('input[name$="genki-7-value"]')!.value = 'きのうは日曜日でした';
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(2));
        expect(evaluations[1]).toMatchObject({ outcome: 'pass', errorTags: [] });
        await vi.waitFor(() => expect(form.dataset.outcome).toBe('pass'));
        controller.dispose();
    });

    it('wraps the activity as one beat and keeps mobile, touch-target, and reduced-motion contracts', () => {
        expect(createLessonNineWeeklyPlanBeat()).toMatchObject({
            id: 'weekly-plan-workbook',
            activity: {
                id: 'activity:l1-l09-weekly-plan-workbook',
                kind: 'academy-weekly-plan-workbook',
            },
        });
        const css = readFileSync(path.resolve('src/academy/minigames/weekly-plan-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*grid-template-columns:\s*1fr/);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
