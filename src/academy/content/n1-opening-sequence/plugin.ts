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
import {
    N1_OPENING_SEQUENCE_AUTHORED,
    N1_OPENING_SEQUENCE_DELIVERED_SOURCE,
    N1_OPENING_SEQUENCE_PROVENANCE,
} from './source';
import {
    N1_OPENING_SEQUENCE_ACTIVITY_KIND,
    type N1OpeningSequenceModality,
    type N1OpeningSequenceModel,
    type N1OpeningSequenceProductionCheckResult,
    type N1OpeningSequenceQuestion,
    type N1OpeningSequenceResponse,
    type N1OpeningSequenceStimulusRole,
} from './types';

const TOTAL_CHECKS = 15;
const MODALITY_QUESTION_COUNTS: Readonly<Record<N1OpeningSequenceModality, number>> = Object.freeze({
    reading: 5,
    grammar: 3,
    listening: 3,
});
const STIMULUS_ROLE_COUNTS: Readonly<Record<N1OpeningSequenceStimulusRole, number>> = Object.freeze({
    'source-reading': 2,
    'transfer-reading': 3,
    grammar: 3,
    'source-listening': 1,
    'transfer-listening': 2,
});
const TOTAL_QUESTIONS = 11;
const PRODUCTION_CHECK_IDS = ['length-band', 'evidence-balance', 'qualification-marker', 'provisional-no-overclaim'] as const;

export const n1OpeningSequencePlugin: ActivityPlugin<N1OpeningSequenceModel, N1OpeningSequenceResponse> = {
    kind: N1_OPENING_SEQUENCE_ACTIVITY_KIND,
    validate: validateN1OpeningSequence,
    render: renderN1OpeningSequence,
    grade: gradeN1OpeningSequence,
    toReviewSeeds: n1OpeningSequenceReviewSeeds,
};

export function createN1OpeningSequenceRuntime() {
    return createActivityRuntime([n1OpeningSequencePlugin]);
}

/**
 * Deterministic constrained production checks. Intentionally NOT
 * normalizeJapanese: length counts NFKC code points minus whitespace only, and
 * marker matching runs on NFKC text with punctuation intact.
 */
export function evaluateN1OpeningSequenceProduction(
    model: N1OpeningSequenceModel,
    production: string,
): readonly N1OpeningSequenceProductionCheckResult[] {
    const config = model.payload.production;
    const nfkc = production.normalize('NFKC');
    const compact = nfkc.replace(/[\s　]/gu, '');
    const contains = (terms: readonly string[]) => terms.some(term => compact.includes(term.normalize('NFKC')));
    const met: Record<(typeof PRODUCTION_CHECK_IDS)[number], boolean> = {
        'length-band': [...compact].length >= config.minLengthChars && [...compact].length <= config.maxLengthChars,
        'evidence-balance': contains(config.demandAnchors) && contains(config.accessAnchors),
        'qualification-marker': contains(config.contrastMarkers),
        'provisional-no-overclaim': contains(config.provisionalMarkers) && !contains(config.overclaimTerms),
    };
    return config.checks.map(checkDef => ({
        id: checkDef.id,
        errorTag: checkDef.errorTag,
        label: checkDef.label,
        met: met[checkDef.id],
    }));
}

export function validateN1OpeningSequence(model: N1OpeningSequenceModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
    }
    if (!sameObject(model.provenance, N1_OPENING_SEQUENCE_PROVENANCE)) {
        issues.push({ path: 'provenance', message: 'The exact pinned mixed source set, rights, and package-local audio state are required.' });
    }
    if (model.payload.prerequisiteRefresh.length !== 3 || model.payload.prerequisiteRefresh.some(item =>
        !text(item.conceptId) || !text(item.bridge.ja) || !text(item.bridge.en) || !text(item.example)
        || (item.exampleSource !== 'authored' && item.exampleSource !== 'exact-source-tobira'))) {
        issues.push({ path: 'payload.prerequisiteRefresh', message: 'Three complete unassessed N2-to-N1 bridges with honest example attribution are required.' });
    }
    const sourceBridge = model.payload.prerequisiteRefresh.find(item => item.exampleSource === 'exact-source-tobira');
    if (sourceBridge?.example !== N1_OPENING_SEQUENCE_DELIVERED_SOURCE.tobiraBridgeSentence) {
        issues.push({ path: 'payload.prerequisiteRefresh', message: 'The exact pinned Tobira bridge sentence is required.' });
    }
    if (model.payload.reading.sourceAnchor.authorship !== 'exact-source-shin-kanzen-reading'
        || !text(model.payload.reading.sourceAnchor.title.ja) || !text(model.payload.reading.sourceAnchor.title.en)
        || model.payload.reading.sourceAnchor.paragraphs.length !== 3
        || model.payload.reading.sourceAnchor.paragraphs.some(paragraph => !text(paragraph))
        || !sameObject(model.payload.reading.sourceAnchor.paragraphs, N1_OPENING_SEQUENCE_DELIVERED_SOURCE.readingAnchorParagraphs)) {
        issues.push({ path: 'payload.reading.sourceAnchor', message: 'The exact three-line Shin Kanzen reading source anchor is required.' });
    }
    if (model.payload.reading.transfer.authorship !== 'original-yomu-n1-reading'
        || !text(model.payload.reading.transfer.title.ja) || !text(model.payload.reading.transfer.title.en)
        || model.payload.reading.transfer.paragraphs.length !== 3
        || model.payload.reading.transfer.paragraphs.some(paragraph => !text(paragraph))
        || !sameObject(model.payload.reading.transfer.paragraphs, N1_OPENING_SEQUENCE_AUTHORED.readingParagraphs)) {
        issues.push({ path: 'payload.reading.transfer', message: 'The complete original three-paragraph N1 reading transfer is required.' });
    }
    if (model.payload.grammar.forms.length !== 3 || model.payload.grammar.forms.some(item =>
        !text(item.id) || !text(item.form) || !text(item.example)
        || item.exampleAuthorship !== 'exact-source-shin-kanzen-grammar'
        || !text(item.registerNote.ja) || !text(item.registerNote.en)
        || !text(item.agentNote.ja) || !text(item.agentNote.en)
        || !text(item.eventNote.ja) || !text(item.eventNote.en))
        || !sameObject(model.payload.grammar.forms.map(item => item.form), ['〜が早いか', '〜や／〜や否や', '〜なり'])
        || !sameObject(model.payload.grammar.forms.map(item => item.example), N1_OPENING_SEQUENCE_DELIVERED_SOURCE.grammarExamples)) {
        issues.push({ path: 'payload.grammar', message: 'Three exact Shin Kanzen N1 time-relation forms with register, agent, and event notes are required.' });
    }
    const sourceAudio = model.payload.listening.sourceAudio;
    const deliveredAudio = N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio;
    if (sourceAudio.authorship !== 'exact-source-somatome-listening'
        || !text(sourceAudio.title.ja) || !text(sourceAudio.title.en)
        || sourceAudio.packageUrl !== deliveredAudio.packageUrl || sourceAudio.sha256 !== deliveredAudio.sha256
        || sourceAudio.byteLength !== deliveredAudio.byteLength || sourceAudio.durationSeconds !== deliveredAudio.durationSeconds
        || sourceAudio.track !== deliveredAudio.track
        || sourceAudio.transcript !== N1_OPENING_SEQUENCE_DELIVERED_SOURCE.listeningSourceTranscript
        || !sameObject(sourceAudio.rationale, N1_OPENING_SEQUENCE_AUTHORED.sourceListeningRationale)) {
        issues.push({ path: 'payload.listening.sourceAudio', message: 'Complete exact source-audio metadata, transcript, and rationale are required.' });
    }
    if (model.payload.listening.transfer.authorship !== 'original-yomu-n1-listening'
        || model.payload.listening.transfer.script !== N1_OPENING_SEQUENCE_AUTHORED.listeningScript
        || !text(model.payload.listening.transfer.scenario.ja) || !text(model.payload.listening.transfer.scenario.en)) {
        issues.push({ path: 'payload.listening.transfer', message: 'A complete original N1 workplace listening transfer update is required.' });
    }
    validateProduction(model, issues);
    validateQuestions(model, issues);
    validatePassScore(model.payload.passScore, issues);
    validateFloors(model, issues);
    validateFeedback(model.payload.feedback, issues);
    validateReviewTargets(model, issues);
    return issues;
}

function validateProduction(model: N1OpeningSequenceModel, issues: ValidationIssue[]): void {
    const production = model.payload.production;
    if (production.authorship !== 'learner-authored-deterministically-checked'
        || !text(production.prompt.ja) || !text(production.prompt.en)
        || !text(production.guidance.ja) || !text(production.guidance.en)
        || !Number.isInteger(production.minLengthChars) || !Number.isInteger(production.maxLengthChars)
        || production.minLengthChars <= 0 || production.maxLengthChars <= production.minLengthChars
        || !production.demandAnchors.length || !production.accessAnchors.length
        || !production.contrastMarkers.length || !production.provisionalMarkers.length
        || !production.overclaimTerms.length || !text(production.modelAnswer)) {
        issues.push({ path: 'payload.production', message: 'A complete deterministic production rubric with anchors, markers, and a model answer is required.' });
        return;
    }
    if (production.checks.length !== 4
        || PRODUCTION_CHECK_IDS.some(id => !production.checks.some(checkDef => checkDef.id === id))
        || production.checks.some(checkDef => !text(checkDef.errorTag) || !text(checkDef.label.ja) || !text(checkDef.label.en))) {
        issues.push({ path: 'payload.production.checks', message: 'Exactly the four labelled deterministic production checks are required.' });
        return;
    }
    if (evaluateN1OpeningSequenceProduction(model, production.modelAnswer).some(result => !result.met)) {
        issues.push({ path: 'payload.production.modelAnswer', message: 'The authored model answer must satisfy its own four deterministic checks.' });
    }
}

function validateQuestions(model: N1OpeningSequenceModel, issues: ValidationIssue[]): void {
    const questions = model.payload.questions;
    const countForModality = (modality: N1OpeningSequenceModality) =>
        questions.filter(question => question.modality === modality).length;
    const countForRole = (role: N1OpeningSequenceStimulusRole) =>
        questions.filter(question => question.stimulusRole === role).length;
    if (questions.length !== TOTAL_QUESTIONS
        || countForModality('reading') !== MODALITY_QUESTION_COUNTS.reading
        || countForModality('grammar') !== MODALITY_QUESTION_COUNTS.grammar
        || countForModality('listening') !== MODALITY_QUESTION_COUNTS.listening
        || (Object.keys(STIMULUS_ROLE_COUNTS) as N1OpeningSequenceStimulusRole[])
            .some(role => countForRole(role) !== STIMULUS_ROLE_COUNTS[role])) {
        issues.push({ path: 'payload.questions', message: 'Exactly 2 source-reading, 3 transfer-reading, 3 grammar, 1 source-listening, and 2 transfer-listening judgments are required.' });
        return;
    }
    const ids = new Set<string>();
    questions.forEach((question, index) => {
        const optionIds = new Set(question.options.map(option => option.id));
        const expectedOptionCount = question.stimulusRole === 'source-listening' ? 4 : 3;
        if (!text(question.id) || ids.has(question.id)
            || !text(question.prompt.ja) || !text(question.prompt.en)
            || question.options.length !== expectedOptionCount || optionIds.size !== expectedOptionCount
            || !optionIds.has(question.correctOptionId) || !text(question.errorTag)
            || question.options.some(option => !text(option.label.ja) || !text(option.label.en))
            || (question.stimulusRole === 'source-listening' && (!question.rationale || !text(question.rationale.ja) || !text(question.rationale.en)))) {
            issues.push({ path: `payload.questions.${index}`, message: 'Each judgment needs a unique id, bilingual prompt, correct option count, and one valid answer; the exact source-listening judgment also needs a rationale.' });
        }
        ids.add(question.id);
    });
    const sourceListening = questions.find(question => question.stimulusRole === 'source-listening');
    const delivered = N1_OPENING_SEQUENCE_DELIVERED_SOURCE;
    if (!sourceListening
        || sourceListening.prompt.ja !== delivered.listeningSourceQuestionPromptJa
        || sourceListening.correctOptionId !== delivered.listeningSourceCorrectOptionId
        || !sameObject(
            sourceListening.options.map(option => ({ id: option.id, ja: option.label.ja })),
            delivered.listeningSourceOptions,
        )
        || !sameObject(sourceListening.rationale, N1_OPENING_SEQUENCE_AUTHORED.sourceListeningRationale)) {
        issues.push({ path: 'payload.questions.source-listening', message: 'The exact So-matome source question, option order, answer, and Yomu rationale are required.' });
    }
}

function validateFloors(model: N1OpeningSequenceModel, issues: ValidationIssue[]): void {
    const floors = model.payload.modalityFloors;
    if (!Number.isInteger(floors.reading) || floors.reading < 0 || floors.reading > MODALITY_QUESTION_COUNTS.reading
        || !Number.isInteger(floors.grammar) || floors.grammar < 0 || floors.grammar > MODALITY_QUESTION_COUNTS.grammar
        || !Number.isInteger(floors.listening) || floors.listening < 0 || floors.listening > MODALITY_QUESTION_COUNTS.listening
        || !Number.isInteger(floors.production) || floors.production < 0 || floors.production > 4) {
        issues.push({ path: 'payload.modalityFloors', message: 'Modality floors must be integers within each modality check count.' });
    }
}

function validateReviewTargets(model: N1OpeningSequenceModel, issues: ValidationIssue[]): void {
    const tags = new Set<string>([
        ...model.payload.questions.map(question => question.errorTag),
        ...model.payload.production.checks.map(checkDef => checkDef.errorTag),
        'floor-reading', 'floor-grammar', 'floor-listening', 'floor-production',
    ]);
    if (model.payload.reviewTargets.length !== 8 || model.payload.reviewTargets.some(target =>
        !text(target.id) || !model.conceptIds.includes(target.conceptId) || !text(target.expression)
        || !target.meanings.length || target.meanings.some(meaning => !text(meaning)) || !text(target.sentence)
        || !target.repairFor.length || target.repairFor.some(tag => !tags.has(tag))
        || (target.attribution !== 'yomu-authored' && target.attribution !== 'exact-source'))) {
        issues.push({ path: 'payload.reviewTargets', message: 'Eight complete, honestly attributed, repair-mapped Reader/SRS targets are required.' });
    }
}

function gradeN1OpeningSequence(
    model: N1OpeningSequenceModel,
    response: N1OpeningSequenceResponse,
): GradeResult {
    const answers = parseResponse(model, response);
    const missed = model.payload.questions.filter(question => answers.get(question.id) !== question.correctOptionId);
    const production = evaluateN1OpeningSequenceProduction(model, response.production);
    const failedChecks = production.filter(result => !result.met);
    const score = (TOTAL_CHECKS - missed.length - failedChecks.length) / TOTAL_CHECKS;
    const floors = model.payload.modalityFloors;
    const correctFor = (modality: N1OpeningSequenceModality) =>
        MODALITY_QUESTION_COUNTS[modality] - missed.filter(question => question.modality === modality).length;
    const floorFailures: string[] = [];
    if (correctFor('reading') < floors.reading) floorFailures.push('floor-reading');
    if (correctFor('grammar') < floors.grammar) floorFailures.push('floor-grammar');
    if (correctFor('listening') < floors.listening) floorFailures.push('floor-listening');
    if (production.length - failedChecks.length < floors.production) floorFailures.push('floor-production');
    const passed = score >= model.payload.passScore && floorFailures.length === 0;
    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: passed
            ? []
            : [...missed.map(question => question.errorTag), ...failedChecks.map(result => result.errorTag), ...floorFailures],
        feedback: structuredClone(passed ? model.payload.feedback.pass : model.payload.feedback.lapse),
    };
}

function n1OpeningSequenceReviewSeeds(
    model: N1OpeningSequenceModel,
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

function renderN1OpeningSequence(
    model: N1OpeningSequenceModel,
    host: ActivityHost,
    submit: (response: N1OpeningSequenceResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const readers: Array<() => void> = [];
    const playback: Array<{ dispose(): void }> = [];
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit';
    root.dataset.activityId = model.id;
    root.dataset.attemptCount = '0';
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const mediaNote = document.createElement('p');
    mediaNote.className = 'academy-support';
    mediaNote.textContent = host.language === 'ja'
        ? '転移課題は、よむが作成した業務連絡文の合成音声です。原典音声（CD1-55）と短い引用はそのまま使い、原典の全ページ・画像は配信しません。'
        : 'The transfer uses synthesized playback of an original Yomu script. CD1 track 55 and short source excerpts are delivered exactly; full source pages and images are not.';
    const form = document.createElement('form');
    form.setAttribute('aria-labelledby', heading.id);
    form.append(
        renderPrerequisiteRefresh(model, host),
        renderReading(model, host, readers),
        renderGrammar(model, host, readers),
        renderListening(model, host, playback, lifecycle.signal),
        renderProduction(model, host),
    );
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja'
        ? '十五の確認をまとめて確定する'
        : 'Commit all fifteen checks';
    const status = statusRegion('academy-kit-feedback');
    form.append(commit, status);
    root.append(heading, mediaNote, form);
    host.replace(root);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '十一の質問すべてに答えてから確定してください。'
                : 'Answer all eleven questions before committing.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.attemptCount = String(Number(root.dataset.attemptCount ?? '0') + 1);
            root.dataset.outcome = evaluation.result.outcome;
            revealEarnedMaterial(root, model, host, readers, response, evaluation);
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
            readers.forEach(dispose => dispose());
            playback.forEach(item => item.dispose());
            root.remove();
        },
    };
}

function renderPrerequisiteRefresh(model: N1OpeningSequenceModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'context';
    section.dataset.prerequisiteRefresh = 'unassessed';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? 'N2からの持ち上げ（採点なし）' : 'Carried up from N2 (unassessed)';
    const list = document.createElement('ol');
    model.payload.prerequisiteRefresh.forEach(item => {
        const row = document.createElement('li');
        row.dataset.prerequisiteConcept = item.conceptId;
        row.dataset.exampleSource = item.exampleSource;
        const bridge = document.createElement('p');
        bridge.textContent = localized(item.bridge, host);
        row.append(bridge, japanese(item.example));
        list.append(row);
    });
    section.append(heading, list);
    return section;
}

function renderReading(
    model: N1OpeningSequenceModel,
    host: ActivityHost,
    readers: Array<() => void>,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-recognition';
    section.dataset.sequenceStep = 'reading';

    const anchorArticle = document.createElement('article');
    anchorArticle.dataset.sourceRole = 'reading-source-anchor';
    const anchorHeading = document.createElement('h3');
    anchorHeading.append(...localizedNodes(model.payload.reading.sourceAnchor.title));
    anchorArticle.append(anchorHeading);
    model.payload.reading.sourceAnchor.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement('p');
        const span = japanese(paragraph);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:reading:source-paragraph-${index + 1}`;
        registerSurface(host, span, readers);
        row.append(span);
        anchorArticle.append(row);
    });
    section.append(anchorArticle);
    questionsFor(model, 'reading', 'source-reading').forEach(question => section.append(renderQuestion(question)));

    const transferArticle = document.createElement('article');
    transferArticle.dataset.sourceRole = 'reading-transfer';
    const transferHeading = document.createElement('h3');
    transferHeading.append(...localizedNodes(model.payload.reading.transfer.title));
    transferArticle.append(transferHeading);
    model.payload.reading.transfer.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement('p');
        const span = japanese(paragraph);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:reading:transfer-paragraph-${index + 1}`;
        registerSurface(host, span, readers);
        row.append(span);
        transferArticle.append(row);
    });
    section.append(transferArticle);
    questionsFor(model, 'reading', 'transfer-reading').forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderGrammar(
    model: N1OpeningSequenceModel,
    host: ActivityHost,
    readers: Array<() => void>,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'instruction';
    section.dataset.sequenceStep = 'grammar';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(model.payload.grammar.title));
    section.append(heading);
    const list = document.createElement('ol');
    model.payload.grammar.forms.forEach((item, index) => {
        const row = document.createElement('li');
        row.dataset.grammarForm = item.id;
        row.dataset.sourceRole = 'grammar-exact-source';
        const title = document.createElement('strong');
        title.textContent = item.form;
        const example = japanese(item.example);
        example.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:grammar:example-${index + 1}`;
        registerSurface(host, example, readers);
        const notes = document.createElement('ul');
        [item.registerNote, item.agentNote, item.eventNote].forEach(note => {
            const noteRow = document.createElement('li');
            noteRow.textContent = localized(note, host);
            notes.append(noteRow);
        });
        row.append(title, example, notes);
        list.append(row);
    });
    section.append(list);
    questionsFor(model, 'grammar', 'grammar').forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderListening(
    model: N1OpeningSequenceModel,
    host: ActivityHost,
    playback: Array<{ dispose(): void }>,
    signal: AbortSignal,
): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-recognition';
    section.dataset.sequenceStep = 'listening';

    const sourceAudio = model.payload.listening.sourceAudio;
    const sourceBlock = document.createElement('div');
    sourceBlock.dataset.sourceRole = 'listening-source-audio';
    const sourceHeading = document.createElement('h3');
    sourceHeading.append(...localizedNodes(sourceAudio.title));
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = sourceAudio.packageUrl;
    audio.dataset.sourceAudioTrack = sourceAudio.track;
    // A simple abort-signal listener that removes the src/element is enough to
    // stop playback on dispose without invoking jsdom-unimplemented media APIs.
    signal.addEventListener('abort', () => {
        audio.removeAttribute('src');
        audio.remove();
    }, { once: true });
    sourceBlock.append(sourceHeading, audio);
    section.append(sourceBlock);
    // The exact source transcript intentionally never enters the DOM before commitment.
    questionsFor(model, 'listening', 'source-listening').forEach(question => section.append(renderQuestion(question)));

    const transfer = model.payload.listening.transfer;
    const transferBlock = document.createElement('div');
    transferBlock.dataset.sourceRole = 'listening-transfer';
    const transferHeading = document.createElement('h3');
    transferHeading.append(...localizedNodes(transfer.title));
    const scenario = document.createElement('p');
    scenario.className = 'academy-support';
    scenario.textContent = localized(transfer.scenario, host);
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-button academy-button-secondary';
    play.dataset.playListening = '';
    play.textContent = host.language === 'ja' ? '業務連絡を再生する' : 'Play the workplace update';
    // The transfer script text intentionally never enters the DOM before commitment.
    play.addEventListener('click', () => void playRehearsal(transfer.script, host, playback, signal), { signal });
    transferBlock.append(transferHeading, scenario, play);
    section.append(transferBlock);
    questionsFor(model, 'listening', 'transfer-listening').forEach(question => section.append(renderQuestion(question)));
    return section;
}

function renderProduction(model: N1OpeningSequenceModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.dataset.lessonPhase = 'assessed-production';
    section.dataset.sequenceStep = 'production';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(model.payload.production.prompt));
    const guidance = document.createElement('p');
    guidance.className = 'academy-support';
    guidance.dataset.productionGuidance = 'constrained-deterministic-check';
    guidance.textContent = localized(model.payload.production.guidance, host);
    const label = document.createElement('label');
    label.textContent = localized(model.payload.production.fieldLabel, host);
    const input = document.createElement('textarea');
    input.name = 'production';
    input.dataset.production = 'deterministically-checked';
    input.rows = 5;
    label.append(input);
    section.append(heading, guidance, label);
    return section;
}

function renderQuestion(question: N1OpeningSequenceQuestion): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.questionId = question.id;
    fieldset.dataset.modality = question.modality;
    fieldset.dataset.stimulusRole = question.stimulusRole;
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

/**
 * Creates the exact-source transcript/rationale reveal, the Yomu transfer
 * transcript reveal, and the answer key on the first evaluated attempt, then
 * updates the SAME key element in place on later attempts. Earned material is
 * never removed across retries.
 */
function revealEarnedMaterial(
    root: HTMLElement,
    model: N1OpeningSequenceModel,
    host: ActivityHost,
    readers: Array<() => void>,
    response: N1OpeningSequenceResponse,
    evaluation: ActivityEvaluation,
): void {
    if (!root.querySelector('[data-source-transcript-reveal]')) {
        const sourceAudio = model.payload.listening.sourceAudio;
        const reveal = document.createElement('section');
        reveal.dataset.sourceTranscriptReveal = 'after-attempt';
        const heading = document.createElement('h3');
        heading.textContent = host.language === 'ja'
            ? '試行後の正確な原典スクリプトと解説'
            : 'Exact source transcript and rationale after your attempt';
        const span = japanese(sourceAudio.transcript);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:listening:source-transcript-1`;
        registerSurface(host, span, readers);
        const body = document.createElement('p');
        body.append(span);
        const rationale = document.createElement('p');
        rationale.dataset.sourceRationale = '';
        rationale.textContent = localized(sourceAudio.rationale, host);
        reveal.append(heading, body, rationale);
        root.append(reveal);
    }
    if (!root.querySelector('[data-transfer-transcript-reveal]')) {
        const reveal = document.createElement('section');
        reveal.dataset.transferTranscriptReveal = 'after-attempt';
        const heading = document.createElement('h3');
        heading.textContent = host.language === 'ja'
            ? '試行後のオリジナル業務連絡文'
            : 'Original workplace script after your attempt';
        const span = japanese(model.payload.listening.transfer.script);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:listening:transfer-transcript-1`;
        registerSurface(host, span, readers);
        const body = document.createElement('p');
        body.append(span);
        reveal.append(heading, body);
        root.append(reveal);
    }
    let key = root.querySelector<HTMLElement>('[data-answer-key]');
    if (!key) {
        key = document.createElement('section');
        key.dataset.answerKey = 'after-attempt';
        const heading = document.createElement('h3');
        heading.textContent = host.language === 'ja' ? '答えと採点基準' : 'Answer and rubric key';
        const body = document.createElement('div');
        body.dataset.answerKeyBody = '';
        key.append(heading, body);
        root.append(key);
    }
    const body = key.querySelector<HTMLElement>('[data-answer-key-body]');
    if (!body) return;
    body.replaceChildren(
        renderMcqKey(model, host),
        renderProductionKey(model, host, response),
        renderModelAnswer(model, host),
    );
    key.dataset.attemptCount = root.dataset.attemptCount ?? '1';
    key.dataset.outcome = evaluation.result.outcome;
}

function renderMcqKey(model: N1OpeningSequenceModel, host: ActivityHost): HTMLElement {
    const list = document.createElement('ol');
    list.dataset.answerKeyMcq = '';
    model.payload.questions.forEach(question => {
        const correct = question.options.find(option => option.id === question.correctOptionId);
        const row = document.createElement('li');
        row.dataset.keyQuestionId = question.id;
        row.dataset.correctOptionId = question.correctOptionId;
        const prompt = document.createElement('span');
        prompt.textContent = `${localized(question.prompt, host)} — `;
        row.append(prompt);
        if (correct) row.append(japanese(correct.label.ja), document.createTextNode(` ${correct.label.en}`));
        if (question.rationale) {
            const rationale = document.createElement('p');
            rationale.dataset.keyRationale = '';
            rationale.textContent = localized(question.rationale, host);
            row.append(rationale);
        }
        list.append(row);
    });
    return list;
}

function renderProductionKey(
    model: N1OpeningSequenceModel,
    host: ActivityHost,
    response: N1OpeningSequenceResponse,
): HTMLElement {
    const list = document.createElement('ul');
    list.dataset.answerKeyProduction = '';
    evaluateN1OpeningSequenceProduction(model, response.production).forEach(result => {
        const row = document.createElement('li');
        row.dataset.productionCheck = result.id;
        row.dataset.met = String(result.met);
        const metLabel = result.met
            ? (host.language === 'ja' ? '達成' : 'met')
            : (host.language === 'ja' ? '未達成' : 'not met');
        row.textContent = `${localized(result.label, host)} — ${metLabel}`;
        list.append(row);
    });
    return list;
}

function renderModelAnswer(model: N1OpeningSequenceModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('div');
    section.dataset.modelAnswer = 'after-attempt';
    const heading = document.createElement('h4');
    heading.textContent = host.language === 'ja' ? '提言の一例（よむ作成）' : 'One model recommendation (Yomu-authored)';
    const body = document.createElement('p');
    body.append(japanese(model.payload.production.modelAnswer));
    section.append(heading, body);
    return section;
}

function questionsFor(
    model: N1OpeningSequenceModel,
    modality: N1OpeningSequenceModality,
    stimulusRole: N1OpeningSequenceStimulusRole,
): readonly N1OpeningSequenceQuestion[] {
    return model.payload.questions.filter(question => question.modality === modality && question.stimulusRole === stimulusRole);
}

function responseFromForm(model: N1OpeningSequenceModel, form: HTMLFormElement): N1OpeningSequenceResponse | undefined {
    const answers = model.payload.questions.map(question => {
        const input = form.querySelector<HTMLInputElement>(`input[name="${question.id}"]:checked`);
        return input ? { questionId: question.id, optionId: input.value } : undefined;
    });
    if (!answers.every(answer => answer !== undefined)) return undefined;
    const production = form.elements.namedItem('production');
    return {
        answers: answers as N1OpeningSequenceResponse['answers'],
        production: production instanceof HTMLTextAreaElement ? production.value : '',
    };
}

function parseResponse(model: N1OpeningSequenceModel, response: N1OpeningSequenceResponse): ReadonlyMap<string, string> {
    if (!Array.isArray(response?.answers) || response.answers.length !== model.payload.questions.length
        || typeof response.production !== 'string') {
        throw new TypeError('Every N1 opening-sequence question needs one answer and a written recommendation value.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        const question = model.payload.questions.find(candidate => candidate.id === answer.questionId);
        if (!question || answers.has(answer.questionId) || !question.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('N1 opening-sequence answers must address each assessed question once.');
        }
        answers.set(answer.questionId, answer.optionId);
    });
    return answers;
}

async function playRehearsal(
    textToPlay: string,
    host: ActivityHost,
    disposers: Array<{ dispose(): void }>,
    signal: AbortSignal,
): Promise<void> {
    const item = host.playPronunciation ? await host.playPronunciation(textToPlay) : browserSpeech(textToPlay);
    if (!item) return;
    if (signal.aborted) {
        item.dispose();
        return;
    }
    disposers.push(item);
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
