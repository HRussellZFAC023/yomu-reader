import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonTenDailyRoutineWorkbookBeat,
    createLessonTenDailyRoutineWorkbookModel,
    createLessonTenSourceVocabularyActivities,
} from '../../src/academy/content/lesson-ten-daily-routine';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    dailyRoutineWorkbookPlugin,
    type DailyRoutineAnswer,
    type DailyRoutineRound,
    type DailyRoutineWorkbookResponse,
} from '../../src/academy/minigames/daily-routine-workbook';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';

const runtime = createActivityRuntime([dailyRoutineWorkbookPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

afterEach(() => document.body.replaceChildren());

describe('Lesson 10 source daily-routine workbook', () => {
    it('preserves all 13 Moodle vocabulary rows in exact source order', () => {
        const rows = createLessonTenSourceVocabularyActivities();
        expect(rows).toHaveLength(13);
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows.map(row => row.provenance.locus)).toEqual(
            Array.from({ length: 13 }, (_, index) => ({ page: 1, row: index + 1 })),
        );
        expect(rows.map(row => row.payload.exact.words)).toEqual([
            'けさ', 'こんばん', 'まいあさ', 'まいにち', 'まいばん', 'おきます', 'ねます',
            'はたらきます', 'やすみます', 'べんきょうします', 'おわります', '〜に',
            '〜ます／ません／ました／ませんでした',
        ]);
        expect(rows[11]?.payload.exact).toEqual({
            words: '〜に', pronunciation: 'ni', meaning: 'The particle に after time means ‘at’.',
        });
    });

    it('binds exact Moodle, Minna, and Genki provenance and teaches before testing', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l10',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 5907552,
                verbSummary: { payloadSha256: 'fd4826082b3e5ec89453bce677937f10240ca5e76325b4ca7fc3806f0914dfad' },
                grammarCheck: { payloadSha256: 'e1a72f416713d5ba430b8e3e97aecd39d03a2da53f0c8baf136d34c16fd3f20a' },
            },
            minna: {
                payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
                pdfPage: 55,
                printedPage: 35,
                exercise: 'Practice B, exercise 5',
            },
            genki: {
                payloadSha256: 'cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f',
                scriptSha256: 'de7d3beedd2565ba6db123561567c56661c3fed66b859ac6772c3edca457ac85',
                lineLocus: { start: 76, end: 125 },
            },
        });
        expect(activity.payload.teaching.map(step => [step.pattern, step.example])).toEqual([
            ['Vます → Vません → Vました → Vませんでした',
                'はたらきます／はたらきません／はたらきました／はたらきませんでした'],
            ['time expression → tense → verb ending', 'まいにち はたらきます。／きのう はたらきました。'],
            ['毎朝 何時に 起きますか。', '7時に 起きます。'],
            ['person + frequency + time に + place + verb', 'メアリーさんはまいにちろくじにおきます。'],
        ]);
    });

    it('keeps all 21 source items verbatim and in Moodle, Minna, then Genki order', () => {
        const rounds = model().payload.rounds;
        expect(rounds.map(round => round.sourceOrder)).toEqual(Array.from({ length: 21 }, (_, index) => index + 1));
        expect(rounds.map(round => round.mode)).toEqual([
            ...Array(5).fill('tense-choice'),
            ...Array(4).fill('short-answer'),
            ...Array(4).fill('routine-time'),
            ...Array(8).fill('sentence'),
        ]);
        expect(rounds.slice(0, 5).map(round => round.sourcePrompt)).toEqual([
            '1）きのう 10じ に（ねます、ねました）。',
            '2）まいにち ひる 12じ から 1じ まで（やすみます、やすみました）。',
            '3）おととい の ばん 9じ から 11じ まで（べんきょうします、べんきょうしました）。',
            '4）まいあさ なんじに（おきます、おきました）か。',
            '5）あさって は にちようび です。（はたらきません、はたらきませんでした）。',
        ]);
        expect(rounds.slice(9, 13).map(round => round.sourcePrompt)).toEqual([
            '1）毎晩 →', '2）あした →', '3）今晩 →', '4）日曜日 →',
        ]);
        expect(rounds.slice(13).map(round => round.sourcePrompt)).toEqual([
            'every day/06:00/get up',
            'every day/08:30/go to college',
            'every day/12:00/eat lunch at school',
            'usually/at about 6:00/return home',
            'usually/at about 11:00/sleep',
            'I speak Japanese every day.',
            'I will not watch TV tonight.',
            'Mary does not come to school on Saturdays.',
        ]);
        expect(rounds.every(round => round.sourceQuestionId && round.sourceLabel)).toBe(true);
    });

    it('grades all four modes and emits repair seeds only for missed source items', () => {
        const passed = runtime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(21);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning' && seed.sourceQuestionId)).toBe(true);

        const response = structuredClone(perfectResponse()) as { answers: DailyRoutineAnswer[] };
        response.answers[0] = { mode: 'tense-choice', roundId: 'moodle-tense-yesterday-sleep', optionId: 'option-1' };
        response.answers[7] = { mode: 'short-answer', roundId: 'moodle-form-yesterday-study', value: 'べんきょうしません' };
        response.answers[11] = { mode: 'routine-time', roundId: 'minna-tonight', optionId: '10' };
        response.answers[19] = { mode: 'sentence', roundId: 'genki-not-watch-tonight', value: 'わたしはこんばんテレビをみました' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 17 / 21 });
        expect(lapsed.result.errorTags).toEqual([
            'l1-l10-daily-routine-genki-not-watch-tonight',
            'l1-l10-daily-routine-minna-tonight',
            'l1-l10-daily-routine-moodle-form-yesterday-study',
            'l1-l10-daily-routine-moodle-tense-yesterday-sleep',
        ]);
        expect(lapsed.reviewSeeds.map(seed => seed.id)).toEqual([
            'review:l1-l10:daily-routine:moodle-tense-yesterday-sleep',
            'review:l1-l10:daily-routine:moodle-form-yesterday-study',
            'review:l1-l10:daily-routine:minna-tonight',
            'review:l1-l10:daily-routine:genki-not-watch-tonight',
        ]);
        expect(lapsed.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
    });

    it('accepts source kanji variants and rejects incomplete, duplicate, or wrong-mode responses', () => {
        const response = structuredClone(perfectResponse()) as { answers: DailyRoutineAnswer[] };
        response.answers[13] = {
            mode: 'sentence', roundId: 'genki-every-day-six', value: 'メアリーさんは毎日六時に起きます。',
        };
        expect(runtime.evaluate(model(), response).result.outcome).toBe('pass');
        expect(() => runtime.evaluate(model(), { answers: [] })).toThrow('Every exact Lesson 10 source item');
        const duplicate = structuredClone(perfectResponse()) as { answers: DailyRoutineAnswer[] };
        duplicate.answers[1] = duplicate.answers[0]!;
        expect(() => runtime.evaluate(model(), duplicate)).toThrow('every source item once');
        const wrongMode = structuredClone(perfectResponse()) as { answers: DailyRoutineAnswer[] };
        wrongMode.answers[0] = { mode: 'sentence', roundId: 'moodle-tense-yesterday-sleep', value: 'ねました' };
        expect(() => runtime.evaluate(model(), wrongMode)).toThrow('interaction mode');
    });

    it('shows teaching first, then offers earned per-item hints and supports repair', async () => {
        const hostElement = document.createElement('main');
        const announcements: string[] = [];
        const supportUse = vi.fn();
        const evaluations: Array<ReturnType<typeof runtime.evaluate>> = [];
        const controller = runtime.mount(model(), {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce(message) { announcements.push(message); },
            recordSupportUse: supportUse,
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(hostElement);

        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.textContent).toContain('Learn the pattern first');
        expect(hostElement.textContent).toContain('Vます → Vません → Vました → Vませんでした');
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        hostElement.querySelector<HTMLButtonElement>('.academy-routine-continue')!.click();

        expect(hostElement.querySelector('[data-lesson-phase="assessment"]')).not.toBeNull();
        expect(hostElement.querySelectorAll('fieldset')).toHaveLength(21);
        expect(hostElement.querySelectorAll('select')).toHaveLength(9);
        expect(hostElement.querySelectorAll('input[type="text"]')).toHaveLength(12);
        expect(hostElement.querySelector('.academy-routine-hint-button')).toBeNull();
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('select')!.value = 'option-1';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));

        expect(evaluations[0]?.result.outcome).toBe('lapse');
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-routine-round-missed')).toHaveLength(1));
        const hintButton = hostElement.querySelector<HTMLButtonElement>('.academy-routine-hint-button')!;
        expect(hintButton).not.toBeNull();
        expect(hostElement.querySelector<HTMLElement>('.academy-routine-hint-panel')?.hidden).toBe(true);
        hintButton.click();
        expect(supportUse).toHaveBeenCalledWith({
            activityId: 'activity:l1-l10-source-daily-routine-workbook',
            supportKind: 'hint',
            choiceId: 'moodle-tense-yesterday-sleep',
        });
        expect(hostElement.querySelector<HTMLElement>('.academy-routine-hint-panel')?.hidden).toBe(false);
        expect(hostElement.textContent).toContain('きょう 10じに ねます。');

        hostElement.querySelector<HTMLSelectElement>('select')!.value = 'option-2';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(2));
        expect(evaluations[1]?.result.outcome).toBe('pass');
        await vi.waitFor(() => expect(hostElement.querySelector('.academy-routine-round-missed')).toBeNull());
        await vi.waitFor(() => expect(announcements.at(-1)).toContain('21 items'));
        controller.dispose();
    });

    it('wraps the workbook as a lesson beat and keeps mobile/accessibility CSS contracts', () => {
        expect(createLessonTenDailyRoutineWorkbookBeat()).toMatchObject({
            id: 'source-daily-routine-workbook',
            activity: {
                id: 'activity:l1-l10-source-daily-routine-workbook',
                kind: 'academy-daily-routine-workbook',
            },
        });
        const css = readFileSync(path.resolve('src/academy/minigames/daily-routine-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-routine-round-grid[\s\S]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});

function model() {
    return createLessonTenDailyRoutineWorkbookModel();
}

function perfectResponse(): DailyRoutineWorkbookResponse {
    return {
        answers: model().payload.rounds.map(round => answerFor(round)),
    };
}

function answerFor(round: DailyRoutineRound): DailyRoutineAnswer {
    if (round.mode === 'tense-choice' || round.mode === 'routine-time') {
        return { mode: round.mode, roundId: round.id, optionId: round.correctOptionId };
    }
    return { mode: round.mode, roundId: round.id, value: round.acceptedAnswers[0]! };
}

function fillForm(root: HTMLElement, rounds: readonly DailyRoutineRound[]): void {
    for (const round of rounds) {
        if (round.mode === 'tense-choice' || round.mode === 'routine-time') {
            root.querySelector<HTMLSelectElement>(`select[name$="${round.id}-option"]`)!.value = round.correctOptionId;
        } else {
            root.querySelector<HTMLInputElement>(`input[name$="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!;
        }
    }
}
