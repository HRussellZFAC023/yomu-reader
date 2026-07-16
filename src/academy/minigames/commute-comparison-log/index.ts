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
    gradeFromScore,
    localizedNodes,
    reviewSeeds,
    setPending,
    showEvaluation,
    statusRegion,
    validateFeedback,
    validatePassScore,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from '../activity-kit/shared';

export interface CommuteComparisonRound {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourcePrompt: string;
    readonly disruption: Readonly<{ readonly transportId: string; readonly durationId: string; }>;
    readonly usual: Readonly<{ readonly transportId: string; readonly durationId: string; }>;
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface CommuteComparisonResponse {
    readonly answers: readonly Readonly<{
        readonly roundId: string;
        readonly disruptionTransportId: string;
        readonly disruptionDurationId: string;
        readonly usualTransportId: string;
        readonly usualDurationId: string;
    }>[];
}

export interface CommuteComparisonLogModel extends ActivityModel {
    readonly kind: 'academy-commute-comparison-log';
    readonly responseKind: 'source-commute-disruption-usual-log';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l21';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6375062;
            readonly worksheet: Readonly<{ readonly payloadSha256: string; readonly member: string; readonly pages: readonly [1, 3]; }>;
            readonly audio: Readonly<{ readonly payloadSha256: string; readonly member: string; readonly url: string; readonly durationSeconds: 70.066667; readonly transcriptStatus: 'worksheet-script-after-attempt'; }>;
            readonly sourceSurfaces: readonly Readonly<{ readonly url: string; readonly sha256: string; readonly page: 1 | 3; }> [];
        };
        readonly minna: Readonly<{ readonly reference: 'Minna no Nihongo I, Lesson 11'; readonly role: 'chronology-map-only'; }>;
        readonly genki: Readonly<{ readonly taskId: 'genki-2e:l1-l21:lesson-1-workbook-1'; readonly role: 'post-instruction-number-reinforcement-only'; readonly payloadSha256: string; readonly lineLocus: readonly [76, 109]; }>;
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{
            readonly sourceQuestionId: string;
            readonly sourceLabel: string;
            readonly pattern: string;
            readonly explanation: LocalizedText;
            readonly example: string;
        }>[];
        readonly rounds: readonly CommuteComparisonRound[];
        readonly sourceScript: readonly Readonly<{ readonly speaker: 'A' | 'B'; readonly text: string; }>[];
        readonly transportOptions: readonly Readonly<{ readonly id: string; readonly ja: string; }> [];
        readonly durationOptions: readonly Readonly<{ readonly id: string; readonly ja: string; }> [];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

const WORKSHEET_SHA256 = '49468890a807f485a2c86cf2c05f6c3e11b6e2bf0cbd2ca50da662de8b91e5f5';
const AUDIO_SHA256 = '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97';
const PAGE_ONE_SHA256 = '549fadcb25776014c1901d17cdc3e5ac032da901c615cc1b31e66252cc444e12';
const PAGE_THREE_SHA256 = '18979cb3a0916d93ea0e507bfbfb036ea2f95142c8711a0fadb7d16edc75f4df';
const GENKI_SHA256 = '2f55d6b6f87e9431d4359eaa1d52a175fd15619dd61321775ce35b8b98c6f36e';

const EXACT_PROMPTS = [
    '2hours by bus / 30mins by tube usually',
    '1hour and half on foot / only 15 mins by tube usually',
    'about 3hours on foot / 45mins by bus and tube usually',
] as const;

const EXACT_SOURCE_SCRIPT = [
    { speaker: 'A', text: 'きのう ちかてつ の ストライキ が ありましたね。' },
    { speaker: 'B', text: 'ええ、わたし は バス で かいしゃ へ いきました。' },
    { speaker: 'A', text: 'え！かいしゃ まで どのくらい かかりましたか。' },
    { speaker: 'B', text: 'バス で ２じかん かかりました。' },
    { speaker: 'A', text: 'そうでしたか。いつも どのくらい かかりますか。' },
    { speaker: 'B', text: 'ちかてつ で ３０ぷん だけ です。' },
    { speaker: 'A', text: 'たいへんでしたね。' },
    { speaker: 'B', text: 'はい、ほんとうに たいへんでした。' },
] as const;

export const commuteComparisonLogPlugin: ActivityPlugin<CommuteComparisonLogModel, CommuteComparisonResponse> = {
    kind: 'academy-commute-comparison-log',
    validate,
    render,
    grade(model, response) {
        const answers = new Map(response?.answers?.map(answer => [answer.roundId, answer]) ?? []);
        const errorTags: string[] = [];
        let correct = 0;
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id);
            if (answer?.disruptionTransportId === round.disruption.transportId
                && answer.disruptionDurationId === round.disruption.durationId
                && answer.usualTransportId === round.usual.transportId
                && answer.usualDurationId === round.usual.durationId) correct += 1;
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

function validate(model: CommuteComparisonLogModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const provenance = model.provenance;
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'The source dialogue requires assessed answer support.' });
    if (provenance?.packageId !== 'l1-l21' || provenance.answerVisibility !== 'after-attempt'
        || provenance.moodle?.moduleId !== 6375062 || provenance.moodle.worksheet.payloadSha256 !== WORKSHEET_SHA256
        || provenance.moodle.worksheet.member !== 'Chapter 11-4_time period_how long does it take.pdf'
        || provenance.moodle.worksheet.pages.join(',') !== '1,3'
        || provenance.moodle.audio.payloadSha256 !== AUDIO_SHA256 || provenance.moodle.audio.member !== '46 A-46.mp3'
        || provenance.moodle.audio.durationSeconds !== 70.066667 || provenance.moodle.audio.transcriptStatus !== 'worksheet-script-after-attempt'
        || provenance.moodle.sourceSurfaces.length !== 2
        || provenance.moodle.sourceSurfaces[0]?.sha256 !== PAGE_ONE_SHA256 || provenance.moodle.sourceSurfaces[1]?.sha256 !== PAGE_THREE_SHA256) {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 21 requires the exact Chapter 11-4 worksheet pages and A-46 audio.' });
    }
    if (provenance?.minna.reference !== 'Minna no Nihongo I, Lesson 11' || provenance.minna.role !== 'chronology-map-only'
        || provenance.genki.taskId !== 'genki-2e:l1-l21:lesson-1-workbook-1'
        || provenance.genki.role !== 'post-instruction-number-reinforcement-only'
        || provenance.genki.payloadSha256 !== GENKI_SHA256 || provenance.genki.lineLocus.join(',') !== '76,109') {
        issues.push({ path: 'provenance.support', message: 'Minna chronology and Genki number support must remain secondary to Moodle.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2
        || model.payload.teaching[0]?.pattern !== 'Place A から Place B まで transportation で Time period かかります。'
        || model.payload.teaching[1]?.pattern !== 'どのくらい かかりますか。') {
        issues.push({ path: 'payload.teaching', message: 'The exact かかります route frame and question must precede the dialogue log.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== EXACT_PROMPTS.length) issues.push({ path: 'payload.rounds', message: 'All three source disruption/usual commute prompts are required.' });
    else rounds.forEach((round, index) => {
        if (round.sourceOrder !== index + 1 || round.sourcePrompt !== EXACT_PROMPTS[index]
            || !round.sourceQuestionId || !round.disruption.transportId || !round.disruption.durationId
            || !round.usual.transportId || !round.usual.durationId || !round.answerExpression
            || !model.conceptIds.includes(round.conceptId) || !round.errorTag) {
            issues.push({ path: `payload.rounds.${index}`, message: 'Every source prompt needs its exact order, commute facts, and repair identity.' });
        }
    });
    if (JSON.stringify(model.payload?.sourceScript) !== JSON.stringify(EXACT_SOURCE_SCRIPT)) {
        issues.push({ path: 'payload.sourceScript', message: 'The exact page-3 source dialogue must remain available only after an attempt.' });
    }
    if (!Array.isArray(model.payload?.transportOptions) || model.payload.transportOptions.length < 4
        || !Array.isArray(model.payload?.durationOptions) || model.payload.durationOptions.length < 6) {
        issues.push({ path: 'payload.options', message: 'Stable transport and duration choices are required for the commute log.' });
    }
    validatePassScore(model.payload?.passScore, issues);
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source commute must be repaired before passing.' });
    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model.payload?.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(model: CommuteComparisonLogModel, host: ActivityHost, submit: (response: CommuteComparisonResponse) => Promise<ActivityEvaluation>): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-commute-comparison-log';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2'); heading.tabIndex = -1; heading.append(...localizedNodes(model.prompt));
    const teaching = document.createElement('div'); teaching.className = 'academy-commute-log-teaching';
    model.payload.teaching.forEach(step => {
        const card = document.createElement('article'); card.className = 'academy-commute-log-teaching-card';
        const label = document.createElement('p'); label.className = 'academy-commute-log-source'; label.textContent = step.sourceLabel;
        const pattern = document.createElement('strong'); pattern.textContent = step.pattern;
        const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
        const example = document.createElement('p'); example.className = 'academy-commute-log-example'; example.textContent = step.example;
        card.append(label, pattern, explanation, example); teaching.append(card);
    });
    root.append(heading, teaching, sourceEvidence(model, host));

    const form = document.createElement('form'); form.className = 'academy-commute-log-form';
    const instruction = document.createElement('p'); instruction.append(...localizedNodes({ ja: 'ストの日と、いつもの行き方を別々の行に記録します。答えを見る前に、交通手段と時間を一組ずつ置きましょう。', en: 'Record the strike day and the usual journey on separate lines. Before seeing an answer, place one transport-and-duration pair in each.' }));
    const rounds = document.createElement('div'); rounds.className = 'academy-commute-log-rounds';
    model.payload.rounds.forEach(round => rounds.append(roundView(model, round, host.language)));
    const submitButton = document.createElement('button'); submitButton.type = 'submit'; submitButton.className = 'academy-button academy-button-primary'; submitButton.textContent = host.language === 'ja' ? 'メモを 確認する' : 'Check commute log';
    const feedback = statusRegion('academy-commute-log-feedback');
    form.append(instruction, rounds, submitButton, feedback);
    form.addEventListener('submit', async event => {
        event.preventDefault(); setPending(root, true);
        try {
            const evaluation = await submit(responseFrom(form, model));
            appendPostAttemptSupport(root, model, host.language);
            showEvaluation(feedback, evaluation, host);
        }
        finally { setPending(root, false); }
    }, { signal: lifecycle.signal });
    root.append(form); host.replace(root);
    return { focus: () => heading.focus(), dispose: () => lifecycle.abort() };
}

function sourceEvidence(model: CommuteComparisonLogModel, host: ActivityHost): HTMLElement {
    const details = document.createElement('details'); details.className = 'academy-commute-log-evidence';
    const summary = document.createElement('summary'); summary.textContent = host.language === 'ja' ? '元のワークシートと 音声' : 'Original worksheet and audio';
    const figures = document.createElement('div'); figures.className = 'academy-commute-log-surfaces';
    for (const surface of model.provenance.moodle.sourceSurfaces.filter(surface => surface.page === 1)) {
        const image = document.createElement('img'); image.src = surface.url; image.loading = 'lazy'; image.alt = host.language === 'ja'
            ? `Moodle Chapter 11-4、${surface.page}ページ目。`
            : `Moodle Chapter 11-4, page ${surface.page}.`;
        figures.append(image);
    }
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = model.provenance.moodle.audio.url;
    const note = document.createElement('p'); note.textContent = host.language === 'ja'
        ? '元の Moodle 音声 46 A-46。ワークシートの会話と答えは、試行のあとに表示されます。'
        : 'Original Moodle audio 46 A-46. The worksheet dialogue and answers appear after your attempt.';
    details.append(summary, figures, audio, note); return details;
}

function appendPostAttemptSupport(root: HTMLElement, model: CommuteComparisonLogModel, language: ActivityHost['language']): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-commute-log-support';
    support.dataset.listeningSupport = 'after-attempt';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '試行後のワークシート会話と答え' : 'Worksheet dialogue and answers after your attempt';
    const script = document.createElement('ol');
    script.className = 'academy-commute-log-script';
    model.payload.sourceScript.forEach(line => {
        const item = document.createElement('li');
        item.textContent = `${line.speaker}: ${line.text}`;
        script.append(item);
    });
    const answers = document.createElement('dl');
    answers.className = 'academy-commute-log-answers';
    model.payload.rounds.forEach(round => {
        const term = document.createElement('dt');
        term.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
        const definition = document.createElement('dd');
        definition.textContent = round.answerExpression;
        answers.append(term, definition);
    });
    const sourcePage = model.provenance.moodle.sourceSurfaces.find(surface => surface.page === 3);
    if (sourcePage) {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = sourcePage.url;
        image.loading = 'lazy';
        image.alt = language === 'ja' ? 'Moodle Chapter 11-4、3ページ目。ストライキの日といつもの通勤を比べる会話。' : 'Moodle Chapter 11-4, page 3: dialogue comparing a strike-day and usual commute.';
        figure.append(image);
        support.append(title, script, answers, figure);
    } else support.append(title, script, answers);
    root.append(support);
}

function roundView(model: CommuteComparisonLogModel, round: CommuteComparisonRound, language: ActivityHost['language']): HTMLElement {
    const fieldset = document.createElement('fieldset'); fieldset.className = 'academy-commute-log-round';
    const legend = document.createElement('legend'); legend.textContent = `${round.sourceOrder}. ${round.sourcePrompt}`;
    fieldset.append(legend, commuteRow(model, round, 'disruption', language), commuteRow(model, round, 'usual', language));
    return fieldset;
}

function commuteRow(model: CommuteComparisonLogModel, round: CommuteComparisonRound, phase: 'disruption' | 'usual', language: ActivityHost['language']): HTMLElement {
    const row = document.createElement('div'); row.className = 'academy-commute-log-row';
    const label = document.createElement('strong'); label.textContent = phase === 'disruption'
        ? (language === 'ja' ? 'ストの日' : 'Strike day')
        : (language === 'ja' ? 'いつも' : 'Usually');
    const transport = select(`${model.id}-${round.id}-${phase}-transport`, model.payload.transportOptions, language === 'ja' ? '交通手段' : 'Transport');
    const duration = select(`${model.id}-${round.id}-${phase}-duration`, model.payload.durationOptions, language === 'ja' ? '時間' : 'Duration');
    row.append(label, transport, duration); return row;
}

function select(name: string, options: readonly Readonly<{ id: string; ja: string; }>[], placeholder: string): HTMLSelectElement {
    const control = document.createElement('select'); control.name = name; control.required = true; control.setAttribute('aria-label', placeholder);
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = placeholder; empty.disabled = true; empty.selected = true; control.append(empty);
    options.forEach(option => { const node = document.createElement('option'); node.value = option.id; node.textContent = option.ja; control.append(node); });
    return control;
}

function responseFrom(form: HTMLFormElement, model: CommuteComparisonLogModel): CommuteComparisonResponse {
    const data = new FormData(form);
    return { answers: model.payload.rounds.map(round => ({
        roundId: round.id,
        disruptionTransportId: String(data.get(`${model.id}-${round.id}-disruption-transport`) ?? ''),
        disruptionDurationId: String(data.get(`${model.id}-${round.id}-disruption-duration`) ?? ''),
        usualTransportId: String(data.get(`${model.id}-${round.id}-usual-transport`) ?? ''),
        usualDurationId: String(data.get(`${model.id}-${round.id}-usual-duration`) ?? ''),
    })) };
}
