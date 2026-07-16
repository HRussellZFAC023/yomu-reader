import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
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
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface ExistenceTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

interface ExistenceRoundBase {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hint: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface ExistenceClassifyRound extends ExistenceRoundBase {
    readonly mode: 'classify';
    readonly nounClass: 'animate' | 'inanimate';
    readonly verb: 'います' | 'あります';
}

export interface ExistenceTypedRound extends ExistenceRoundBase {
    readonly mode: 'typed';
    readonly acceptedAnswers: readonly string[];
}

export type ExistenceLocationRound = ExistenceClassifyRound | ExistenceTypedRound;

export type ExistenceLocationAnswer =
    | Readonly<{ mode: 'classify'; roundId: string; nounClass: 'animate' | 'inanimate'; verb: 'います' | 'あります' }>
    | Readonly<{ mode: 'typed'; roundId: string; value: string }>;

export interface ExistenceLocationResponse {
    readonly answers: readonly ExistenceLocationAnswer[];
}

export interface ExistenceLocationWorkbookModel extends ActivityModel {
    readonly kind: 'academy-existence-location-workbook';
    readonly responseKind: 'existence-classification-and-source-transfer';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l16';
        readonly answerVisibility: 'after-attempt';
        readonly sourceOrder: readonly ['moodle', 'minna-mapping', 'genki'];
        readonly moodle: {
            readonly moduleId: 5881257;
            readonly archiveSha256: string;
            readonly documents: readonly [{ readonly payloadSha256: string; readonly member: string; readonly pages: '2' }];
        };
        readonly minna: {
            readonly sourceId: 'japanese-minna:10-10';
            readonly reference: 'Minna no Nihongo I, Lesson 10';
            readonly relation: 'chronology-map-only';
            readonly reason: string;
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l16:lesson-4-workbook-1';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 141 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceSlice: readonly [1, 4];
        };
    };
    readonly payload: {
        readonly teaching: readonly ExistenceTeachingStep[];
        readonly rounds: readonly ExistenceLocationRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_ARCHIVE_SHA256 = 'ab7585b4d14d945535b90b6c64509e9c1b34caa96f0659b83b23920e893f46ba';
const MOODLE_GRAMMAR_SHA256 = 'b2143f1f2ce2469fe7e54d8f778d75956ae6c060bc44e2c39421bde470b8ac0b';
const GENKI_SHA256 = 'a4af27440a6e72bde55d011df350acd921199a0b558eb168ec46b380a3949e09';
const GENKI_SCRIPT_SHA256 = 'aad41fec9195385ef13a7e8280c6b2292c48d8857dfbcabd9c93c82fe968733a';
const EXACT_SOURCE_IDS = [
    'moodle:5881257:b2143f1f:p2:q3:1', 'moodle:5881257:b2143f1f:p2:q3:2',
    'moodle:5881257:b2143f1f:p2:q3:3', 'moodle:5881257:b2143f1f:p2:q3:4',
    'moodle:5881257:b2143f1f:p2:q3:5', 'moodle:5881257:b2143f1f:p2:q3:6',
    'moodle:5881257:b2143f1f:p2:q3:7', 'moodle:5881257:b2143f1f:p2:q3:8',
    'genki-2e:l1-l16:lesson-4-workbook-1:slot-1', 'genki-2e:l1-l16:lesson-4-workbook-1:slot-4',
] as const;

export const existenceLocationWorkbookPlugin: ActivityPlugin<ExistenceLocationWorkbookModel, ExistenceLocationResponse> = {
    kind: 'academy-existence-location-workbook',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (model.kind !== this.kind || model.responseKind !== 'existence-classification-and-source-transfer') {
            issues.push({ path: 'kind', message: 'Unexpected existence-location workbook contract.' });
        }
        if (model.answerSupport !== ACADEMY_ASSESSED_ANSWER_SUPPORT) {
            issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
        }
        validateProvenance(model, issues);
        if (!Array.isArray(model.payload?.teaching) || !model.payload.teaching.length) {
            issues.push({ path: 'payload.teaching', message: 'Teaching must precede assessment.' });
        }
        const rounds = model.payload?.rounds;
        if (!Array.isArray(rounds) || rounds.length !== EXACT_SOURCE_IDS.length) {
            issues.push({ path: 'payload.rounds', message: 'All ten exact source items are required.' });
        } else {
            rounds.forEach((round, index) => {
                if (round.sourceOrder !== index + 1) issues.push({ path: `payload.rounds.${index}.sourceOrder`, message: 'Source order must be deterministic.' });
                if (round.sourceQuestionId !== EXACT_SOURCE_IDS[index]) issues.push({ path: `payload.rounds.${index}.sourceQuestionId`, message: 'Unexpected source question id.' });
                if (!round.answerExpression || !round.conceptId || !round.errorTag) issues.push({ path: `payload.rounds.${index}`, message: 'Every source round needs answer and repair metadata.' });
                if (round.mode === 'classify' && ((round.nounClass === 'animate') !== (round.verb === 'います'))) {
                    issues.push({ path: `payload.rounds.${index}`, message: 'The noun classification must agree with its existence verb.' });
                }
                if (round.mode === 'typed' && !round.acceptedAnswers.length) issues.push({ path: `payload.rounds.${index}.acceptedAnswers`, message: 'Typed transfer needs accepted source answers.' });
            });
        }
        if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source item must be repaired before passing.' });
        validateFeedback(model.payload?.feedback, issues);
        return issues;
    },
    render(model, host, submit) {
        let disposed = false;
        let assessment: ReturnType<typeof assessmentView> | undefined;
        const showAssessment = (): void => {
            assessment = assessmentView(model, host, async response => {
                if (disposed || !assessment) return;
                setPending(assessment.root, true);
                try {
                    const evaluation = await submit(response);
                    showEvaluation(assessment.feedback, evaluation, host);
                    updateRepair(model, assessment.form, evaluation.result.errorTags, host);
                } finally {
                    if (!disposed && assessment) setPending(assessment.root, false);
                }
            });
            host.replace(assessment.root);
            assessment.form.querySelector<HTMLElement>('select, input')?.focus();
        };
        const teaching = document.createElement('section');
        teaching.className = 'academy-existence-workbook academy-existence-teaching';
        teaching.dataset.lessonPhase = 'teaching';
        const title = document.createElement('h3');
        title.append(...localizedNodes({ ja: '先に あります・います を分ける', en: 'Sort あります and います first' }));
        const grid = document.createElement('div');
        grid.className = 'academy-existence-teaching-grid';
        model.payload.teaching.forEach(step => grid.append(teachingCard(step)));
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'academy-button academy-button-primary academy-existence-start';
        start.textContent = host.language === 'ja' ? '元の問題へ' : 'Start source workbook';
        start.addEventListener('click', showAssessment, { once: true });
        teaching.append(title, grid, start);
        host.replace(teaching);
        return { focus: () => (assessment?.form ?? start).focus(), dispose: () => { disposed = true; } };
    },
    grade(model, response) {
        const answers = answerMap(response);
        const missed = model.payload.rounds.filter(round => !correct(round, answers.get(round.id)));
        return gradeFromScore((model.payload.rounds.length - missed.length) / model.payload.rounds.length,
            model.payload.passScore, missed.map(round => round.errorTag), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        const rounds = result.outcome === 'pass' ? model.payload.rounds : model.payload.rounds.filter(round => result.errorTags.includes(round.errorTag));
        return rounds.map(round => ({
            id: `review:l1-l16:existence:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: { expression: round.answerExpression, meanings: [round.sourcePrompt], sentence: round.answerExpression },
        } satisfies ReviewSeed));
    },
};

function validateProvenance(model: ExistenceLocationWorkbookModel, issues: ValidationIssue[]): void {
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l16' || provenance.answerVisibility !== 'after-attempt'
        || provenance.sourceOrder.join('|') !== 'moodle|minna-mapping|genki') {
        issues.push({ path: 'provenance', message: 'The Moodle-first source sequence is required.' });
    }
    if (provenance?.moodle?.moduleId !== 5881257 || provenance.moodle.archiveSha256 !== MOODLE_ARCHIVE_SHA256
        || provenance.moodle.documents[0]?.payloadSha256 !== MOODLE_GRAMMAR_SHA256) {
        issues.push({ path: 'provenance.moodle', message: 'The exact Moodle archive and grammar worksheet hashes are required.' });
    }
    if (provenance?.minna?.sourceId !== 'japanese-minna:10-10' || provenance.minna.relation !== 'chronology-map-only') {
        issues.push({ path: 'provenance.minna', message: 'Minna must remain an honest chronology-only mapping.' });
    }
    if (provenance?.genki?.taskId !== 'genki-2e:l1-l16:lesson-4-workbook-1'
        || provenance.genki.payloadSha256 !== GENKI_SHA256 || provenance.genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || provenance.genki.engine !== 'Genki.generateQuiz' || provenance.genki.sourceSlice.join('|') !== '1|4') {
        issues.push({ path: 'provenance.genki', message: 'The exact mapped Genki transfer task is required.' });
    }
}

function assessmentView(model: ExistenceLocationWorkbookModel, host: ActivityHost, onSubmit: (response: ExistenceLocationResponse) => Promise<void>) {
    const root = document.createElement('section');
    root.className = 'academy-existence-workbook academy-existence-assessment';
    root.dataset.lessonPhase = 'assessment';
    const form = document.createElement('form');
    const rounds = document.createElement('div');
    rounds.className = 'academy-existence-rounds';
    model.payload.rounds.forEach(round => rounds.append(roundView(round, host)));
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'academy-button academy-button-primary';
    submit.textContent = host.language === 'ja' ? '答えを確認する' : 'Check answers';
    const feedback = statusRegion('academy-existence-feedback');
    form.addEventListener('submit', event => { event.preventDefault(); void onSubmit(responseFrom(form, model.payload.rounds)); });
    form.append(rounds, submit, feedback); root.append(form);
    return { root, form, feedback };
}

function roundView(round: ExistenceLocationRound, host: ActivityHost): HTMLElement {
    const card = document.createElement('fieldset');
    card.className = 'academy-existence-round'; card.dataset.roundId = round.id;
    const legend = document.createElement('legend'); legend.textContent = `${round.sourceOrder}. ${round.sourceLabel}`;
    const prompt = document.createElement('p'); prompt.className = 'academy-existence-prompt'; prompt.textContent = round.sourcePrompt;
    card.append(legend, prompt);
    if (round.mode === 'classify') {
        card.append(selectFor(`${round.id}-class`, host.language === 'ja' ? '名詞の種類' : 'Noun type', [
            ['', host.language === 'ja' ? '選んでください' : 'Choose'], ['animate', host.language === 'ja' ? '人・動物' : 'Living person or animal'], ['inanimate', host.language === 'ja' ? '物' : 'Thing'],
        ]));
        card.append(selectFor(`${round.id}-verb`, host.language === 'ja' ? '文の最後' : 'Sentence ending', [
            ['', host.language === 'ja' ? '選んでください' : 'Choose'], ['います', 'います'], ['あります', 'あります'],
        ]));
    } else {
        const label = document.createElement('label'); label.htmlFor = `${round.id}-value`; label.textContent = host.language === 'ja' ? '日本語で入力' : 'Type in Japanese';
        const input = document.createElement('input'); input.id = `${round.id}-value`; input.name = `${round.id}-value`; input.autocomplete = 'off'; input.lang = 'ja'; input.required = true;
        label.append(input); card.append(label);
    }
    return card;
}

function selectFor(name: string, labelText: string, options: readonly (readonly [string, string])[]): HTMLLabelElement {
    const label = document.createElement('label'); label.htmlFor = name; label.textContent = labelText;
    const select = document.createElement('select'); select.id = name; select.name = name; select.required = true;
    options.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
    label.append(select); return label;
}

function responseFrom(form: HTMLFormElement, rounds: readonly ExistenceLocationRound[]): ExistenceLocationResponse {
    return { answers: rounds.map(round => round.mode === 'classify'
        ? { mode: 'classify' as const, roundId: round.id, nounClass: controlValue(form, `${round.id}-class`) as 'animate' | 'inanimate', verb: controlValue(form, `${round.id}-verb`) as 'います' | 'あります' }
        : { mode: 'typed' as const, roundId: round.id, value: controlValue(form, `${round.id}-value`) }) };
}

function controlValue(form: HTMLFormElement, name: string): string {
    const control = form.elements.namedItem(name);
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? control.value : '';
}

function updateRepair(model: ExistenceLocationWorkbookModel, form: HTMLFormElement, errorTags: readonly string[], host: ActivityHost): void {
    model.payload.rounds.forEach(round => {
        const card = form.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
        card.hidden = !errorTags.includes(round.errorTag);
        if (!card.hidden) addHint(card, round, model.id, host);
    });
}

function addHint(card: HTMLElement, round: ExistenceLocationRound, activityId: string, host: ActivityHost): void {
    if (card.querySelector('.academy-existence-hint-button')) return;
    let hintIndex = 0;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-button academy-existence-hint-button'; button.textContent = host.language === 'ja' ? 'ヒント' : 'Hint';
    const panel = document.createElement('p'); panel.className = 'academy-existence-hint-panel'; panel.hidden = true;
    button.addEventListener('click', () => {
        hintIndex = Math.min(hintIndex + 1, round.hint.length); panel.hidden = false; panel.dataset.hintIndex = String(hintIndex);
        panel.textContent = round.hint[hintIndex - 1]?.[host.language === 'ja' ? 'ja' : 'en'] ?? '';
        void host.recordSupportUse?.({ activityId, supportKind: 'hint', choiceId: round.id });
    });
    card.append(button, panel);
}

function teachingCard(step: ExistenceTeachingStep): HTMLElement {
    const card = document.createElement('article'); card.className = 'academy-existence-teaching-card';
    const source = document.createElement('p'); source.className = 'academy-existence-source'; source.textContent = step.sourceLabel;
    const pattern = document.createElement('strong'); pattern.textContent = step.pattern;
    const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
    const example = document.createElement('p'); example.className = 'academy-existence-example'; example.append(assessedJapanese(step.example));
    card.append(source, pattern, explanation, example); return card;
}

function answerMap(response: unknown): Map<string, ExistenceLocationAnswer> {
    if (!response || typeof response !== 'object' || !Array.isArray((response as ExistenceLocationResponse).answers)) return new Map();
    return new Map((response as ExistenceLocationResponse).answers.filter(answer => answer && typeof answer.roundId === 'string').map(answer => [answer.roundId, answer]));
}

function correct(round: ExistenceLocationRound, answer: ExistenceLocationAnswer | undefined): boolean {
    if (!answer || answer.mode !== round.mode) return false;
    if (round.mode === 'classify' && answer.mode === 'classify') {
        return answer.nounClass === round.nounClass && answer.verb === round.verb;
    }
    if (round.mode === 'typed' && answer.mode === 'typed') {
        return round.acceptedAnswers.some(value => normalizeJapanese(value) === normalizeJapanese(answer.value));
    }
    return false;
}
