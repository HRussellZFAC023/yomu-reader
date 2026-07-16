import './style.css';

import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityModel,
    ActivityPlugin,
    GradeResult,
    ReviewSeed,
    ValidationIssue,
} from '../../domain/activity-runtime';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from '../activity-kit/shared';

export type ShopProductVisual = 'shirt' | 'cd' | 'bag';

export interface ShopCounterProduct {
    readonly id: string;
    readonly label: string;
    readonly visual: ShopProductVisual;
}

export interface ShopCounterOption {
    readonly id: string;
    readonly label: string;
}

export interface ShopCounterRound {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly prompt: LocalizedText;
    readonly priceOptions: readonly ShopCounterOption[];
    readonly correctProductId: string;
    readonly correctPriceId: string;
    readonly request?: {
        readonly sourceQuestionId: string;
        readonly options: readonly ShopCounterOption[];
        readonly correctOptionId: string;
    };
    readonly errorTags: {
        readonly product: string;
        readonly price: string;
        readonly request?: string;
    };
}

export interface ShopCounterReviewTarget extends ReviewableTarget {
    readonly sourceQuestionId: string;
    readonly errorTags: readonly string[];
}

export interface ShopCounterResponse {
    readonly answers: readonly Readonly<{
        roundId: string;
        productId: string;
        priceId: string;
        requestId?: string;
    }>[];
}

export interface ShopCounterModel extends ActivityModel {
    readonly kind: 'academy-shop-counter';
    readonly responseKind: 'visual-shop-counter';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly products: readonly ShopCounterProduct[];
        readonly rounds: readonly ShopCounterRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ShopCounterReviewTarget[];
    };
}

const PRODUCT_SYMBOLS: Readonly<Record<ShopProductVisual, string>> = {
    shirt: '👕',
    cd: '💿',
    bag: '🛍️',
};

export const shopCounterPlugin: ActivityPlugin<ShopCounterModel, ShopCounterResponse> = {
    kind: 'academy-shop-counter',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const errorTags: string[] = [];
        let correct = 0;
        let criteria = 0;
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id)!;
            criteria += 2;
            if (answer.productId === round.correctProductId) correct += 1;
            else errorTags.push(round.errorTags.product);
            if (answer.priceId === round.correctPriceId) correct += 1;
            else errorTags.push(round.errorTags.price);
            if (round.request) {
                criteria += 1;
                if (answer.requestId === round.request.correctOptionId) correct += 1;
                else errorTags.push(round.errorTags.request!);
            }
        }
        return gradeFromScore(correct / criteria, model.payload.passScore, errorTags, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        const targets = result.outcome === 'pass'
            ? model.payload.reviewTargets
            : model.payload.reviewTargets.filter(target => target.errorTags.some(tag => result.errorTags.includes(tag)));
        return targets.map(target => reviewSeed(target, result));
    },
};

function validate(model: ShopCounterModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'Assessed shopping requires the answer-support contract.' });
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Shop checkout passes only with every criterion correct.' });

    const products = model.payload?.products;
    const productIds = new Set<string>();
    if (!Array.isArray(products) || products.length < 2) {
        issues.push({ path: 'payload.products', message: 'At least two visual products are required.' });
    } else products.forEach((product, index) => {
        if (!text(product.id) || productIds.has(product.id) || !text(product.label)
            || !Object.hasOwn(PRODUCT_SYMBOLS, product.visual)) {
            issues.push({ path: `payload.products.${index}`, message: 'Products need unique ids, Japanese labels, and supported visuals.' });
        }
        productIds.add(product.id);
    });

    const rounds = model.payload?.rounds;
    const roundIds = new Set<string>();
    const allErrorTags = new Set<string>();
    const errorTagSources = new Map<string, string>();
    if (!Array.isArray(rounds) || rounds.length === 0) {
        issues.push({ path: 'payload.rounds', message: 'At least one shop ticket is required.' });
    } else rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (!text(round.id) || roundIds.has(round.id)) issues.push({ path: `${path}.id`, message: 'Ticket ids must be stable and unique.' });
        roundIds.add(round.id);
        if (!text(round.sourceQuestionId)) issues.push({ path: `${path}.sourceQuestionId`, message: 'An exact source question id is required.' });
        if (!text(round.prompt?.en) || !text(round.prompt?.ja)) issues.push({ path: `${path}.prompt`, message: 'A bilingual ticket prompt is required.' });
        if (!productIds.has(round.correctProductId)) issues.push({ path: `${path}.correctProductId`, message: 'The correct product must be authored.' });
        validateOptions(round.priceOptions, round.correctPriceId, `${path}.priceOptions`, issues);
        if (round.request) {
            if (!text(round.request.sourceQuestionId)) issues.push({ path: `${path}.request.sourceQuestionId`, message: 'A request criterion needs its exact source question id.' });
            validateOptions(round.request.options, round.request.correctOptionId, `${path}.request.options`, issues);
        }
        if (Boolean(round.request) !== Boolean(round.errorTags.request)) {
            issues.push({ path: `${path}.errorTags.request`, message: 'Request tickets need exactly one request error tag.' });
        }
        const tags = [round.errorTags.product, round.errorTags.price, ...(round.errorTags.request ? [round.errorTags.request] : [])];
        tags.forEach((tag, tagIndex) => {
            if (!text(tag) || allErrorTags.has(tag)) issues.push({ path: `${path}.errorTags.${tagIndex}`, message: 'Criterion error tags must be nonempty and globally unique.' });
            allErrorTags.add(tag);
        });
        errorTagSources.set(round.errorTags.product, round.sourceQuestionId);
        errorTagSources.set(round.errorTags.price, round.sourceQuestionId);
        if (round.request && round.errorTags.request) errorTagSources.set(round.errorTags.request, round.request.sourceQuestionId);
    });

    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model.payload?.reviewTargets, model.conceptIds, issues);
    const coveredTags = new Set<string>();
    model.payload?.reviewTargets?.forEach((target, index) => {
        if (!text(target.sourceQuestionId)) issues.push({ path: `payload.reviewTargets.${index}.sourceQuestionId`, message: 'Review targets need exact source question ids.' });
        if (!target.errorTags?.length || target.errorTags.some(tag => !allErrorTags.has(tag))) {
            issues.push({ path: `payload.reviewTargets.${index}.errorTags`, message: 'Review targets must name authored criterion error tags.' });
        }
        if (target.errorTags?.some(tag => errorTagSources.get(tag) !== target.sourceQuestionId)) {
            issues.push({ path: `payload.reviewTargets.${index}.sourceQuestionId`, message: 'Review provenance must match every covered criterion.' });
        }
        target.errorTags?.forEach(tag => coveredTags.add(tag));
    });
    for (const tag of allErrorTags) {
        if (!coveredTags.has(tag)) issues.push({ path: 'payload.reviewTargets', message: `No review target covers ${tag}.` });
    }
    return issues;
}

function validateOptions(
    options: readonly ShopCounterOption[] | undefined,
    correctId: string,
    path: string,
    issues: ValidationIssue[],
): void {
    if (!Array.isArray(options) || options.length < 2) {
        issues.push({ path, message: 'A criterion needs at least two authored choices.' });
        return;
    }
    const ids = new Set(options.map(option => option.id));
    if (ids.size !== options.length || options.some(option => !text(option.id) || !text(option.label))) {
        issues.push({ path, message: 'Choices need unique ids and Japanese labels.' });
    }
    if (!ids.has(correctId)) issues.push({ path: `${path}.correctOptionId`, message: 'The correct choice must be authored.' });
}

function render(
    model: ShopCounterModel,
    host: ActivityHost,
    submit: (response: ShopCounterResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-shop-counter';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const form = document.createElement('form');
    form.className = 'academy-shop-counter-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.rounds.forEach((round, index) => form.append(renderTicket(model, round, index)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-shop-counter-check';
    check.textContent = host.language === 'ja' ? 'レジを確認する' : 'Check the counter';
    const status = statusRegion('academy-kit-feedback academy-shop-counter-feedback');
    form.append(check);
    root.append(heading, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? 'すべてのレジ券を完成させてください。' : 'Complete every part of each shop ticket.';
            status.textContent = message;
            host.announce(message);
            form.querySelector<HTMLInputElement>('input:not(:checked)')?.focus();
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
    }, { signal: lifecycle.signal });

    return {
        focus() { form.querySelector<HTMLInputElement>('input')?.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function renderTicket(model: ShopCounterModel, round: ShopCounterRound, index: number): HTMLElement {
    const ticket = document.createElement('article');
    ticket.className = 'academy-shop-ticket';
    ticket.dataset.ticketId = round.id;
    const title = document.createElement('h3');
    title.id = `${model.id}-${round.id}-title`;
    const number = document.createElement('span');
    number.className = 'academy-shop-ticket-number';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    const titleCopy = document.createElement('span');
    titleCopy.className = 'academy-shop-ticket-copy';
    titleCopy.append(...localizedNodes(round.prompt));
    title.append(number, titleCopy);
    ticket.append(title);
    const productGroup = radioGroup(
        `${model.id}-${round.id}-product`,
        { ja: 'しょうひん', en: 'Choose the item' },
        model.payload.products,
        option => productChoice(option),
    );
    const priceGroup = radioGroup(
        `${model.id}-${round.id}-price`,
        { ja: 'ねふだ', en: 'Choose the price tag' },
        round.priceOptions,
        option => assessedJapanese(option.label),
    );
    productGroup.setAttribute('aria-describedby', title.id);
    priceGroup.setAttribute('aria-describedby', title.id);
    ticket.append(productGroup, priceGroup);
    if (round.request) {
        const requestGroup = radioGroup(
            `${model.id}-${round.id}-request`,
            { ja: 'レジで いう ことば', en: 'Choose what to say at the counter' },
            round.request.options,
            option => assessedJapanese(option.label),
        );
        requestGroup.setAttribute('aria-describedby', title.id);
        ticket.append(requestGroup);
    }
    return ticket;
}

function radioGroup<Option extends ShopCounterOption>(
    name: string,
    legendText: LocalizedText,
    options: readonly Option[],
    content: (option: Option) => Node,
): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-shop-choice-group';
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(legendText));
    const choices = document.createElement('div');
    choices.className = 'academy-shop-choices';
    options.forEach(option => {
        const label = document.createElement('label');
        label.className = 'academy-shop-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = option.id;
        input.required = true;
        label.append(input, content(option));
        choices.append(label);
    });
    fieldset.append(legend, choices);
    return fieldset;
}

function productChoice(product: ShopCounterProduct): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const visual = document.createElement('span');
    visual.className = 'academy-shop-product-visual';
    visual.dataset.visual = product.visual;
    visual.setAttribute('aria-hidden', 'true');
    visual.textContent = PRODUCT_SYMBOLS[product.visual];
    fragment.append(visual, assessedJapanese(product.label));
    return fragment;
}

function responseFromForm(model: ShopCounterModel, form: HTMLFormElement): ShopCounterResponse | null {
    const answers: ShopCounterResponse['answers'][number][] = [];
    for (const round of model.payload.rounds) {
        const productId = selected(form, `${model.id}-${round.id}-product`);
        const priceId = selected(form, `${model.id}-${round.id}-price`);
        const requestId = round.request ? selected(form, `${model.id}-${round.id}-request`) : undefined;
        if (!productId || !priceId || (round.request && !requestId)) return null;
        answers.push({ roundId: round.id, productId, priceId, ...(requestId ? { requestId } : {}) });
    }
    return { answers };
}

function selected(form: HTMLFormElement, name: string): string | undefined {
    const value = new FormData(form).get(name);
    return typeof value === 'string' && value ? value : undefined;
}

function parseResponse(model: ShopCounterModel, response: ShopCounterResponse): ReadonlyMap<string, ShopCounterResponse['answers'][number]> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every shop ticket needs one complete answer.');
    }
    const answers = new Map<string, ShopCounterResponse['answers'][number]>();
    response.answers.forEach(answer => {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        const productIds = new Set(model.payload.products.map(product => product.id));
        const priceIds = new Set(round?.priceOptions.map(option => option.id) ?? []);
        const requestIds = new Set(round?.request?.options.map(option => option.id) ?? []);
        const validRequest = round?.request ? requestIds.has(answer.requestId ?? '') : answer.requestId === undefined;
        if (!round || answers.has(answer.roundId) || !productIds.has(answer.productId)
            || !priceIds.has(answer.priceId) || !validRequest) {
            throw new TypeError('Shop answers must use each authored ticket and choice exactly once.');
        }
        answers.set(answer.roundId, answer);
    });
    return answers;
}

function reviewSeed(target: ShopCounterReviewTarget, result: GradeResult): ReviewSeed {
    return {
        id: target.id,
        conceptId: target.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: target.sourceQuestionId,
        content: {
            expression: target.expression,
            ...(target.reading ? { reading: target.reading } : {}),
            meanings: [...target.meanings],
            ...(target.sentence ? { sentence: target.sentence } : {}),
        },
    };
}
