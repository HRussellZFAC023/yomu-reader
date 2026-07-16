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
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface TimeWorkbookOption {
    readonly id: string;
    readonly ja: string;
    readonly en: string;
}

export interface TimeWorkbookTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly rule: LocalizedText;
    readonly example: string;
}

interface TimeWorkbookRoundBase {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface TimeWorkbookRangeRound extends TimeWorkbookRoundBase {
    readonly mode: 'range-build';
    readonly subject: string;
    readonly displayedHours: string;
    readonly options: readonly TimeWorkbookOption[];
    readonly correctStartId: string;
    readonly correctEndId: string;
}

export interface TimeWorkbookTypedRound extends TimeWorkbookRoundBase {
    readonly mode: 'typed-clock';
    readonly acceptedAnswers: readonly string[];
}

export interface TimeWorkbookOpeningRound extends TimeWorkbookRoundBase {
    readonly mode: 'opening-hours-choice';
    readonly subject: string;
    readonly displayedHours: string;
    readonly options: readonly TimeWorkbookOption[];
    readonly correctOptionId: string;
}

export type TimeWorkbookRound = TimeWorkbookRangeRound | TimeWorkbookTypedRound | TimeWorkbookOpeningRound;

export type TimeWorkbookAnswer =
    | Readonly<{ mode: 'range-build'; roundId: string; startId: string; endId: string }>
    | Readonly<{ mode: 'typed-clock'; roundId: string; value: string }>
    | Readonly<{ mode: 'opening-hours-choice'; roundId: string; optionId: string }>;

export interface TimeWorkbookResponse {
    readonly answers: readonly TimeWorkbookAnswer[];
}

interface MoodleDocumentSource {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly sourceTitle: string;
    readonly member: string;
    readonly author: 'Rie Tsuruta-Barratt';
    readonly pages: readonly number[];
}

export interface TimeWorkbookModel extends ActivityModel {
    readonly kind: 'academy-time-workbook';
    readonly responseKind: 'mixed-source-time-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l08';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5866381;
            readonly timeGrammar: MoodleDocumentSource;
            readonly rangeGrammar: MoodleDocumentSource;
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l08:lesson-1-workbook-2';
            readonly sourceId: string;
            readonly relativePath: 'lessons/lesson-1/workbook-2/index.html';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 108 };
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
        };
    };
    readonly payload: {
        readonly teaching: readonly TimeWorkbookTeachingStep[];
        readonly rounds: readonly TimeWorkbookRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const TIME_GRAMMAR_SHA256 = 'a38a8e1f686876ba1b6bc109ce0e5e0f9ddc70f4b18b520d43241f54256406e0';
const RANGE_GRAMMAR_SHA256 = '26f0f7c3397e7a4903e8c62fc79bdd3ecceca09bb7302826c5e7497dbd83ccd7';
const GENKI_SHA256 = '6e6c804c56797542057ad96a56ed65dc0de3c90e066e67586e8cf85ce65a09e4';
const GENKI_SCRIPT_SHA256 = 'ecbac7a25b6cefdd604afda0ee11c0ac3ff177440487aadb7ebdae650def7c0b';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const MODES = [
    'range-build', 'range-build', 'range-build',
    'typed-clock', 'typed-clock', 'typed-clock', 'typed-clock', 'typed-clock',
    'opening-hours-choice', 'opening-hours-choice', 'opening-hours-choice', 'opening-hours-choice',
] as const;
const EXACT_TEACHING = [
    [`moodle:${TIME_GRAMMAR_SHA256}:p1:time-counters`, 'いまは なんじですか。— time です。', 'いまは なんじですか。— 3じです。'],
    [`moodle:${RANGE_GRAMMAR_SHA256}:p1:kara-made-pattern`, 'Noun は time1 から time2 まで です。', 'パーティは ごご6じから 10じまでです。'],
    [`minna-i:${MINNA_SHA256}:lesson-4:pdf-p55:exercise-4:model`, 'Noun は 何時から 何時までですか。', '銀行は 何時から 何時までですか。— 9時から 3時までです。'],
] as const;
const EXACT_ROUND_IDS = [
    'meeting', 'exam', 'lunch-break',
    'genki-5pm', 'genki-9am', 'genki-12-30pm', 'genki-4-30am', 'genki-7-30pm',
    'post-office', 'department-store', 'library', 'company',
] as const;
const EXACT_PROMPTS = [
    'かいぎ 1 p.m. - 3:30 p.m.',
    'しけん 10 a.m. - 12:45 p.m.',
    'ひるやすみ 12:30 p.m. - 1 p.m.',
    'いまなんじですか。（Current Time: 05:00pm）',
    'いまなんじですか。（Current Time: 09:00am）',
    'いまなんじですか。（Current Time: 12:30pm）',
    'いまなんじですか。（Current Time: 04:30am）',
    'いまなんじですか。（Current Time: 07:30pm）',
    'ゆうびんきょく (9:00-5:00)',
    'デパート (10:00-8:30)',
    'としょかん (9:00-6:30)',
    'かいしゃ (9:15-5:45)',
] as const;
const EXACT_EXPRESSIONS = [
    'かいぎは ごご1じから 3じはんまでです。',
    'しけんは ごぜん10じから ごご12じ45ふんまでです。',
    'ひるやすみは ごご12じはんから 1じまでです。',
    'ごごごじです',
    'ごぜんくじです',
    'ごごじゅうにじはんです',
    'ごぜんよじはんです',
    'ごごしちじはんです',
    'ゆうびんきょくは 9じから 5じまでです。',
    'デパートは 10じから 8じはんまでです。',
    'としょかんは 9じから 6じはんまでです。',
    'かいしゃは 9じ15ふんから 5じ45ふんまでです。',
] as const;
const EXACT_RANGE_OPTIONS = 'gogo-1:ごご1じ:1 p.m.|3-han:3じはん:3:30 p.m.|gozen-10:ごぜん10じ:10 a.m.|gogo-12-45:ごご12じ45ふん:12:45 p.m.|gogo-12-han:ごご12じはん:12:30 p.m.|1:1じ:1 p.m.';
const EXACT_OPENING_OPTIONS = '9-5:9じから 5じまでです。:9:00-5:00|10-8-30:10じから 8じはんまでです。:10:00-8:30|9-6-30:9じから 6じはんまでです。:9:00-6:30|9-15-5-45:9じ15ふんから 5じ45ふんまでです。:9:15-5:45';

export const timeWorkbookPlugin: ActivityPlugin<TimeWorkbookModel, TimeWorkbookResponse> = {
    kind: 'academy-time-workbook',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        let correct = 0;
        const errorTags: string[] = [];
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id);
            const passed = round.mode === 'range-build'
                ? answer?.mode === round.mode
                    && answer.startId === round.correctStartId && answer.endId === round.correctEndId
                : round.mode === 'typed-clock'
                    ? answer?.mode === round.mode
                        && round.acceptedAnswers.some(candidate => normalizeJapanese(candidate) === normalizeJapanese(answer.value))
                    : answer?.mode === round.mode && answer.optionId === round.correctOptionId;
            if (passed) correct += 1;
            else errorTags.push(round.errorTag);
        }
        return gradeFromScore(
            correct / model.payload.rounds.length,
            model.payload.passScore,
            errorTags,
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)) return [];
            return [reviewSeed(round, result)];
        });
    },
};

function validate(model: TimeWorkbookModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The source workbook requires assessed answer support.' });
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

function validateProvenance(value: TimeWorkbookModel['provenance'] | undefined, issues: ValidationIssue[]): void {
    if (value?.packageId !== 'l1-l08' || value.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'provenance', message: 'Lesson 8 identity and after-attempt answer policy are required.' });
        return;
    }
    if (value.moodle?.moduleId !== 5866381
        || !exactDocument(value.moodle.timeGrammar, TIME_GRAMMAR_SHA256, 'Chapter 4-1_time_Grammar Exercise', 'Handouts/Chapter 4-1_time_Grammar Exercise.pdf')
        || !exactDocument(value.moodle.rangeGrammar, RANGE_GRAMMAR_SHA256, 'New Chapter 4-1 from time to time Grammar Exercise', 'Handouts/New_Chapter 4-1_from time to time_Grammar Exercise.pdf')) {
        issues.push({ path: 'provenance.moodle', message: 'Exact Moodle module and worksheet identities are required.' });
    }
    const genki = value.genki;
    if (genki?.taskId !== 'genki-2e:l1-l08:lesson-1-workbook-2'
        || genki.sourceId !== `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`
        || genki.payloadSha256 !== GENKI_SHA256 || genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || genki.relativePath !== 'lessons/lesson-1/workbook-2/index.html'
        || genki.lineLocus?.start !== 76 || genki.lineLocus.end !== 108
        || genki.engine !== 'Genki.generateQuiz' || genki.sourceType !== 'fill') {
        issues.push({ path: 'provenance.genki', message: 'Exact Genki generated-quiz provenance is required.' });
    }
    const minna = value.minna;
    if (minna?.sourceId !== `minna-i:${MINNA_SHA256}:lesson-4`
        || minna.payloadSha256 !== MINNA_SHA256 || minna.author !== '3A Network' || minna.pageCount !== 326
        || minna.reference !== 'Minna no Nihongo I, Lesson 4'
        || minna.title !== 'Minna no Nihongo 2nd Edition Shokyu I'
        || minna.pdfPages?.join(',') !== '55,56,57' || minna.printedPages?.join(',') !== '35,36,37') {
        issues.push({ path: 'provenance.minna', message: 'Verified Minna Lesson 4 pages and source identity are required.' });
    }
}

function exactDocument(
    source: MoodleDocumentSource | undefined,
    digest: string,
    title: string,
    member: string,
): boolean {
    return source?.payloadSha256 === digest && source.sourceId === `moodle-payload:${digest}`
        && source.sourceTitle === title && source.member === member
        && source.author === 'Rie Tsuruta-Barratt' && source.pages?.join(',') === '1,2';
}

function validateTeaching(value: readonly TimeWorkbookTeachingStep[] | undefined, issues: ValidationIssue[]): void {
    if (!Array.isArray(value) || value.length !== 3) {
        issues.push({ path: 'payload.teaching', message: 'Three source-labelled teaching steps are required.' });
        return;
    }
    const expectedSources = ['moodle:', 'moodle:', 'minna-i:'];
    value.forEach((step, index) => {
        const exact = EXACT_TEACHING[index];
        if (!text(step.sourceQuestionId).startsWith(expectedSources[index] ?? '') || !exact
            || step.sourceQuestionId !== exact[0] || step.pattern !== exact[1] || step.example !== exact[2]
            || !text(step.sourceLabel)
            || !text(step.pattern) || !text(step.example) || !text(step.rule?.ja) || !text(step.rule?.en)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching must preserve its source, pattern, rule, and model.' });
        }
    });
}

function validateRounds(model: TimeWorkbookModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== MODES.length) {
        issues.push({ path: 'payload.rounds', message: 'All 12 source items are required.' });
        return;
    }
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (round.sourceOrder !== index + 1 || round.mode !== MODES[index]
            || round.id !== EXACT_ROUND_IDS[index] || round.sourcePrompt !== EXACT_PROMPTS[index]
            || round.answerExpression !== EXACT_EXPRESSIONS[index]
            || round.sourceQuestionId !== exactSourceQuestionId(index)) {
            issues.push({ path, message: 'Source order and interaction mode must remain exact.' });
        }
        if (!text(round.id) || ids.has(round.id) || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)) {
            issues.push({ path, message: 'Round and source ids must be stable and unique.' });
        }
        ids.add(round.id);
        sourceIds.add(round.sourceQuestionId);
        if (!text(round.sourcePrompt) || !text(round.answerExpression) || !text(round.conceptId)
            || !model.conceptIds.includes(round.conceptId) || !text(round.errorTag)) {
            issues.push({ path, message: 'Every source item needs a prompt, answer, Concept, and repair tag.' });
        }
        if (round.mode === 'range-build') {
            const optionIds = validOptions(round.options, `${path}.options`, issues);
            if (!optionIds.has(round.correctStartId) || !optionIds.has(round.correctEndId)
                || rangeAnswer(round) !== ['gogo-1:3-han', 'gozen-10:gogo-12-45', 'gogo-12-han:1'][index]
                || optionSignature(round.options) !== EXACT_RANGE_OPTIONS
                || !text(round.subject) || !text(round.displayedHours)) {
                issues.push({ path, message: 'Range items require offered source start and finish values.' });
            }
        } else if (round.mode === 'typed-clock') {
            const expectedAnswers = exactTypedAnswers(index - 2);
            if (!Array.isArray(round.acceptedAnswers) || round.acceptedAnswers.length < 4
                || round.acceptedAnswers.some((answer: string) => !text(answer))
                || round.acceptedAnswers.join('|') !== expectedAnswers.join('|')) {
                issues.push({ path: `${path}.acceptedAnswers`, message: 'Exact Genki answer variants are required.' });
            }
        } else {
            const optionIds = validOptions(round.options, `${path}.options`, issues);
            if (!optionIds.has(round.correctOptionId)
                || round.correctOptionId !== ['9-5', '10-8-30', '9-6-30', '9-15-5-45'][index - 8]
                || optionSignature(round.options) !== EXACT_OPENING_OPTIONS
                || !text(round.subject) || !text(round.displayedHours)) {
                issues.push({ path, message: 'Opening-hour items require one offered exact range.' });
            }
        }
    });
    if (new Set(model.conceptIds).size !== rounds.length || model.conceptIds.length !== rounds.length) {
        issues.push({ path: 'conceptIds', message: 'Each source item needs one unique Concept.' });
    }
}

function exactSourceQuestionId(index: number): string {
    if (index < 3) return `moodle:${RANGE_GRAMMAR_SHA256}:p1:exercise-1:item-${index + 1}`;
    if (index < 8) return `genki-2e:l1-l08:lesson-1-workbook-2:slot-${index - 2}`;
    return `minna-i:${MINNA_SHA256}:lesson-4:pdf-p55:exercise-4:item-${index - 7}`;
}

function rangeAnswer(round: TimeWorkbookRangeRound): string {
    return `${round.correctStartId}:${round.correctEndId}`;
}

function optionSignature(options: readonly TimeWorkbookOption[]): string {
    return options.map(option => `${option.id}:${option.ja}:${option.en}`).join('|');
}

function exactTypedAnswers(slot: number): readonly string[] {
    if (slot === 1) return ['ごごごじです', '午後五時です', '午後ごじです', 'ごご五時です'];
    if (slot === 2) return ['ごぜんくじです', '午前九時です', '午前くじです', 'ごぜん九時です'];
    if (slot === 3) return primaryFirst('ごごじゅうにじはんです', combinations('午後', 'ごご', '十二時', 'じゅうにじ', '半', 'はん'));
    if (slot === 4) return primaryFirst('ごぜんよじはんです', combinations('午前', 'ごぜん', '四時', 'よじ', '半', 'はん'));
    if (slot === 5) return primaryFirst('ごごしちじはんです', combinations('午後', 'ごご', '七時', 'しちじ', '半', 'はん'));
    return [];
}

function combinations(
    formalPeriod: string,
    kanaPeriod: string,
    formalHour: string,
    kanaHour: string,
    formalHalf: string,
    kanaHalf: string,
): readonly string[] {
    return [formalPeriod, kanaPeriod].flatMap(period =>
        [formalHour, kanaHour].flatMap(hour =>
            [formalHalf, kanaHalf].map(half => `${period}${hour}${half}です`)));
}

function primaryFirst(primary: string, accepted: readonly string[]): readonly string[] {
    return [primary, ...accepted.filter(answer => answer !== primary)];
}

function validOptions(
    options: readonly TimeWorkbookOption[] | undefined,
    path: string,
    issues: ValidationIssue[],
): ReadonlySet<string> {
    if (!Array.isArray(options) || options.length < 2) {
        issues.push({ path, message: 'At least two neutral options are required.' });
        return new Set();
    }
    const ids = new Set<string>();
    options.forEach((option, index) => {
        if (!text(option.id) || ids.has(option.id) || !text(option.ja) || !text(option.en)) {
            issues.push({ path: `${path}.${index}`, message: 'Options need unique ids and bilingual labels.' });
        }
        ids.add(option.id);
    });
    return ids;
}

function render(
    model: TimeWorkbookModel,
    host: ActivityHost,
    submit: (response: TimeWorkbookResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-time-workbook';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'academy-button academy-button-primary academy-time-continue';
    continueButton.textContent = host.language === 'ja' ? '問題へ進む' : 'Continue to source tasks';
    const assessment = document.createElement('div');
    assessment.className = 'academy-time-assessment';
    root.append(heading, teaching, continueButton, assessment);
    host.replace(root);

    let form: HTMLFormElement | null = null;
    continueButton.addEventListener('click', () => {
        if (form) return;
        form = renderAssessment(model, host, submit);
        assessment.append(form);
        continueButton.remove();
        form.querySelector<HTMLElement>('input, select')?.focus();
    }, { signal: lifecycle.signal });

    return {
        focus() { (form?.querySelector<HTMLElement>('input, select') ?? continueButton).focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function renderTeaching(model: TimeWorkbookModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-time-teaching';
    section.dataset.lessonPhase = 'teaching';
    const title = document.createElement('h3');
    title.append(...localizedNodes({ ja: '先に型を確認', en: 'Learn the patterns first' }));
    const grid = document.createElement('div');
    grid.className = 'academy-time-teaching-grid';
    for (const step of model.payload.teaching) {
        const article = document.createElement('article');
        article.className = 'academy-time-teaching-step';
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
        example.className = 'academy-time-model';
        example.append(assessedJapanese(step.example));
        article.append(source, pattern, rule, example);
        grid.append(article);
    }
    section.append(title, grid);
    return section;
}

function renderAssessment(
    model: TimeWorkbookModel,
    host: ActivityHost,
    submit: (response: TimeWorkbookResponse) => Promise<ActivityEvaluation>,
): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'academy-time-form';
    form.dataset.lessonPhase = 'assessment';
    const groups = [
        group(model, 'range-build', { ja: 'Moodle：時間の範囲を作る', en: 'Moodle: build each time range' }),
        group(model, 'typed-clock', { ja: 'Genki：時刻を入力する', en: 'Genki: type the exact time' }),
        group(model, 'opening-hours-choice', { ja: 'みんな：営業時間を選ぶ', en: 'Minna: match the opening hours' }),
    ];
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary academy-time-check';
    submitButton.textContent = host.language === 'ja' ? '答えを確認' : 'Check source tasks';
    const feedback = statusRegion('academy-time-feedback');
    form.append(...groups, submitButton, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) return;
        setPending(form, true);
        void submit(response).then(evaluation => {
            form.dataset.outcome = evaluation.result.outcome;
            showEvaluation(feedback, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(form, false);
        }).catch(() => {
            setPending(form, false);
            feedback.setAttribute('role', 'alert');
            feedback.textContent = host.language === 'ja'
                ? '答えを保存できませんでした。もう一度お試しください。'
                : 'Your answers could not be saved. Try again.';
        });
    });
    return form;
}

function group(model: TimeWorkbookModel, mode: TimeWorkbookRound['mode'], titleText: LocalizedText): HTMLElement {
    const section = document.createElement('section');
    section.className = `academy-time-group academy-time-group-${mode}`;
    const title = document.createElement('h3');
    title.append(...localizedNodes(titleText));
    const grid = document.createElement('div');
    grid.className = 'academy-time-round-grid';
    for (const round of model.payload.rounds.filter(candidate => candidate.mode === mode)) {
        grid.append(renderRound(model, round));
    }
    section.append(title, grid);
    return section;
}

function renderRound(model: TimeWorkbookModel, round: TimeWorkbookRound): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-time-round academy-time-round-${round.mode}`;
    fieldset.dataset.sourceQuestionId = round.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.append(assessedJapanese(round.sourcePrompt));
    fieldset.append(legend);
    if (round.mode === 'range-build') renderRangeControls(model, round, fieldset);
    else if (round.mode === 'typed-clock') renderTypedControl(model, round, fieldset);
    else renderOpeningControls(model, round, fieldset);
    return fieldset;
}

function renderRangeControls(model: TimeWorkbookModel, round: TimeWorkbookRangeRound, root: HTMLElement): void {
    const builder = document.createElement('div');
    builder.className = 'academy-time-range-builder';
    builder.append(assessedJapanese(`${round.subject}は`));
    builder.append(selectControl(`${model.id}-${round.id}-start`, { ja: '始まる時刻', en: 'Starting time' }, round.options));
    builder.append(assessedJapanese('から'));
    builder.append(selectControl(`${model.id}-${round.id}-end`, { ja: '終わる時刻', en: 'Finishing time' }, round.options));
    builder.append(assessedJapanese('までです。'));
    root.append(builder);
}

function selectControl(name: string, labelText: LocalizedText, options: readonly TimeWorkbookOption[]): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'academy-time-select';
    const caption = document.createElement('span');
    caption.className = 'academy-visually-hidden';
    caption.textContent = `${labelText.ja} / ${labelText.en}`;
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

function renderTypedControl(model: TimeWorkbookModel, round: TimeWorkbookTypedRound, root: HTMLElement): void {
    const label = document.createElement('label');
    label.className = 'academy-time-typed';
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

function renderOpeningControls(model: TimeWorkbookModel, round: TimeWorkbookOpeningRound, root: HTMLElement): void {
    const prompt = document.createElement('p');
    prompt.className = 'academy-time-question-frame';
    prompt.append(assessedJapanese(`${round.subject}は 何時から 何時までですか。`));
    const choices = document.createElement('div');
    choices.className = 'academy-time-opening-options';
    for (const option of round.options) {
        const label = document.createElement('label');
        label.className = 'academy-time-opening-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.required = true;
        input.name = `${model.id}-${round.id}-option`;
        input.value = option.id;
        label.append(input, assessedJapanese(option.ja));
        choices.append(label);
    }
    root.append(prompt, choices);
}

function responseFromForm(model: TimeWorkbookModel, form: HTMLFormElement): TimeWorkbookResponse | null {
    const data = new FormData(form);
    const answers: TimeWorkbookAnswer[] = [];
    for (const round of model.payload.rounds) {
        if (round.mode === 'range-build') {
            const startId = data.get(`${model.id}-${round.id}-start`);
            const endId = data.get(`${model.id}-${round.id}-end`);
            if (typeof startId !== 'string' || typeof endId !== 'string' || !startId || !endId) return null;
            answers.push({ mode: round.mode, roundId: round.id, startId, endId });
        } else if (round.mode === 'typed-clock') {
            const value = data.get(`${model.id}-${round.id}-value`);
            if (typeof value !== 'string' || !value.trim()) return null;
            answers.push({ mode: round.mode, roundId: round.id, value });
        } else {
            const optionId = data.get(`${model.id}-${round.id}-option`);
            if (typeof optionId !== 'string' || !optionId) return null;
            answers.push({ mode: round.mode, roundId: round.id, optionId });
        }
    }
    return { answers };
}

function parseResponse(model: TimeWorkbookModel, response: TimeWorkbookResponse): ReadonlyMap<string, TimeWorkbookAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Lesson 8 source item needs one answer.');
    }
    const answers = new Map<string, TimeWorkbookAnswer>();
    for (const answer of response.answers) {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round || answers.has(answer.roundId) || answer.mode !== round.mode) {
            throw new TypeError('Answers must use each exact source item once and keep its interaction mode.');
        }
        if (round.mode === 'range-build') {
            if (answer.mode !== round.mode || !round.options.some(option => option.id === answer.startId)
                || !round.options.some(option => option.id === answer.endId)) {
                throw new TypeError('Range items require offered start and finish values.');
            }
        } else if (round.mode === 'typed-clock') {
            if (answer.mode !== round.mode || !text(answer.value)) {
                throw new TypeError('Genki clock items require a non-empty typed answer.');
            }
        } else if (answer.mode !== round.mode || !round.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('Minna opening items require one offered range.');
        }
        answers.set(answer.roundId, answer);
    }
    return answers;
}

function reviewSeed(round: TimeWorkbookRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l08:source-time:${round.id}`,
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
