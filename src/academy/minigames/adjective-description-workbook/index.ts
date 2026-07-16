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
    assessedJapanese,
    gradeFromScore,
    localized,
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface AdjectiveDescriptionTeachingStep {
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

interface AdjectiveDescriptionRoundBase {
    readonly id: string;
    readonly mode: 'modifier' | 'connector' | 'typed';
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly sourcePrompt: string;
    readonly acceptedAnswers: readonly string[];
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface AdjectiveDescriptionModifierRound extends AdjectiveDescriptionRoundBase {
    readonly mode: 'modifier';
    readonly correctAttachment: 'direct' | 'na';
}

export interface AdjectiveDescriptionConnectorRound extends AdjectiveDescriptionRoundBase {
    readonly mode: 'connector';
    readonly correctConnector: 'soshite' | 'ga';
}

export interface AdjectiveDescriptionTypedRound extends AdjectiveDescriptionRoundBase {
    readonly mode: 'typed';
}

export type AdjectiveDescriptionRound =
    | AdjectiveDescriptionModifierRound
    | AdjectiveDescriptionConnectorRound
    | AdjectiveDescriptionTypedRound;

export type AdjectiveDescriptionAnswer =
    | Readonly<{ mode: 'modifier'; roundId: string; attachment: 'direct' | 'na'; value: string }>
    | Readonly<{ mode: 'connector'; roundId: string; connector: 'soshite' | 'ga'; value: string }>
    | Readonly<{ mode: 'typed'; roundId: string; value: string }>;

export interface AdjectiveDescriptionWorkbookResponse {
    readonly answers: readonly AdjectiveDescriptionAnswer[];
}

export interface AdjectiveDescriptionWorkbookModel extends ActivityModel {
    readonly kind: 'academy-adjective-description-workbook';
    readonly responseKind: 'mixed-source-adjective-description-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l11';
        readonly answerVisibility: 'after-attempt';
        readonly sourceOrder: readonly ['moodle', 'minna', 'genki'];
        readonly moodle: {
            readonly moduleId: 6053028;
            readonly archiveOccurrenceId: 'archive-000011';
            readonly archiveSha256: string;
            readonly documents: readonly [{ readonly payloadSha256: string; readonly member: string; readonly pages: '1-6' },
                { readonly payloadSha256: string; readonly member: string; readonly pages: '1-3' }];
        };
        readonly minna: {
            readonly sourceId: string;
            readonly reference: 'Minna no Nihongo I, Lesson 8';
            readonly title: 'Minna no Nihongo 2nd Edition Shokyu I';
            readonly author: '3A Network';
            readonly payloadSha256: string;
            readonly pageCount: 326;
            readonly pdfPage: 90;
            readonly printedPage: 70;
            readonly locus: 'Practice B, exercises 5-7';
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l11:lesson-5-workbook-2';
            readonly sourceId: string;
            readonly relativePath: 'lessons/lesson-5/workbook-2/index.html';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 140 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceType: 'fill';
        };
    };
    readonly payload: {
        readonly teaching: readonly AdjectiveDescriptionTeachingStep[];
        readonly rounds: readonly AdjectiveDescriptionRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_MODIFIER_SHA = 'dfec00d8e4c6d049a2251e0ef90035cbe92edef7fdde0c7ca96ced1e8ed40aba';
const MOODLE_CONNECTOR_SHA = '869c7d8430e6d18a2c7d56aceda2789408e2fa9dada1643f30ff9bc600cb1623';
const MINNA_SHA = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA = '5ab2683d567a265548fa0dbfb02af9961bd0bf367b669c2e7cc22aa38d149a65';
const GENKI_SCRIPT_SHA = '470977b7f3e135dcbeefe9121426387f43f20fded2eda92eb6037fd5921cc2fc';
const MODE_SIGNATURE = [
    ...Array(6).fill('modifier'), ...Array(2).fill('connector'), ...Array(4).fill('connector'),
    ...Array(8).fill('modifier'), ...Array(10).fill('typed'),
].join('|');
const SOURCE_SEQUENCE_FINGERPRINT = '219c7f68';

export const adjectiveDescriptionWorkbookPlugin: ActivityPlugin<
    AdjectiveDescriptionWorkbookModel,
    AdjectiveDescriptionWorkbookResponse
> = {
    kind: 'academy-adjective-description-workbook',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed: string[] = [];
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id)!;
            const textMatches = round.acceptedAnswers.some(candidate =>
                normalizeJapanese(candidate) === normalizeJapanese(answer.value));
            const structureMatches = round.mode === 'modifier'
                ? answer.mode === round.mode && answer.attachment === round.correctAttachment
                : round.mode === 'connector'
                    ? answer.mode === round.mode && answer.connector === round.correctConnector
                    : answer.mode === round.mode;
            if (!textMatches || !structureMatches) missed.push(round.errorTag);
        }
        const score = (model.payload.rounds.length - missed.length) / model.payload.rounds.length;
        return gradeFromScore(score, model.payload.passScore, missed, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round =>
            result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
                ? []
                : [reviewSeed(round, result)]);
    },
};

function validate(model: AdjectiveDescriptionWorkbookModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'Assessed answer support is required.' });
    }
    validateProvenance(model.provenance, issues);
    validateTeaching(model.payload?.teaching, issues);
    validateRounds(model, issues);
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source item is required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateProvenance(value: AdjectiveDescriptionWorkbookModel['provenance'] | undefined, issues: ValidationIssue[]): void {
    if (value?.packageId !== 'l1-l11' || value.answerVisibility !== 'after-attempt'
        || value.sourceOrder?.join(',') !== 'moodle,minna,genki') {
        issues.push({ path: 'provenance', message: 'Lesson 11 identity, source order, and answer gate are required.' });
        return;
    }
    const documents = value.moodle?.documents;
    if (value.moodle?.moduleId !== 6053028 || value.moodle.archiveOccurrenceId !== 'archive-000011'
        || documents?.[0]?.payloadSha256 !== MOODLE_MODIFIER_SHA || documents[0].pages !== '1-6'
        || documents?.[1]?.payloadSha256 !== MOODLE_CONNECTOR_SHA || documents[1].pages !== '1-3') {
        issues.push({ path: 'provenance.moodle', message: 'Exact Moodle module and documents are required.' });
    }
    const minna = value.minna;
    if (minna?.sourceId !== `minna-i:${MINNA_SHA}:lesson-8` || minna.reference !== 'Minna no Nihongo I, Lesson 8'
        || minna.payloadSha256 !== MINNA_SHA || minna.title !== 'Minna no Nihongo 2nd Edition Shokyu I'
        || minna.author !== '3A Network' || minna.pageCount !== 326 || minna.pdfPage !== 90
        || minna.printedPage !== 70 || minna.locus !== 'Practice B, exercises 5-7') {
        issues.push({ path: 'provenance.minna', message: 'Exact Minna Lesson 8 page and exercise provenance is required.' });
    }
    const genki = value.genki;
    if (genki?.taskId !== 'genki-2e:l1-l11:lesson-5-workbook-2'
        || genki.sourceId !== `japanese-genki-interactive:${GENKI_SHA}:generateQuiz`
        || genki.relativePath !== 'lessons/lesson-5/workbook-2/index.html'
        || genki.payloadSha256 !== GENKI_SHA || genki.scriptSha256 !== GENKI_SCRIPT_SHA
        || genki.lineLocus?.start !== 76 || genki.lineLocus.end !== 140
        || genki.engine !== 'Genki.generateQuiz' || genki.sourceType !== 'fill') {
        issues.push({ path: 'provenance.genki', message: 'Exact Genki generated-quiz provenance is required.' });
    }
}

function validateTeaching(value: readonly AdjectiveDescriptionTeachingStep[] | undefined, issues: ValidationIssue[]): void {
    if (!Array.isArray(value) || value.length !== 4) {
        issues.push({ path: 'payload.teaching', message: 'Four source-labelled teaching steps are required.' });
        return;
    }
    value.forEach((step, index) => {
        if (step.sourceOrder !== index + 1 || !text(step.sourceQuestionId) || !text(step.sourceLabel)
            || !text(step.pattern) || !text(step.example) || !text(step.explanation?.en) || !text(step.explanation?.ja)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching must be complete, bilingual, and ordered.' });
        }
    });
}

function validateRounds(model: AdjectiveDescriptionWorkbookModel, issues: ValidationIssue[]): void {
    const rounds: readonly AdjectiveDescriptionRound[] = model.payload?.rounds ?? [];
    if (!Array.isArray(rounds) || rounds.length !== 30) {
        issues.push({ path: 'payload.rounds', message: 'All 30 ordered source rounds are required.' });
        return;
    }
    if (rounds.map(round => round.mode).join('|') !== MODE_SIGNATURE) {
        issues.push({ path: 'payload.rounds', message: 'The exact varied interaction sequence is required.' });
    }
    const fingerprint = sourceSequenceFingerprint(rounds);
    if (fingerprint !== SOURCE_SEQUENCE_FINGERPRINT) {
        issues.push({ path: 'payload.rounds', message: `Exact source sequence changed (${fingerprint}).` });
    }
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        const expectedPrefix = index < 8 ? 'moodle:6053028:' : index < 20 ? `minna-i:${MINNA_SHA}:` : 'genki-2e:l1-l11:';
        if (round.sourceOrder !== index + 1 || !round.sourceQuestionId.startsWith(expectedPrefix)
            || !text(round.sourceLabel) || !text(round.sourcePrompt) || !text(round.answerExpression)
            || round.acceptedAnswers[0] !== round.answerExpression
            || round.acceptedAnswers.some((answer: string) => !text(answer))) {
            issues.push({ path, message: 'Source order, identity, prompt, and canonical answer must remain complete.' });
        }
        if (ids.has(round.id) || sourceIds.has(round.sourceQuestionId) || !model.conceptIds.includes(round.conceptId)
            || !text(round.errorTag)) {
            issues.push({ path, message: 'Round ids, source ids, Concepts, and repair tags must be unique.' });
        }
        ids.add(round.id);
        sourceIds.add(round.sourceQuestionId);
        if (round.hints.length !== 3
            || round.hints.some((hint: LocalizedText) => !text(hint.en) || !text(hint.ja))) {
            issues.push({ path: `${path}.hints`, message: 'Three bilingual progressive hints are required.' });
        }
    });
    if (model.conceptIds.length !== 30 || new Set(model.conceptIds).size !== 30) {
        issues.push({ path: 'conceptIds', message: 'Each source round needs one unique Concept.' });
    }
}

function sourceSequenceFingerprint(rounds: readonly AdjectiveDescriptionRound[]): string {
    const value = rounds.map(round => [
        round.sourceOrder,
        round.mode,
        round.sourceQuestionId,
        round.sourcePrompt,
        ...round.acceptedAnswers,
    ].join('\u241f')).join('\u241e');
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function render(
    model: AdjectiveDescriptionWorkbookModel,
    host: ActivityHost,
    submit: (response: AdjectiveDescriptionWorkbookResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-adjective-workbook';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'academy-button academy-button-primary academy-adjective-start';
    start.textContent = host.language === 'ja' ? '元資料の問題へ' : 'Continue to source workbook';
    const assessment = document.createElement('div');
    root.append(heading, teaching, start, assessment);
    host.replace(root);
    let form: HTMLFormElement | null = null;
    start.addEventListener('click', () => {
        if (form) return;
        form = renderAssessment(model, host, submit);
        assessment.append(form);
        start.remove();
        form.querySelector<HTMLElement>('input, select')?.focus();
    }, { signal: lifecycle.signal });
    return {
        focus() { (form?.querySelector<HTMLElement>('input, select') ?? start).focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: AdjectiveDescriptionWorkbookModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-adjective-teaching';
    section.dataset.lessonPhase = 'teaching';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes({ ja: '先に形と意味を学ぶ', en: 'Learn the forms and meaning first' }));
    section.append(heading);
    for (const step of model.payload.teaching) {
        const article = document.createElement('article');
        article.className = 'academy-adjective-teaching-step';
        article.dataset.sourceQuestionId = step.sourceQuestionId;
        const source = document.createElement('p');
        source.className = 'academy-source-record';
        source.dataset.jpdbReaderSurfaceIgnore = '';
        source.textContent = step.sourceLabel;
        const pattern = document.createElement('h4');
        pattern.append(assessedJapanese(step.pattern));
        const explanation = document.createElement('p');
        explanation.append(...localizedNodes(step.explanation));
        const example = document.createElement('p');
        example.className = 'academy-adjective-model';
        example.append(assessedJapanese(step.example));
        article.append(source, pattern, explanation, example);
        section.append(article);
    }
    return section;
}

function renderAssessment(
    model: AdjectiveDescriptionWorkbookModel,
    host: ActivityHost,
    submit: (response: AdjectiveDescriptionWorkbookResponse) => Promise<ActivityEvaluation>,
): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'academy-adjective-form';
    form.dataset.lessonPhase = 'assessment';
    form.setAttribute('aria-labelledby', `${model.id}-prompt`);
    form.append(
        renderGroup(model, host, 'moodle', { ja: 'Moodle：元の順番', en: 'Moodle: original order' }),
        renderGroup(model, host, 'minna', { ja: 'みんなの日本語 第8課', en: 'Minna no Nihongo: Lesson 8' }),
        renderGroup(model, host, 'genki', { ja: 'Genki 第5課', en: 'Genki: Lesson 5' }),
    );
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-adjective-check';
    check.textContent = host.language === 'ja' ? '30問を確認' : 'Check all 30 answers';
    const feedback = statusRegion('academy-adjective-feedback');
    form.append(check, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) return;
        setPending(form, true);
        void submit(response).then(evaluation => {
            form.dataset.outcome = evaluation.result.outcome;
            showEvaluation(feedback, evaluation, host);
            setPending(form, false);
            if (evaluation.result.outcome === 'lapse') {
                applyRepair(form, evaluation.result.errorTags, check, host);
            }
        }).catch(error => {
            setPending(form, false);
            feedback.setAttribute('role', 'alert');
            feedback.textContent = error instanceof Error ? error.message : String(error);
        });
    });
    return form;
}

function renderGroup(
    model: AdjectiveDescriptionWorkbookModel,
    host: ActivityHost,
    source: 'moodle' | 'minna' | 'genki',
    title: LocalizedText,
): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-adjective-group';
    section.dataset.sourceGroup = source;
    const heading = document.createElement('h3');
    heading.append(...localizedNodes(title));
    const grid = document.createElement('div');
    grid.className = 'academy-adjective-round-grid';
    const bounds = source === 'moodle' ? [0, 8] : source === 'minna' ? [8, 20] : [20, 30];
    model.payload.rounds.slice(bounds[0], bounds[1]).forEach(round => grid.append(renderRound(model, round, host)));
    section.append(heading, grid);
    return section;
}

function renderRound(
    model: AdjectiveDescriptionWorkbookModel,
    round: AdjectiveDescriptionRound,
    host: ActivityHost,
): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-adjective-round academy-adjective-round-${round.mode}`;
    fieldset.dataset.roundId = round.id;
    fieldset.dataset.errorTag = round.errorTag;
    fieldset.dataset.sourceQuestionId = round.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.append(assessedJapanese(`${round.sourceOrder}. ${round.sourcePrompt}`));
    const source = document.createElement('p');
    source.className = 'academy-source-record';
    source.dataset.jpdbReaderSurfaceIgnore = '';
    source.textContent = round.sourceLabel;
    fieldset.append(legend, source);
    if (round.mode === 'modifier') fieldset.append(structureSelect(model, round, 'attachment'));
    if (round.mode === 'connector') fieldset.append(structureSelect(model, round, 'connector'));
    fieldset.append(answerInput(model, round), hintSurface(model, round, host));
    return fieldset;
}

function structureSelect(
    model: AdjectiveDescriptionWorkbookModel,
    round: AdjectiveDescriptionModifierRound | AdjectiveDescriptionConnectorRound,
    suffix: 'attachment' | 'connector',
): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'academy-adjective-structure';
    const caption = document.createElement('span');
    caption.textContent = suffix === 'attachment'
        ? `${round.sourceOrder}. つなぎ方 / Attachment`
        : `${round.sourceOrder}. 関係 / Relationship`;
    const select = document.createElement('select');
    select.name = `${model.id}-${round.id}-${suffix}`;
    select.required = true;
    select.append(option('', '—'));
    if (suffix === 'attachment') {
        select.append(option('direct', 'そのまま / direct'), option('na', 'な を入れる / add な'));
    } else {
        select.append(option('soshite', '同じ方向 / compatible'), option('ga', '反対 / contrast'));
    }
    label.append(caption, select);
    return label;
}

function option(value: string, label: string): HTMLOptionElement {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = label;
    return item;
}

function answerInput(model: AdjectiveDescriptionWorkbookModel, round: AdjectiveDescriptionRound): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'academy-adjective-answer';
    const caption = document.createElement('span');
    caption.textContent = `${round.sourceOrder}. 日本語を完成する / Complete in Japanese`;
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `${model.id}-${round.id}-value`;
    input.required = true;
    input.lang = 'ja';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.jpdbReaderSurfaceIgnore = '';
    label.append(caption, input);
    return label;
}

function hintSurface(
    model: AdjectiveDescriptionWorkbookModel,
    round: AdjectiveDescriptionRound,
    host: ActivityHost,
): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-adjective-hints';
    root.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-adjective-hint';
    button.textContent = host.language === 'ja' ? 'ヒント 1' : 'Hint 1';
    const output = statusRegion('academy-adjective-hint-output');
    let index = 0;
    button.addEventListener('click', () => {
        const hint = round.hints[index];
        if (!hint) return;
        index += 1;
        output.textContent = localized(hint, host);
        output.dataset.hintIndex = String(index);
        void host.recordSupportUse?.({ activityId: model.id, supportKind: 'hint', choiceId: round.id });
        if (index === round.hints.length) button.disabled = true;
        else button.textContent = host.language === 'ja' ? `ヒント ${index + 1}` : `Hint ${index + 1}`;
    });
    root.append(button, output);
    return root;
}

function responseFromForm(
    model: AdjectiveDescriptionWorkbookModel,
    form: HTMLFormElement,
): AdjectiveDescriptionWorkbookResponse | null {
    const data = new FormData(form);
    const answers: AdjectiveDescriptionAnswer[] = [];
    for (const round of model.payload.rounds) {
        const value = data.get(`${model.id}-${round.id}-value`);
        if (typeof value !== 'string' || !value.trim()) return null;
        if (round.mode === 'modifier') {
            const attachment = data.get(`${model.id}-${round.id}-attachment`);
            if (attachment !== 'direct' && attachment !== 'na') return null;
            answers.push({ mode: round.mode, roundId: round.id, attachment, value });
        } else if (round.mode === 'connector') {
            const connector = data.get(`${model.id}-${round.id}-connector`);
            if (connector !== 'soshite' && connector !== 'ga') return null;
            answers.push({ mode: round.mode, roundId: round.id, connector, value });
        } else {
            answers.push({ mode: round.mode, roundId: round.id, value });
        }
    }
    return { answers };
}

function parseResponse(
    model: AdjectiveDescriptionWorkbookModel,
    response: AdjectiveDescriptionWorkbookResponse,
): ReadonlyMap<string, AdjectiveDescriptionAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Lesson 11 source item needs one answer.');
    }
    const answers = new Map<string, AdjectiveDescriptionAnswer>();
    for (const answer of response.answers) {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round || answers.has(answer.roundId) || answer.mode !== round.mode || !text(answer.value)) {
            throw new TypeError('Answers must use every source item once and keep its interaction mode.');
        }
        if (round.mode === 'modifier' && (answer.mode !== round.mode || !['direct', 'na'].includes(answer.attachment))) {
            throw new TypeError('Modifier answers require an offered attachment.');
        }
        if (round.mode === 'connector' && (answer.mode !== round.mode || !['soshite', 'ga'].includes(answer.connector))) {
            throw new TypeError('Connector answers require an offered relationship.');
        }
        answers.set(answer.roundId, answer);
    }
    return answers;
}

function applyRepair(
    form: HTMLFormElement,
    errorTags: readonly string[],
    check: HTMLButtonElement,
    host: ActivityHost,
): void {
    const missed = new Set(errorTags);
    const rounds = [...form.querySelectorAll<HTMLFieldSetElement>('.academy-adjective-round')];
    rounds.forEach(round => {
        const repair = missed.has(round.dataset.errorTag ?? '');
        round.hidden = !repair;
        round.dataset.needsRepair = String(repair);
        const hints = round.querySelector<HTMLElement>('.academy-adjective-hints');
        if (hints) hints.hidden = !repair;
    });
    form.querySelectorAll<HTMLElement>('.academy-adjective-group').forEach(group => {
        group.hidden = !group.querySelector('.academy-adjective-round:not([hidden])');
    });
    form.classList.add('academy-adjective-repair');
    check.textContent = host.language === 'ja'
        ? `${missed.size}問を直して確認`
        : `Check ${missed.size} repaired ${missed.size === 1 ? 'answer' : 'answers'}`;
    rounds.find(round => !round.hidden)?.querySelector<HTMLElement>('input, select, button')?.focus();
}

function reviewSeed(round: AdjectiveDescriptionRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l11:adjective-description:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: {
            expression: round.answerExpression,
            meanings: [round.sourcePrompt],
            sentence: round.answerExpression,
        },
    };
}
