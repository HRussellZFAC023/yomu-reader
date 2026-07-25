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
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
} from '../../minigames/activity-kit/shared';
import {
    N3_MOCK_LISTENING_ACTIVITY_KIND,
    N3_MOCK_LISTENING_BATCH_ID,
    N3_MOCK_LISTENING_PACKAGE_IDS,
    type N3MockListeningModel,
    type N3MockListeningPackageId,
    type N3MockListeningQuestion,
    type N3MockListeningResponse,
    type N3MockListeningReviewTarget,
} from './types';

const EXPECTED_QUESTION_COUNTS = Object.freeze({
    'task-comprehension': 6,
    'point-comprehension': 6,
    'overview-comprehension': 3,
    'expression-choice': 4,
    'quick-response': 9,
} as const);

const EXPECTED_SOURCE_START = Object.freeze([1, 7, 13, 16, 20] as const);
export const N3_MOCK_LISTENING_REVIEW_DELAY_MS = 24 * 60 * 60 * 1_000;
const EXPECTED_OFFICIAL_CALIBRATIONS: Readonly<Record<N3MockListeningPackageId, readonly string[]>> = Object.freeze({
    'n3-mock-listening-01-action': Object.freeze(['official-jlpt:n3-2009-listening:p1-i1', 'official-jlpt:n3-2009-listening:p1-i2']),
    'n3-mock-listening-02-point': Object.freeze(['official-jlpt:n3-2009-listening:p2-i1', 'official-jlpt:n3-2009-listening:p2-i2']),
    'n3-mock-listening-03-overview': Object.freeze(['official-jlpt:n3-2009-listening:p3-i1']),
    'n3-mock-listening-04-expression': Object.freeze(['official-jlpt:n3-2009-listening:p4-i1']),
    'n3-mock-listening-05-response': Object.freeze(['official-jlpt:n3-2009-listening:p5-i1', 'official-jlpt:n3-2009-listening:p5-i2']),
});

export const n3MockListeningPlugin: ActivityPlugin<N3MockListeningModel, N3MockListeningResponse> = {
    kind: N3_MOCK_LISTENING_ACTIVITY_KIND,
    validate: validateN3MockListening,
    render: renderN3MockListening,
    grade: gradeN3MockListening,
    toReviewSeeds: n3MockListeningReviewSeeds,
};

export function createN3MockListeningRuntime() {
    return createActivityRuntime([n3MockListeningPlugin]);
}

function validateN3MockListening(model: N3MockListeningModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    }
    validateProvenance(model, issues);
    validateQuestions(model, issues);
    validateProduction(model, issues);
    validateReviewTargets(model, issues);
    validatePassScore(model.payload?.passScore, issues);
    validateFeedback(model.payload?.feedback, issues);
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2
        || model.payload.teaching.some(point => !text(point.title.ja) || !text(point.title.en)
            || !text(point.cue) || !text(point.explanation.ja) || !text(point.explanation.en))) {
        issues.push({ path: 'payload.teaching', message: 'Two bilingual teaching cues must precede practice.' });
    }
    if (!Array.isArray(model.payload?.delayedReviewOf)
        || (model.provenance.packageId === N3_MOCK_LISTENING_PACKAGE_IDS[0]
            ? model.payload.delayedReviewOf.length !== 0
            : model.payload.delayedReviewOf.length === 0)) {
        issues.push({ path: 'payload.delayedReviewOf', message: 'Every package after the first must declare a delayed revisit.' });
    }
    return issues;
}

function gradeN3MockListening(model: N3MockListeningModel, response: N3MockListeningResponse): GradeResult {
    const answers = parseResponse(model, response);
    const missed = model.payload.questions.filter(question => answers.get(question.id) !== question.correctOptionId);
    const productionPassed = model.payload.production
        ? productionMeetsContract(response.production, model.payload.production)
        : true;
    const denominator = model.payload.questions.length + (model.payload.production ? 1 : 0);
    const score = (model.payload.questions.length - missed.length + (productionPassed ? (model.payload.production ? 1 : 0) : 0)) / denominator;
    return gradeFromScore(
        score,
        model.payload.passScore,
        [
            ...missed.map(question => question.errorTag),
            ...(!productionPassed && model.payload.production ? [model.payload.production.errorTag] : []),
        ],
        model.payload.feedback,
    );
}

function n3MockListeningReviewSeeds(model: N3MockListeningModel, result: GradeResult): readonly ReviewSeed[] {
    const currentTargets = result.outcome === 'pass'
        ? model.payload.reviewTargets
        : model.payload.reviewTargets.filter(target => target.repairFor.some(tag => result.errorTags.includes(tag)));
    const targets = [
        ...currentTargets.map(target => ({
            target,
            reason: result.outcome === 'pass' ? 'new-learning' as const : 'repair' as const,
        })),
        ...(result.outcome === 'pass'
            ? model.payload.delayedReviewTargets.map(target => ({ target, reason: 'delayed-review' as const }))
            : []),
    ];
    return targets.map(({ target, reason }) => ({
        id: reason === 'delayed-review' ? `${target.id}:via:${model.provenance.packageId}` : target.id,
        conceptId: target.conceptId,
        reason,
        sourceQuestionId: model.sourceQuestionId,
        ...(reason === 'delayed-review'
            ? { schedule: { dueAfterMs: N3_MOCK_LISTENING_REVIEW_DELAY_MS } }
            : {}),
        content: {
            expression: target.expression,
            ...(target.reading ? { reading: target.reading } : {}),
            meanings: [...target.meanings],
            sentence: target.sentence,
        },
    }));
}

function renderN3MockListening(
    model: N3MockListeningModel,
    host: ActivityHost,
    submit: (response: N3MockListeningResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const playbackDisposers: Array<{ dispose(): void }> = [];
    const readingDisposers: Array<() => void> = [];
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit';
    root.dataset.activityId = model.id;
    root.dataset.listeningMechanic = model.payload.mechanic;
    root.dataset.attemptState = 'answering';

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const mediaNote = document.createElement('p');
    mediaNote.className = 'academy-support';
    mediaNote.textContent = host.language === 'ja'
        ? '文脈・選択肢・説明とブラウザ音声は、よむが新しく作った練習です。一般的な定型表現は出典を明記して扱い、参照元固有の文・構成・画像・音声は提供しません。'
        : 'Yomu authors the contexts, choices, explanations, and browser speech. Conventional formulas are disclosed; source-specific wording, answer structure, images, and audio are not delivered.';
    const form = document.createElement('form');
    form.setAttribute('aria-labelledby', heading.id);
    form.append(renderTeaching(model, host, readingDisposers));
    const questionCards = model.payload.questions.map((question, index) => {
        const card = renderQuestion(question, index, host, playbackDisposers, lifecycle.signal);
        form.append(card);
        return card;
    });
    const production = model.payload.production ? renderProduction(model, host) : undefined;
    if (production) form.append(production);
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '答えを確定する' : 'Commit answers';
    const status = statusRegion('academy-kit-feedback');
    form.append(commit);
    root.append(heading, mediaNote, form, status);
    host.replace(root);
    root.closest<HTMLElement>('.academy-advanced-lesson-paper')?.scrollTo?.({ top: 0 });

    let attemptSettled = false;
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (attemptSettled) {
            const message = host.language === 'ja'
                ? '答えを表示したこのフォームは学習用です。新しい非表示の問題で再挑戦してください。'
                : 'This revealed form is study-only. Use a fresh hidden-answer attempt for mastery.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? 'すべての項目に答えてください。' : 'Answer every item before committing.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        attemptSettled = true;
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            revealAnswers(model, questionCards, production, host, readingDisposers);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                root.dataset.attemptState = 'repair';
                form.dataset.answerAssisted = 'true';
                const repair = renderBoundedRepair(host);
                root.append(repair);
                repair.focus();
            } else root.dataset.attemptState = 'complete';
        }).catch(error => {
            attemptSettled = false;
            setPending(form, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { heading.focus({ preventScroll: true }); },
        dispose() {
            lifecycle.abort();
            playbackDisposers.forEach(disposable => disposable.dispose());
            readingDisposers.forEach(dispose => dispose());
            root.remove();
        },
    };
}

function renderTeaching(
    model: N3MockListeningModel,
    host: ActivityHost,
    disposers: Array<() => void>,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'instruction';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '聞く前の手がかり' : 'Cues before listening';
    const list = document.createElement('ol');
    model.payload.teaching.forEach((point, index) => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = localized(point.title, host);
        const cue = japanese(point.cue);
        cue.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:teaching:${index + 1}`;
        registerSurface(host, cue, disposers);
        const explanation = document.createElement('p');
        explanation.textContent = localized(point.explanation, host);
        row.append(title, cue, explanation);
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderQuestion(
    question: N3MockListeningQuestion,
    index: number,
    host: ActivityHost,
    playbackDisposers: Array<{ dispose(): void }>,
    signal: AbortSignal,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.questionId = question.id;
    section.dataset.practicePhase = question.phase;
    const heading = document.createElement('h3');
    heading.textContent = `${index + 1}. ${localized(question.prompt, host)}`;
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-button academy-button-secondary';
    play.dataset.originalYomuPlayback = question.id;
    play.textContent = host.language === 'ja' ? '聞く' : 'Listen';
    play.addEventListener('click', () => void playRehearsal(question.audioText, host, playbackDisposers), { signal });
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = host.language === 'ja' ? '答え' : 'Answer';
    fieldset.append(legend);
    question.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = option.id;
        label.append(input, assessedJapanese(option.label.ja));
        fieldset.append(label);
    });
    section.append(heading, play, fieldset);
    return section;
}

function renderProduction(model: N3MockListeningModel, host: ActivityHost): HTMLElement {
    const production = model.payload.production!;
    const section = document.createElement('section');
    section.dataset.productionId = production.id;
    section.dataset.lessonPhase = 'assessed-production';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(production.prompt));
    const scenario = document.createElement('p');
    scenario.append(...localizedNodes(production.scenario));
    const label = document.createElement('label');
    label.textContent = host.language === 'ja' ? '声に出した文' : 'Sentence spoken';
    const input = document.createElement('textarea');
    input.name = production.id;
    input.rows = 3;
    input.lang = 'ja';
    label.append(input);
    section.append(heading, scenario, label);
    return section;
}

function revealAnswers(
    model: N3MockListeningModel,
    cards: readonly HTMLElement[],
    productionSection: HTMLElement | undefined,
    host: ActivityHost,
    disposers: Array<() => void>,
): void {
    cards.forEach((card, index) => {
        if (card.querySelector('[data-answer-key="after-attempt"]')) return;
        const question = model.payload.questions[index];
        const reveal = document.createElement('div');
        reveal.dataset.answerKey = 'after-attempt';
        const transcript = document.createElement('p');
        transcript.dataset.originalTranscript = 'after-attempt';
        const transcriptText = japanese(question.audioText);
        transcriptText.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:${question.id}:transcript`;
        registerSurface(host, transcriptText, disposers);
        transcript.append(transcriptText);
        const answer = document.createElement('p');
        const correct = question.options.find(option => option.id === question.correctOptionId)!;
        answer.append(
            assessedJapanese(correct.label.ja),
            document.createTextNode(` ${correct.label.en}`),
        );
        const explanation = document.createElement('p');
        explanation.append(...localizedNodes(question.explanation));
        reveal.append(transcript, answer, explanation);
        card.append(reveal);
    });
    if (productionSection && model.payload.production
        && !productionSection.querySelector('[data-model-answer="after-attempt"]')) {
        const modelAnswer = document.createElement('p');
        modelAnswer.dataset.modelAnswer = 'after-attempt';
        modelAnswer.append(japanese(model.payload.production.modelAnswer));
        productionSection.append(modelAnswer);
    }
}

function renderBoundedRepair(host: ActivityHost): HTMLElement {
    const repair = document.createElement('section');
    repair.className = 'academy-feedback-repair academy-n3-listening-repair';
    repair.dataset.repairState = 'revealed-attempt-closed';
    repair.tabIndex = -1;
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? 'この回答はここで終了です' : 'This attempt ends here';
    const explanation = document.createElement('p');
    explanation.textContent = host.language === 'ja'
        ? '表示された答えは復習に使えますが、このフォームから合格にはなりません。戻って手がかりを確認し、新しい文脈の答えが隠れた問題で再挑戦してください。'
        : 'Use the revealed answers for repair; this form can no longer produce mastery. Return to the cues, then make a fresh attempt with answers hidden and changed-context work included.';
    repair.append(heading, explanation);
    return repair;
}

function responseFromForm(model: N3MockListeningModel, form: HTMLFormElement): N3MockListeningResponse | undefined {
    const data = new FormData(form);
    const answers = model.payload.questions.map(question => {
        const optionId = data.get(question.id);
        return typeof optionId === 'string' ? { questionId: question.id, optionId } : undefined;
    });
    if (answers.some(answer => answer === undefined)) return undefined;
    if (model.payload.production) {
        const production = data.get(model.payload.production.id);
        if (typeof production !== 'string' || !text(production)) return undefined;
        return { answers: answers as N3MockListeningResponse['answers'], production };
    }
    return { answers: answers as N3MockListeningResponse['answers'] };
}

function parseResponse(model: N3MockListeningModel, response: N3MockListeningResponse): Map<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.questions.length) {
        throw new TypeError('Every N3 mock-listening question must be answered exactly once.');
    }
    if (model.payload.production && !text(response.production)) {
        throw new TypeError('The N3 spoken-transfer sentence is required.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        const question = model.payload.questions.find(item => item.id === answer.questionId);
        if (!question || answers.has(answer.questionId) || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('N3 mock-listening answers must address each authored question once.');
        }
        answers.set(answer.questionId, answer.optionId);
    });
    return answers;
}

function productionMeetsContract(
    response: string | undefined,
    production: NonNullable<N3MockListeningModel['payload']['production']>,
): boolean {
    const normalized = normalizeJapanese(response ?? '');
    return normalized.length >= production.minimumCharacters
        && production.acceptedFragments.every(group => group.some(fragment => normalized.includes(normalizeJapanese(fragment))));
}

function validateProvenance(model: N3MockListeningModel, issues: ValidationIssue[]): void {
    const provenance = model.provenance;
    if (provenance?.batchId !== N3_MOCK_LISTENING_BATCH_ID
        || provenance.sourceRecord !== 'module-local:n3-mock-listening/audit.ts'
        || provenance.contentAuthorship !== 'original-yomu-with-disclosed-conventional-language'
        || provenance.protectedSourceWordingDelivered !== false
        || provenance.sourceMediaDelivered !== false
        || !N3_MOCK_LISTENING_PACKAGE_IDS.includes(provenance.packageId)) {
        issues.push({ path: 'provenance', message: 'The fail-closed CUR-007 provenance contract is required.' });
        return;
    }
    const conventional = provenance.packageId === 'n3-mock-listening-04-expression'
        ? [{
            phrase: 'お先に失礼します',
            policy: 'allowed-conventional-formula',
            sourceCandidateId: 'soya:n3-mock1:mock1_l_19',
        }]
        : [];
    if (JSON.stringify(provenance.conventionalLanguage) !== JSON.stringify(conventional)) {
        issues.push({
            path: 'provenance.conventionalLanguage',
            message: 'Conventional source overlap must be explicit and item-located.',
        });
    }
    const expectedSoya = model.payload.questions.map(question => question.sourceCandidateId);
    const expectedOfficial = model.payload.questions.flatMap(question => question.officialCalibrationId ? [question.officialCalibrationId] : []);
    const packageIndex = N3_MOCK_LISTENING_PACKAGE_IDS.indexOf(provenance.packageId);
    const sourceStart = EXPECTED_SOURCE_START[packageIndex];
    const packageSoya = sourceStart === undefined
        ? []
        : Array.from({ length: model.payload.questions.length }, (_, index) =>
            `soya:n3-mock1:mock1_l_${String(sourceStart + index).padStart(2, '0')}`);
    if (JSON.stringify(provenance.sourceCandidateIds) !== JSON.stringify(expectedSoya)
        || JSON.stringify(provenance.officialCalibrationIds) !== JSON.stringify(expectedOfficial)
        || JSON.stringify(expectedSoya) !== JSON.stringify(packageSoya)
        || JSON.stringify(expectedOfficial) !== JSON.stringify(EXPECTED_OFFICIAL_CALIBRATIONS[provenance.packageId])) {
        issues.push({ path: 'provenance', message: 'Every source candidate must resolve to this package in the 36-item audit.' });
    }
}

function validateQuestions(model: N3MockListeningModel, issues: ValidationIssue[]): void {
    const questions: readonly N3MockListeningQuestion[] = model.payload.questions;
    if (questions.length !== EXPECTED_QUESTION_COUNTS[model.payload.mechanic]) {
        issues.push({ path: 'payload.questions', message: 'The mechanic must retain its complete frozen Soya denominator.' });
        return;
    }
    const ids = new Set<string>();
    questions.forEach((question, index) => {
        const optionIds = new Set(question.options.map(option => option.id));
        if (!text(question.id) || ids.has(question.id) || !text(question.audioText)
            || /https?:|\/audio\/|soya-eagle|N3Sample/u.test(question.audioText)
            || !text(question.prompt.ja) || !text(question.prompt.en)
            || question.options.length < 3 || optionIds.size !== question.options.length
            || !optionIds.has(question.correctOptionId) || !model.conceptIds.includes(question.conceptId)
            || !text(question.explanation.ja) || !text(question.explanation.en) || !text(question.errorTag)) {
            issues.push({ path: `payload.questions.${index}`, message: 'Each original item needs a complete prompt, script, neutral choices, answer, explanation, and Concept.' });
        }
        ids.add(question.id);
    });
    if (!questions.some(question => question.phase === 'guided')
        || !questions.some(question => question.phase === 'changed-context-transfer')
        || (questions.length > 3 && !questions.some(question => question.phase === 'independent'))) {
        issues.push({ path: 'payload.questions', message: 'The package needs guided, independent, and changed-context work.' });
    }
}

function validateProduction(model: N3MockListeningModel, issues: ValidationIssue[]): void {
    const requiresProduction = model.payload?.mechanic === 'expression-choice' || model.payload?.mechanic === 'quick-response';
    const production = model.payload?.production;
    if (requiresProduction !== Boolean(production)) {
        issues.push({ path: 'payload.production', message: 'Expression and response packages require a spoken changed-context transfer.' });
        return;
    }
    if (production && (!text(production.prompt.ja) || !text(production.prompt.en)
        || !text(production.scenario.ja) || !text(production.scenario.en) || !text(production.modelAnswer)
        || production.minimumCharacters < 10 || production.acceptedFragments.length < 2
        || production.acceptedFragments.some(group => group.length === 0 || group.some(fragment => !text(fragment)))
        || !model.conceptIds.includes(production.conceptId) || !text(production.errorTag))) {
        issues.push({ path: 'payload.production', message: 'The spoken transfer needs deterministic original-Yomu grading evidence.' });
    }
}

function validateReviewTargets(model: N3MockListeningModel, issues: ValidationIssue[]): void {
    const targets: readonly N3MockListeningReviewTarget[] = model.payload.reviewTargets;
    const delayedTargets: readonly N3MockListeningReviewTarget[] = model.payload.delayedReviewTargets;
    const tags = new Set([
        ...model.payload.questions.map(question => question.errorTag),
        ...(model.payload.production ? [model.payload.production.errorTag] : []),
    ]);
    if (targets.length < 2) {
        issues.push({ path: 'payload.reviewTargets', message: 'At least two delayed SRS targets are required.' });
        return;
    }
    targets.forEach((target, index) => {
        if (!text(target.id) || !model.conceptIds.includes(target.conceptId) || !text(target.expression)
            || !target.meanings.length || !text(target.sentence) || !target.repairFor.length
            || target.repairFor.some(tag => !tags.has(tag))) {
            issues.push({ path: `payload.reviewTargets.${index}`, message: 'Every review target must map to a Concept and assessment error.' });
        }
    });
    const covered = new Set(targets.flatMap(target => target.repairFor));
    if ([...tags].some(tag => !covered.has(tag))) {
        issues.push({ path: 'payload.reviewTargets', message: 'Every possible lapse must have a targeted repair seed.' });
    }
    if (new Set(delayedTargets.map(target => target.conceptId)).size !== model.payload.delayedReviewOf.length
        || delayedTargets.some(target => !model.payload.delayedReviewOf.includes(target.conceptId))) {
        issues.push({
            path: 'payload.delayedReviewTargets',
            message: 'Every delayed prerequisite Concept needs one concrete future review target.',
        });
    }
}

async function playRehearsal(
    textToPlay: string,
    host: ActivityHost,
    disposers: Array<{ dispose(): void }>,
): Promise<void> {
    const disposable = host.playPronunciation
        ? await host.playPronunciation(textToPlay)
        : browserSpeech(textToPlay);
    if (disposable) disposers.push(disposable);
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
    if (host.registerReadingSurface) disposers.push(host.registerReadingSurface(surface));
}
