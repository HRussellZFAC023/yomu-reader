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
    gradeFromScore,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export type ObjectDistancePositionId = 'speaker' | 'listener' | 'far';

export interface ObjectDistanceTeachingStep {
    readonly sourceOrder: number;
    readonly pronoun: string;
    readonly position: ObjectDistancePositionId | 'viewpoint';
    readonly rule: LocalizedText;
    readonly example: string;
}

export interface ObjectDistancePosition {
    readonly id: ObjectDistancePositionId;
    readonly label: LocalizedText;
}

export interface ObjectDistanceRound {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourcePrompt: string;
    readonly context: LocalizedText;
    readonly correctPositionId: ObjectDistancePositionId;
    readonly pronoun: 'これ' | 'それ' | 'あれ';
    readonly answerSentence: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface ObjectDistanceBoardResponse {
    readonly placements: readonly Readonly<{ roundId: string; positionId: ObjectDistancePositionId }>[];
}

export interface ObjectDistanceBoardModel extends ActivityModel {
    readonly kind: 'academy-object-distance-board';
    readonly responseKind: 'object-distance-three-position-board';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l04';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5822243;
            readonly grammar: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly sourceTitle: string;
                readonly author: string;
                readonly pages: readonly number[];
            };
            readonly answerKey: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly sourceTitle: string;
                readonly page: 1;
            };
        };
        readonly minna: {
            readonly reference: string;
            readonly relation: 'course-sequence-and-byte-identified-audio-only';
            readonly audioMember: {
                readonly title: string;
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly archiveOrder: 3;
                readonly durationSeconds: 36.884917;
            };
            readonly transcriptStatus: 'not-provided-do-not-invent';
        };
        readonly genki: {
            readonly sourceId: string;
            readonly relativePath: string;
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 123 };
            readonly engine: 'Genki.generateQuiz';
            readonly responseAdaptation: string;
        };
    };
    readonly payload: {
        readonly teaching: readonly ObjectDistanceTeachingStep[];
        readonly positions: readonly ObjectDistancePosition[];
        readonly rounds: readonly ObjectDistanceRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const EXACT_POSITION_ORDER: readonly ObjectDistancePositionId[] = ['speaker', 'listener', 'far'];
const EXACT_ROUND_POSITIONS: readonly ObjectDistancePositionId[] = [
    'speaker', 'listener', 'far', 'speaker', 'speaker', 'listener', 'speaker', 'far', 'far',
];

export const objectDistanceBoardPlugin: ActivityPlugin<ObjectDistanceBoardModel, ObjectDistanceBoardResponse> = {
    kind: 'academy-object-distance-board',
    validate,
    render,
    grade(model, response) {
        const placements = parseResponse(model, response);
        let correct = 0;
        const errorTags: string[] = [];
        model.payload.rounds.forEach(round => {
            if (placements.get(round.id)?.positionId === round.correctPositionId) correct += 1;
            else errorTags.push(round.errorTag);
        });
        return gradeFromScore(
            correct / model.payload.rounds.length,
            model.payload.passScore,
            errorTags.sort(),
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

function validate(model: ObjectDistanceBoardModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The object board requires assessed answer support.' });
    }
    validateProvenance(model.provenance, issues);
    validateTeaching(model.payload?.teaching, issues);
    validatePositions(model.payload?.positions, issues);
    validateRounds(model, issues);
    if (model.payload?.passScore !== 1) {
        issues.push({ path: 'payload.passScore', message: 'Every exact Genki source slot is required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateProvenance(
    value: ObjectDistanceBoardModel['provenance'] | undefined,
    issues: ValidationIssue[],
): void {
    const grammar = value?.moodle?.grammar;
    const answer = value?.moodle?.answerKey;
    if (value?.packageId !== 'l1-l04' || value?.answerVisibility !== 'after-attempt'
        || value?.moodle?.moduleId !== 5822243
        || grammar?.payloadSha256 !== '83bf2695e5760fdf415c31eabf96586a31f373f6b339849467fa7c88dbdde49b'
        || grammar?.sourceTitle !== 'Chapter 2-1 Grammar Exercise'
        || grammar?.author !== 'Rie Tsuruta-Barratt'
        || grammar?.pages?.join(',') !== '1,2,3,4,5,6,7'
        || answer?.payloadSha256 !== '0d33601e79064e1d08e46988bab8f1cd7738dabf829ece3efe9ae7e60e575249'
        || answer?.sourceTitle !== 'Chapter 2-2 これはなんですか answer' || answer?.page !== 1) {
        issues.push({ path: 'provenance.moodle', message: 'Exact Lesson 4 Moodle instruction and answer-key provenance is required.' });
    }
    const minna = value?.minna;
    if (minna?.reference !== 'Minna no Nihongo I, Lesson 2'
        || minna?.relation !== 'course-sequence-and-byte-identified-audio-only'
        || minna?.audioMember?.title !== 'minna shokyu 1 005'
        || minna?.audioMember?.payloadSha256 !== '62f3b96d10028d1eb1d6e39020a76cd72003d5d9cf651a70bc895bd3c66bd450'
        || minna?.audioMember?.archiveOrder !== 3
        || minna?.audioMember?.durationSeconds !== 36.884917
        || minna?.transcriptStatus !== 'not-provided-do-not-invent') {
        issues.push({ path: 'provenance.minna', message: 'Minna must remain a byte-identified audio-only anchor without an invented transcript.' });
    }
    const genki = value?.genki;
    if (genki?.sourceId !== 'japanese-genki-interactive:69eb24f468086afac22f58fbac149c4765026d38477926417f42835e0dfa9b53:generateQuiz'
        || genki?.payloadSha256 !== '69eb24f468086afac22f58fbac149c4765026d38477926417f42835e0dfa9b53'
        || genki?.scriptSha256 !== '52ce8ff929718489eab63f648eb8f82b12f5b7324f3727e76a6bf84d5559474c'
        || genki?.relativePath !== 'lessons/lesson-2/workbook-2/index.html'
        || genki?.lineLocus?.start !== 76 || genki?.lineLocus?.end !== 123
        || genki?.engine !== 'Genki.generateQuiz'
        || !text(genki?.responseAdaptation).includes('exact-prompts-answers-and-order')) {
        issues.push({ path: 'provenance.genki', message: 'The exact mapped Genki workbook task and adaptation policy are required.' });
    }
    for (const [path, sourceId, digest] of [
        ['provenance.moodle.grammar.sourceId', grammar?.sourceId, grammar?.payloadSha256],
        ['provenance.moodle.answerKey.sourceId', answer?.sourceId, answer?.payloadSha256],
        ['provenance.minna.audioMember.sourceId', minna?.audioMember?.sourceId, minna?.audioMember?.payloadSha256],
    ] as const) {
        if (sourceId !== `moodle-payload:${digest}`) issues.push({ path, message: 'Source id must carry the exact payload digest.' });
    }
}

function validateTeaching(
    steps: readonly ObjectDistanceTeachingStep[] | undefined,
    issues: ValidationIssue[],
): void {
    if (!Array.isArray(steps) || steps.length !== 4) {
        issues.push({ path: 'payload.teaching', message: 'Teach all three positions and the reciprocal viewpoint before assessment.' });
        return;
    }
    const expected = [
        ['これ', 'speaker'], ['それ', 'listener'], ['あれ', 'far'], ['これ／それ', 'viewpoint'],
    ] as const;
    steps.forEach((step, index) => {
        if (step.sourceOrder !== index + 1 || step.pronoun !== expected[index][0] || step.position !== expected[index][1]
            || !text(step.rule?.ja) || !text(step.rule?.en) || !text(step.example)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching must preserve the Moodle position and viewpoint sequence.' });
        }
    });
}

function validatePositions(
    positions: readonly ObjectDistancePosition[] | undefined,
    issues: ValidationIssue[],
): void {
    if (!Array.isArray(positions) || positions.map(position => position.id).join(',') !== EXACT_POSITION_ORDER.join(',')) {
        issues.push({ path: 'payload.positions', message: 'The board needs speaker, listener, and far positions in source order.' });
        return;
    }
    positions.forEach((position, index) => {
        if (!text(position.label?.en) || !text(position.label?.ja)) {
            issues.push({ path: `payload.positions.${index}.label`, message: 'Position labels must be bilingual.' });
        }
    });
}

function validateRounds(model: ObjectDistanceBoardModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 9) {
        issues.push({ path: 'payload.rounds', message: 'The exact nine Genki workbook slots are required.' });
        return;
    }
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    const errorTags = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        const expectedPronoun = round.correctPositionId === 'speaker'
            ? 'これ'
            : round.correctPositionId === 'listener' ? 'それ' : 'あれ';
        if (!text(round.id) || ids.has(round.id) || round.sourceOrder !== index + 1
            || round.correctPositionId !== EXACT_ROUND_POSITIONS[index]
            || round.pronoun !== expectedPronoun
            || !text(round.sourcePrompt) || !text(round.context?.en) || !text(round.context?.ja)
            || !text(round.answerSentence) || !model.conceptIds.includes(round.conceptId)) {
            issues.push({ path, message: 'Each exact Genki slot needs its source order, spatial answer, prompt, context, and Concept.' });
        }
        ids.add(round.id);
        if (!text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
            || round.sourceQuestionId !== `genki-2e:l1-l04:lesson-2-workbook-2:slot-${index + 1}`) {
            issues.push({ path: `${path}.sourceQuestionId`, message: 'Genki source slot ids must be exact and unique.' });
        }
        sourceIds.add(round.sourceQuestionId);
        if (!text(round.errorTag) || errorTags.has(round.errorTag)) {
            issues.push({ path: `${path}.errorTag`, message: 'Round error tags must be unique.' });
        }
        errorTags.add(round.errorTag);
    });
}

function render(
    model: ObjectDistanceBoardModel,
    host: ActivityHost,
    submit: (response: ObjectDistanceBoardResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-object-distance-board';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'academy-button academy-button-primary academy-object-distance-start';
    start.textContent = host.language === 'ja' ? '位置ボードを始める' : 'Start the position board';
    const status = statusRegion('academy-kit-feedback academy-object-distance-feedback');
    root.append(heading, teaching, start, status);
    host.replace(root);

    let form: HTMLFormElement | undefined;
    start.addEventListener('click', () => {
        form = renderAssessment(model, host, submit, root, status);
        start.remove();
        root.insertBefore(form, status);
        form.querySelector<HTMLInputElement>('input')?.focus();
    }, { once: true, signal: lifecycle.signal });

    return {
        focus() { (form?.querySelector('input') ?? start).focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function renderTeaching(model: ObjectDistanceBoardModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-object-distance-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const article = document.createElement('article');
        article.className = 'academy-object-distance-teaching-step';
        const title = document.createElement('h3');
        title.className = 'academy-japanese';
        title.lang = 'ja';
        title.textContent = step.pronoun;
        const rule = document.createElement('p');
        rule.append(...localizedNodes(step.rule));
        const example = document.createElement('p');
        example.className = 'academy-object-distance-example academy-japanese';
        example.lang = 'ja';
        example.textContent = step.example;
        article.append(title, rule, example);
        section.append(article);
    });
    return section;
}

function renderAssessment(
    model: ObjectDistanceBoardModel,
    host: ActivityHost,
    submit: (response: ObjectDistanceBoardResponse) => Promise<ActivityEvaluation>,
    root: HTMLElement,
    status: HTMLElement,
): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'academy-object-distance-form';
    form.dataset.lessonPhase = 'assessment';
    form.setAttribute('aria-labelledby', `${model.id}-prompt`);
    model.payload.rounds.forEach(round => form.append(renderRound(model, round)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-object-distance-check';
    check.textContent = host.language === 'ja' ? '九つの位置を確認する' : 'Check all nine positions';
    form.append(check);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '九つの場面すべてに位置を選んでください。' : 'Choose a position for all nine scenarios.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    });
    return form;
}

function renderRound(model: ObjectDistanceBoardModel, round: ObjectDistanceRound): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-object-distance-round';
    fieldset.dataset.roundId = round.id;
    const legend = document.createElement('legend');
    legend.id = `${model.id}-${round.id}-prompt`;
    legend.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
    const context = document.createElement('p');
    context.id = `${model.id}-${round.id}-context`;
    context.className = 'academy-object-distance-context';
    context.append(...localizedNodes(round.context));
    const choices = document.createElement('div');
    choices.className = 'academy-object-distance-choices';
    model.payload.positions.forEach(position => {
        const label = document.createElement('label');
        label.className = 'academy-object-distance-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `${model.id}-${round.id}`;
        input.value = position.id;
        input.required = true;
        label.append(input, ...localizedNodes(position.label));
        choices.append(label);
    });
    fieldset.setAttribute('aria-describedby', context.id);
    fieldset.append(legend, context, choices);
    return fieldset;
}

function responseFromForm(
    model: ObjectDistanceBoardModel,
    form: HTMLFormElement,
): ObjectDistanceBoardResponse | null {
    const placements: ObjectDistanceBoardResponse['placements'][number][] = [];
    for (const round of model.payload.rounds) {
        const value = new FormData(form).get(`${model.id}-${round.id}`);
        if (value !== 'speaker' && value !== 'listener' && value !== 'far') return null;
        placements.push({ roundId: round.id, positionId: value });
    }
    return { placements };
}

function parseResponse(
    model: ObjectDistanceBoardModel,
    response: ObjectDistanceBoardResponse,
): ReadonlyMap<string, ObjectDistanceBoardResponse['placements'][number]> {
    if (!response || !Array.isArray(response.placements) || response.placements.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Genki source slot needs one position.');
    }
    const placements = new Map<string, ObjectDistanceBoardResponse['placements'][number]>();
    response.placements.forEach(placement => {
        if (!model.payload.rounds.some(round => round.id === placement.roundId) || placements.has(placement.roundId)
            || !EXACT_POSITION_ORDER.includes(placement.positionId)) {
            throw new TypeError('Placements must use each source slot and board position exactly once per round.');
        }
        placements.set(placement.roundId, placement);
    });
    return placements;
}

function reviewSeed(round: ObjectDistanceRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l04:object-distance:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: {
            expression: round.pronoun,
            meanings: [round.context.en],
            sentence: round.answerSentence,
        },
    };
}
