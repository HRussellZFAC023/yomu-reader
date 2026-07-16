import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    reviewSeeds,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from '../activity-kit/shared';

export interface FrequencyLensRound {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    /** The exact Sensei cue, before the learner supplies the frequency frame. */
    readonly sourceCue: string;
    readonly answerExpression: string;
    readonly correctCountId: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface FrequencyLensAnswer {
    readonly roundId: string;
    readonly lens: 'frequency' | 'duration';
    readonly particle: 'ni' | 'none';
    readonly countId: string;
}

export interface FrequencyLensResponse {
    readonly answers: readonly FrequencyLensAnswer[];
}

export interface FrequencyLensModel extends ActivityModel {
    readonly kind: 'academy-frequency-lens';
    readonly responseKind: 'frequency-lens-classify-and-build';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l20';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6310077;
            readonly payloadSha256: string;
            readonly member: string;
            readonly lineLocus: { readonly start: number; readonly end: number };
            readonly sourceSurface: { readonly url: string; readonly sha256: string; readonly page: 1; };
            readonly audio: readonly { readonly title: string; readonly url: string; readonly payloadSha256: string; readonly transcriptStatus: 'not-provided-do-not-invent' | 'learner-toggle'; }[];
        };
        readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 11'; readonly role: 'post-instruction-context-and-paired-track-039'; };
        readonly genki: { readonly reference: 'Genki I, Lesson 4 Grammar 9'; readonly role: 'post-instruction-duration-support'; readonly sourceSlice: readonly [1, 6]; };
    };
    readonly payload: {
        readonly teaching: readonly {
            readonly sourceQuestionId: string;
            readonly sourceLabel: string;
            readonly pattern: string;
            readonly explanation: LocalizedText;
            readonly example: string;
        }[];
        readonly rounds: readonly FrequencyLensRound[];
        readonly countOptions: readonly { readonly id: string; readonly ja: string; }[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

const MOODLE_SHA256 = '14bf6fe4ba20b651eebe5639f9e87b2492592dc6ec92893ccd162e78289cc737';
const WORKSHEET_SURFACE_SHA256 = 'eb21bacb07cd59fd5491708dbe05dc52a113833ba37869601c28986fc624bed4';
const A45_SHA256 = '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8';
const MINNA_039_SHA256 = 'bca7547d5207c2a6b2abe6fd2df8716a1858fd02bbdf34d6195291900c75389d';
const GENKI_SHA256 = '6b8d397d95313e5fe17eb8de2d5cebb557f6365ee835309caff3d7c6a25fa5fa';

const EXPECTED_CUES = [
    'いちにち／いぬ と さんぽ を します（２）',
    'いっしゅうかん／にほんご を ならいます（1）',
    'いっしゅうかん／ヨガ を します（3）',
    'いっかげつ／ジム へ いきます（4）',
    'いちねん／りょこう します（2）',
    'いちねん／かのじょ に プレゼント を あげます（7）',
] as const;

const EXPECTED_ANSWERS = [
    'いちにちに ２かい いぬと さんぽを します。',
    'いっしゅうかんに １かい にほんごを ならいます。',
    'いっしゅうかんに ３かい ヨガを します。',
    'いっかげつに ４かい ジムへ いきます。',
    'いちねんに ２かい りょこう します。',
    'いちねんに ７かい かのじょに プレゼントを あげます。',
] as const;

export const frequencyLensPlugin: ActivityPlugin<FrequencyLensModel, FrequencyLensResponse> = {
    kind: 'academy-frequency-lens',
    validate,
    render,
    grade(model, response) {
        const answers = new Map(response?.answers?.map(answer => [answer.roundId, answer]) ?? []);
        const errorTags: string[] = [];
        let correct = 0;
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id);
            if (answer?.lens === 'frequency' && answer.particle === 'ni' && answer.countId === round.correctCountId) correct += 1;
            else errorTags.push(round.errorTag);
        }
        return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errorTags, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap((round, index) => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)) return [];
            return reviewSeeds([model.payload.reviewTargets[index]], result, round.sourceQuestionId);
        });
    },
};

function validate(model: FrequencyLensModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'The source worksheet requires assessed answer support.' });
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l20' || provenance.answerVisibility !== 'after-attempt'
        || provenance.moodle?.moduleId !== 6310077 || provenance.moodle.payloadSha256 !== MOODLE_SHA256
        || provenance.moodle.member !== 'Handouts/Chapter 11-3_time period_how many times_how long.docx'
        || provenance.moodle.lineLocus?.start !== 26 || provenance.moodle.lineLocus.end !== 33
        || provenance.moodle.sourceSurface?.url !== '/academy/content/lessons/l1-l20/moodle-chapter-11-3-frequency-page-1.png'
        || provenance.moodle.sourceSurface.sha256 !== WORKSHEET_SURFACE_SHA256) {
        issues.push({ path: 'provenance.moodle', message: 'The exact Lesson 20 Moodle worksheet slice is required.' });
    }
    if (provenance?.moodle.audio?.map(track => track.payloadSha256).join(',') !== `${A45_SHA256},${MINNA_039_SHA256}`
        || provenance.moodle.audio[0]?.transcriptStatus !== 'not-provided-do-not-invent'
        || provenance.moodle.audio[1]?.transcriptStatus !== 'learner-toggle') {
        issues.push({ path: 'provenance.moodle.audio', message: 'A-45 and paired Minna 039 must retain their distinct transcript policies.' });
    }
    if (provenance?.minna.reference !== 'Minna no Nihongo I, Lesson 11'
        || provenance.minna.role !== 'post-instruction-context-and-paired-track-039'
        || provenance.genki.reference !== 'Genki I, Lesson 4 Grammar 9'
        || provenance.genki.role !== 'post-instruction-duration-support' || provenance.genki.sourceSlice?.join(',') !== '1,6') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki must remain post-instruction support.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2
        || model.payload.teaching[0]?.pattern !== 'Time period に Number + かい Verb ます。'
        || model.payload.teaching[1]?.pattern !== 'duration + action (no frequency に)') {
        issues.push({ path: 'payload.teaching', message: 'Frequency and duration contrast teaching is required before the source task.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== EXPECTED_CUES.length) issues.push({ path: 'payload.rounds', message: 'All six exact Sensei exercise-1 cues are required.' });
    else rounds.forEach((round, index) => {
        if (round.id !== `sensei-frequency-${index + 1}` || round.sourceOrder !== index + 1
            || round.sourceQuestionId !== `moodle:6310077:chapter-11-3:p1:exercise-1:item-${index + 1}`
            || round.sourceCue !== EXPECTED_CUES[index] || round.answerExpression !== EXPECTED_ANSWERS[index]
            || !model.conceptIds.includes(round.conceptId) || !text(round.errorTag)) {
            issues.push({ path: `payload.rounds.${index}`, message: 'Each round must preserve its exact source order, cue, and answer expression.' });
        }
    });
    if (!Array.isArray(model.payload?.countOptions) || model.payload.countOptions.length !== 6 || new Set(model.payload.countOptions.map(option => option.id)).size !== 6) {
        issues.push({ path: 'payload.countOptions', message: 'Six stable frequency-count choices are required.' });
    }
    validatePassScore(model.payload?.passScore, issues);
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source cue is required for mastery.' });
    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model.payload?.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(model: FrequencyLensModel, host: ActivityHost, submit: (response: FrequencyLensResponse) => Promise<ActivityEvaluation>): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-frequency-lens';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    root.append(heading, renderTeaching(model, host), renderSourceSurface(model));

    const form = document.createElement('form');
    form.className = 'academy-frequency-lens-form';
    const instruction = document.createElement('p');
    instruction.append(...localizedNodes({ ja: '各カードで、時間の見方、に、回数をそろえます。', en: 'For each source card, focus the lens, choose に, then match its count.' }));
    const grid = document.createElement('div');
    grid.className = 'academy-frequency-lens-grid';
    for (const round of model.payload.rounds) grid.append(renderRound(model, round));
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary';
    submitButton.textContent = host.language === 'ja' ? '元の問題を確認' : 'Check source cards';
    const feedback = statusRegion('academy-frequency-lens-feedback');
    form.append(instruction, grid, submitButton, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        setPending(form, true);
        void submit(responseFrom(form, model)).then(evaluation => {
            form.dataset.outcome = evaluation.result.outcome;
            showEvaluation(feedback, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(form, false);
        }).catch(() => {
            setPending(form, false);
            feedback.setAttribute('role', 'alert');
            feedback.textContent = host.language === 'ja' ? '答えを保存できませんでした。もう一度お試しください。' : 'Your answers could not be saved. Try again.';
        });
    }, { signal: lifecycle.signal });
    root.append(form);
    host.replace(root);
    return { focus() { form.querySelector<HTMLElement>('input, select')?.focus(); }, dispose() { lifecycle.abort(); root.remove(); } };
}

function renderTeaching(model: FrequencyLensModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-frequency-lens-teaching';
    const title = document.createElement('h3');
    title.append(...localizedNodes({ ja: 'レンズを合わせる', en: 'Set the lens first' }));
    const grid = document.createElement('div');
    grid.className = 'academy-frequency-lens-teaching-grid';
    for (const step of model.payload.teaching) {
        const card = document.createElement('article');
        card.className = 'academy-frequency-lens-teaching-card';
        const source = document.createElement('p'); source.className = 'academy-source-record'; source.textContent = step.sourceLabel;
        const pattern = document.createElement('h4'); pattern.append(assessedJapanese(step.pattern));
        const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
        const example = document.createElement('p'); example.className = 'academy-frequency-lens-example'; example.append(assessedJapanese(step.example));
        card.append(source, pattern, explanation, example); grid.append(card);
    }
    const audio = document.createElement('details');
    audio.className = 'academy-frequency-lens-audio';
    const summary = document.createElement('summary');
    summary.textContent = host.language === 'ja' ? '元の音声を聞く' : 'Listen to original audio';
    audio.append(summary);
    for (const track of model.provenance.moodle.audio) {
        const label = document.createElement('p'); label.textContent = track.title;
        const player = document.createElement('audio'); player.controls = true; player.preload = 'metadata'; player.src = track.url;
        audio.append(label, player);
    }
    section.append(title, grid, audio);
    return section;
}

function renderSourceSurface(model: FrequencyLensModel): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'academy-frequency-lens-source';
    const image = document.createElement('img');
    image.src = model.provenance.moodle.sourceSurface.url;
    image.alt = 'Moodle Chapter 11-3 worksheet page 1, showing frequency instruction and six unfilled source cues.';
    const caption = document.createElement('figcaption');
    caption.append(...localizedNodes({ ja: '元資料: Chapter 11-3、1ページ目。答えのない6つの手がかりを順番どおりに使います。', en: 'Source: Chapter 11-3, page 1. The six unanswered cues below stay in their original order.' }));
    figure.append(image, caption);
    return figure;
}

function renderRound(model: FrequencyLensModel, round: FrequencyLensRound): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-frequency-lens-round';
    fieldset.dataset.sourceQuestionId = round.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.append(assessedJapanese(`${round.sourceOrder}. ${round.sourceCue}`));
    const lenses = radioGroup(`${model.id}-${round.id}-lens`, [
        ['frequency', '回数 / Frequency'], ['duration', '期間 / Duration'],
    ]);
    const particles = radioGroup(`${model.id}-${round.id}-particle`, [
        ['ni', 'に'], ['none', 'なし / no に'],
    ]);
    const count = document.createElement('select');
    count.name = `${model.id}-${round.id}-count`; count.required = true;
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '—'; count.append(placeholder);
    for (const option of model.payload.countOptions) { const item = document.createElement('option'); item.value = option.id; item.textContent = option.ja; count.append(item); }
    const countLabel = document.createElement('label'); countLabel.append('回数 / Count', count);
    fieldset.append(legend, control('見方 / Lens', lenses), control('助詞 / Particle', particles), countLabel);
    return fieldset;
}

function radioGroup(name: string, options: readonly (readonly [string, string])[]): HTMLElement {
    const root = document.createElement('div'); root.className = 'academy-frequency-lens-options';
    options.forEach(([value, labelText], index) => {
        const label = document.createElement('label');
        const input = document.createElement('input'); input.type = 'radio'; input.name = name; input.value = value; input.required = index === 0;
        label.append(input, labelText); root.append(label);
    });
    return root;
}

function control(labelText: string, controls: HTMLElement): HTMLElement {
    const root = document.createElement('div'); root.className = 'academy-frequency-lens-control';
    const label = document.createElement('span'); label.textContent = labelText; root.append(label, controls); return root;
}

function responseFrom(form: HTMLFormElement, model: FrequencyLensModel): FrequencyLensResponse {
    const data = new FormData(form);
    return { answers: model.payload.rounds.map(round => ({
        roundId: round.id,
        lens: data.get(`${model.id}-${round.id}-lens`) as FrequencyLensAnswer['lens'],
        particle: data.get(`${model.id}-${round.id}-particle`) as FrequencyLensAnswer['particle'],
        countId: data.get(`${model.id}-${round.id}-count`) as string,
    })) };
}

export const LESSON_TWENTY_FREQUENCY_LENS_CONSTANTS = Object.freeze({
    MOODLE_SHA256, A45_SHA256, MINNA_039_SHA256, GENKI_SHA256,
});
