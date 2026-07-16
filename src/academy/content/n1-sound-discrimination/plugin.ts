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
import { N1_SOUND_DISCRIMINATION_PROVENANCE } from './source';
import {
    N1_SOUND_DISCRIMINATION_ACTIVITY_KIND,
    type N1SoundDiscriminationModel,
    type N1SoundDiscriminationQuestion,
    type N1SoundDiscriminationResponse,
} from './types';

export const n1SoundDiscriminationPlugin: ActivityPlugin<N1SoundDiscriminationModel, N1SoundDiscriminationResponse> = {
    kind: N1_SOUND_DISCRIMINATION_ACTIVITY_KIND,
    validate: validateN1SoundDiscrimination,
    render: renderN1SoundDiscrimination,
    grade: gradeN1SoundDiscrimination,
    toReviewSeeds: n1SoundDiscriminationReviewSeeds,
};

export function createN1SoundDiscriminationRuntime() {
    return createActivityRuntime([n1SoundDiscriminationPlugin]);
}

export function validateN1SoundDiscrimination(model: N1SoundDiscriminationModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    }
    if (!sameObject(model.provenance, N1_SOUND_DISCRIMINATION_PROVENANCE)) {
        issues.push({ path: 'provenance', message: 'The exact permitted Shin Kanzen listening locus and local-only media state are required.' });
    }
    if (model.payload.teaching.length !== 3 || model.payload.teaching.some(item =>
        !text(item.title.ja) || !text(item.title.en) || !text(item.cue)
        || !text(item.explanation.ja) || !text(item.explanation.en))) {
        issues.push({ path: 'payload.teaching', message: 'Three complete bilingual pre-retrieval teaching cues are required.' });
    }
    if (model.payload.soundMap.length !== 4 || model.payload.soundMap.some(pair =>
        !text(pair.id) || !text(pair.left) || !text(pair.right) || !text(pair.focus.ja) || !text(pair.focus.en))) {
        issues.push({ path: 'payload.soundMap', message: 'Four complete visual sound pairs are required.' });
    }
    validateQuestions(model, issues);
    if (model.payload.production.authorship !== 'learner-authored-ungraded'
        || !text(model.payload.production.prompt.ja) || !text(model.payload.production.prompt.en)
        || !text(model.payload.production.guidance.ja) || !text(model.payload.production.guidance.en)) {
        issues.push({ path: 'payload.production', message: 'An explicit ungraded learner noticing note is required.' });
    }
    validatePassScore(model.payload.passScore, issues);
    validateFeedback(model.payload.feedback, issues);
    validateReviewTargets(model, issues);
    return issues;
}

export function gradeN1SoundDiscrimination(
    model: N1SoundDiscriminationModel,
    response: N1SoundDiscriminationResponse,
): GradeResult {
    const answers = parseResponse(model, response);
    const missed = model.payload.questions.filter(question => answers.get(question.id) !== question.correctOptionId);
    return gradeFromScore(
        (model.payload.questions.length - missed.length) / model.payload.questions.length,
        model.payload.passScore,
        missed.map(question => question.errorTag),
        model.payload.feedback,
    );
}

export function n1SoundDiscriminationReviewSeeds(
    model: N1SoundDiscriminationModel,
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
        content: { expression: target.expression, meanings: [...target.meanings], sentence: target.sentence },
    }));
}

function renderN1SoundDiscrimination(
    model: N1SoundDiscriminationModel,
    host: ActivityHost,
    submit: (response: N1SoundDiscriminationResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const playback: Array<{ dispose(): void }> = [];
    const readers: Array<() => void> = [];
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit';
    root.dataset.activityId = model.id;
    root.dataset.retrievalState = 'teaching';
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const mediaNote = document.createElement('p');
    mediaNote.className = 'academy-support';
    mediaNote.textContent = host.language === 'ja'
        ? '再生は、よむが作成した練習文の合成音声です。参照資料の本文、画像、A07 音声は配信されません。'
        : 'Playback is synthesized from original Yomu practice lines; the reference text, page image, and A07 audio are not delivered.';
    const gate = document.createElement('button');
    gate.type = 'button';
    gate.className = 'academy-button academy-button-primary';
    gate.dataset.beginRetrieval = '';
    gate.textContent = host.language === 'ja' ? '学習を終えて聞き取りへ' : 'Begin listening round';
    const retrievalHost = document.createElement('div');
    retrievalHost.dataset.retrievalHost = '';
    gate.addEventListener('click', () => {
        if (root.dataset.retrievalState === 'active') return;
        root.dataset.retrievalState = 'active';
        gate.remove();
        retrievalHost.append(renderAssessment(model, host, submit, root, readers, playback, lifecycle.signal));
        retrievalHost.querySelector<HTMLButtonElement>('[data-play-question]')?.focus();
    }, { signal: lifecycle.signal });
    root.append(heading, mediaNote, renderTeaching(model, host), renderSoundMap(model, host), gate, retrievalHost);
    host.replace(root);
    return {
        focus() { heading.focus(); },
        dispose() {
            lifecycle.abort();
            readers.forEach(dispose => dispose());
            playback.forEach(item => item.dispose());
            root.remove();
        },
    };
}

function renderTeaching(model: N1SoundDiscriminationModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'instruction';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '聞く前の三つの手順' : 'Three steps before retrieval';
    const list = document.createElement('ol');
    model.payload.teaching.forEach(item => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = localized(item.title, host);
        const cue = japanese(item.cue);
        cue.dataset.teachingCue = '';
        const explanation = document.createElement('p');
        explanation.textContent = localized(item.explanation, host);
        row.append(title, cue, explanation);
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderSoundMap(model: N1SoundDiscriminationModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'guided-practice';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '音の境界マップ' : 'Sound-boundary map';
    const list = document.createElement('ul');
    model.payload.soundMap.forEach(pair => {
        const row = document.createElement('li');
        row.dataset.soundPair = pair.id;
        row.append(japanese(`${pair.left} / ${pair.right}`), document.createTextNode(`: ${localized(pair.focus, host)}`));
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderAssessment(
    model: N1SoundDiscriminationModel,
    host: ActivityHost,
    submit: (response: N1SoundDiscriminationResponse) => Promise<ActivityEvaluation>,
    root: HTMLElement,
    readers: Array<() => void>,
    playback: Array<{ dispose(): void }>,
    signal: AbortSignal,
): HTMLFormElement {
    const form = document.createElement('form');
    form.setAttribute('aria-labelledby', `${model.id}-prompt`);
    form.dataset.lessonPhase = 'assessed-recognition';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '合成音声で聞き分ける' : 'Retrieve from synthesized listening';
    form.append(heading);
    model.payload.questions.forEach((question, index) => form.append(renderQuestion(question, index, host, playback, signal)));
    form.append(renderProduction(model, host));
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '四つの聞き取りを確定する' : 'Commit all four heard words';
    const status = statusRegion('academy-kit-feedback');
    form.append(commit, status);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '四つの質問すべてに答えてください。' : 'Answer all four listening questions.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            revealTranscripts(root, model, host, readers);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(form, false);
        }).catch(error => {
            setPending(form, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal });
    return form;
}

function renderQuestion(
    question: N1SoundDiscriminationQuestion,
    index: number,
    host: ActivityHost,
    playback: Array<{ dispose(): void }>,
    signal: AbortSignal,
): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.questionId = question.id;
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(question.prompt));
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-button academy-button-secondary';
    play.dataset.playQuestion = question.id;
    play.textContent = host.language === 'ja' ? `音声 ${index + 1} を再生` : `Play line ${index + 1}`;
    play.addEventListener('click', () => void playRehearsal(question.playbackText, host, playback), { signal });
    fieldset.append(legend, play);
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

function renderProduction(model: N1SoundDiscriminationModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-production';
    const heading = document.createElement('h3');
    heading.textContent = localized(model.payload.production.prompt, host);
    const guidance = document.createElement('p');
    guidance.className = 'academy-support';
    guidance.textContent = localized(model.payload.production.guidance, host);
    const label = document.createElement('label');
    label.textContent = localized(model.payload.production.fieldLabel, host);
    const input = document.createElement('textarea');
    input.name = 'production';
    input.dataset.production = 'ungraded';
    input.rows = 3;
    label.append(input);
    section.append(heading, guidance, label);
    return section;
}

function revealTranscripts(
    root: HTMLElement,
    model: N1SoundDiscriminationModel,
    host: ActivityHost,
    readers: Array<() => void>,
): void {
    if (root.querySelector('[data-transcript-reveal]')) return;
    const section = document.createElement('section');
    section.dataset.transcriptReveal = 'after-attempt';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '試行後のオリジナル練習文' : 'Original practice transcripts after your attempt';
    const list = document.createElement('ol');
    model.payload.questions.forEach((question, index) => {
        const row = document.createElement('li');
        const span = japanese(question.playbackText);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:transcript:${index + 1}`;
        registerSurface(host, span, readers);
        row.append(span);
        list.append(row);
    });
    section.append(heading, list);
    root.append(section);
}

function responseFromForm(model: N1SoundDiscriminationModel, form: HTMLFormElement): N1SoundDiscriminationResponse | undefined {
    const answers = model.payload.questions.map(question => {
        const input = form.querySelector<HTMLInputElement>(`input[name="${question.id}"]:checked`);
        return input ? { questionId: question.id, optionId: input.value } : undefined;
    });
    if (!answers.every(answer => answer !== undefined)) return undefined;
    const production = form.elements.namedItem('production');
    return {
        answers: answers as N1SoundDiscriminationResponse['answers'],
        production: production instanceof HTMLTextAreaElement ? production.value : '',
    };
}

function parseResponse(model: N1SoundDiscriminationModel, response: N1SoundDiscriminationResponse): ReadonlyMap<string, string> {
    if (!Array.isArray(response?.answers) || response.answers.length !== model.payload.questions.length
        || typeof response.production !== 'string') {
        throw new TypeError('Every N1 sound-discrimination question needs one answer and a noticing note value.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || answers.has(answer.questionId) || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('N1 sound-discrimination answers must address each authored question once.');
        }
        answers.set(answer.questionId, answer.optionId);
    });
    return answers;
}

function validateQuestions(model: N1SoundDiscriminationModel, issues: ValidationIssue[]): void {
    if (model.payload.questions.length !== 4) {
        issues.push({ path: 'payload.questions', message: 'Four listening judgments are required.' });
        return;
    }
    const ids = new Set<string>();
    model.payload.questions.forEach((question, index) => {
        const optionIds = new Set(question.options.map(option => option.id));
        if (!text(question.id) || ids.has(question.id) || !text(question.prompt.ja) || !text(question.prompt.en)
            || !text(question.playbackText) || question.options.length !== 2 || optionIds.size !== 2
            || !optionIds.has(question.correctOptionId) || !text(question.errorTag)) {
            issues.push({ path: `payload.questions.${index}`, message: 'Each listening judgment needs a unique id, original playback, two options, and one answer.' });
        }
        ids.add(question.id);
    });
}

function validateReviewTargets(model: N1SoundDiscriminationModel, issues: ValidationIssue[]): void {
    const tags = new Set(model.payload.questions.map(question => question.errorTag));
    if (model.payload.reviewTargets.length !== 4 || model.payload.reviewTargets.some(target =>
        !text(target.id) || !model.conceptIds.includes(target.conceptId) || !text(target.expression)
        || !target.meanings.length || target.meanings.some(meaning => !text(meaning)) || !text(target.sentence)
        || !target.repairFor.length || target.repairFor.some(tag => !tags.has(tag)))) {
        issues.push({ path: 'payload.reviewTargets', message: 'Four complete repair-mapped Reader/SRS targets are required.' });
    }
}

async function playRehearsal(textToPlay: string, host: ActivityHost, disposers: Array<{ dispose(): void }>): Promise<void> {
    const item = host.playPronunciation ? await host.playPronunciation(textToPlay) : browserSpeech(textToPlay);
    if (item) disposers.push(item);
}
function browserSpeech(textToPlay: string): { dispose(): void } | undefined {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined'
        || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
    const utterance = new SpeechSynthesisUtterance(textToPlay);
    utterance.lang = 'ja-JP';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return { dispose: () => window.speechSynthesis.cancel() };
}
function registerSurface(host: ActivityHost, surface: HTMLElement, disposers: Array<() => void>): void {
    const dispose = host.registerReadingSurface?.(surface);
    if (dispose) disposers.push(dispose);
}
function sameObject(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
