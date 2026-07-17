import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    createActivityRuntime,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityPlugin,
    type GradeResult,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import {
    assessedJapanese,
    gradeFromScore,
    japanese,
    localized,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
} from '../../minigames/activity-kit/shared';
import { N2_POLICY_SCOPE_PROVENANCE } from './source';
import {
    N2_POLICY_SCOPE_ACTIVITY_KIND,
    type N2PolicyScopeModel,
    type N2PolicyScopeQuestion,
    type N2PolicyScopeResponse,
} from './types';

const n2PolicyScopePlugin: ActivityPlugin<N2PolicyScopeModel, N2PolicyScopeResponse> = {
    kind: N2_POLICY_SCOPE_ACTIVITY_KIND,
    validate: validateN2PolicyScope,
    render: renderN2PolicyScope,
    grade: gradeN2PolicyScope,
    toReviewSeeds: n2PolicyScopeReviewSeeds,
};

export function createN2PolicyScopeRuntime() {
    return createActivityRuntime([n2PolicyScopePlugin]);
}

export function validateN2PolicyScope(model: N2PolicyScopeModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    }
    if (!sameObject(model.provenance, N2_POLICY_SCOPE_PROVENANCE)) {
        issues.push({ path: 'provenance', message: 'The exact permitted-library source locus and rights contract are required.' });
    }
    if (model.payload?.rehearsal?.authorship !== 'original-yomu-n2-rehearsal'
        || model.payload.rehearsal.paragraphs.length !== 2
        || model.payload.rehearsal.paragraphs.some(paragraph => !text(paragraph))
        || model.payload.rehearsal.playbackText !== model.payload.rehearsal.paragraphs.join(' ')) {
        issues.push({ path: 'payload.rehearsal', message: 'The complete original two-paragraph N2 rehearsal is required.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 3
        || model.payload.teaching.some(item => !text(item.title.ja) || !text(item.title.en)
            || !text(item.example) || !text(item.explanation.ja) || !text(item.explanation.en))) {
        issues.push({ path: 'payload.teaching', message: 'Three bilingual scope teaching points are required.' });
    }
    validateQuestions(model, issues);
    validatePassScore(model.payload?.passScore, issues);
    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model, issues);
    return issues;
}

function gradeN2PolicyScope(model: N2PolicyScopeModel, response: N2PolicyScopeResponse): GradeResult {
    const answers = parseResponse(model, response);
    const missed = model.payload.questions.filter(question => answers.get(question.id) !== question.correctOptionId);
    return gradeFromScore(
        (model.payload.questions.length - missed.length) / model.payload.questions.length,
        model.payload.passScore,
        missed.map(question => question.errorTag),
        model.payload.feedback,
    );
}

function n2PolicyScopeReviewSeeds(model: N2PolicyScopeModel, result: GradeResult): readonly ReviewSeed[] {
    const targets = result.outcome === 'pass'
        ? model.payload.reviewTargets
        : model.payload.reviewTargets.filter(target => target.repairFor.some(tag => result.errorTags.includes(tag)));
    return targets.map(target => ({
        id: target.id,
        conceptId: target.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: model.sourceQuestionId,
        content: {
            expression: target.expression,
            ...(target.reading ? { reading: target.reading } : {}),
            meanings: [...target.meanings],
            sentence: target.sentence,
        },
    }));
}

function renderN2PolicyScope(
    model: N2PolicyScopeModel,
    host: ActivityHost,
    submit: (response: N2PolicyScopeResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const mediaNote = document.createElement('p');
    mediaNote.className = 'academy-support';
    mediaNote.textContent = host.language === 'ja'
        ? '再生はオリジナルのN2リハーサルです。許可済みの参照資料本文・画像・原音声は配信されません。'
        : 'Playback is an original N2 rehearsal; the permitted reference text, images, and original media are not delivered.';
    const readingDisposers: Array<() => void> = [];
    const playbackDisposers: Array<{ dispose(): void }> = [];
    const form = document.createElement('form');
    form.setAttribute('aria-labelledby', heading.id);
    form.append(renderTeaching(model, host, readingDisposers));
    form.append(renderRehearsal(model, host, readingDisposers, playbackDisposers, lifecycle.signal));
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '四つの判断を確定する' : 'Commit all four judgments';
    const status = statusRegion('academy-kit-feedback');
    form.append(commit);
    root.append(heading, mediaNote, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '四つの質問すべてに答えてください。' : 'Answer all four questions.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(form, false);
        }).catch(error => {
            setPending(form, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { heading.focus(); },
        dispose() {
            lifecycle.abort();
            readingDisposers.forEach(dispose => dispose());
            playbackDisposers.forEach(disposable => disposable.dispose());
            root.remove();
        },
    };
}

function renderTeaching(model: N2PolicyScopeModel, host: ActivityHost, disposers: Array<() => void>): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'instruction';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '聞く前の三つの手がかり' : 'Three cues before rehearsal';
    const list = document.createElement('ol');
    model.payload.teaching.forEach((item, index) => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = localized(item.title, host);
        const example = japanese(item.example);
        example.dataset.readerSurfaceId = `teaching:${model.provenance.packageId}:${index + 1}`;
        registerSurface(host, example, disposers);
        const explanation = document.createElement('p');
        explanation.textContent = localized(item.explanation, host);
        row.append(title, example, explanation);
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderRehearsal(
    model: N2PolicyScopeModel,
    host: ActivityHost,
    readingDisposers: Array<() => void>,
    playbackDisposers: Array<{ dispose(): void }>,
    signal: AbortSignal,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-recognition';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(model.payload.rehearsal.title));
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-button academy-button-secondary';
    play.dataset.rehearsalPlayback = 'synthesized-original-n2';
    play.textContent = host.language === 'ja' ? 'オリジナルN2リハーサルを聞く' : 'Play original N2 rehearsal';
    play.addEventListener('click', () => void playRehearsal(model.payload.rehearsal.playbackText, host, playbackDisposers), { signal });
    const article = document.createElement('article');
    model.payload.rehearsal.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement('p');
        const span = japanese(paragraph);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:rehearsal:paragraph-${index + 1}`;
        registerSurface(host, span, readingDisposers);
        row.append(span);
        article.append(row);
    });
    section.append(heading, play, article);
    model.payload.questions.forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderQuestion(question: N2PolicyScopeQuestion): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.questionId = question.id;
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(question.prompt));
    fieldset.append(legend);
    question.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = option.id;
        const copy = document.createElement('span');
        copy.append(assessedJapanese(option.label.ja), document.createTextNode(` ${option.label.en}`));
        label.append(input, copy);
        fieldset.append(label);
    });
    return fieldset;
}

function responseFromForm(model: N2PolicyScopeModel, form: HTMLFormElement): N2PolicyScopeResponse | undefined {
    const answers = model.payload.questions.map(question => {
        const selected = form.querySelector<HTMLInputElement>(`input[name="${question.id}"]:checked`);
        return selected ? { questionId: question.id, optionId: selected.value } : undefined;
    });
    return answers.every(answer => answer !== undefined) ? { answers } : undefined;
}

function parseResponse(model: N2PolicyScopeModel, response: N2PolicyScopeResponse): ReadonlyMap<string, string> {
    if (!Array.isArray(response?.answers) || response.answers.length !== model.payload.questions.length) {
        throw new TypeError('Every N2 policy-scope question needs exactly one answer.');
    }
    const answers = new Map<string, string>();
    for (const answer of response.answers) {
        if (!answer || !text(answer.questionId) || !text(answer.optionId) || answers.has(answer.questionId)) {
            throw new TypeError('N2 policy-scope answers must have unique question and option ids.');
        }
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError(`Invalid N2 policy-scope answer: ${answer.questionId}`);
        }
        answers.set(answer.questionId, answer.optionId);
    }
    return answers;
}

function validateQuestions(model: N2PolicyScopeModel, issues: ValidationIssue[]): void {
    const questions = model.payload.questions;
    if (questions.length !== 4) {
        issues.push({ path: 'payload.questions', message: 'Four N2 scope judgments are required.' });
        return;
    }
    const ids = new Set<string>();
    for (const [index, question] of questions.entries()) {
        if (!text(question.id) || ids.has(question.id) || !text(question.prompt.ja) || !text(question.prompt.en)
            || !Array.isArray(question.options) || question.options.length !== 3
            || !question.options.some(option => option.id === question.correctOptionId)
            || !text(question.errorTag)) {
            issues.push({ path: `payload.questions.${index}`, message: 'Questions need unique ids, bilingual prompts, three options, and a valid answer.' });
        }
        ids.add(question.id);
    }
}

function validateReviewTargets(model: N2PolicyScopeModel, issues: ValidationIssue[]): void {
    const targets = model.payload.reviewTargets;
    if (targets.length !== 4 || targets.some(target =>
        !text(target.id) || !text(target.conceptId) || !text(target.expression) || !text(target.sentence)
        || !Array.isArray(target.meanings) || target.meanings.length === 0
        || !Array.isArray(target.repairFor) || target.repairFor.length === 0)) {
        issues.push({ path: 'payload.reviewTargets', message: 'Four complete N2 review targets are required.' });
    }
}

function registerSurface(host: ActivityHost, surface: HTMLElement, disposers: Array<() => void>): void {
    const dispose = host.registerReadingSurface?.(surface);
    if (dispose) disposers.push(dispose);
}

async function playRehearsal(textToPlay: string, host: ActivityHost, disposers: Array<{ dispose(): void }>): Promise<void> {
    const playback = await host.playPronunciation?.(textToPlay);
    if (playback) disposers.push(playback);
}

function sameObject(left: object, right: object): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
