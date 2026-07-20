import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
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
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
    validateReviewTargets,
} from '../../minigames/activity-kit/shared';
import type {
    N2OpeningActivityModel,
    N2OpeningAnswer,
    N2OpeningChoiceQuestion,
    N2OpeningOrderingQuestion,
    N2OpeningQuestion,
    N2OpeningResponse,
    N2OpeningTypedQuestion,
} from './types';

export interface N2OpeningPluginContract<Model extends N2OpeningActivityModel> {
    readonly kind: Model['kind'];
    readonly packageId: Model['provenance']['packageId'];
    readonly order: Model['payload']['sequence']['order'];
    readonly sourceDelivery: 'reference-only' | 'exact-media';
    validateProvenance(model: Model): readonly ValidationIssue[];
    validateMedia?(model: Model): readonly ValidationIssue[];
}

export function createN2OpeningPlugin<Model extends N2OpeningActivityModel>(
    contract: N2OpeningPluginContract<Model>,
): ActivityPlugin<Model, N2OpeningResponse> {
    return Object.freeze({
        kind: contract.kind,
        validate(model: Model) { return validateN2OpeningModel(model, contract); },
        render: renderN2Opening,
        grade: gradeN2Opening,
        toReviewSeeds: n2OpeningReviewSeeds,
    });
}

function validateN2OpeningModel<Model extends N2OpeningActivityModel>(
    model: Model,
    contract: N2OpeningPluginContract<Model>,
): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [...contract.validateProvenance(model)];
    if (model.kind !== contract.kind) issues.push({ path: 'kind', message: 'The concrete N2 package plugin kind is required.' });
    if (model.provenance?.packageId !== contract.packageId) issues.push({ path: 'provenance.packageId', message: 'The concrete N2 package id is required.' });
    if (model.provenance?.answerVisibility !== 'after-attempt') issues.push({ path: 'provenance.answerVisibility', message: 'Answers must remain gated until after commitment.' });
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    if (model.payload?.sequence?.order !== contract.order || model.payload?.sequence?.total !== 5) {
        issues.push({ path: 'payload.sequence', message: 'The package must retain its stable N2 opening-sequence position.' });
    }
    const sequence = model.payload?.sequence;
    if (!text(sequence?.introduces) || !Array.isArray(sequence?.recycles)
        || sequence.recycles.includes(sequence.introduces)
        || new Set(sequence.recycles).size !== sequence.recycles.length
        || !model.conceptIds.includes(sequence.introduces)
        || sequence.recycles.some(conceptId => !model.conceptIds.includes(conceptId))) {
        issues.push({ path: 'payload.sequence', message: 'Exactly one new Concept and distinct recycled Concepts are required.' });
    }
    const instruction = model.payload?.instruction;
    if (instruction?.authorship !== 'original-yomu-authored'
        || !text(instruction.title?.ja) || !text(instruction.title?.en)
        || !instruction.entries?.length
        || instruction.entries.some(entry => !text(entry.japanese) || !text(entry.explanation?.ja) || !text(entry.explanation?.en))) {
        issues.push({ path: 'payload.instruction', message: 'Complete original bilingual instruction must precede assessment.' });
    }
    const content = model.payload?.content;
    if (content?.authorship !== 'original-yomu-authored'
        || !text(content.title?.ja) || !text(content.title?.en)
        || !content.paragraphs?.length || content.paragraphs.some(paragraph => !text(paragraph))) {
        issues.push({ path: 'payload.content', message: 'Complete original Yomu practice text is required.' });
    }
    if (contract.sourceDelivery === 'reference-only' && model.payload?.media) {
        issues.push({ path: 'payload.media', message: 'Reference-only packages cannot deliver source media.' });
    }
    if (contract.sourceDelivery === 'exact-media' && !model.payload?.media) {
        issues.push({ path: 'payload.media', message: 'The exact-media package requires its pinned source media.' });
    }
    if (contract.validateMedia) issues.push(...contract.validateMedia(model));
    validateQuestions(model.payload?.questions, issues);
    validatePassScore(model.payload?.passScore, issues);
    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model.payload?.reviewTargets, model.conceptIds, issues);
    const errorTags = new Set(model.payload?.questions?.map(question => question.errorTag) ?? []);
    if (model.payload?.reviewTargets?.some(target => !text(target.sentence) || !target.repairFor.length
        || target.repairFor.some(tag => !errorTags.has(tag)))) {
        issues.push({ path: 'payload.reviewTargets', message: 'Each review target needs a sentence and declared repair tags.' });
    }
    return issues;
}

function validateQuestions(questions: readonly N2OpeningQuestion[] | undefined, issues: ValidationIssue[]): void {
    if (!Array.isArray(questions) || !questions.length) {
        issues.push({ path: 'payload.questions', message: 'At least one gradable question is required.' });
        return;
    }
    if (new Set(questions.map(question => question.id)).size !== questions.length) {
        issues.push({ path: 'payload.questions', message: 'Question ids must be unique.' });
    }
    questions.forEach((question, index) => {
        const path = `payload.questions.${index}`;
        if (!text(question.id) || !text(question.prompt?.ja) || !text(question.prompt?.en) || !text(question.errorTag)) {
            issues.push({ path, message: 'Every question needs an id, bilingual prompt, and error tag.' });
            return;
        }
        if (question.kind === 'choice') validateChoice(question, path, issues);
        else if (question.kind === 'ordering') validateOrdering(question, path, issues);
        else if (question.kind === 'typed') validateTyped(question, path, issues);
        else issues.push({ path: `${path}.kind`, message: 'Unknown N2 question kind.' });
    });
}

function validateChoice(question: N2OpeningChoiceQuestion, path: string, issues: ValidationIssue[]): void {
    if (question.options.length < 3
        || new Set(question.options.map(option => option.id)).size !== question.options.length
        || question.options.some(option => !text(option.id) || !text(option.label?.ja) || !text(option.label?.en))
        || !question.options.some(option => option.id === question.correctOptionId)) {
        issues.push({ path, message: 'Choice questions need distinct bilingual options and one declared answer.' });
    }
}

function validateOrdering(question: N2OpeningOrderingQuestion, path: string, issues: ValidationIssue[]): void {
    const actionIds = question.actions.map(action => action.id);
    if (actionIds.length < 3
        || new Set(actionIds).size !== actionIds.length
        || question.actions.some(action => !text(action.id) || !text(action.label?.ja) || !text(action.label?.en))
        || !isPermutation(question.presentationOrder, actionIds)
        || !isPermutation(question.correctOrder, actionIds)
        || sameObject(question.presentationOrder, question.correctOrder)) {
        issues.push({ path, message: 'Ordering requires distinct actions and a deterministic presentation order different from the answer.' });
    }
}

function validateTyped(question: N2OpeningTypedQuestion, path: string, issues: ValidationIssue[]): void {
    if (!text(question.fieldLabel?.ja) || !text(question.fieldLabel?.en)
        || !question.acceptedAnswers.length || question.acceptedAnswers.some(answer => !text(answer))) {
        issues.push({ path, message: 'Typed questions need a bilingual field label and explicit accepted answers.' });
    }
}

function gradeN2Opening(model: N2OpeningActivityModel, response: N2OpeningResponse): GradeResult {
    const answers = parseAnswers(model, response);
    const missed = model.payload.questions.filter(question => !isCorrect(question, answers.get(question.id)!));
    return gradeFromScore(
        (model.payload.questions.length - missed.length) / model.payload.questions.length,
        model.payload.passScore,
        missed.map(question => question.errorTag),
        model.payload.feedback,
    );
}

function n2OpeningReviewSeeds(model: N2OpeningActivityModel, result: GradeResult): readonly ReviewSeed[] {
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

function renderN2Opening(
    model: N2OpeningActivityModel,
    host: ActivityHost,
    submit: (response: N2OpeningResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const readingDisposers: Array<() => void> = [];
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-n2-opening';
    root.dataset.activityId = model.id;
    root.dataset.sequenceOrder = String(model.payload.sequence.order);
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const sourceNote = document.createElement('p');
    sourceNote.dataset.sourceDelivery = model.payload.media ? 'exact-media-gated-transcript' : 'reference-only';
    sourceNote.textContent = model.payload.media
        ? (host.language === 'ja'
            ? 'Soyaの画像と音声は原本どおりです。文字起こし、英語の選択肢、正解は回答後にだけ表示されます。'
            : 'The exact Soya image and audio are delivered. Transcript, English option support, and the correct answer appear only after commitment.')
        : (host.language === 'ja'
            ? '参照した市販教材の本文と画像は配布していません。練習文はすべてYomuのオリジナルです。'
            : 'The referenced commercial text and images are not delivered. Every practice line is Yomu-original.');
    const instruction = renderInstruction(model, host);
    const content = renderContent(model, readingDisposers, host);
    const status = statusRegion('academy-kit-feedback academy-n2-opening-feedback');
    const media = model.payload.media ? renderMedia(model, status, host, lifecycle.signal) : undefined;
    const form = document.createElement('form');
    form.className = 'academy-n2-opening-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.questions.forEach(question => form.append(renderQuestion(question, host)));
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '答えを確定する' : 'Commit answers';
    form.append(commit);
    root.append(heading, sourceNote, instruction, content, ...(media ? [media] : []), form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? 'すべての問題に一度ずつ答えてください。' : 'Answer every question exactly once.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            root.append(renderAnswerReveal(model, host));
            if (model.payload.media) root.append(renderTranscriptReveal(model, readingDisposers, host));
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
            root.remove();
        },
    };
}

function renderInstruction(model: N2OpeningActivityModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'instruction';
    const heading = document.createElement('h3');
    heading.textContent = localized(model.payload.instruction.title, host);
    const list = document.createElement('ul');
    model.payload.instruction.entries.forEach(entry => {
        const row = document.createElement('li');
        row.append(japanese(entry.japanese), document.createTextNode(` ${localized(entry.explanation, host)}`));
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderContent(
    model: N2OpeningActivityModel,
    readingDisposers: Array<() => void>,
    host: ActivityHost,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'context';
    const heading = document.createElement('h3');
    heading.textContent = localized(model.payload.content.title, host);
    section.append(heading);
    model.payload.content.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement('p');
        const surface = japanese(paragraph);
        surface.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:content:${index + 1}`;
        if (host.registerReadingSurface) readingDisposers.push(host.registerReadingSurface(surface));
        row.append(surface);
        section.append(row);
    });
    return section;
}

function renderMedia(
    model: N2OpeningActivityModel,
    status: HTMLElement,
    host: ActivityHost,
    signal: AbortSignal,
): HTMLElement {
    const media = model.payload.media!;
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-listening';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '引っ越しの会話' : 'Moving-house conversation';
    const image = document.createElement('img');
    image.src = media.imageUrl;
    image.alt = localized(media.imageAlt, host);
    image.loading = 'lazy';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = media.audioUrl;
    audio.dataset.exactSourceAudio = 'true';
    audio.addEventListener('error', () => {
        const message = host.language === 'ja'
            ? '音声を読み込めませんでした。接続後にもう一度開いてください。'
            : 'The source audio could not load. Reopen this activity when connected.';
        status.textContent = message;
        host.announce(message);
    }, { signal });
    section.append(heading, image, audio);
    return section;
}

function renderQuestion(question: N2OpeningQuestion, host: ActivityHost): HTMLElement {
    if (question.kind === 'choice') return renderChoice(question);
    if (question.kind === 'ordering') return renderOrdering(question, host);
    return renderTyped(question, host);
}

function renderChoice(question: N2OpeningChoiceQuestion): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.questionId = question.id;
    fieldset.dataset.questionKind = question.kind;
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(question.prompt));
    fieldset.append(legend);
    question.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = option.id;
        const copy = assessedJapanese(option.label.ja);
        copy.dataset.optionId = option.id;
        label.append(input, copy);
        fieldset.append(label);
    });
    return fieldset;
}

function renderOrdering(question: N2OpeningOrderingQuestion, host: ActivityHost): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.questionId = question.id;
    fieldset.dataset.questionKind = question.kind;
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(question.prompt));
    fieldset.append(legend);
    question.actions.forEach((_, index) => {
        const label = document.createElement('label');
        label.textContent = host.language === 'ja' ? `${index + 1}番目 ` : `Position ${index + 1} `;
        const select = document.createElement('select');
        select.name = `${question.id}:${index}`;
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = host.language === 'ja' ? '選ぶ' : 'Choose';
        select.append(placeholder);
        question.presentationOrder.forEach(actionId => {
            const action = question.actions.find(candidate => candidate.id === actionId)!;
            const option = document.createElement('option');
            option.value = action.id;
            option.textContent = action.label.ja;
            select.append(option);
        });
        label.append(select);
        fieldset.append(label);
    });
    return fieldset;
}

function renderTyped(question: N2OpeningTypedQuestion, host: ActivityHost): HTMLDivElement {
    const row = document.createElement('div');
    row.dataset.questionId = question.id;
    row.dataset.questionKind = question.kind;
    const prompt = document.createElement('p');
    prompt.append(...localizedNodes(question.prompt));
    const label = document.createElement('label');
    label.htmlFor = `${question.id}-answer`;
    label.textContent = localized(question.fieldLabel, host);
    const input = document.createElement('input');
    input.id = `${question.id}-answer`;
    input.name = question.id;
    input.type = 'text';
    input.autocomplete = 'off';
    input.lang = 'ja';
    row.append(prompt, label, input);
    return row;
}

function renderAnswerReveal(model: N2OpeningActivityModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.answerReveal = 'after-attempt';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '答えと選択肢の意味' : 'Answers and option support';
    const list = document.createElement('ol');
    model.payload.questions.forEach(question => {
        const row = document.createElement('li');
        if (question.kind === 'choice') {
            const correct = question.options.find(option => option.id === question.correctOptionId)!;
            row.append(japanese(correct.label.ja), document.createTextNode(` ${correct.label.en}`));
        } else if (question.kind === 'typed') {
            row.append(japanese(question.acceptedAnswers[0]));
        } else {
            const ordered = document.createElement('ol');
            question.correctOrder.forEach(actionId => {
                const action = question.actions.find(candidate => candidate.id === actionId)!;
                const actionRow = document.createElement('li');
                actionRow.append(japanese(action.label.ja), document.createTextNode(` ${action.label.en}`));
                ordered.append(actionRow);
            });
            row.append(ordered);
        }
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderTranscriptReveal(
    model: N2OpeningActivityModel,
    readingDisposers: Array<() => void>,
    host: ActivityHost,
): HTMLElement {
    const media = model.payload.media!;
    const section = document.createElement('section');
    section.dataset.transcriptReveal = 'after-attempt';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '回答後の文字起こし' : 'Post-attempt transcript';
    section.append(heading);
    media.transcript.forEach((line, index) => {
        const row = document.createElement('p');
        const speaker = document.createElement('strong');
        speaker.textContent = `${line.speaker}: `;
        const surface = japanese(line.text);
        surface.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:transcript:${index + 1}`;
        if (host.registerReadingSurface) readingDisposers.push(host.registerReadingSurface(surface));
        row.append(speaker, surface);
        section.append(row);
    });
    const answer = document.createElement('p');
    answer.dataset.sourceAnswer = 'after-attempt';
    answer.append(document.createTextNode(host.language === 'ja' ? '正解：' : 'Correct action: '), japanese(media.correctAnswer));
    section.append(answer);
    return section;
}

function responseFromForm(model: N2OpeningActivityModel, form: HTMLFormElement): N2OpeningResponse | null {
    const data = new FormData(form);
    const answers: N2OpeningAnswer[] = [];
    for (const question of model.payload.questions) {
        if (question.kind === 'choice') {
            const optionId = String(data.get(question.id) ?? '');
            if (!optionId) return null;
            answers.push({ questionId: question.id, kind: 'choice', optionId });
        } else if (question.kind === 'typed') {
            const value = String(data.get(question.id) ?? '').trim();
            if (!value) return null;
            answers.push({ questionId: question.id, kind: 'typed', value });
        } else {
            const order = question.actions.map((_, index) => String(data.get(`${question.id}:${index}`) ?? ''));
            if (order.some(actionId => !actionId) || new Set(order).size !== order.length) return null;
            answers.push({ questionId: question.id, kind: 'ordering', order });
        }
    }
    return { answers };
}

function parseAnswers(model: N2OpeningActivityModel, response: N2OpeningResponse): Map<string, N2OpeningAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.questions.length) {
        throw new TypeError('Every N2 opening question needs exactly one answer.');
    }
    const answers = new Map<string, N2OpeningAnswer>();
    for (const answer of response.answers) {
        if (!text(answer?.questionId) || answers.has(answer.questionId)) {
            throw new TypeError('Every N2 opening question needs exactly one answer.');
        }
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || question.kind !== answer.kind) throw new TypeError('Answer kinds must match their declared N2 questions.');
        if (question.kind === 'choice') {
            if (!('optionId' in answer) || !question.options.some(option => option.id === answer.optionId)) {
                throw new TypeError('Choice answers must use a declared option.');
            }
        } else if (question.kind === 'typed') {
            if (!('value' in answer) || !text(answer.value)) throw new TypeError('Typed answers cannot be empty.');
        } else if (!('order' in answer) || !isPermutation(answer.order, question.actions.map(action => action.id))) {
            throw new TypeError('Ordering answers must be one complete action permutation.');
        }
        answers.set(answer.questionId, answer);
    }
    return answers;
}

function isCorrect(question: N2OpeningQuestion, answer: N2OpeningAnswer): boolean {
    if (question.kind === 'choice' && answer.kind === 'choice') return answer.optionId === question.correctOptionId;
    if (question.kind === 'typed' && answer.kind === 'typed') {
        const value = normalizeJapanese(answer.value);
        return question.acceptedAnswers.some(accepted => normalizeJapanese(accepted) === value);
    }
    if (question.kind === 'ordering' && answer.kind === 'ordering') return sameObject(answer.order, question.correctOrder);
    return false;
}

function isPermutation(value: readonly string[], expected: readonly string[]): boolean {
    return value.length === expected.length
        && new Set(value).size === expected.length
        && value.every(item => expected.includes(item));
}

function sameObject(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
