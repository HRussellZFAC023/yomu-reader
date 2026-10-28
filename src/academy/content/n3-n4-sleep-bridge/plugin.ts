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
import { N3_N4_SLEEP_BRIDGE_PROVENANCE, N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS } from './source';
import {
    N3_N4_SLEEP_BRIDGE_ACTIVITY_KIND,
    type N3N4SleepBridgeModel,
    type N3N4SleepBridgeQuestion,
    type N3N4SleepBridgeReviewTarget,
    type N3N4SleepBridgeResponse,
} from './types';

export const n3N4SleepBridgePlugin: ActivityPlugin<N3N4SleepBridgeModel, N3N4SleepBridgeResponse> = {
    kind: N3_N4_SLEEP_BRIDGE_ACTIVITY_KIND,
    validate: validateN3N4SleepBridge,
    render: renderN3N4SleepBridge,
    grade: gradeN3N4SleepBridge,
    toReviewSeeds: n3N4SleepBridgeReviewSeeds,
};

export function createN3N4SleepBridgeRuntime() {
    return createActivityRuntime([n3N4SleepBridgePlugin]);
}

export function validateN3N4SleepBridge(model: N3N4SleepBridgeModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    }
    if (!sameObject(model.provenance, N3_N4_SLEEP_BRIDGE_PROVENANCE)) {
        issues.push({ path: 'provenance', message: 'The exact permitted local JLPT source locus and rights contract are required.' });
    }
    if (!sameObject(model.payload?.sourceSegments, N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS)) {
        issues.push({ path: 'payload.sourceSegments', message: 'The exact reviewed local JLPT source segment is required.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 3
        || model.payload.teaching.some(item => !text(item.title.ja) || !text(item.title.en) || !text(item.example) || !text(item.explanation.ja) || !text(item.explanation.en))) {
        issues.push({ path: 'payload.teaching', message: 'Three bilingual bridge teaching points are required.' });
    }
    if (model.payload?.transfer?.authorship !== 'original-yomu-n3-n4-bridge-transfer'
        || model.payload.transfer.paragraphs.length !== 2
        || model.payload.transfer.paragraphs.some(paragraph => !text(paragraph))
        || model.payload.transfer.playbackText !== model.payload.transfer.paragraphs.join(' ')) {
        issues.push({ path: 'payload.transfer', message: 'The complete original N3/N4 transfer is required.' });
    }
    validateQuestions(model, issues);
    validatePassScore(model.payload?.passScore, issues);
    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model, issues);
    return issues;
}

function gradeN3N4SleepBridge(model: N3N4SleepBridgeModel, response: N3N4SleepBridgeResponse): GradeResult {
    const answers = parseResponse(model, response);
    const missed = model.payload.questions.filter(question => answers.get(question.id) !== question.correctOptionId);
    return gradeFromScore((model.payload.questions.length - missed.length) / model.payload.questions.length, model.payload.passScore, missed.map(question => question.errorTag), model.payload.feedback);
}

function n3N4SleepBridgeReviewSeeds(model: N3N4SleepBridgeModel, result: GradeResult): readonly ReviewSeed[] {
    const targets = result.outcome === 'pass'
        ? model.payload.reviewTargets
        : model.payload.reviewTargets.filter(target => target.repairFor.some(tag => result.errorTags.includes(tag)));
    return targets.map(target => ({
        id: target.id,
        conceptId: target.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: model.sourceQuestionId,
        content: { expression: target.expression, ...(target.reading ? { reading: target.reading } : {}), meanings: [...target.meanings], sentence: target.sentence },
    }));
}

function renderN3N4SleepBridge(model: N3N4SleepBridgeModel, host: ActivityHost, submit: (response: N3N4SleepBridgeResponse) => Promise<ActivityEvaluation>): ActivityController {
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
        ? '再生はハッシュ確認済み資料文からの合成リハーサルです。原音声と資料本文は試行後まで提供されません。'
        : 'Playback is synthesized from hash-verified source text; original audio and source text remain unavailable until after your attempt.';
    const readingDisposers: Array<() => void> = [];
    const playbackDisposers: Array<{ dispose(): void }> = [];
    const form = document.createElement('form');
    form.setAttribute('aria-labelledby', heading.id);
    form.append(renderTeaching(model, host, readingDisposers));
    form.append(renderSourceRound(model, host, playbackDisposers, lifecycle.signal));
    form.append(renderTransfer(model, host, readingDisposers, playbackDisposers, lifecycle.signal));
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '四つの活動を確定する' : 'Commit all four activities';
    const status = statusRegion('academy-kit-feedback');
    form.append(commit);
    root.append(heading, mediaNote, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '四つの活動すべてに答えてください。' : 'Complete all four activities.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            revealSourceTranscript(root, model, host, readingDisposers);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(form, false);
        }).catch(error => {
            setPending(form, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return { focus() { heading.focus(); }, dispose() { lifecycle.abort(); readingDisposers.forEach(dispose => dispose()); playbackDisposers.forEach(disposable => disposable.dispose()); root.remove(); } };
}

function renderTeaching(model: N3N4SleepBridgeModel, host: ActivityHost, disposers: Array<() => void>): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'instruction';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? 'N4からN3への三つの手がかり' : 'Three cues from N4 into N3';
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

function renderSourceRound(model: N3N4SleepBridgeModel, host: ActivityHost, disposers: Array<{ dispose(): void }>, signal: AbortSignal): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-recognition';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '活動 1-2: 資料文を聞く・根拠を選ぶ' : 'Activities 1-2: listen to the source and choose evidence';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-button academy-button-secondary';
    play.dataset.sourceSegmentId = N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].id;
    play.textContent = host.language === 'ja' ? '資料文を聞く' : 'Play source text';
    play.addEventListener('click', () => void playRehearsal(N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text, host, disposers), { signal });
    section.append(heading, play);
    model.payload.questions.filter(question => question.stage === 'source-rehearsal').forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderTransfer(model: N3N4SleepBridgeModel, host: ActivityHost, readingDisposers: Array<() => void>, playbackDisposers: Array<{ dispose(): void }>, signal: AbortSignal): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-recognition';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(model.payload.transfer.title));
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-button academy-button-secondary';
    play.dataset.transferPlayback = 'synthesized-rehearsal';
    play.textContent = host.language === 'ja' ? 'オリジナル転移文を聞く' : 'Play original transfer';
    play.addEventListener('click', () => void playRehearsal(model.payload.transfer.playbackText, host, playbackDisposers), { signal });
    const article = document.createElement('article');
    model.payload.transfer.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement('p');
        const span = japanese(paragraph);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:original-transfer:paragraph-${index + 1}`;
        registerSurface(host, span, readingDisposers);
        row.append(span);
        article.append(row);
    });
    section.append(heading, play, article);
    model.payload.questions.filter(question => question.stage === 'original-transfer').forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderQuestion(question: N3N4SleepBridgeQuestion): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.questionId = question.id;
    fieldset.dataset.activityMode = question.activityMode;
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(question.prompt));
    fieldset.append(legend);
    if (question.activityMode === 'evidence-sort' || question.activityMode === 'cloze') {
        const select = document.createElement('select');
        select.name = question.id;
        select.dataset.activityControl = question.activityMode;
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '---';
        select.append(empty);
        question.options.forEach(option => {
            const choice = document.createElement('option');
            choice.value = option.id;
            choice.textContent = `${option.label.ja} ${option.label.en}`;
            select.append(choice);
        });
        fieldset.append(select);
        return fieldset;
    }
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

function revealSourceTranscript(root: HTMLElement, model: N3N4SleepBridgeModel, host: ActivityHost, disposers: Array<() => void>): void {
    if (root.querySelector('[data-source-transcript]')) return;
    const section = document.createElement('section');
    section.dataset.sourceTranscript = 'after-attempt';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '試行後のハッシュ確認済み資料文' : 'Hash-verified source text after your attempt';
    const span = japanese(model.payload.sourceSegments[0].text);
    span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:${model.payload.sourceSegments[0].id}`;
    registerSurface(host, span, disposers);
    const translation = document.createElement('p');
    translation.lang = 'en';
    translation.textContent = model.payload.sourceSegments[0].translation;
    section.append(heading, span, translation);
    root.append(section);
}

function responseFromForm(model: N3N4SleepBridgeModel, form: HTMLFormElement): N3N4SleepBridgeResponse | undefined {
    const data = new FormData(form);
    const answers = model.payload.questions.map(question => ({ questionId: question.id, optionId: String(data.get(question.id) ?? '') }));
    return answers.some(answer => !answer.optionId) ? undefined : { answers };
}

function parseResponse(model: N3N4SleepBridgeModel, response: N3N4SleepBridgeResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.questions.length) {
        throw new TypeError('Every N3/N4 sleep-bridge activity needs one answer.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || answers.has(answer.questionId) || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('N3/N4 sleep-bridge answers must address each authored activity once.');
        }
        answers.set(answer.questionId, answer.optionId);
    });
    return answers;
}

function validateQuestions(model: N3N4SleepBridgeModel, issues: ValidationIssue[]): void {
    const questions = model.payload?.questions as readonly N3N4SleepBridgeQuestion[] | undefined;
    const expectedModes = ['listening-choice', 'evidence-sort', 'cloze', 'conclusion-choice'];
    if (!questions || questions.length !== 4 || questions.filter(question => question.stage === 'source-rehearsal').length !== 2 || questions.filter(question => question.stage === 'original-transfer').length !== 2 || questions.map(question => question.activityMode).join('|') !== expectedModes.join('|')) {
        issues.push({ path: 'payload.questions', message: 'Two source and two original-transfer activities with four distinct modes are required.' });
        return;
    }
    const ids = new Set<string>();
    questions.forEach((question, index) => {
        const optionIds = new Set(question.options.map(option => option.id));
        if (!text(question.id) || ids.has(question.id) || !text(question.prompt.ja) || !text(question.prompt.en) || question.options.length !== 3 || optionIds.size !== 3 || !optionIds.has(question.correctOptionId) || !text(question.errorTag)) {
            issues.push({ path: `payload.questions.${index}`, message: 'Each activity needs a unique id, three options, and one answer.' });
        }
        ids.add(question.id);
    });
}

function validateReviewTargets(model: N3N4SleepBridgeModel, issues: ValidationIssue[]): void {
    const targets = model.payload?.reviewTargets as readonly N3N4SleepBridgeReviewTarget[] | undefined;
    const errorTags = new Set(model.payload?.questions.map(question => question.errorTag));
    if (!targets || targets.length !== 4) {
        issues.push({ path: 'payload.reviewTargets', message: 'Four Reader/SRS targets are required.' });
        return;
    }
    targets.forEach((target, index) => {
        if (!text(target.id) || !model.conceptIds.includes(target.conceptId) || !text(target.expression) || !target.meanings.length || target.meanings.some(meaning => !text(meaning)) || !text(target.sentence) || !target.repairFor.length || target.repairFor.some(tag => !errorTags.has(tag))) {
            issues.push({ path: `payload.reviewTargets.${index}`, message: 'Each target must map to a concept and one assessment error.' });
        }
    });
}

async function playRehearsal(textToPlay: string, host: ActivityHost, disposers: Array<{ dispose(): void }>): Promise<void> {
    const disposable = host.playPronunciation ? await host.playPronunciation(textToPlay) : undefined;
    if (disposable) disposers.push(disposable);
}

function registerSurface(host: ActivityHost, surface: HTMLElement, disposers: Array<() => void>): void {
    const dispose = host.registerReadingSurface?.(surface);
    if (dispose) disposers.push(dispose);
}

function sameObject(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
