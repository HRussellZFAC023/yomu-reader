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
} from '../activity-kit/shared';
import { N2_EVENT_INFORMATION_PROVENANCE } from './source';
import {
    N2_EVENT_INFORMATION_ACTIVITY_KIND,
    type N2EventInformationModel,
    type N2EventInformationQuestion,
    type N2EventInformationResponse,
} from './types';

export const n2EventInformationPlugin: ActivityPlugin<N2EventInformationModel, N2EventInformationResponse> = {
    kind: N2_EVENT_INFORMATION_ACTIVITY_KIND,
    validate: validateN2EventInformation,
    render: renderN2EventInformation,
    grade: gradeN2EventInformation,
    toReviewSeeds: n2EventInformationReviewSeeds,
};

export function createN2EventInformationRuntime() {
    return createActivityRuntime([n2EventInformationPlugin]);
}

export function validateN2EventInformation(model: N2EventInformationModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    }
    if (JSON.stringify(model.provenance) !== JSON.stringify(N2_EVENT_INFORMATION_PROVENANCE)) {
        issues.push({ path: 'provenance', message: 'The exact permitted Soya file and item pins are required.' });
    }
    if (model.payload.notice.authorship !== 'original-yomu-n2-notice'
        || model.payload.notice.paragraphs.length !== 3
        || model.payload.notice.paragraphs.some(paragraph => !text(paragraph))
        || model.payload.notice.playbackText !== model.payload.notice.paragraphs.join(' ')
        || model.payload.notice.facts.length !== 5) {
        issues.push({ path: 'payload.notice', message: 'The complete original three-paragraph notice and five-row grid are required.' });
    }
    if (model.payload.teaching.length !== 3
        || model.payload.teaching.some(item => !text(item.title.ja) || !text(item.title.en)
            || !text(item.example) || !text(item.explanation.ja) || !text(item.explanation.en))) {
        issues.push({ path: 'payload.teaching', message: 'Three bilingual pre-retrieval teaching points are required.' });
    }
    validateQuestions(model, issues);
    validateActionSequence(model, issues);
    validatePassScore(model.payload.passScore, issues);
    validateFeedback(model.payload.feedback, issues);
    if (model.payload.reviewTargets.length !== 4 || model.payload.reviewTargets.some(target =>
        !text(target.id) || !model.conceptIds.includes(target.conceptId) || !text(target.expression)
        || !text(target.sentence) || !target.meanings.length || !target.repairFor.length)) {
        issues.push({ path: 'payload.reviewTargets', message: 'Four targeted N2 repair records are required.' });
    }
    return issues;
}

function gradeN2EventInformation(
    model: N2EventInformationModel,
    response: N2EventInformationResponse,
): GradeResult {
    const parsed = parseResponse(model, response);
    const missed = model.payload.questions.filter(question => parsed.answers.get(question.id) !== question.correctOptionId);
    const sequenceCorrect = sameStrings(parsed.actionOrder, model.payload.actionSequence.correctOrder);
    const errorTags = [
        ...missed.map(question => question.errorTag),
        ...(sequenceCorrect ? [] : [model.payload.actionSequence.errorTag]),
    ];
    const score = (model.payload.questions.length - missed.length + Number(sequenceCorrect))
        / (model.payload.questions.length + 1);
    return gradeFromScore(score, model.payload.passScore, errorTags, model.payload.feedback);
}

function n2EventInformationReviewSeeds(
    model: N2EventInformationModel,
    result: GradeResult,
): readonly ReviewSeed[] {
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

function renderN2EventInformation(
    model: N2EventInformationModel,
    host: ActivityHost,
    submit: (response: N2EventInformationResponse) => Promise<ActivityEvaluation>,
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
        ? '表示と再生は、よむが作成した練習用の案内です。参照したSoyaの本文、解答、媒体は配信されません。'
        : 'The displayed and synthesized notice is original Yomu rehearsal; the referenced Soya text, answers, and media are not delivered.';
    const readingDisposers: Array<() => void> = [];
    const playbackDisposers: Array<{ dispose(): void }> = [];
    const form = document.createElement('form');
    form.setAttribute('aria-labelledby', heading.id);
    form.append(
        renderTeaching(model, host, readingDisposers),
        renderNotice(model, host, readingDisposers, playbackDisposers, lifecycle.signal),
        renderRetrieval(model, host),
        renderActionSequence(model, host),
    );
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '判断と順番を確定する' : 'Commit judgments and order';
    const status = statusRegion('academy-kit-feedback');
    form.append(commit);
    root.append(heading, mediaNote, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '三つの質問に答え、四つの行動を一度ずつ選んでください。'
                : 'Answer all three questions and use each of the four actions once.';
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

function renderTeaching(
    model: N2EventInformationModel,
    host: ActivityHost,
    disposers: Array<() => void>,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'instruction';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '検索する前の三つの印' : 'Three marks before retrieval';
    const list = document.createElement('ol');
    model.payload.teaching.forEach((item, index) => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = localized(item.title, host);
        const example = japanese(item.example);
        example.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:teaching:${index + 1}`;
        registerSurface(host, example, disposers);
        const explanation = document.createElement('p');
        explanation.textContent = localized(item.explanation, host);
        row.append(title, example, explanation);
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderNotice(
    model: N2EventInformationModel,
    host: ActivityHost,
    readingDisposers: Array<() => void>,
    playbackDisposers: Array<{ dispose(): void }>,
    signal: AbortSignal,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'source-inspection';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(model.payload.notice.title));
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-button academy-button-secondary';
    play.dataset.noticePlayback = 'synthesized-original-n2';
    play.textContent = host.language === 'ja' ? 'オリジナル案内を聞く' : 'Play original notice';
    play.addEventListener('click', () => void playNotice(model.payload.notice.playbackText, host, playbackDisposers), { signal });
    const table = document.createElement('table');
    table.dataset.modality = 'visual-constraint-grid';
    const body = document.createElement('tbody');
    model.payload.notice.facts.forEach((item, index) => {
        const row = document.createElement('tr');
        const label = document.createElement('th');
        label.scope = 'row';
        label.textContent = localized(item.label, host);
        const value = document.createElement('td');
        const surface = japanese(item.value);
        surface.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:grid:${index + 1}`;
        registerSurface(host, surface, readingDisposers);
        value.append(surface);
        row.append(label, value);
        body.append(row);
    });
    table.append(body);
    const article = document.createElement('article');
    model.payload.notice.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement('p');
        const surface = japanese(paragraph);
        surface.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:notice:paragraph-${index + 1}`;
        registerSurface(host, surface, readingDisposers);
        row.append(surface);
        article.append(row);
    });
    section.append(heading, play, table, article);
    return section;
}

function renderRetrieval(model: N2EventInformationModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-retrieval';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '案内から情報を探す' : 'Information retrieval';
    section.append(heading);
    model.payload.questions.forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderQuestion(question: N2EventInformationQuestion): HTMLFieldSetElement {
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

function renderActionSequence(model: N2EventInformationModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-sequencing';
    section.dataset.modality = 'ordered-action';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(model.payload.actionSequence.prompt));
    const list = document.createElement('ol');
    model.payload.actionSequence.correctOrder.forEach((_, index) => {
        const row = document.createElement('li');
        const select = document.createElement('select');
        select.name = `action-order-${index + 1}`;
        select.setAttribute('aria-label', host.language === 'ja' ? `${index + 1}番目の行動` : `Action ${index + 1}`);
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = host.language === 'ja' ? '行動を選ぶ' : 'Choose an action';
        select.append(placeholder);
        model.payload.actionSequence.actions.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = localized(item.label, host);
            select.append(option);
        });
        row.append(select);
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function responseFromForm(model: N2EventInformationModel, form: HTMLFormElement): N2EventInformationResponse | undefined {
    const answers = model.payload.questions.map(question => {
        const selected = form.querySelector<HTMLInputElement>(`input[name="${question.id}"]:checked`);
        return selected ? { questionId: question.id, optionId: selected.value } : undefined;
    });
    const actionOrder = model.payload.actionSequence.correctOrder.map((_, index) =>
        form.querySelector<HTMLSelectElement>(`select[name="action-order-${index + 1}"]`)?.value ?? '');
    if (!answers.every(answer => answer !== undefined)
        || actionOrder.some(value => !value)
        || new Set(actionOrder).size !== actionOrder.length) return undefined;
    return { answers, actionOrder };
}

function parseResponse(model: N2EventInformationModel, response: N2EventInformationResponse) {
    if (!Array.isArray(response?.answers) || response.answers.length !== model.payload.questions.length) {
        throw new TypeError('Every N2 event-information question needs exactly one answer.');
    }
    const answers = new Map<string, string>();
    for (const answer of response.answers) {
        if (!answer || !text(answer.questionId) || !text(answer.optionId) || answers.has(answer.questionId)) {
            throw new TypeError('N2 event-information answers must use unique question and option ids.');
        }
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError(`Invalid N2 event-information answer: ${answer.questionId}`);
        }
        answers.set(answer.questionId, answer.optionId);
    }
    const validActions = new Set(model.payload.actionSequence.actions.map(action => action.id));
    if (!Array.isArray(response.actionOrder)
        || response.actionOrder.length !== validActions.size
        || new Set(response.actionOrder).size !== validActions.size
        || response.actionOrder.some(action => !validActions.has(action))) {
        throw new TypeError('The N2 event-information action order must contain every action exactly once.');
    }
    return { answers, actionOrder: response.actionOrder };
}

function validateQuestions(model: N2EventInformationModel, issues: ValidationIssue[]): void {
    if (model.payload.questions.length !== 3) {
        issues.push({ path: 'payload.questions', message: 'Three N2 information-retrieval judgments are required.' });
        return;
    }
    const ids = new Set<string>();
    model.payload.questions.forEach((question, index) => {
        if (!text(question.id) || ids.has(question.id) || !text(question.prompt.ja) || !text(question.prompt.en)
            || question.options.length !== 3 || !question.options.some(option => option.id === question.correctOptionId)
            || !text(question.errorTag)) {
            issues.push({ path: `payload.questions.${index}`, message: 'Questions need unique ids, bilingual prompts, three options, and a valid answer.' });
        }
        ids.add(question.id);
    });
}

function validateActionSequence(model: N2EventInformationModel, issues: ValidationIssue[]): void {
    const sequence = model.payload.actionSequence;
    const ids = sequence.actions.map(action => action.id);
    if (sequence.actions.length !== 4 || new Set(ids).size !== 4
        || sequence.correctOrder.length !== 4 || !sameStrings([...ids].sort(), [...sequence.correctOrder].sort())) {
        issues.push({ path: 'payload.actionSequence', message: 'The ordered modality must contain each of four actions exactly once.' });
    }
}

function registerSurface(host: ActivityHost, surface: HTMLElement, disposers: Array<() => void>): void {
    const dispose = host.registerReadingSurface?.(surface);
    if (dispose) disposers.push(dispose);
}

async function playNotice(value: string, host: ActivityHost, disposers: Array<{ dispose(): void }>): Promise<void> {
    const playback = await host.playPronunciation?.(value);
    if (playback) disposers.push(playback);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
