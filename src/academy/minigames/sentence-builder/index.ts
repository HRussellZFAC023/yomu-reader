import './style.css';

import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityModel,
    ActivityPlugin,
    ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    reviewSeeds,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from '../activity-kit/shared';

export interface SentenceBuilderToken {
    readonly id: string;
    readonly label: string;
}

export interface SentenceBuilderProvenance {
    readonly sourceId: string;
    readonly relativePath: string;
    readonly payloadSha256: string;
    readonly lineLocus: Readonly<{ start: number; end: number }>;
    readonly rights: 'permitted-mit' | 'moodle-teaching-material';
    readonly reuse: 'verbatim-rendered-quiz-prompt-and-answer' | 'verbatim-rendered-teaching-sentence';
}

export interface SentenceBuilderSourceAudio {
    readonly title: LocalizedText;
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly url: string;
    readonly durationSeconds: number;
    readonly transcriptStatus: 'not-provided-do-not-invent';
}

export interface SentenceBuilderSourceSurface {
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
    readonly caption: LocalizedText;
}

export interface SentenceBuilderMapping {
    readonly academyWeek: string;
    readonly moodleModuleId: number;
    readonly curriculum: readonly string[];
    readonly skills: readonly string[];
    readonly jlpt: string;
}

export interface SentenceBuilderModel extends ActivityModel {
    readonly kind: 'academy-sentence-builder';
    readonly responseKind: 'tapped-token-order';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly tokens: readonly SentenceBuilderToken[];
        readonly correctOrder: readonly string[];
        readonly sourceSentence: string;
        readonly source: SentenceBuilderProvenance;
        readonly sourceSurface?: SentenceBuilderSourceSurface;
        readonly sourceAudio?: readonly SentenceBuilderSourceAudio[];
        readonly mapping: SentenceBuilderMapping;
        readonly errorTag: string;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

export interface SentenceBuilderResponse {
    readonly order: readonly string[];
}

export const sentenceBuilderPlugin: ActivityPlugin<SentenceBuilderModel, SentenceBuilderResponse> = {
    kind: 'academy-sentence-builder',
    validate,
    render,
    grade(model, response) {
        const order = parseResponse(model, response);
        const correctPositions = order.filter((id, index) => model.payload.correctOrder[index] === id).length;
        return gradeFromScore(
            correctPositions / model.payload.correctOrder.length,
            1,
            [model.payload.errorTag],
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return reviewSeeds(model.payload.reviewTargets, result, model.sourceQuestionId);
    },
};

function validate(model: SentenceBuilderModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'Assessed sentence building requires the answer-support contract.' });
    const tokens = model.payload?.tokens;
    if (!Array.isArray(tokens) || tokens.length < 3) {
        issues.push({ path: 'payload.tokens', message: 'At least three sentence tokens are required.' });
        return issues;
    }
    const ids = tokens.map(token => token.id);
    if (new Set(ids).size !== ids.length || tokens.some(token => !text(token.id) || !text(token.label))) {
        issues.push({ path: 'payload.tokens', message: 'Sentence tokens need unique ids and visible labels.' });
    }
    const order = model.payload.correctOrder;
    if (!Array.isArray(order) || order.length !== tokens.length
        || new Set(order).size !== tokens.length || order.some(id => !ids.includes(id))) {
        issues.push({ path: 'payload.correctOrder', message: 'The answer must use every token exactly once.' });
    } else {
        const assembled = order.map(id => tokens.find(token => token.id === id)?.label ?? '').join('');
        if (assembled !== model.payload.sourceSentence) {
            issues.push({ path: 'payload.sourceSentence', message: 'The correct token order must reproduce the verbatim source sentence.' });
        }
    }
    validateSource(model, issues);
    if (!text(model.payload?.errorTag)) issues.push({ path: 'payload.errorTag', message: 'A deterministic error tag is required.' });
    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model.payload?.reviewTargets, model.conceptIds, issues);
    return issues;
}

function validateSource(model: SentenceBuilderModel, issues: ValidationIssue[]): void {
    const source = model.payload?.source;
    if (!text(source?.sourceId) || !text(source?.relativePath)) {
        issues.push({ path: 'payload.source', message: 'An exact logical source locator is required.' });
    }
    if (!/^[a-f0-9]{64}$/u.test(source?.payloadSha256 ?? '')) {
        issues.push({ path: 'payload.source.payloadSha256', message: 'A SHA-256 source fingerprint is required.' });
    }
    if (!Number.isSafeInteger(source?.lineLocus?.start) || !Number.isSafeInteger(source?.lineLocus?.end)
        || source.lineLocus.start < 1 || source.lineLocus.end < source.lineLocus.start) {
        issues.push({ path: 'payload.source.lineLocus', message: 'A valid source line locus is required.' });
    }
    const permittedSourcePair = (source?.rights === 'permitted-mit' && source.reuse === 'verbatim-rendered-quiz-prompt-and-answer')
        || (source?.rights === 'moodle-teaching-material' && source.reuse === 'verbatim-rendered-teaching-sentence');
    if (!permittedSourcePair) {
        issues.push({ path: 'payload.source.rights', message: 'Verbatim activities require a matched authorised source contract.' });
    }
    const mapping = model.payload?.mapping;
    if (!text(mapping?.academyWeek) || !Number.isSafeInteger(mapping?.moodleModuleId)
        || !mapping?.curriculum?.length || !mapping.curriculum.every(text)
        || !mapping?.skills?.length || !mapping.skills.every(text) || !text(mapping?.jlpt)) {
        issues.push({ path: 'payload.mapping', message: 'Curriculum, week, Moodle module, skills, and JLPT mappings are required.' });
    }
    validateSourceSurface(model.payload?.sourceSurface, issues);
    validateSourceAudio(model.payload?.sourceAudio, issues);
}

function validateSourceSurface(value: SentenceBuilderSourceSurface | undefined, issues: ValidationIssue[]): void {
    if (!value) return;
    if (!/^\/academy\/content\/lessons\/[a-z0-9-]+\/[a-z0-9-]+\.png$/u.test(value.url)
        || !/^[a-f0-9]{64}$/u.test(value.sha256)
        || !text(value.alt?.en) || !text(value.alt?.ja)
        || !text(value.caption?.en) || !text(value.caption?.ja)) {
        issues.push({ path: 'payload.sourceSurface', message: 'A source page needs a pinned public image and bilingual description.' });
    }
}

function validateSourceAudio(value: readonly SentenceBuilderSourceAudio[] | undefined, issues: ValidationIssue[]): void {
    if (!value) return;
    const seen = new Set<string>();
    value.forEach((track, index) => {
        if (!text(track.title?.en) || !text(track.title?.ja) || !text(track.sourceId)
            || !/^[a-f0-9]{64}$/u.test(track.payloadSha256)
            || !/^\/academy\/content\/lessons\/[a-z0-9-]+\/[a-z0-9-]+\.mp3$/u.test(track.url)
            || !Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0
            || track.transcriptStatus !== 'not-provided-do-not-invent' || seen.has(track.url)) {
            issues.push({ path: `payload.sourceAudio.${index}`, message: 'Each source audio track needs an exact public delivery without an invented transcript.' });
        }
        seen.add(track.url);
    });
}

function render(
    model: SentenceBuilderModel,
    host: ActivityHost,
    submit: (response: SentenceBuilderResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-sentence-builder';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));

    const answer = document.createElement('div');
    answer.className = 'academy-sentence-builder-answer';
    answer.setAttribute('role', 'group');
    answer.setAttribute('aria-label', host.language === 'ja' ? '組み立てた文' : 'Built sentence');
    answer.setAttribute('aria-live', 'polite');

    const bank = document.createElement('div');
    bank.className = 'academy-sentence-builder-bank';
    bank.setAttribute('role', 'group');
    bank.setAttribute('aria-label', host.language === 'ja' ? 'ことば' : 'Word bank');

    const actions = document.createElement('div');
    actions.className = 'academy-sentence-builder-actions';
    const reset = actionButton(host.language === 'ja' ? 'やり直す' : 'Reset');
    const check = actionButton(host.language === 'ja' ? '文を確認' : 'Check sentence', true);
    check.className = 'academy-button academy-button-primary';
    actions.append(reset, check);

    const status = statusRegion('academy-kit-feedback');
    root.append(
        heading,
        ...[sourceSurface(model), sourceAudio(model)].filter((value): value is HTMLElement => Boolean(value)),
        answer,
        bank,
        actions,
        status,
    );
    host.replace(root);

    const placed: string[] = [];
    const renderTokens = (focusId?: string): void => {
        answer.replaceChildren(...placed.map(id => tokenButton(model, id, true, () => {
            placed.splice(placed.indexOf(id), 1);
            renderTokens(id);
        }, lifecycle.signal, host.language)));
        const remaining = model.payload.tokens.filter(token => !placed.includes(token.id));
        bank.replaceChildren(...remaining.map(token => tokenButton(model, token.id, false, () => {
            placed.push(token.id);
            renderTokens(token.id);
        }, lifecycle.signal, host.language)));
        answer.dataset.empty = String(placed.length === 0);
        if (placed.length === 0) answer.replaceChildren(assessedJapanese(host.language === 'ja' ? 'ことばをここに並べます。' : 'Build the sentence here.'));
        check.disabled = placed.length !== model.payload.tokens.length;
        reset.disabled = placed.length === 0;
        if (focusId) queueMicrotask(() => root.querySelector<HTMLButtonElement>(`[data-token-id="${focusId}"]`)?.focus());
    };

    reset.addEventListener('click', () => {
        placed.splice(0);
        renderTokens();
        bank.querySelector<HTMLButtonElement>('button')?.focus();
        host.announce(host.language === 'ja' ? '文をリセットしました。' : 'Sentence reset.');
    }, { signal: lifecycle.signal });

    check.addEventListener('click', () => {
        setPending(root, true);
        void submit({ order: [...placed] }).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                setPending(root, false);
                answer.querySelector<HTMLButtonElement>('button')?.focus();
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    renderTokens();
    return {
        focus() { bank.querySelector<HTMLButtonElement>('button')?.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function sourceSurface(model: SentenceBuilderModel): HTMLElement | undefined {
    const source = model.payload.sourceSurface;
    if (!source) return undefined;
    const figure = document.createElement('figure');
    figure.className = 'academy-sentence-builder-source';
    const image = document.createElement('img');
    image.src = source.url;
    image.alt = source.alt.en;
    image.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.append(...localizedNodes(source.caption));
    figure.append(image, caption);
    return figure;
}

function sourceAudio(model: SentenceBuilderModel): HTMLElement | undefined {
    const tracks = model.payload.sourceAudio;
    if (!tracks?.length) return undefined;
    const section = document.createElement('section');
    section.className = 'academy-sentence-builder-audio';
    const heading = document.createElement('h3');
    heading.textContent = 'Moodle audio';
    section.append(heading, ...tracks.map(track => {
        const label = document.createElement('p');
        label.append(...localizedNodes(track.title));
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'metadata';
        audio.src = track.url;
        const wrapper = document.createElement('div');
        wrapper.append(label, audio);
        return wrapper;
    }));
    return section;
}

function tokenButton(
    model: SentenceBuilderModel,
    id: string,
    placed: boolean,
    action: () => void,
    signal: AbortSignal,
    language: ActivityHost['language'],
): HTMLButtonElement {
    const token = model.payload.tokens.find(candidate => candidate.id === id)!;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-sentence-builder-token';
    button.dataset.tokenId = id;
    button.dataset.placed = String(placed);
    button.lang = 'ja';
    button.textContent = token.label;
    button.setAttribute('aria-label', language === 'ja'
        ? `${token.label}を${placed ? '戻す' : '文に追加'}`
        : `${placed ? 'Return' : 'Add'} ${token.label}`);
    button.addEventListener('click', action, { signal });
    return button;
}

function actionButton(label: string, disabled = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button';
    button.textContent = label;
    button.disabled = disabled;
    return button;
}

function parseResponse(model: SentenceBuilderModel, response: SentenceBuilderResponse): readonly string[] {
    const order = response?.order;
    const tokenIds = model.payload.tokens.map(token => token.id);
    if (!Array.isArray(order) || order.length !== tokenIds.length
        || new Set(order).size !== order.length || order.some(id => !tokenIds.includes(id))) {
        throw new TypeError('A sentence-builder response must use every authored token exactly once.');
    }
    return order;
}
