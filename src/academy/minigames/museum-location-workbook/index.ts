import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface MuseumLocationTeachingStep {
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly pattern: string;
    readonly explanation: LocalizedText;
    readonly example: string;
}

export interface MuseumLocationSourceVisual {
    readonly id: 'position-picture-strip' | 'position-room-garden' | 'museum-object-panels';
    readonly role: 'prompt-image' | 'museum-context';
    readonly sourceQuestionIds: readonly string[];
    readonly url: string;
    readonly sha256: string;
    readonly source: {
        readonly payloadSha256: string;
        readonly member: string;
        readonly page: 1 | 2 | 3;
        readonly crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rasterDpi: 144 };
    };
    readonly answerKeyVisible: false;
    readonly alt: LocalizedText;
    readonly caption: LocalizedText;
}

interface MuseumLocationRoundBase {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceLabel: string;
    readonly sourcePrompt: string;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hint: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface MuseumLocationFrameRound extends MuseumLocationRoundBase {
    readonly mode: 'frame-choice';
    readonly position: 'うえ' | 'した' | 'まえ' | 'なか';
    readonly verb: 'あります' | 'います';
}

export interface MuseumLocationReplyRound extends MuseumLocationRoundBase {
    readonly mode: 'reply-choice';
}

export interface MuseumLocationTypedRound extends MuseumLocationRoundBase {
    readonly mode: 'typed';
    readonly acceptedAnswers: readonly string[];
}

export type MuseumLocationRound = MuseumLocationFrameRound | MuseumLocationReplyRound | MuseumLocationTypedRound;

export type MuseumLocationAnswer =
    | Readonly<{ mode: 'frame-choice'; roundId: string; position: MuseumLocationFrameRound['position']; verb: MuseumLocationFrameRound['verb'] }>
    | Readonly<{ mode: 'reply-choice'; roundId: string; value: string }>
    | Readonly<{ mode: 'typed'; roundId: string; value: string }>;

export interface MuseumLocationResponse {
    readonly answers: readonly MuseumLocationAnswer[];
}

export interface MuseumLocationWorkbookModel extends ActivityModel {
    readonly kind: 'academy-museum-location-workbook';
    readonly responseKind: 'position-frame-and-source-transfer';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l17';
        readonly answerVisibility: 'after-attempt';
        readonly sourceOrder: readonly ['moodle', 'minna-mapping', 'genki'];
        readonly moodle: {
            readonly moduleId: 5489600;
            readonly archiveSha256: string;
            readonly documents: readonly [
                { readonly payloadSha256: string; readonly member: string; readonly pages: '1' },
                { readonly payloadSha256: string; readonly member: string; readonly pages: '1, 3' },
                { readonly payloadSha256: string; readonly member: string; readonly pages: '2' },
            ];
            readonly sourceVisuals: readonly MuseumLocationSourceVisual[];
        };
        readonly minna: {
            readonly sourceId: 'japanese-minna:10-10';
            readonly reference: 'Minna no Nihongo I, Lesson 10';
            readonly relation: 'chronology-map-only';
            readonly reason: string;
        };
        readonly genki: {
            readonly taskId: 'genki-2e:l1-l17:lesson-4-workbook-2';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 153 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceSlice: readonly [1, 6];
        };
    };
    readonly payload: {
        readonly teaching: readonly MuseumLocationTeachingStep[];
        readonly rounds: readonly MuseumLocationRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const MOODLE_ARCHIVE_SHA256 = '61c9d1b3633f418f55fbb047b2ea941eed7f4a2245ea33a45ef8945656150815';
const MOODLE_TOPIC_LOCATION_SHA256 = '321fd611a707f2820764a563662b3b7b2ad70d6122ebf48e2dbea8951b4486a9';
const MOODLE_POSITION_SHA256 = 'b7ab822e95efc2f31a35f11725fb8e48d90348246433804434b3f2b3f200e620';
const MOODLE_MUSEUM_READING_SHA256 = '2eb33ab6da711f25198843922600959965fbb7aee5c279f06598ffe109687e09';
const GENKI_SHA256 = '1bc8b462c5c75728e9e891c35f71e9df13e05c7917b81e5aa4c07496582d9686';
const GENKI_SCRIPT_SHA256 = '4165f6dcecba03b99b8f7124f35d863fa6232585949619633905cc18a93ccd89';
const EXACT_SOURCE_IDS = [
    'moodle:5489600:b7ab822e:p1:q1:1', 'moodle:5489600:b7ab822e:p1:q1:2',
    'moodle:5489600:b7ab822e:p1:q1:3', 'moodle:5489600:b7ab822e:p1:q1:4',
    'moodle:5489600:b7ab822e:p3:q4:1', 'moodle:5489600:b7ab822e:p3:q4:2',
    'moodle:5489600:b7ab822e:p3:q4:3', 'moodle:5489600:b7ab822e:p3:q4:4',
    'genki-2e:l1-l17:lesson-4-workbook-2:slot-1', 'genki-2e:l1-l17:lesson-4-workbook-2:slot-6',
] as const;
const POSITIONS = ['うえ', 'した', 'まえ', 'なか'] as const;

export const museumLocationWorkbookPlugin: ActivityPlugin<MuseumLocationWorkbookModel, MuseumLocationResponse> = {
    kind: 'academy-museum-location-workbook',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (model.kind !== this.kind || model.responseKind !== 'position-frame-and-source-transfer') {
            issues.push({ path: 'kind', message: 'Unexpected museum-location workbook contract.' });
        }
        if (model.answerSupport !== ACADEMY_ASSESSED_ANSWER_SUPPORT) {
            issues.push({ path: 'answerSupport', message: 'The assessed answer-support contract is required.' });
        }
        validateProvenance(model, issues);
        if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length < 3) {
            issues.push({ path: 'payload.teaching', message: 'Three source-grounded teaching steps must precede assessment.' });
        }
        const rounds = model.payload?.rounds;
        if (!Array.isArray(rounds) || rounds.length !== EXACT_SOURCE_IDS.length) {
            issues.push({ path: 'payload.rounds', message: 'All ten exact source items are required.' });
        } else {
            rounds.forEach((round, index) => {
                if (round.sourceOrder !== index + 1) issues.push({ path: `payload.rounds.${index}.sourceOrder`, message: 'Source order must be deterministic.' });
                if (round.sourceQuestionId !== EXACT_SOURCE_IDS[index]) issues.push({ path: `payload.rounds.${index}.sourceQuestionId`, message: 'Unexpected source question id.' });
                if (!round.answerExpression || !round.conceptId || !round.errorTag || round.hint.length !== 3) issues.push({ path: `payload.rounds.${index}`, message: 'Every source round needs answer and repair metadata.' });
                if (round.mode === 'frame-choice' && !POSITIONS.includes(round.position)) issues.push({ path: `payload.rounds.${index}.position`, message: 'Position choices must stay within the authorized source set.' });
                if (round.mode === 'typed' && !round.acceptedAnswers.length) issues.push({ path: `payload.rounds.${index}.acceptedAnswers`, message: 'Typed transfer needs accepted source answers.' });
            });
        }
        if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source item must be repaired before passing.' });
        validateFeedback(model.payload?.feedback, issues);
        return issues;
    },
    render(model, host, submit) {
        let disposed = false;
        let assessment: ReturnType<typeof assessmentView> | undefined;
        const showAssessment = (): void => {
            assessment = assessmentView(model, host, async response => {
                if (disposed || !assessment) return;
                setPending(assessment.root, true);
                try {
                    const evaluation = await submit(response);
                    showEvaluation(assessment.feedback, evaluation, host);
                    updateRepair(model, assessment.form, evaluation.result.errorTags, host);
                } finally {
                    if (!disposed && assessment) setPending(assessment.root, false);
                }
            });
            host.replace(assessment.root);
            assessment.form.querySelector<HTMLElement>('select, input')?.focus();
        };
        const teaching = document.createElement('section');
        teaching.className = 'academy-museum-location-workbook academy-museum-location-teaching';
        teaching.dataset.lessonPhase = 'teaching';
        const title = document.createElement('h3');
        title.append(...localizedNodes({ ja: '先に位置の型を読む', en: 'Read the location frames first' }));
        const grid = document.createElement('div');
        grid.className = 'academy-museum-location-teaching-grid';
        model.payload.teaching.forEach(step => grid.append(teachingCard(step)));
        const visuals = sourceVisualGallery(model.provenance.moodle.sourceVisuals, host.language);
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'academy-button academy-button-primary academy-museum-location-start';
        start.textContent = host.language === 'ja' ? '元の問題へ' : 'Start source workbook';
        start.addEventListener('click', showAssessment, { once: true });
        teaching.append(title, grid, visuals, start);
        host.replace(teaching);
        return { focus: () => (assessment?.form ?? start).focus(), dispose: () => { disposed = true; } };
    },
    grade(model, response) {
        const answers = answerMap(response);
        const missed = model.payload.rounds.filter(round => !correct(round, answers.get(round.id)));
        return gradeFromScore((model.payload.rounds.length - missed.length) / model.payload.rounds.length,
            model.payload.passScore, missed.map(round => round.errorTag), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        const rounds = result.outcome === 'pass' ? model.payload.rounds : model.payload.rounds.filter(round => result.errorTags.includes(round.errorTag));
        return rounds.map(round => ({
            id: `review:l1-l17:location:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: { expression: round.answerExpression, meanings: [round.sourcePrompt], sentence: round.answerExpression },
        } satisfies ReviewSeed));
    },
};

function validateProvenance(model: MuseumLocationWorkbookModel, issues: ValidationIssue[]): void {
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l17' || provenance.answerVisibility !== 'after-attempt'
        || provenance.sourceOrder?.join('|') !== 'moodle|minna-mapping|genki') {
        issues.push({ path: 'provenance', message: 'The Moodle-first source sequence is required.' });
    }
    const [topicLocation, position, museumReading] = provenance?.moodle?.documents ?? [];
    if (provenance?.moodle?.moduleId !== 5489600 || provenance.moodle.archiveSha256 !== MOODLE_ARCHIVE_SHA256
        || topicLocation?.payloadSha256 !== MOODLE_TOPIC_LOCATION_SHA256 || position?.payloadSha256 !== MOODLE_POSITION_SHA256
        || museumReading?.payloadSha256 !== MOODLE_MUSEUM_READING_SHA256) {
        issues.push({ path: 'provenance.moodle', message: 'The exact Moodle archive, worksheets, and museum reading hash are required.' });
    }
    validateSourceVisuals(provenance?.moodle?.sourceVisuals, issues);
    if (provenance?.minna?.sourceId !== 'japanese-minna:10-10' || provenance.minna.relation !== 'chronology-map-only'
        || !provenance.minna.reason.includes('No Minna wording or answer')) {
        issues.push({ path: 'provenance.minna', message: 'Minna must remain an honest chronology-only mapping.' });
    }
    if (provenance?.genki?.taskId !== 'genki-2e:l1-l17:lesson-4-workbook-2'
        || provenance.genki.payloadSha256 !== GENKI_SHA256 || provenance.genki.scriptSha256 !== GENKI_SCRIPT_SHA256
        || provenance.genki.lineLocus.start !== 76 || provenance.genki.lineLocus.end !== 153
        || provenance.genki.engine !== 'Genki.generateQuiz' || provenance.genki.sourceSlice?.join('|') !== '1|6') {
        issues.push({ path: 'provenance.genki', message: 'The exact mapped Genki transfer task is required.' });
    }
}

function validateSourceVisuals(visuals: readonly MuseumLocationSourceVisual[] | undefined, issues: ValidationIssue[]): void {
    const expected = [
        {
            id: 'position-picture-strip', role: 'prompt-image', payloadSha256: MOODLE_POSITION_SHA256, page: 1,
            member: 'Handouts/New Chapter 10-2_positionに あります_いますGrammar Exercise.pdf', filename: 'moodle-position-picture-strip.png',
            sourceQuestionIds: EXACT_SOURCE_IDS.slice(0, 4), crop: [310, 880, 780, 210],
        },
        {
            id: 'position-room-garden', role: 'prompt-image', payloadSha256: MOODLE_POSITION_SHA256, page: 3,
            member: 'Handouts/New Chapter 10-2_positionに あります_いますGrammar Exercise.pdf', filename: 'moodle-position-room-garden.png',
            sourceQuestionIds: EXACT_SOURCE_IDS.slice(4, 8), crop: [150, 373, 815, 430],
        },
        {
            id: 'museum-object-panels', role: 'museum-context', payloadSha256: MOODLE_MUSEUM_READING_SHA256, page: 2,
            member: 'Homework/HW Chapter 10 Reading practice「美術館」.pdf', filename: 'moodle-museum-object-panels.png',
            sourceQuestionIds: [], crop: [120, 920, 950, 270],
        },
    ] as const;
    if (!Array.isArray(visuals) || visuals.length !== expected.length) {
        issues.push({ path: 'provenance.moodle.sourceVisuals', message: 'Three byte-pinned Moodle visual crops are required.' });
        return;
    }
    visuals.forEach((visual, index) => {
        const expectedVisual = expected[index];
        const crop = visual.source.crop;
        if (visual.id !== expectedVisual.id || visual.role !== expectedVisual.role || visual.source.payloadSha256 !== expectedVisual.payloadSha256
            || visual.source.member !== expectedVisual.member || visual.source.page !== expectedVisual.page
            || visual.sourceQuestionIds.join('|') !== expectedVisual.sourceQuestionIds.join('|')
            || visual.url !== `/academy/content/lessons/l1-l17/${expectedVisual.filename}`
            || [crop.x, crop.y, crop.width, crop.height].join('|') !== expectedVisual.crop.join('|') || crop.rasterDpi !== 144
            || !/^[a-f0-9]{64}$/u.test(visual.sha256) || visual.answerKeyVisible !== false
            || !visual.alt.en || !visual.alt.ja || !visual.caption.en || !visual.caption.ja) {
            issues.push({ path: `provenance.moodle.sourceVisuals.${index}`, message: 'Each source crop must be byte-pinned, answer-key-free, and captioned.' });
        }
    });
}

function assessmentView(model: MuseumLocationWorkbookModel, host: ActivityHost, onSubmit: (response: MuseumLocationResponse) => Promise<void>) {
    const root = document.createElement('section');
    root.className = 'academy-museum-location-workbook academy-museum-location-assessment';
    root.dataset.lessonPhase = 'assessment';
    const form = document.createElement('form');
    const rounds = document.createElement('div');
    rounds.className = 'academy-museum-location-rounds';
    model.payload.rounds.forEach(round => rounds.append(roundView(round, host)));
    const submit = document.createElement('button');
    submit.type = 'submit'; submit.className = 'academy-button academy-button-primary';
    submit.textContent = host.language === 'ja' ? '答えを確認する' : 'Check answers';
    const feedback = statusRegion('academy-museum-location-feedback');
    form.addEventListener('submit', event => { event.preventDefault(); void onSubmit(responseFrom(form, model.payload.rounds)); });
    form.append(rounds, submit, feedback); root.append(form);
    return { root, form, feedback };
}

function roundView(round: MuseumLocationRound, host: ActivityHost): HTMLElement {
    const card = document.createElement('fieldset');
    card.className = `academy-museum-location-round academy-museum-location-round-${round.mode}`;
    card.dataset.roundId = round.id;
    const legend = document.createElement('legend'); legend.textContent = `${round.sourceOrder}. ${round.sourceLabel}`;
    const prompt = document.createElement('p'); prompt.className = 'academy-museum-location-prompt'; prompt.append(assessedJapanese(round.sourcePrompt));
    card.append(legend, prompt);
    if (round.mode === 'frame-choice') {
        card.append(selectFor(`${round.id}-position`, host.language === 'ja' ? '位置' : 'Position', [
            ['', host.language === 'ja' ? '選んでください' : 'Choose'], ...POSITIONS.map(position => [position, position] as const),
        ]));
        card.append(selectFor(`${round.id}-verb`, host.language === 'ja' ? '文の最後' : 'Sentence ending', [
            ['', host.language === 'ja' ? '選んでください' : 'Choose'], ['あります', 'あります'], ['います', 'います'],
        ]));
    } else if (round.mode === 'reply-choice') {
        const label = document.createElement('label'); label.htmlFor = `${round.id}-value`; label.textContent = host.language === 'ja' ? '答え' : 'Answer';
        const select = document.createElement('select'); select.id = `${round.id}-value`; select.name = `${round.id}-value`; select.required = true;
        [['', host.language === 'ja' ? '選んでください' : 'Choose'], ...replyChoices()].forEach(([value, text]) => {
            const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
        });
        label.append(select); card.append(label);
    } else {
        const label = document.createElement('label'); label.htmlFor = `${round.id}-value`; label.textContent = host.language === 'ja' ? '日本語で入力' : 'Type in Japanese';
        const input = document.createElement('input'); input.id = `${round.id}-value`; input.name = `${round.id}-value`; input.autocomplete = 'off'; input.lang = 'ja'; input.required = true;
        label.append(input); card.append(label);
    }
    return card;
}

function selectFor(name: string, labelText: string, options: readonly (readonly [string, string])[]): HTMLLabelElement {
    const label = document.createElement('label'); label.htmlFor = name; label.textContent = labelText;
    const select = document.createElement('select'); select.id = name; select.name = name; select.required = true;
    options.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
    label.append(select); return label;
}

function replyChoices(): readonly (readonly [string, string])[] {
    const answers = ['くつが あります。', 'おんなのこが います。', 'ほんだなが あります。', 'おとこのひとが います。'];
    return answers.map(value => [value, value] as const);
}

function responseFrom(form: HTMLFormElement, rounds: readonly MuseumLocationRound[]): MuseumLocationResponse {
    return {
        answers: rounds.map(round => round.mode === 'frame-choice'
            ? { mode: 'frame-choice' as const, roundId: round.id, position: controlValue(form, `${round.id}-position`) as MuseumLocationFrameRound['position'], verb: controlValue(form, `${round.id}-verb`) as MuseumLocationFrameRound['verb'] }
            : { mode: round.mode, roundId: round.id, value: controlValue(form, `${round.id}-value`) }),
    };
}

function controlValue(form: HTMLFormElement, name: string): string {
    const control = form.elements.namedItem(name);
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? control.value : '';
}

function answerMap(response: MuseumLocationResponse): ReadonlyMap<string, MuseumLocationAnswer> {
    return new Map((response?.answers ?? []).map(answer => [answer.roundId, answer]));
}

function correct(round: MuseumLocationRound, answer: MuseumLocationAnswer | undefined): boolean {
    if (!answer || answer.mode !== round.mode) return false;
    if (round.mode === 'frame-choice' && answer.mode === 'frame-choice') return answer.position === round.position && answer.verb === round.verb;
    if (round.mode === 'reply-choice' && answer.mode === 'reply-choice') return normalizeJapanese(answer.value) === normalizeJapanese(round.answerExpression);
    return round.mode === 'typed' && answer.mode === 'typed' && round.acceptedAnswers.some(value => normalizeJapanese(value) === normalizeJapanese(answer.value));
}

function updateRepair(model: MuseumLocationWorkbookModel, form: HTMLFormElement, errorTags: readonly string[], host: ActivityHost): void {
    model.payload.rounds.forEach(round => {
        const card = form.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
        card.hidden = !errorTags.includes(round.errorTag);
        if (!card.hidden) addHint(card, round, model.id, host);
    });
}

function addHint(card: HTMLElement, round: MuseumLocationRound, activityId: string, host: ActivityHost): void {
    if (card.querySelector('.academy-museum-location-hint-button')) return;
    let hintIndex = 0;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-button academy-museum-location-hint-button'; button.textContent = host.language === 'ja' ? 'ヒント' : 'Hint';
    const panel = document.createElement('p'); panel.className = 'academy-museum-location-hint-panel'; panel.hidden = true;
    button.addEventListener('click', () => {
        hintIndex = Math.min(hintIndex + 1, round.hint.length); panel.hidden = false; panel.dataset.hintIndex = String(hintIndex);
        panel.textContent = round.hint[hintIndex - 1]?.[host.language === 'ja' ? 'ja' : 'en'] ?? '';
        void host.recordSupportUse?.({ activityId, supportKind: 'hint', choiceId: round.id });
    });
    card.append(button, panel);
}

function teachingCard(step: MuseumLocationTeachingStep): HTMLElement {
    const card = document.createElement('article'); card.className = 'academy-museum-location-teaching-card';
    const source = document.createElement('p'); source.className = 'academy-museum-location-source'; source.textContent = step.sourceLabel;
    const pattern = document.createElement('strong'); pattern.textContent = step.pattern;
    const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
    const example = document.createElement('p'); example.className = 'academy-museum-location-example'; example.append(assessedJapanese(step.example));
    card.append(source, pattern, explanation, example);
    return card;
}

function sourceVisualGallery(visuals: readonly MuseumLocationSourceVisual[], language: 'en' | 'ja' | undefined): HTMLElement {
    const gallery = document.createElement('div');
    gallery.className = 'academy-museum-location-source-visuals';
    gallery.dataset.answerKeyVisible = 'false';
    visuals.forEach(visual => {
        const figure = document.createElement('figure'); figure.className = `academy-museum-location-source-visual academy-museum-location-source-visual-${visual.role}`;
        const image = document.createElement('img'); image.src = visual.url; image.alt = visual.alt[language ?? 'en']; image.loading = 'lazy'; image.decoding = 'async';
        const caption = document.createElement('figcaption'); caption.append(...localizedNodes(visual.caption));
        figure.append(image, caption); gallery.append(figure);
    });
    return gallery;
}
