import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type GradeResult,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localized,
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface WeeklyPlanWeekdayOption {
    readonly id: string;
    readonly ja: string;
    readonly en: string;
}

export interface WeeklyPlanTeachingStep {
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly rule: LocalizedText;
    readonly example: string;
}

interface WeeklyPlanRoundBase {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly LocalizedText[];
}

export interface WeeklyPlanPairRound extends WeeklyPlanRoundBase {
    readonly mode: 'weekday-pair';
    readonly options: readonly WeeklyPlanWeekdayOption[];
    readonly correctTomorrowId: string;
    readonly correctYesterdayId: string;
}

export interface WeeklyPlanChoiceRound extends WeeklyPlanRoundBase {
    readonly mode: 'day-answer';
    readonly correctPolarity: 'hai' | 'iie' | 'none';
    readonly dayOptions: readonly WeeklyPlanWeekdayOption[];
    readonly correctDayId: string;
    readonly copula: 'です' | 'でした';
}

export interface WeeklyPlanTypedRound extends WeeklyPlanRoundBase {
    readonly mode: 'typed-past';
    readonly acceptedAnswers: readonly string[];
}

export type WeeklyPlanRound = WeeklyPlanPairRound | WeeklyPlanChoiceRound | WeeklyPlanTypedRound;

export type WeeklyPlanAnswer =
    | Readonly<{ mode: 'weekday-pair'; roundId: string; tomorrowId: string; yesterdayId: string }>
    | Readonly<{ mode: 'day-answer'; roundId: string; polarity: 'hai' | 'iie' | 'none'; dayId: string }>
    | Readonly<{ mode: 'typed-past'; roundId: string; value: string }>;

export interface WeeklyPlanWorkbookResponse {
    readonly answers: readonly WeeklyPlanAnswer[];
}

interface MoodleDocumentSource {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly sourceTitle: string;
    readonly member: string;
    readonly author: 'Rie Tsuruta-Barratt';
    readonly pages: readonly [1, 2];
}

export interface WeeklyPlanWorkbookModel extends ActivityModel {
    readonly kind: 'academy-weekly-plan-workbook';
    readonly responseKind: 'mixed-source-weekly-plan-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l09';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5889535;
            readonly grammar: MoodleDocumentSource;
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l09:lesson-4-workbook-3';
            readonly sourceId: string;
            readonly relativePath: 'lessons/lesson-4/workbook-3/index.html';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 130 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceType: 'fill';
        };
        readonly minna: {
            readonly sourceId: string;
            readonly reference: 'Minna no Nihongo I, Lesson 4';
            readonly title: 'Minna no Nihongo 2nd Edition Shokyu I';
            readonly author: '3A Network';
            readonly payloadSha256: string;
            readonly pageCount: 326;
            readonly pdfPages: readonly [55, 56, 57];
            readonly printedPages: readonly [35, 36, 37];
            readonly relation: 'verified-sequence-and-page-55-model-only';
        };
    };
    readonly payload: {
        readonly teaching: readonly WeeklyPlanTeachingStep[];
        readonly rounds: readonly WeeklyPlanRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_SHA256 = '4c9419150055497b0771d56b98eccfadbdf10a7506293090701312eeebf3b306';
const GENKI_SHA256 = 'd4193e4a18bfef9dc69c58656759405b1fe013fc5d9d4599d3c74a9cd7fe7569';
const GENKI_SCRIPT_SHA256 = '8a377ce898a0067131d5b8345e88b20f229508435e1265f8b739deb6e469eb0b';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const WEEKDAY_SIGNATURE = 'getsu:げつようび:Monday|ka:かようび:Tuesday|sui:すいようび:Wednesday|moku:もくようび:Thursday|kin:きんようび:Friday|do:どようび:Saturday|nichi:にちようび:Sunday';
const EXACT_MODES = [
    'weekday-pair', 'weekday-pair',
    'day-answer', 'day-answer', 'day-answer', 'day-answer', 'day-answer',
    'typed-past', 'typed-past', 'typed-past', 'typed-past',
    'typed-past', 'typed-past', 'typed-past', 'typed-past',
] as const;
const EXACT_IDS = [
    'monday-today', 'friday-today',
    'sunday-tomorrow', 'saturday-yesterday', 'monday-yesterday', 'saturday-tomorrow', 'tuesday-yesterday',
    'genki-1', 'genki-2', 'genki-3', 'genki-4', 'genki-5', 'genki-6', 'genki-7', 'genki-8',
] as const;
const EXACT_PROMPTS = [
    'きょう は げつようび です。',
    'きょう は きんようび です。',
    'あした は にちようび です。あさって は げつようび ですか。',
    'きのう は どようび でした。おととい は きんようび でしたか。',
    'きのう は げつようび でした。きょう は なんようび ですか。',
    'あした は どようび です。あさって は かようび ですか。',
    'きのう は かようび でした。おととい は きんようび でしたか。',
    'きのうは月曜日でしたか。\n(Yes, yesterday was Monday.)',
    'きのうは十五日でしたか。\n(No, yesterday was not the 15th. It was the 22nd.)',
    "今日の朝ご飯はハンバーガーでしたか。\n(No, today's breakfast was not hamburger. It was bread.)",
    '子供の時、いい子供でしたか。\n(No, when I was a child, I was not a very good kid.)',
    '高校の時、いい学生でしたか。\n(Yes, when I was in high school, I was a good student.)',
    'My bicycle was 30,000 yen.',
    'Yesterday was Sunday.',
    'Professor Yamashita was not a Nihon University student.',
] as const;
const EXACT_EXPRESSIONS = [
    'あした は かようび です。きのう は にちようび でした。',
    'あした は どようび です。きのう は もくようび でした。',
    'はい、げつようび です。',
    'はい、きんようび でした。',
    'かようび です。',
    'いいえ、にちようび です。',
    'いいえ、げつようび でした。',
    'はい、きのうは月曜日でした',
    'いいえ、きのうは十五日じゃなかったです。二十二日でした。',
    'いいえ、今日の朝ご飯はハンバーガーじゃなかったです。パンでした。',
    'いいえ、子供の時、あまりいい子供じゃなかったです',
    'はい、高校の時、いい学生でした',
    '私の自転車は三万円でした',
    'きのうは日曜日でした',
    '山下先生は日本大学の学生じゃなかったです',
] as const;
const EXACT_TEACHING = [
    ['Noun 1 は Noun 2 (day) です。', 'あさって は きんようび です。'],
    ['non past: Noun です／じゃ ありません。 past: Noun でした／じゃ ありませんでした。', 'きのう は かようび でした。'],
    ['question: Noun ですか／でしたか。', 'おととい は なんようび でしたか。— げつようび でした。'],
    ['きょう は すいようび です。あした は もくようび ですか。', 'はい、もくようび です。'],
    ['Noun は 何時から 何時までですか。', '銀行は 何時から 何時までですか。— 9時から 3時までです。'],
    ['Complete the following problems using past tense nouns.', 'Yesterday was Sunday. — きのうは日曜日でした。'],
] as const;

export const weeklyPlanWorkbookPlugin: ActivityPlugin<WeeklyPlanWorkbookModel, WeeklyPlanWorkbookResponse> = {
    kind: 'academy-weekly-plan-workbook',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        let correct = 0;
        const errorTags: string[] = [];
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id);
            const passed = round.mode === 'weekday-pair'
                ? answer?.mode === round.mode
                    && answer.tomorrowId === round.correctTomorrowId && answer.yesterdayId === round.correctYesterdayId
                : round.mode === 'day-answer'
                    ? answer?.mode === round.mode
                        && answer.polarity === round.correctPolarity && answer.dayId === round.correctDayId
                    : answer?.mode === round.mode
                        && round.acceptedAnswers.some(candidate => normalizeJapanese(candidate) === normalizeJapanese(answer.value));
            if (passed) correct += 1;
            else errorTags.push(round.errorTag);
        }
        return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errorTags, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)) return [];
            return [reviewSeed(round, result)];
        });
    },
};

function validate(model: WeeklyPlanWorkbookModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The exact source workbook requires assessed answer support.' });
    }
    validateProvenance(model.provenance, issues);
    validateTeaching(model.payload?.teaching, issues);
    validateRounds(model, issues);
    if (model.payload?.passScore !== 1) {
        issues.push({ path: 'payload.passScore', message: 'Every exact source item is required for mastery.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateProvenance(value: WeeklyPlanWorkbookModel['provenance'] | undefined, issues: ValidationIssue[]): void {
    if (value?.packageId !== 'l1-l09' || value.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'provenance', message: 'Lesson 9 identity and after-attempt answers are required.' });
        return;
    }
    const grammar = value.moodle?.grammar;
    if (value.moodle?.moduleId !== 5889535
        || grammar?.sourceId !== `moodle-payload:${MOODLE_SHA256}` || grammar.payloadSha256 !== MOODLE_SHA256
        || grammar.sourceTitle !== 'New Chapter 4-2 days and weekly plans desu conjugation Grammar Exercise'
        || grammar.member !== 'Handouts/New Chapter 4-2_days and weekly plans_desu conjugation_Grammar Exercise.pdf'
        || grammar.author !== 'Rie Tsuruta-Barratt' || grammar.pages?.join(',') !== '1,2') {
        issues.push({ path: 'provenance.moodle', message: 'Exact Moodle module and worksheet provenance is required.' });
    }
    const genki = value.genki;
    if (genki?.taskId !== 'genki-2e:l1-l09:lesson-4-workbook-3'
        || genki.sourceId !== `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`
        || genki.relativePath !== 'lessons/lesson-4/workbook-3/index.html'
        || genki.payloadSha256 !== GENKI_SHA256 || genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || genki.lineLocus?.start !== 76 || genki.lineLocus.end !== 130
        || genki.engine !== 'Genki.generateQuiz' || genki.sourceType !== 'fill') {
        issues.push({ path: 'provenance.genki', message: 'Exact Genki generated-quiz provenance is required.' });
    }
    const minna = value.minna;
    if (minna?.sourceId !== `minna-i:${MINNA_SHA256}:lesson-4` || minna.payloadSha256 !== MINNA_SHA256
        || minna.reference !== 'Minna no Nihongo I, Lesson 4'
        || minna.title !== 'Minna no Nihongo 2nd Edition Shokyu I' || minna.author !== '3A Network'
        || minna.pageCount !== 326 || minna.pdfPages?.join(',') !== '55,56,57'
        || minna.printedPages?.join(',') !== '35,36,37'
        || minna.relation !== 'verified-sequence-and-page-55-model-only') {
        issues.push({ path: 'provenance.minna', message: 'Verified Minna identity and limited reuse relation are required.' });
    }
}

function validateTeaching(value: readonly WeeklyPlanTeachingStep[] | undefined, issues: ValidationIssue[]): void {
    if (!Array.isArray(value) || value.length !== EXACT_TEACHING.length) {
        issues.push({ path: 'payload.teaching', message: 'All six source-labelled teaching steps are required.' });
        return;
    }
    value.forEach((step, index) => {
        const exact = EXACT_TEACHING[index];
        const expectedPrefix = index < 4 ? 'moodle:' : index === 4 ? 'minna-i:' : 'genki-2e:';
        if (!exact || step.sourceOrder !== index + 1 || !step.sourceQuestionId.startsWith(expectedPrefix)
            || step.pattern !== exact[0] || step.example !== exact[1]
            || !text(step.sourceLabel) || !text(step.rule?.ja) || !text(step.rule?.en)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching wording, order, and provenance must remain exact.' });
        }
    });
}

function validateRounds(model: WeeklyPlanWorkbookModel, issues: ValidationIssue[]): void {
    const rounds: readonly WeeklyPlanRound[] = model.payload.rounds;
    if (rounds.length !== EXACT_MODES.length) {
        issues.push({ path: 'payload.rounds', message: 'All 15 Moodle and Genki source items are required.' });
        return;
    }
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (round.sourceOrder !== index + 1 || round.mode !== EXACT_MODES[index]
            || round.id !== EXACT_IDS[index] || round.sourcePrompt !== EXACT_PROMPTS[index]
            || round.answerExpression !== EXACT_EXPRESSIONS[index]
            || round.sourceQuestionId !== expectedSourceQuestionId(index)) {
            issues.push({ path, message: 'Source wording, order, mode, and answer must remain exact.' });
        }
        if (ids.has(round.id) || sourceIds.has(round.sourceQuestionId) || !model.conceptIds.includes(round.conceptId)
            || !text(round.errorTag)) {
            issues.push({ path, message: 'Round ids, source ids, Concepts, and repair tags must be stable and unique.' });
        }
        ids.add(round.id);
        sourceIds.add(round.sourceQuestionId);
        if (round.hints.length !== 2
            || round.hints.some(hint => !text(hint.ja) || !text(hint.en))) {
            issues.push({ path: `${path}.hints`, message: 'Two bilingual progressive hints are required.' });
        }
        if (round.mode === 'weekday-pair') {
            if (optionSignature(round.options) !== WEEKDAY_SIGNATURE
                || !round.options.some(option => option.id === round.correctTomorrowId)
                || !round.options.some(option => option.id === round.correctYesterdayId)) {
                issues.push({ path, message: 'Paired weekday items require the exact ordered weekday menu.' });
            }
        } else if (round.mode === 'day-answer') {
            if (optionSignature(round.dayOptions) !== WEEKDAY_SIGNATURE
                || !round.dayOptions.some(option => option.id === round.correctDayId)
                || !['hai', 'iie', 'none'].includes(round.correctPolarity)
                || !['です', 'でした'].includes(round.copula)) {
                issues.push({ path, message: 'Day-answer items require the exact polarity, tense, and weekday menu.' });
            }
        } else if (round.acceptedAnswers.length < 2
            || round.acceptedAnswers.some(answer => !text(answer))
            || round.acceptedAnswers[0] !== EXACT_EXPRESSIONS[index]) {
            issues.push({ path: `${path}.acceptedAnswers`, message: 'Genki source answer variants and canonical order are required.' });
        }
    });
    if (new Set(model.conceptIds).size !== rounds.length || model.conceptIds.length !== rounds.length) {
        issues.push({ path: 'conceptIds', message: 'Each exact source item needs one unique Concept.' });
    }
}

function expectedSourceQuestionId(index: number): string {
    if (index < 2) return `moodle:${MOODLE_SHA256}:p1:section-1:item-${index + 1}`;
    if (index < 7) return `moodle:${MOODLE_SHA256}:p2:section-2:item-${index - 1}`;
    return `genki-2e:l1-l09:lesson-4-workbook-3:slot-${index - 6}`;
}

function optionSignature(options: readonly WeeklyPlanWeekdayOption[]): string {
    return options.map(option => `${option.id}:${option.ja}:${option.en}`).join('|');
}

function render(
    model: WeeklyPlanWorkbookModel,
    host: ActivityHost,
    submit: (response: WeeklyPlanWorkbookResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-weekly-plan';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'academy-button academy-button-primary academy-weekly-plan-start';
    start.textContent = host.language === 'ja' ? '元資料の問題へ' : 'Continue to source tasks';
    const assessment = document.createElement('div');
    assessment.className = 'academy-weekly-plan-assessment';
    root.append(heading, teaching, start, assessment);
    host.replace(root);

    let form: HTMLFormElement | null = null;
    start.addEventListener('click', () => {
        if (form) return;
        form = renderAssessment(model, host, submit);
        assessment.append(form);
        start.remove();
        form.querySelector<HTMLElement>('input, select')?.focus();
    }, { signal: lifecycle.signal });
    return {
        focus() { (form?.querySelector<HTMLElement>('input, select') ?? start).focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: WeeklyPlanWorkbookModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-weekly-plan-teaching';
    section.dataset.lessonPhase = 'teaching';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes({ ja: '先に型を学ぶ', en: 'Learn the patterns first' }));
    section.append(heading);
    for (const step of model.payload.teaching) {
        const article = document.createElement('article');
        article.className = 'academy-weekly-plan-teaching-step';
        article.dataset.sourceQuestionId = step.sourceQuestionId;
        const source = document.createElement('p');
        source.className = 'academy-source-record';
        source.dataset.jpdbReaderSurfaceIgnore = '';
        source.textContent = step.sourceLabel;
        const pattern = document.createElement('h4');
        pattern.append(assessedJapanese(step.pattern));
        const rule = document.createElement('p');
        rule.append(...localizedNodes(step.rule));
        const example = document.createElement('p');
        example.className = 'academy-weekly-plan-model';
        example.append(assessedJapanese(step.example));
        article.append(source, pattern, rule, example);
        section.append(article);
    }
    return section;
}

function renderAssessment(
    model: WeeklyPlanWorkbookModel,
    host: ActivityHost,
    submit: (response: WeeklyPlanWorkbookResponse) => Promise<ActivityEvaluation>,
): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'academy-weekly-plan-form';
    form.dataset.lessonPhase = 'assessment';
    form.setAttribute('aria-labelledby', `${model.id}-prompt`);
    form.append(
        roundGroup(model, host, 'weekday-pair', { ja: 'Moodle 1：前後の曜日', en: 'Moodle 1: adjacent weekdays' }),
        roundGroup(model, host, 'day-answer', { ja: 'Moodle 2：質問に答える', en: 'Moodle 2: answer the questions' }),
        roundGroup(model, host, 'typed-past', { ja: 'Genki：名詞の過去形', en: 'Genki: past-tense nouns' }),
    );
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary academy-weekly-plan-check';
    submitButton.textContent = host.language === 'ja' ? '15問を確認' : 'Check all 15 answers';
    const feedback = statusRegion('academy-weekly-plan-feedback');
    form.append(submitButton, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) return;
        setPending(form, true);
        void submit(response).then(evaluation => {
            form.dataset.outcome = evaluation.result.outcome;
            showEvaluation(feedback, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                setPending(form, false);
                applyRepairState(form, evaluation.result.errorTags, submitButton, host);
            }
        }).catch(error => {
            setPending(form, false);
            feedback.setAttribute('role', 'alert');
            feedback.textContent = error instanceof Error ? error.message : String(error);
        });
    });
    return form;
}

function roundGroup(
    model: WeeklyPlanWorkbookModel,
    host: ActivityHost,
    mode: WeeklyPlanRound['mode'],
    titleText: LocalizedText,
): HTMLElement {
    const section = document.createElement('section');
    section.className = `academy-weekly-plan-group academy-weekly-plan-group-${mode}`;
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(titleText));
    const grid = document.createElement('div');
    grid.className = 'academy-weekly-plan-rounds';
    for (const round of model.payload.rounds.filter(candidate => candidate.mode === mode)) {
        grid.append(renderRound(model, round, host));
    }
    section.append(heading, grid);
    return section;
}

function renderRound(model: WeeklyPlanWorkbookModel, round: WeeklyPlanRound, host: ActivityHost): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-weekly-plan-round academy-weekly-plan-round-${round.mode}`;
    fieldset.dataset.roundId = round.id;
    fieldset.dataset.errorTag = round.errorTag;
    fieldset.dataset.sourceQuestionId = round.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.append(assessedJapanese(`${round.sourceOrder}. ${round.sourcePrompt}`));
    fieldset.append(legend);
    if (round.mode === 'weekday-pair') renderPairControls(model, round, fieldset);
    else if (round.mode === 'day-answer') renderChoiceControls(model, round, fieldset);
    else renderTypedControl(model, round, fieldset);
    fieldset.append(renderHints(round, host));
    return fieldset;
}

function renderPairControls(model: WeeklyPlanWorkbookModel, round: WeeklyPlanPairRound, root: HTMLElement): void {
    const controls = document.createElement('div');
    controls.className = 'academy-weekly-plan-pair';
    controls.append(
        weekdaySelect(`${model.id}-${round.id}-tomorrow`, { ja: 'あした', en: 'Tomorrow' }, round.options),
        weekdaySelect(`${model.id}-${round.id}-yesterday`, { ja: 'きのう', en: 'Yesterday' }, round.options),
    );
    root.append(controls);
}

function renderChoiceControls(model: WeeklyPlanWorkbookModel, round: WeeklyPlanChoiceRound, root: HTMLElement): void {
    const controls = document.createElement('div');
    controls.className = 'academy-weekly-plan-choice';
    if (round.correctPolarity !== 'none') {
        const polarity = document.createElement('fieldset');
        polarity.className = 'academy-weekly-plan-polarity';
        const legend = document.createElement('legend');
        legend.textContent = 'はい／いいえ';
        polarity.append(legend);
        for (const [value, labelText] of [['hai', 'はい'], ['iie', 'いいえ']] as const) {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.required = true;
            input.name = `${model.id}-${round.id}-polarity`;
            input.value = value;
            label.append(input, assessedJapanese(labelText));
            polarity.append(label);
        }
        controls.append(polarity);
    }
    controls.append(weekdaySelect(`${model.id}-${round.id}-day`, { ja: '答えの曜日', en: 'Answer day' }, round.dayOptions));
    const copula = document.createElement('span');
    copula.className = 'academy-weekly-plan-copula';
    copula.append(assessedJapanese(round.copula));
    controls.append(copula);
    root.append(controls);
}

function renderTypedControl(model: WeeklyPlanWorkbookModel, round: WeeklyPlanTypedRound, root: HTMLElement): void {
    const label = document.createElement('label');
    label.className = 'academy-weekly-plan-typed';
    const caption = document.createElement('span');
    caption.textContent = '日本語で答える / Answer in Japanese';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `${model.id}-${round.id}-value`;
    input.required = true;
    input.lang = 'ja';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.jpdbReaderSurfaceIgnore = '';
    label.append(caption, input);
    root.append(label);
}

function weekdaySelect(name: string, captionText: LocalizedText, options: readonly WeeklyPlanWeekdayOption[]): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'academy-weekly-plan-select';
    const caption = document.createElement('span');
    caption.append(...localizedNodes(captionText));
    const select = document.createElement('select');
    select.name = name;
    select.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    select.append(placeholder);
    for (const option of options) {
        const item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.ja;
        select.append(item);
    }
    label.append(caption, select);
    return label;
}

function renderHints(round: WeeklyPlanRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-weekly-plan-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-weekly-plan-hint';
    button.textContent = host.language === 'ja' ? 'ヒント' : 'Hint';
    const output = statusRegion('academy-weekly-plan-hint-output');
    let index = 0;
    button.addEventListener('click', () => {
        const hint = round.hints[index];
        if (!hint) return;
        index += 1;
        output.textContent = localized(hint, host);
        output.dataset.hintIndex = String(index);
        if (index >= round.hints.length) button.disabled = true;
        else button.textContent = host.language === 'ja' ? '次のヒント' : 'Next hint';
    });
    root.append(button, output);
    return root;
}

function responseFromForm(model: WeeklyPlanWorkbookModel, form: HTMLFormElement): WeeklyPlanWorkbookResponse | null {
    const data = new FormData(form);
    const answers: WeeklyPlanAnswer[] = [];
    for (const round of model.payload.rounds) {
        if (round.mode === 'weekday-pair') {
            const tomorrowId = data.get(`${model.id}-${round.id}-tomorrow`);
            const yesterdayId = data.get(`${model.id}-${round.id}-yesterday`);
            if (typeof tomorrowId !== 'string' || !tomorrowId || typeof yesterdayId !== 'string' || !yesterdayId) return null;
            answers.push({ mode: round.mode, roundId: round.id, tomorrowId, yesterdayId });
        } else if (round.mode === 'day-answer') {
            const polarity = round.correctPolarity === 'none' ? 'none' : data.get(`${model.id}-${round.id}-polarity`);
            const dayId = data.get(`${model.id}-${round.id}-day`);
            if (!['hai', 'iie', 'none'].includes(String(polarity)) || typeof dayId !== 'string' || !dayId) return null;
            answers.push({ mode: round.mode, roundId: round.id, polarity: polarity as 'hai' | 'iie' | 'none', dayId });
        } else {
            const value = data.get(`${model.id}-${round.id}-value`);
            if (typeof value !== 'string' || !value.trim()) return null;
            answers.push({ mode: round.mode, roundId: round.id, value });
        }
    }
    return { answers };
}

function parseResponse(model: WeeklyPlanWorkbookModel, response: WeeklyPlanWorkbookResponse): ReadonlyMap<string, WeeklyPlanAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Lesson 9 source item needs one answer.');
    }
    const answers = new Map<string, WeeklyPlanAnswer>();
    for (const answer of response.answers) {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round || answers.has(answer.roundId) || answer.mode !== round.mode) {
            throw new TypeError('Answers must use each exact source item once and keep its interaction mode.');
        }
        if (round.mode === 'weekday-pair') {
            if (answer.mode !== round.mode || !round.options.some(option => option.id === answer.tomorrowId)
                || !round.options.some(option => option.id === answer.yesterdayId)) {
                throw new TypeError('Paired weekday items require two offered weekdays.');
            }
        } else if (round.mode === 'day-answer') {
            if (answer.mode !== round.mode || !['hai', 'iie', 'none'].includes(answer.polarity)
                || (round.correctPolarity === 'none' ? answer.polarity !== 'none' : answer.polarity === 'none')
                || !round.dayOptions.some(option => option.id === answer.dayId)) {
                throw new TypeError('Day-answer items require the offered polarity and weekday.');
            }
        } else if (answer.mode !== round.mode || !text(answer.value)) {
            throw new TypeError('Genki past-tense items require a non-empty typed answer.');
        }
        answers.set(answer.roundId, answer);
    }
    return answers;
}

function applyRepairState(
    form: HTMLFormElement,
    errorTags: readonly string[],
    submitButton: HTMLButtonElement,
    host: ActivityHost,
): void {
    const missed = new Set(errorTags);
    const rounds = [...form.querySelectorAll<HTMLFieldSetElement>('.academy-weekly-plan-round')];
    for (const round of rounds) {
        const needsRepair = missed.has(round.dataset.errorTag ?? '');
        round.hidden = !needsRepair;
        round.dataset.needsRepair = String(needsRepair);
    }
    for (const group of form.querySelectorAll<HTMLElement>('.academy-weekly-plan-group')) {
        group.hidden = !group.querySelector('.academy-weekly-plan-round:not([hidden])');
    }
    form.classList.add('academy-weekly-plan-repair');
    submitButton.textContent = host.language === 'ja'
        ? `${missed.size}問を直して確認`
        : `Check ${missed.size} repaired ${missed.size === 1 ? 'answer' : 'answers'}`;
    rounds.find(round => !round.hidden)?.querySelector<HTMLElement>('input, select, button')?.focus();
}

function reviewSeed(round: WeeklyPlanRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l09:weekly-plan:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: {
            expression: round.answerExpression,
            meanings: [round.sourcePrompt],
            sentence: round.sourcePrompt,
        },
    };
}
