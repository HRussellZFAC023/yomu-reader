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

export interface PossessionPhraseTeachingStep {
    readonly sourceOrder: number;
    readonly pattern: string;
    readonly rule: LocalizedText;
    readonly example: string;
    readonly source: 'moodle-content-rule' | 'moodle-owner-rule' | 'genki-order-warning';
}

export interface PossessionPhraseRound {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourcePrompt: string;
    readonly correctA: string;
    readonly correctB: string;
    readonly acceptedAnswers: readonly string[];
    readonly meaning: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface PossessionPhraseBuilderResponse {
    readonly phrases: readonly Readonly<{ roundId: string; a: string; b: string }>[];
}

interface MoodleRuleSource {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly sourceTitle: string;
    readonly member: string;
    readonly author: string;
    readonly pages: readonly [1, 2];
}

interface MinnaAudioSource {
    readonly title: string;
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly archiveOrder: 13 | 14;
    readonly durationSeconds: number;
}

export interface PossessionPhraseBuilderModel extends ActivityModel {
    readonly kind: 'academy-possession-phrase-builder';
    readonly responseKind: 'two-part-no-phrase-builder';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l05';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5834212;
            readonly contentRule: MoodleRuleSource;
            readonly ownerRule: MoodleRuleSource;
        };
        readonly minna: {
            readonly reference: string;
            readonly relation: 'course-sequence-and-byte-identified-audio-only';
            readonly audioMembers: readonly [MinnaAudioSource, MinnaAudioSource];
            readonly transcriptStatus: 'not-provided-do-not-invent';
        };
        readonly genki: {
            readonly sourceId: string;
            readonly taskId: string;
            readonly relativePath: string;
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 107 };
            readonly engine: 'Genki.generateQuiz';
            readonly sourceType: 'fill';
            readonly responseAdaptation: string;
        };
    };
    readonly payload: {
        readonly teaching: readonly PossessionPhraseTeachingStep[];
        readonly aOptions: readonly string[];
        readonly bOptions: readonly string[];
        readonly rounds: readonly PossessionPhraseRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const EXACT_A_OPTIONS = ['にほんじん', 'たけしさん', 'わたし', 'えいご', 'みちこさん'] as const;
const EXACT_B_OPTIONS = ['がくせい', 'でんわばんごう', 'ともだち', 'せんせい', 'せんこう'] as const;
const EXACT_ROUNDS = [
    {
        id: 'japanese-student', prompt: 'Japanese student', a: 'にほんじん', b: 'がくせい',
        answers: ['にほんじんのがくせい', '日本人の学生', '日本人のがくせい', 'にほんじんの学生'],
    },
    {
        id: 'takeshi-phone', prompt: "Takeshi's telephone number", a: 'たけしさん', b: 'でんわばんごう',
        answers: ['たけしさんのでんわばんごう', 'たけしさんの電話番号'],
    },
    {
        id: 'my-friend', prompt: 'My friend', a: 'わたし', b: 'ともだち',
        answers: [
            'わたしのともだち', '私の友だち', '私の友達', '私のとも達', '私のともだち',
            'わたしの友達', 'わたしの友だち', 'わたしのとも達',
        ],
    },
    {
        id: 'english-teacher', prompt: 'English-language teacher', a: 'えいご', b: 'せんせい',
        answers: ['えいごのせんせい', '英語の先生', '英語のせんせい', 'えいごの先生'],
    },
    {
        id: 'michiko-major', prompt: "Michiko's major", a: 'みちこさん', b: 'せんこう',
        answers: ['みちこさんのせんこう', 'みちこさんの専攻'],
    },
] as const;

export const possessionPhraseBuilderPlugin: ActivityPlugin<
    PossessionPhraseBuilderModel,
    PossessionPhraseBuilderResponse
> = {
    kind: 'academy-possession-phrase-builder',
    validate,
    render,
    grade(model, response) {
        const phrases = parseResponse(model, response);
        let correct = 0;
        const errorTags: string[] = [];
        model.payload.rounds.forEach(round => {
            const phrase = phrases.get(round.id);
            if (phrase?.a === round.correctA && phrase.b === round.correctB) correct += 1;
            else errorTags.push(round.errorTag);
        });
        return gradeFromScore(
            correct / model.payload.rounds.length,
            model.payload.passScore,
            errorTags.sort(),
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)) return [];
            return [reviewSeed(round, result)];
        });
    },
};

function validate(model: PossessionPhraseBuilderModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The phrase builder requires assessed answer support.' });
    }
    validateProvenance(model.provenance, issues);
    validateTeaching(model.payload?.teaching, issues);
    if (model.payload?.aOptions?.join('\u0000') !== EXACT_A_OPTIONS.join('\u0000')) {
        issues.push({ path: 'payload.aOptions', message: 'The five A options must remain in exact source order.' });
    }
    if (model.payload?.bOptions?.join('\u0000') !== EXACT_B_OPTIONS.join('\u0000')) {
        issues.push({ path: 'payload.bOptions', message: 'The five B options must remain in exact source order.' });
    }
    validateRounds(model, issues);
    if (model.payload?.passScore !== 1) {
        issues.push({ path: 'payload.passScore', message: 'Every exact Genki source phrase is required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateProvenance(
    value: PossessionPhraseBuilderModel['provenance'] | undefined,
    issues: ValidationIssue[],
): void {
    if (value?.packageId !== 'l1-l05' || value?.answerVisibility !== 'after-attempt'
        || value?.moodle?.moduleId !== 5834212) {
        issues.push({ path: 'provenance.moodle', message: 'Exact Lesson 5 Moodle package provenance is required.' });
    }
    validateMoodleRule(value?.moodle?.contentRule, {
        payload: '3215f31fc58ce0ff7310ee16098e1fb0149f6c09a6fc972415150fc146934915',
        title: 'Chapter 2-2 Grammar Exercise-1 What the object is about',
        member: 'handouts/Chapter 2-2 Grammar Exercise-1_What the object is about.pdf',
    }, 'provenance.moodle.contentRule', issues);
    validateMoodleRule(value?.moodle?.ownerRule, {
        payload: '7d71238e487d8c77d5f618e8529921533ceaea2497e8edd3cc9490220f0ed56f',
        title: 'Chapter 2-2 Grammar Exercise-2 Whose belongings the object is',
        member: 'handouts/Chapter 2-2 Grammar Exercise-2_Whose belongings the object is.pdf',
    }, 'provenance.moodle.ownerRule', issues);

    const minna = value?.minna;
    const minnaExpected = [
        ['minna shokyu 1 007', 'bd797762c73da698d89151f48e3823aea7845064378d0d534f6bbce1af6ba570', 13, 36.257958],
        ['minna shokyu 1 008', 'e71fa2268bce1d88bbe84e7c7dbf5febe663cf7406180afda6ceb6960edfd174', 14, 45.505333],
    ] as const;
    if (minna?.reference !== 'Minna no Nihongo I, Lesson 2'
        || minna?.relation !== 'course-sequence-and-byte-identified-audio-only'
        || minna?.transcriptStatus !== 'not-provided-do-not-invent'
        || !Array.isArray(minna.audioMembers) || minna.audioMembers.length !== 2
        || minna.audioMembers.some((member, index) => {
            const expected = minnaExpected[index];
            return member.title !== expected[0] || member.payloadSha256 !== expected[1]
                || member.sourceId !== `moodle-payload:${expected[1]}`
                || member.archiveOrder !== expected[2] || member.durationSeconds !== expected[3];
        })) {
        issues.push({ path: 'provenance.minna', message: 'Minna must remain two byte-identified audio anchors without invented transcripts.' });
    }

    const genki = value?.genki;
    const genkiDigest = '97cabde5351fca03f498279c245c50f598abb6d4d10165fa732b297b9eda4c06';
    if (genki?.sourceId !== `japanese-genki-interactive:${genkiDigest}:generateQuiz`
        || genki?.taskId !== 'genki-2e:l1-l05:lesson-1-workbook-4'
        || genki?.relativePath !== 'lessons/lesson-1/workbook-4/index.html'
        || genki?.payloadSha256 !== genkiDigest
        || genki?.scriptSha256 !== '44caf8d237764275ac255ab37de85bb007b4250790555ce09b58999c25d64d7d'
        || genki?.lineLocus?.start !== 76 || genki?.lineLocus?.end !== 107
        || genki?.engine !== 'Genki.generateQuiz' || genki?.sourceType !== 'fill'
        || genki?.responseAdaptation !== 'exact-prompts-answer-variants-and-order-with-yomu-two-menu-phrase-assembly') {
        issues.push({ path: 'provenance.genki', message: 'The exact mapped Genki fill task and adaptation policy are required.' });
    }
}

function validateMoodleRule(
    value: MoodleRuleSource | undefined,
    expected: Readonly<{ payload: string; title: string; member: string }>,
    path: string,
    issues: ValidationIssue[],
): void {
    if (value?.sourceId !== `moodle-payload:${expected.payload}`
        || value?.payloadSha256 !== expected.payload || value?.sourceTitle !== expected.title
        || value?.member !== expected.member || value?.author !== 'Rie Tsuruta-Barratt'
        || value?.pages?.join(',') !== '1,2') {
        issues.push({ path, message: 'Exact Moodle PDF identity, author, and page locus are required.' });
    }
}

function validateTeaching(
    steps: readonly PossessionPhraseTeachingStep[] | undefined,
    issues: ValidationIssue[],
): void {
    const expected = [
        ['Noun 1 の Noun 2', 'moodle-content-rule'],
        ['Owner の Thing', 'moodle-owner-rule'],
        ['A の B', 'genki-order-warning'],
    ] as const;
    if (!Array.isArray(steps) || steps.length !== expected.length) {
        issues.push({ path: 'payload.teaching', message: 'Both Moodle rules and the Genki order warning must precede assessment.' });
        return;
    }
    steps.forEach((step, index) => {
        if (step.sourceOrder !== index + 1 || step.pattern !== expected[index][0] || step.source !== expected[index][1]
            || !text(step.rule?.ja) || !text(step.rule?.en) || !text(step.example)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching must preserve exact source rule order and worked examples.' });
        }
    });
}

function validateRounds(model: PossessionPhraseBuilderModel, issues: ValidationIssue[]): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== EXACT_ROUNDS.length) {
        issues.push({ path: 'payload.rounds', message: 'The exact five Genki source phrases are required.' });
        return;
    }
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    const errorTags = new Set<string>();
    rounds.forEach((round, index) => {
        const expected = EXACT_ROUNDS[index];
        const path = `payload.rounds.${index}`;
        if (round.id !== expected.id || ids.has(round.id) || round.sourceOrder !== index + 1
            || round.sourcePrompt !== expected.prompt || round.correctA !== expected.a || round.correctB !== expected.b
            || round.acceptedAnswers.join('\u0000') !== expected.answers.join('\u0000')
            || !text(round.meaning) || !model.conceptIds.includes(round.conceptId)) {
            issues.push({ path, message: 'Each Genki slot needs its exact prompt, answer variants, order, and Concept.' });
        }
        ids.add(round.id);
        const expectedSourceId = `genki-2e:l1-l05:lesson-1-workbook-4:slot-${index + 1}`;
        if (round.sourceQuestionId !== expectedSourceId || sourceIds.has(round.sourceQuestionId)) {
            issues.push({ path: `${path}.sourceQuestionId`, message: 'Genki source slot ids must be exact and unique.' });
        }
        sourceIds.add(round.sourceQuestionId);
        if (!text(round.errorTag) || errorTags.has(round.errorTag)) {
            issues.push({ path: `${path}.errorTag`, message: 'Round error tags must be unique.' });
        }
        errorTags.add(round.errorTag);
    });
}

function render(
    model: PossessionPhraseBuilderModel,
    host: ActivityHost,
    submit: (response: PossessionPhraseBuilderResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-possession-phrase-builder';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'academy-button academy-button-primary academy-possession-start';
    start.textContent = host.language === 'ja' ? '句を組み立てる' : 'Build the phrases';
    const status = statusRegion('academy-kit-feedback academy-possession-feedback');
    root.append(heading, teaching, start, status);
    host.replace(root);

    let form: HTMLFormElement | undefined;
    start.addEventListener('click', () => {
        form = renderAssessment(model, host, submit, root, status);
        start.remove();
        root.insertBefore(form, status);
        form.querySelector<HTMLSelectElement>('select')?.focus();
    }, { once: true, signal: lifecycle.signal });

    return {
        focus() { (form?.querySelector('select') ?? start).focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function renderTeaching(model: PossessionPhraseBuilderModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-possession-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const article = document.createElement('article');
        article.className = 'academy-possession-teaching-step';
        const title = document.createElement('h3');
        title.append(assessedJapanese(step.pattern));
        const rule = document.createElement('p');
        rule.append(...localizedNodes(step.rule));
        const example = document.createElement('p');
        example.className = 'academy-possession-example academy-japanese';
        example.lang = 'ja';
        example.textContent = step.example;
        article.append(title, rule, example);
        section.append(article);
    });
    return section;
}

function renderAssessment(
    model: PossessionPhraseBuilderModel,
    host: ActivityHost,
    submit: (response: PossessionPhraseBuilderResponse) => Promise<ActivityEvaluation>,
    root: HTMLElement,
    status: HTMLElement,
): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'academy-possession-form';
    form.dataset.lessonPhase = 'assessment';
    form.setAttribute('aria-labelledby', `${model.id}-prompt`);
    model.payload.rounds.forEach(round => form.append(renderRound(model, round, host)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-possession-check';
    check.textContent = host.language === 'ja' ? '五つの句を確認する' : 'Check all five phrases';
    form.append(check);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '五つの句すべてで A と B を選んでください。'
                : 'Choose both A and B for all five phrases.';
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

function renderRound(
    model: PossessionPhraseBuilderModel,
    round: PossessionPhraseRound,
    host: ActivityHost,
): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-possession-round';
    fieldset.dataset.roundId = round.id;
    const legend = document.createElement('legend');
    legend.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
    const builder = document.createElement('div');
    builder.className = 'academy-possession-controls';
    const aId = `${model.id}-${round.id}-a`;
    const bId = `${model.id}-${round.id}-b`;
    builder.append(
        selectControl(aId, host.language === 'ja' ? 'A（説明・持ち主）' : 'A: descriptor or owner', model.payload.aOptions),
        assessedJapanese('の'),
        selectControl(bId, host.language === 'ja' ? 'B（中心の名詞）' : 'B: head noun', model.payload.bOptions),
    );
    fieldset.append(legend, builder);
    return fieldset;
}

function selectControl(id: string, labelText: string, options: readonly string[]): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'academy-possession-select';
    const label = document.createElement('span');
    label.textContent = labelText;
    const select = document.createElement('select');
    select.id = id;
    select.name = id;
    select.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    select.append(placeholder);
    options.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.append(option);
    });
    wrapper.append(label, select);
    return wrapper;
}

function responseFromForm(
    model: PossessionPhraseBuilderModel,
    form: HTMLFormElement,
): PossessionPhraseBuilderResponse | null {
    const data = new FormData(form);
    const phrases: PossessionPhraseBuilderResponse['phrases'][number][] = [];
    for (const round of model.payload.rounds) {
        const a = data.get(`${model.id}-${round.id}-a`);
        const b = data.get(`${model.id}-${round.id}-b`);
        if (typeof a !== 'string' || typeof b !== 'string'
            || !model.payload.aOptions.includes(a) || !model.payload.bOptions.includes(b)) return null;
        phrases.push({ roundId: round.id, a, b });
    }
    return { phrases };
}

function parseResponse(
    model: PossessionPhraseBuilderModel,
    response: PossessionPhraseBuilderResponse,
): ReadonlyMap<string, PossessionPhraseBuilderResponse['phrases'][number]> {
    if (!response || !Array.isArray(response.phrases) || response.phrases.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Genki source slot needs one complete AのB phrase.');
    }
    const phrases = new Map<string, PossessionPhraseBuilderResponse['phrases'][number]>();
    response.phrases.forEach(phrase => {
        if (!model.payload.rounds.some(round => round.id === phrase.roundId) || phrases.has(phrase.roundId)
            || !model.payload.aOptions.includes(phrase.a) || !model.payload.bOptions.includes(phrase.b)) {
            throw new TypeError('Phrases must use each exact source slot once and only the offered A and B parts.');
        }
        phrases.set(phrase.roundId, phrase);
    });
    return phrases;
}

function reviewSeed(round: PossessionPhraseRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l1-l05:possession-phrase:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: {
            expression: `${round.correctA}の${round.correctB}`,
            meanings: [round.meaning],
        },
    };
}
