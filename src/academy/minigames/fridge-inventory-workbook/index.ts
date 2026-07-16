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

export interface FridgeInventoryTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

interface FridgeInventoryRoundBase {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hint: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface FridgeInventoryChoiceRound extends FridgeInventoryRoundBase {
    readonly mode: 'existence-choice' | 'quantity-choice';
    readonly options: readonly string[];
}

export interface FridgeInventoryTypedRound extends FridgeInventoryRoundBase {
    readonly mode: 'report-typed';
}

export type FridgeInventoryRound = FridgeInventoryChoiceRound | FridgeInventoryTypedRound;
export interface FridgeInventoryResponse {
    readonly answers: readonly Readonly<{ roundId: string; mode: FridgeInventoryRound['mode']; value: string }>[];
}

export interface FridgeInventoryWorkbookModel extends ActivityModel {
    readonly kind: 'academy-fridge-inventory-workbook';
    readonly responseKind: 'moodle-fridge-information-gap';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l18';
        readonly answerVisibility: 'after-attempt';
        readonly sourceOrder: readonly ['moodle', 'minna-mapping', 'genki-support'];
        readonly moodle: {
            readonly moduleId: 6200250;
            readonly archiveSha256: string;
            readonly documents: readonly [
                { readonly payloadSha256: string; readonly member: string; readonly pages: '1' },
                { readonly payloadSha256: string; readonly member: string; readonly pages: '1' },
                { readonly payloadSha256: string; readonly member: string; readonly pages: '1' },
            ];
            readonly audio: { readonly status: 'not-present-in-archive'; readonly memberCount: 0 };
        };
        readonly minna: {
            readonly sourceId: 'japanese-minna:11-11';
            readonly reference: 'Minna no Nihongo I, Lesson 11';
            readonly relation: 'chronology-map-only';
            readonly reason: string;
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l18:lesson-3-literacy-1';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 92 };
            readonly relation: 'post-instruction-counter-recognition-only';
            readonly reason: string;
        };
    };
    readonly payload: {
        readonly teaching: readonly FridgeInventoryTeachingStep[];
        readonly rounds: readonly FridgeInventoryRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const COUNTER_SUMMARY_SHA256 = '26c694d907c740415f1c4ea82635d7bd6ed64a3106406a4f033398f056c3f1f8';
const INFO_GAP_A_SHA256 = '425fb0138247c6a0328ca9d3006ffd0c6fa088c29945400598bda07f38f89b58';
const INFO_GAP_B_SHA256 = 'fdb6883084e6340d7e0ba3dcef7cb868b8e57c220759135f8e84051ce4192fa4';
const MOODLE_ARCHIVE_SHA256 = '2412b5cffe9f22758f583ac773293f1af371ef60e3c979650d10722499c593fa';
const GENKI_SHA256 = 'b20d58f1ada0f1785367cacaaf56e04363cf20e4134b4a4ef2aa0fee8114239c';
const GENKI_SCRIPT_SHA256 = '2232e46b99640e7232015d3aebce123865b5b2abf778119063fb8b45661cfd36';
const EXACT_SOURCE_IDS = [
    'moodle:6200250:26c694d9:p1:q1',
    'moodle:6200250:425fb013:p1:q1',
    'moodle:6200250:425fb013:p1:q2',
    'moodle:6200250:425fb013:p1:q3',
    'moodle:6200250:425fb013:p1:q4',
    'moodle:6200250:fdb68830:p1:q5',
    'moodle:6200250:425fb013:p1:report-1',
    'moodle:6200250:fdb68830:p1:report-2',
] as const;

export const fridgeInventoryWorkbookPlugin: ActivityPlugin<FridgeInventoryWorkbookModel, FridgeInventoryResponse> = {
    kind: 'academy-fridge-inventory-workbook',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (model.kind !== this.kind || model.responseKind !== 'moodle-fridge-information-gap') {
            issues.push({ path: 'kind', message: 'Unexpected fridge inventory workbook contract.' });
        }
        if (model.answerSupport !== ACADEMY_ASSESSED_ANSWER_SUPPORT) {
            issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
        }
        validateProvenance(model, issues);
        if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length < 3) {
            issues.push({ path: 'payload.teaching', message: 'Three Moodle teaching steps must precede assessment.' });
        }
        const rounds = model.payload?.rounds;
        if (!Array.isArray(rounds) || rounds.length !== EXACT_SOURCE_IDS.length) {
            issues.push({ path: 'payload.rounds', message: 'All eight Moodle source rounds are required.' });
        } else {
            rounds.forEach((round, index) => {
                if (round.sourceOrder !== index + 1 || round.sourceQuestionId !== EXACT_SOURCE_IDS[index]) {
                    issues.push({ path: `payload.rounds.${index}`, message: 'Source order must be exact and deterministic.' });
                }
                if (!round.answerExpression || !round.acceptedAnswers.length || !round.conceptId || !round.errorTag || round.hint.length !== 3) {
                    issues.push({ path: `payload.rounds.${index}`, message: 'Every source round needs answer and repair metadata.' });
                }
                if (round.mode !== 'report-typed' && !round.options.length) {
                    issues.push({ path: `payload.rounds.${index}.options`, message: 'Choice source rounds need answer options.' });
                }
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
        const root = document.createElement('section');
        root.className = 'academy-fridge-inventory-workbook'; root.dataset.lessonPhase = 'teaching';
        const title = document.createElement('h3'); title.append(...localizedNodes({ ja: '先に数える型を読む', en: 'Read the counting frames first' }));
        const grid = document.createElement('div'); grid.className = 'academy-fridge-inventory-teaching-grid';
        model.payload.teaching.forEach(step => grid.append(teachingCard(step)));
        const start = document.createElement('button'); start.type = 'button'; start.className = 'academy-button academy-button-primary academy-fridge-inventory-start';
        start.textContent = host.language === 'ja' ? '元の冷蔵庫問題へ' : 'Start source fridge workbook';
        start.addEventListener('click', showAssessment, { once: true });
        root.append(title, grid, start); host.replace(root);
        return { focus: () => (assessment?.form ?? start).focus(), dispose: () => { disposed = true; } };
    },
    grade(model, response) {
        const answers = new Map((response?.answers ?? []).map(answer => [answer.roundId, answer]));
        const missed = model.payload.rounds.filter(round => {
            const answer = answers.get(round.id);
            return !answer || answer.mode !== round.mode || !round.acceptedAnswers.some(value => normalizeJapanese(value) === normalizeJapanese(answer.value));
        });
        return gradeFromScore((model.payload.rounds.length - missed.length) / model.payload.rounds.length,
            model.payload.passScore, missed.map(round => round.errorTag), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        const rounds = result.outcome === 'pass' ? model.payload.rounds : model.payload.rounds.filter(round => result.errorTags.includes(round.errorTag));
        return rounds.map(round => ({
            id: `review:l1-l18:fridge:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: { expression: round.answerExpression, meanings: [round.sourcePrompt], sentence: round.answerExpression },
        } satisfies ReviewSeed));
    },
};

function validateProvenance(model: FridgeInventoryWorkbookModel, issues: ValidationIssue[]): void {
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l18' || provenance.answerVisibility !== 'after-attempt'
        || provenance.sourceOrder?.join('|') !== 'moodle|minna-mapping|genki-support') {
        issues.push({ path: 'provenance', message: 'The Moodle-first source sequence is required.' });
    }
    const documents = provenance?.moodle?.documents ?? [];
    if (provenance?.moodle?.moduleId !== 6200250 || provenance.moodle.archiveSha256 !== MOODLE_ARCHIVE_SHA256
        || documents[0]?.payloadSha256 !== COUNTER_SUMMARY_SHA256 || documents[1]?.payloadSha256 !== INFO_GAP_A_SHA256
        || documents[2]?.payloadSha256 !== INFO_GAP_B_SHA256
        || provenance.moodle.audio.status !== 'not-present-in-archive' || provenance.moodle.audio.memberCount !== 0) {
        issues.push({ path: 'provenance.moodle', message: 'The exact Moodle archive, worksheets, and honest no-audio status are required.' });
    }
    if (provenance?.minna?.sourceId !== 'japanese-minna:11-11' || provenance.minna.relation !== 'chronology-map-only'
        || !provenance.minna.reason.includes('No Minna wording or answer')) {
        issues.push({ path: 'provenance.minna', message: 'Minna must remain an honest chronology-only mapping.' });
    }
    if (provenance?.genki?.taskId !== 'genki-2e:l1-l18:lesson-3-literacy-1'
        || provenance.genki.payloadSha256 !== GENKI_SHA256 || provenance.genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || provenance.genki.lineLocus.start !== 76 || provenance.genki.lineLocus.end !== 92
        || provenance.genki.relation !== 'post-instruction-counter-recognition-only'
        || !provenance.genki.reason.includes('No Genki wording or answer')) {
        issues.push({ path: 'provenance.genki', message: 'Genki must remain post-instruction support only.' });
    }
}

function assessmentView(model: FridgeInventoryWorkbookModel, host: ActivityHost, onSubmit: (response: FridgeInventoryResponse) => Promise<void>) {
    const root = document.createElement('section'); root.className = 'academy-fridge-inventory-workbook'; root.dataset.lessonPhase = 'assessment';
    const form = document.createElement('form'); const rounds = document.createElement('div'); rounds.className = 'academy-fridge-inventory-rounds';
    model.payload.rounds.forEach(round => rounds.append(roundView(round, host)));
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'academy-button academy-button-primary'; submit.textContent = host.language === 'ja' ? '答えを確認する' : 'Check answers';
    const feedback = statusRegion('academy-fridge-inventory-feedback');
    form.addEventListener('submit', event => { event.preventDefault(); void onSubmit(responseFrom(form, model.payload.rounds)); });
    form.append(rounds, submit, feedback); root.append(form);
    return { root, form, feedback };
}

function roundView(round: FridgeInventoryRound, host: ActivityHost): HTMLElement {
    const card = document.createElement('fieldset'); card.className = 'academy-fridge-inventory-round'; card.dataset.roundId = round.id;
    const legend = document.createElement('legend'); legend.textContent = `${round.sourceOrder}. ${round.sourceLabel}`;
    const prompt = document.createElement('p'); prompt.className = 'academy-fridge-inventory-prompt'; prompt.append(assessedJapanese(round.sourcePrompt));
    const label = document.createElement('label'); label.htmlFor = `${round.id}-value`; label.textContent = round.mode === 'report-typed'
        ? (host.language === 'ja' ? '日本語で入力' : 'Type the source report in Japanese')
        : (host.language === 'ja' ? '答え' : 'Answer');
    if (round.mode === 'report-typed') {
        const input = document.createElement('input'); input.id = `${round.id}-value`; input.name = `${round.id}-value`; input.autocomplete = 'off'; input.lang = 'ja'; input.required = true; label.append(input);
    } else {
        const select = document.createElement('select'); select.id = `${round.id}-value`; select.name = `${round.id}-value`; select.required = true;
        [['', host.language === 'ja' ? '選んでください' : 'Choose'], ...round.options.map(value => [value, value] as const)].forEach(([value, text]) => {
            const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
        });
        label.append(select);
    }
    card.append(legend, prompt, label); return card;
}

function responseFrom(form: HTMLFormElement, rounds: readonly FridgeInventoryRound[]): FridgeInventoryResponse {
    return { answers: rounds.map(round => ({ roundId: round.id, mode: round.mode, value: controlValue(form, `${round.id}-value`) })) };
}

function controlValue(form: HTMLFormElement, name: string): string {
    const control = form.elements.namedItem(name);
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? control.value : '';
}

function updateRepair(model: FridgeInventoryWorkbookModel, form: HTMLFormElement, errorTags: readonly string[], host: ActivityHost): void {
    model.payload.rounds.forEach(round => {
        const card = form.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
        card.hidden = !errorTags.includes(round.errorTag);
        if (!card.hidden) addHint(card, round, model.id, host);
    });
}

function addHint(card: HTMLElement, round: FridgeInventoryRound, activityId: string, host: ActivityHost): void {
    if (card.querySelector('.academy-fridge-inventory-hint-button')) return;
    let hintIndex = 0;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-button academy-fridge-inventory-hint-button'; button.textContent = host.language === 'ja' ? 'ヒント' : 'Hint';
    const panel = document.createElement('p'); panel.className = 'academy-fridge-inventory-hint-panel'; panel.hidden = true;
    button.addEventListener('click', () => {
        hintIndex = Math.min(hintIndex + 1, round.hint.length); panel.hidden = false; panel.dataset.hintIndex = String(hintIndex);
        panel.textContent = round.hint[hintIndex - 1]?.[host.language === 'ja' ? 'ja' : 'en'] ?? '';
        void host.recordSupportUse?.({ activityId, supportKind: 'hint', choiceId: round.id });
    });
    card.append(button, panel);
}

function teachingCard(step: FridgeInventoryTeachingStep): HTMLElement {
    const card = document.createElement('article'); card.className = 'academy-fridge-inventory-teaching-card';
    const source = document.createElement('p'); source.className = 'academy-fridge-inventory-source'; source.textContent = step.sourceLabel;
    const pattern = document.createElement('strong'); pattern.textContent = step.pattern;
    const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
    const example = document.createElement('p'); example.className = 'academy-fridge-inventory-example'; example.append(assessedJapanese(step.example));
    card.append(source, pattern, explanation, example); return card;
}
