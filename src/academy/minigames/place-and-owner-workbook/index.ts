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
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export type PlacePositionId = 'speaker' | 'listener' | 'far';
export type OwnerPointer = 'これ' | 'あれ';
export type OwnerItem = 'ぼうし' | 'さいふ' | 'かさ';

export interface PlaceOwnerTeachingStep {
    readonly sourceOrder: number;
    readonly pattern: string;
    readonly rule: LocalizedText;
    readonly example: string;
    readonly source: 'moodle-place-rule' | 'moodle-location-question' | 'minna-sequence' | 'genki-owner-task';
}

interface SourceRound {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourcePrompt: string;
    readonly context: LocalizedText;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface PlaceLocationRound extends SourceRound {
    readonly mode: 'location-choice';
    readonly correctPositionId: PlacePositionId;
    readonly answerSentence: string;
}

export interface PlaceOwnershipRound extends SourceRound {
    readonly mode: 'owner-phrase';
    readonly correctPointer: OwnerPointer;
    readonly correctItem: OwnerItem;
    readonly sourceReply: string;
}

export type PlaceOwnerRound = PlaceLocationRound | PlaceOwnershipRound;

export type PlaceOwnerAnswer =
    | Readonly<{ kind: 'location'; roundId: string; positionId: PlacePositionId }>
    | Readonly<{ kind: 'owner'; roundId: string; pointer: OwnerPointer; item: OwnerItem }>;

export interface PlaceOwnerWorkbookResponse {
    readonly answers: readonly PlaceOwnerAnswer[];
}

interface ByteSource {
    readonly sourceId: string;
    readonly payloadSha256: string;
}

export interface PlaceOwnerWorkbookModel extends ActivityModel {
    readonly kind: 'academy-place-and-owner-workbook';
    readonly responseKind: 'mixed-place-owner-workbook';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l06';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5860335;
            readonly grammar: ByteSource & {
                readonly sourceTitle: string;
                readonly member: string;
                readonly author: string;
                readonly pages: readonly number[];
            };
            readonly audioMembers: readonly (ByteSource & {
                readonly title: string;
                readonly member: string;
                readonly durationSeconds: number;
            })[];
            readonly transcriptStatus: 'not-provided-do-not-invent';
        };
        readonly minna: {
            readonly reference: string;
            readonly relation: 'course-sequence-and-byte-identified-primary-sources';
            readonly textbook: ByteSource & {
                readonly title: string;
                readonly author: string;
                readonly pageCount: 326;
                readonly locusStatus: 'scanned-pdf-no-text-locus-do-not-invent';
            };
            readonly conversation: ByteSource & {
                readonly title: string;
                readonly relativePath: string;
                readonly durationSeconds: 67.413333;
            };
            readonly transcriptStatus: 'not-provided-do-not-invent';
        };
        readonly genki: {
            readonly sourceId: string;
            readonly taskId: string;
            readonly relativePath: string;
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 152 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceType: 'fill';
            readonly responseAdaptation: string;
        };
    };
    readonly payload: {
        readonly teaching: readonly PlaceOwnerTeachingStep[];
        readonly positions: readonly Readonly<{ id: PlacePositionId; label: LocalizedText }>[];
        readonly ownerPointers: readonly OwnerPointer[];
        readonly ownerItems: readonly OwnerItem[];
        readonly rounds: readonly PlaceOwnerRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const POSITIONS: readonly PlacePositionId[] = ['speaker', 'listener', 'far'];
const POINTERS: readonly OwnerPointer[] = ['これ', 'あれ'];
const ITEMS: readonly OwnerItem[] = ['ぼうし', 'さいふ', 'かさ'];
const ROUND_SHAPE = [
    ['takeshi-place', 'location-choice', 'far'],
    ['sue-place', 'location-choice', 'listener'],
    ['robert-place', 'location-choice', 'speaker'],
    ['toilet-place', 'location-choice', 'far'],
    ['hat-owner', 'owner-phrase', 'これ', 'ぼうし'],
    ['wallet-owner', 'owner-phrase', 'これ', 'さいふ'],
    ['umbrella-owner', 'owner-phrase', 'あれ', 'かさ'],
] as const;
const EXACT_PROMPTS = [
    'A：たけしさんはどこですか。',
    'A：スーさんはどこですか。',
    'A：ロバートさんはどこですか。',
    'A：トイレはどこですか。',
    'ぼうし — in your hand',
    'さいふ — in your hand',
    'かさ — far from both',
] as const;
const EXACT_ACCEPTED_ANSWERS = [
    ['あそこです', 'たけしさんはあそこです'],
    ['そこです', 'スーさんはそこです'],
    ['ここです', 'ロバートさんはここです'],
    ['あそこです', 'トイレはあそこです'],
    ['これはだれのぼうしですか', 'これはだれの帽子ですか', 'これは誰の帽子ですか', 'これは誰のぼうしですか'],
    ['これはだれのさいふですか', 'これはだれの財布ですか', 'これは誰の財布ですか', 'これは誰のさいふですか'],
    ['あれはだれのかさですか', 'あれはだれの傘ですか', 'あれは誰の傘ですか', 'あれは誰のかさですか'],
] as const;
const EXACT_OWNER_REPLIES = [
    'それはたけしさんのぼうしです',
    'それはわたしのさいふです',
    'あれはメアリーさんのかさです',
] as const;

export const placeOwnerWorkbookPlugin: ActivityPlugin<PlaceOwnerWorkbookModel, PlaceOwnerWorkbookResponse> = {
    kind: 'academy-place-and-owner-workbook',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        let correct = 0;
        const errorTags: string[] = [];
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id);
            const passed = round.mode === 'location-choice'
                ? answer?.kind === 'location' && answer.positionId === round.correctPositionId
                : answer?.kind === 'owner' && answer.pointer === round.correctPointer && answer.item === round.correctItem;
            if (passed) correct += 1;
            else errorTags.push(round.errorTag);
        }
        return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errorTags.sort(), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)) return [];
            return [reviewSeed(round, result)];
        });
    },
};

function validate(model: PlaceOwnerWorkbookModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The workbook requires assessed answer support.' });
    }
    validateProvenance(model.provenance, issues);
    validateTeaching(model.payload?.teaching, issues);
    if (model.payload?.positions?.map(position => position.id).join(',') !== POSITIONS.join(',')) {
        issues.push({ path: 'payload.positions', message: 'The three source positions must remain in order.' });
    }
    if (model.payload?.ownerPointers?.join(',') !== POINTERS.join(',')
        || model.payload?.ownerItems?.join(',') !== ITEMS.join(',')) {
        issues.push({ path: 'payload.ownerOptions', message: 'Owner phrase menus must preserve the source option sets.' });
    }
    validateRounds(model, issues);
    if (model.payload?.passScore !== 1) {
        issues.push({ path: 'payload.passScore', message: 'Every exact Genki source slot is required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateProvenance(value: PlaceOwnerWorkbookModel['provenance'] | undefined, issues: ValidationIssue[]): void {
    const grammarDigest = '45db157c1c0c5bdfa5012f238189bdd2f85da3a098acb2d95b2321511fcf573b';
    const grammar = value?.moodle?.grammar;
    const audio = value?.moodle?.audioMembers;
    if (value?.packageId !== 'l1-l06' || value.answerVisibility !== 'after-attempt'
        || value.moodle?.moduleId !== 5860335
        || grammar?.sourceId !== `moodle-payload:${grammarDigest}` || grammar?.payloadSha256 !== grammarDigest
        || grammar?.sourceTitle !== 'Chapter 3-1 Grammar Exercise'
        || grammar?.member !== 'Handouts/Chapter 3-1_Grammar Exercise.pdf'
        || grammar?.author !== 'Rie Tsuruta-Barratt' || grammar?.pages?.join(',') !== '1,2,3,4,5,6'
        || value.moodle?.transcriptStatus !== 'not-provided-do-not-invent') {
        issues.push({ path: 'provenance.moodle', message: 'Exact Lesson 6 Moodle grammar provenance is required.' });
    }
    const audioExpected = [
        ['9 A-9', '0449362eb519969bbf72ac6d059e1c3ef344c559b905d1fccfcdf4efe2390460', 'audio materials/9 A-9.mp3', 78.013333],
        ['10 A-10', 'b19723f688559100d53e2ad71e277bedbea949253c6fc67195f33737fc057d20', 'audio materials/10 A-10.mp3', 58.946667],
    ] as const;
    if (!Array.isArray(audio) || audio.length !== 2 || audio.some((member, index) => {
        const expected = audioExpected[index];
        return member.title !== expected[0] || member.sourceId !== `moodle-payload:${expected[1]}`
            || member.payloadSha256 !== expected[1] || member.member !== expected[2] || member.durationSeconds !== expected[3];
    })) issues.push({ path: 'provenance.moodle.audioMembers', message: 'Both byte-identified Moodle audio anchors are required.' });

    const textbookDigest = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
    const videoDigest = '7d0e2b3e0f7b66c44719b2a1dedc0f85ea19d8c3edcd6a5b4565f50d3c253460';
    const minna = value?.minna;
    if (minna?.reference !== 'Minna no Nihongo I, Lesson 3'
        || minna?.relation !== 'course-sequence-and-byte-identified-primary-sources'
        || minna?.textbook?.sourceId !== `japanese-minna-pdf:${textbookDigest}`
        || minna?.textbook?.payloadSha256 !== textbookDigest
        || minna?.textbook?.title !== 'Minna no Nihongo 2nd Edition Shokyu I'
        || minna?.textbook?.author !== '3A Network' || minna?.textbook?.pageCount !== 326
        || minna?.textbook?.locusStatus !== 'scanned-pdf-no-text-locus-do-not-invent'
        || minna?.conversation?.sourceId !== `japanese-minna-video:${videoDigest}`
        || minna?.conversation?.payloadSha256 !== videoDigest
        || minna?.conversation?.title !== 'Minna no Nihongo Shokyu I Dai 2-Han Kaiwa 03'
        || minna?.conversation?.relativePath !== 'Minna no Nihongo Shokyu DVD I, II/Minna no Nihongo Shokyu I Dai 2-Han Kaiwa/03.mp4'
        || minna?.conversation?.durationSeconds !== 67.413333
        || minna?.transcriptStatus !== 'not-provided-do-not-invent') {
        issues.push({ path: 'provenance.minna', message: 'Exact Minna Lesson 3 source identities are required without an invented locus or transcript.' });
    }

    const genkiDigest = 'e54d3ea575725cfb771f9d9ed2d6b819c7edaa8850c8af1cdd793613012a7d99';
    const genki = value?.genki;
    if (genki?.sourceId !== `japanese-genki-interactive:${genkiDigest}:generateQuiz`
        || genki?.taskId !== 'genki-2e:l1-l06:lesson-2-workbook-4'
        || genki?.relativePath !== 'lessons/lesson-2/workbook-4/index.html'
        || genki?.payloadSha256 !== genkiDigest
        || genki?.scriptSha256 !== 'e4d41714713102b1c1fe093588c397950fcadeaf1808d679f7bc93a1d56430d3'
        || genki?.lineLocus?.start !== 76 || genki?.lineLocus?.end !== 152
        || genki?.engine !== 'Genki.generateQuiz' || genki?.sourceType !== 'fill'
        || !genki?.responseAdaptation.includes('exact-prompts-answer-variants-and-order')) {
        issues.push({ path: 'provenance.genki', message: 'The exact mapped Genki workbook task and mixed adaptation are required.' });
    }
}

function validateTeaching(steps: readonly PlaceOwnerTeachingStep[] | undefined, issues: ValidationIssue[]): void {
    const expected = [
        ['ここ・そこ・あそこ', 'moodle-place-rule'],
        ['Noun は どこですか', 'moodle-location-question'],
        ['Lesson 3 place sequence', 'minna-sequence'],
        ['これは／あれは だれの Noun ですか', 'genki-owner-task'],
    ] as const;
    if (!Array.isArray(steps) || steps.length !== expected.length) {
        issues.push({ path: 'payload.teaching', message: 'Source teaching must precede both activity modes.' });
        return;
    }
    steps.forEach((step, index) => {
        if (step.sourceOrder !== index + 1 || step.pattern !== expected[index][0] || step.source !== expected[index][1]
            || !text(step.rule?.ja) || !text(step.rule?.en) || !text(step.example)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching order, source role, and worked example are required.' });
        }
    });
}

function validateRounds(model: PlaceOwnerWorkbookModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== ROUND_SHAPE.length) {
        issues.push({ path: 'payload.rounds', message: 'The exact seven Genki source slots are required.' });
        return;
    }
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    const errors = new Set<string>();
    rounds.forEach((round, index) => {
        const expected = ROUND_SHAPE[index];
        const shapeMatches = round.id === expected[0] && round.mode === expected[1]
            && (round.mode === 'location-choice'
                ? round.correctPositionId === expected[2]
                : round.correctPointer === expected[2] && round.correctItem === expected[3]);
        const exactAnswerMatches = round.acceptedAnswers?.join('\u0000') === EXACT_ACCEPTED_ANSWERS[index].join('\u0000');
        const exactModePayloadMatches = round.mode === 'location-choice'
            ? round.answerSentence === EXACT_ACCEPTED_ANSWERS[index][0]
            : round.sourceReply === EXACT_OWNER_REPLIES[index - 4];
        if (!shapeMatches || ids.has(round.id) || round.sourceOrder !== index + 1
            || round.sourcePrompt !== EXACT_PROMPTS[index] || !text(round.context?.en) || !text(round.context?.ja)
            || !exactAnswerMatches || !exactModePayloadMatches
            || !model.conceptIds.includes(round.conceptId)) {
            issues.push({ path: `payload.rounds.${index}`, message: 'Each source slot needs its exact mode, answer, order, context, and Concept.' });
        }
        ids.add(round.id);
        const sourceId = `genki-2e:l1-l06:lesson-2-workbook-4:slot-${index + 1}`;
        if (round.sourceQuestionId !== sourceId || sourceIds.has(round.sourceQuestionId)) {
            issues.push({ path: `payload.rounds.${index}.sourceQuestionId`, message: 'Source slot ids must be exact and unique.' });
        }
        sourceIds.add(round.sourceQuestionId);
        if (!text(round.errorTag) || errors.has(round.errorTag)) {
            issues.push({ path: `payload.rounds.${index}.errorTag`, message: 'Error tags must be unique.' });
        }
        errors.add(round.errorTag);
    });
}

function render(
    model: PlaceOwnerWorkbookModel,
    host: ActivityHost,
    submit: (response: PlaceOwnerWorkbookResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-place-owner-workbook';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'academy-button academy-button-primary academy-place-owner-start';
    start.textContent = host.language === 'ja' ? '七つの問題を始める' : 'Start the seven source problems';
    const status = statusRegion('academy-kit-feedback academy-place-owner-feedback');
    root.append(heading, teaching, start, status);
    host.replace(root);

    let form: HTMLFormElement | undefined;
    start.addEventListener('click', () => {
        form = renderAssessment(model, host, submit, root, status);
        start.remove();
        root.insertBefore(form, status);
        form.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus();
    }, { once: true, signal: lifecycle.signal });
    return {
        focus() { (form?.querySelector<HTMLElement>('input, select') ?? start).focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: PlaceOwnerWorkbookModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-place-owner-teaching';
    section.dataset.lessonPhase = 'teaching';
    for (const step of model.payload.teaching) {
        const article = document.createElement('article');
        article.className = 'academy-place-owner-teaching-step';
        const heading = document.createElement('h3');
        heading.append(assessedJapanese(step.pattern));
        const rule = document.createElement('p');
        rule.append(...localizedNodes(step.rule));
        const example = document.createElement('p');
        example.className = 'academy-place-owner-example';
        example.append(assessedJapanese(step.example));
        article.append(heading, rule, example);
        section.append(article);
    }
    return section;
}

function renderAssessment(
    model: PlaceOwnerWorkbookModel,
    host: ActivityHost,
    submit: (response: PlaceOwnerWorkbookResponse) => Promise<ActivityEvaluation>,
    root: HTMLElement,
    status: HTMLElement,
): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'academy-place-owner-form';
    form.dataset.lessonPhase = 'assessment';
    form.setAttribute('aria-labelledby', `${model.id}-prompt`);
    for (const round of model.payload.rounds) {
        form.append(round.mode === 'location-choice' ? renderLocation(model, round) : renderOwner(model, round));
    }
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-place-owner-check';
    check.textContent = host.language === 'ja' ? '七つの答えを確認する' : 'Check all seven answers';
    form.append(check);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '七つの問題すべてに答えてください。' : 'Answer all seven source problems.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    });
    return form;
}

function roundShell(model: PlaceOwnerWorkbookModel, round: PlaceOwnerRound): [HTMLFieldSetElement, HTMLDivElement] {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `academy-place-owner-round academy-place-owner-round-${round.mode}`;
    fieldset.dataset.roundId = round.id;
    const legend = document.createElement('legend');
    legend.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
    const context = document.createElement('div');
    context.id = `${model.id}-${round.id}-context`;
    context.className = 'academy-place-owner-context';
    context.append(...localizedNodes(round.context));
    fieldset.setAttribute('aria-describedby', context.id);
    fieldset.append(legend, context);
    return [fieldset, context];
}

function renderLocation(model: PlaceOwnerWorkbookModel, round: PlaceLocationRound): HTMLFieldSetElement {
    const [fieldset] = roundShell(model, round);
    const choices = document.createElement('div');
    choices.className = 'academy-place-owner-location-choices';
    for (const position of model.payload.positions) {
        const label = document.createElement('label');
        label.className = 'academy-place-owner-location-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.required = true;
        input.name = `${model.id}-${round.id}-position`;
        input.value = position.id;
        label.append(input, ...localizedNodes(position.label));
        choices.append(label);
    }
    fieldset.append(choices);
    return fieldset;
}

function renderOwner(model: PlaceOwnerWorkbookModel, round: PlaceOwnershipRound): HTMLFieldSetElement {
    const [fieldset] = roundShell(model, round);
    const builder = document.createElement('div');
    builder.className = 'academy-place-owner-phrase-builder';
    builder.append(selectControl(
        `${model.id}-${round.id}-pointer`,
        'Pointing word / しじご',
        model.payload.ownerPointers,
    ));
    builder.append(assessedJapanese('は だれの'));
    builder.append(selectControl(
        `${model.id}-${round.id}-item`,
        'Item / もの',
        model.payload.ownerItems,
    ));
    builder.append(assessedJapanese('ですか。'));
    fieldset.append(builder);
    return fieldset;
}

function selectControl(name: string, accessibleName: string, options: readonly string[]): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'academy-place-owner-select';
    const visuallyHidden = document.createElement('span');
    visuallyHidden.className = 'academy-visually-hidden';
    visuallyHidden.textContent = accessibleName;
    const select = document.createElement('select');
    select.name = name;
    select.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    select.append(placeholder);
    for (const option of options) {
        const element = document.createElement('option');
        element.value = option;
        element.textContent = option;
        select.append(element);
    }
    label.append(visuallyHidden, select);
    return label;
}

function responseFromForm(model: PlaceOwnerWorkbookModel, form: HTMLFormElement): PlaceOwnerWorkbookResponse | null {
    const data = new FormData(form);
    const answers: PlaceOwnerAnswer[] = [];
    for (const round of model.payload.rounds) {
        if (round.mode === 'location-choice') {
            const positionId = data.get(`${model.id}-${round.id}-position`);
            if (positionId !== 'speaker' && positionId !== 'listener' && positionId !== 'far') return null;
            answers.push({ kind: 'location', roundId: round.id, positionId });
        } else {
            const pointer = data.get(`${model.id}-${round.id}-pointer`);
            const item = data.get(`${model.id}-${round.id}-item`);
            if ((pointer !== 'これ' && pointer !== 'あれ') || (item !== 'ぼうし' && item !== 'さいふ' && item !== 'かさ')) return null;
            answers.push({ kind: 'owner', roundId: round.id, pointer, item });
        }
    }
    return { answers };
}

function parseResponse(model: PlaceOwnerWorkbookModel, response: PlaceOwnerWorkbookResponse): ReadonlyMap<string, PlaceOwnerAnswer> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Genki source slot needs one answer.');
    }
    const answers = new Map<string, PlaceOwnerAnswer>();
    for (const answer of response.answers) {
        const round = model.payload.rounds.find(candidate => candidate.id === answer.roundId);
        if (!round || answers.has(answer.roundId)) throw new TypeError('Answers must use each exact source slot once.');
        if (round.mode === 'location-choice') {
            if (answer.kind !== 'location' || !POSITIONS.includes(answer.positionId)) {
                throw new TypeError('Location slots require one offered place position.');
            }
        } else if (answer.kind !== 'owner' || !POINTERS.includes(answer.pointer) || !ITEMS.includes(answer.item)) {
            throw new TypeError('Owner slots require one offered pointer and item.');
        }
        answers.set(answer.roundId, answer);
    }
    return answers;
}

function reviewSeed(round: PlaceOwnerRound, result: GradeResult): ReviewSeed {
    const expression = round.mode === 'location-choice'
        ? round.answerSentence
        : `${round.correctPointer}はだれの${round.correctItem}ですか`;
    return {
        id: `review:l1-l06:place-owner:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: {
            expression,
            meanings: [round.context.en],
            sentence: round.mode === 'location-choice' ? round.sourcePrompt : round.sourceReply,
        },
    };
}
