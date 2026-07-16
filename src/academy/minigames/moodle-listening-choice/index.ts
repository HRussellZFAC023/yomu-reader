import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    gradeFromScore,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface MoodleListeningChoiceOption {
    readonly id: 'a' | 'b';
    readonly label: string;
}

export interface MoodleListeningChoicePrompt {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly prompt: string;
    readonly options: readonly MoodleListeningChoiceOption[];
    readonly correctOptionId: 'a' | 'b';
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface MoodleListeningChoiceTrack {
    readonly id: 'names' | 'countries';
    readonly title: LocalizedText;
    readonly audio: {
        readonly sourceId: string;
        readonly payloadSha256: string;
        readonly url: string;
        readonly durationSeconds: number;
        readonly transcriptStatus: 'not-provided-do-not-invent';
    };
    readonly prompts: readonly MoodleListeningChoicePrompt[];
}

export interface MoodleListeningChoiceResponse {
    readonly answers: readonly Readonly<{ promptId: string; optionId: 'a' | 'b' }> [];
}

export interface MoodleListeningChoiceModel extends ActivityModel {
    readonly kind: 'academy-moodle-listening-choice';
    readonly responseKind: 'moodle-audio-a-or-b-choice';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l03';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5804931;
            readonly handout: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: 'Chapter 1 listening';
                readonly locus: { readonly page: 1; readonly sections: readonly [1, 2] };
            };
            readonly sourceImage: { readonly url: string; readonly sha256: string; readonly alt: LocalizedText };
            readonly answerKeyBasis: 'source-audio-verified-selections';
        };
        readonly support: {
            readonly phase: 'after-moodle-listening';
            readonly minna: { readonly reference: 'Minna no Nihongo I, Lesson 1'; readonly reuse: 'sequence-only' };
            readonly genki: { readonly sourceId: string; readonly relation: 'post-instruction-supported-transfer' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: LocalizedText; instruction: LocalizedText; pattern: string }> [];
        readonly sourceCaption: LocalizedText;
        readonly tracks: readonly MoodleListeningChoiceTrack[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const HANDOUT_SHA256 = 'b694cbef8eb74e1c59120effde033a49d886be29ea0efcbe940fb4b460ec9095';
const NAME_AUDIO_SHA256 = 'b601a7681c2ff12d68f4e8bf769319b855f0570dec6a5cfb14e3ee722bed7444';
const COUNTRY_AUDIO_SHA256 = '4fac34dc313c88ab75c802462f98f80530831faa93f3a3d0736134f24060573c';

export const moodleListeningChoicePlugin: ActivityPlugin<MoodleListeningChoiceModel, MoodleListeningChoiceResponse> = {
    kind: 'academy-moodle-listening-choice',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const errors: string[] = [];
        let correct = 0;
        prompts(model).forEach(prompt => {
            if (answers.get(prompt.id) === prompt.correctOptionId) correct += 1;
            else errors.push(prompt.errorTag);
        });
        return gradeFromScore(correct / prompts(model).length, model.payload.passScore, errors.sort(), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return prompts(model).flatMap(prompt => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(prompt.errorTag)) return [];
            const answer = prompt.options.find(option => option.id === prompt.correctOptionId)!;
            return [{
                id: `review:l1-l03:moodle-listening:${prompt.id}`,
                conceptId: prompt.conceptId,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: prompt.sourceQuestionId,
                content: { expression: answer.label, meanings: [prompt.prompt] },
            } satisfies ReviewSeed];
        });
    },
};

function validate(model: MoodleListeningChoiceModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The Moodle listening choice activity requires assessed answer support.' });
    }
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l03' || provenance.answerVisibility !== 'after-attempt'
        || provenance.moodle?.moduleId !== 5804931
        || provenance.moodle.handout?.payloadSha256 !== HANDOUT_SHA256
        || provenance.moodle.handout.title !== 'Chapter 1 listening'
        || provenance.moodle.handout.locus?.page !== 1
        || provenance.moodle.handout.locus.sections?.join(',') !== '1,2'
        || !text(provenance.moodle.handout.sourceId)
        || provenance.moodle.answerKeyBasis !== 'source-audio-verified-selections'
        || provenance.moodle.sourceImage?.url !== '/academy/content/lessons/l1-l03/moodle-chapter-1-listening-page-1.png'
        || !/^[a-f0-9]{64}$/u.test(provenance.moodle.sourceImage?.sha256 ?? '')
        || !text(provenance.moodle.sourceImage?.alt?.en) || !text(provenance.moodle.sourceImage?.alt?.ja)) {
        issues.push({ path: 'provenance.moodle', message: 'The exact Moodle page-one listening handout, image, and answer basis are required.' });
    }
    if (provenance?.support?.phase !== 'after-moodle-listening'
        || provenance.support.minna?.reference !== 'Minna no Nihongo I, Lesson 1'
        || provenance.support.minna.reuse !== 'sequence-only'
        || !text(provenance.support.genki?.sourceId)
        || provenance.support.genki.relation !== 'post-instruction-supported-transfer') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki must remain mapped support after the Moodle listening work.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2
        || model.payload.teaching.some(step => !text(step.title?.en) || !text(step.title?.ja)
            || !text(step.instruction?.en) || !text(step.instruction?.ja) || !text(step.pattern))) {
        issues.push({ path: 'payload.teaching', message: 'Teach both exact worksheet question frames before audio practice.' });
    }
    if (!text(model.payload?.sourceCaption?.en) || !text(model.payload?.sourceCaption?.ja)) {
        issues.push({ path: 'payload.sourceCaption', message: 'The source image needs a bilingual caption.' });
    }
    validateTracks(model, issues);
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source listening choice is required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateTracks(model: MoodleListeningChoiceModel, issues: ValidationIssue[]): void {
    const tracks: readonly MoodleListeningChoiceTrack[] = model.payload.tracks;
    if (!Array.isArray(tracks) || tracks.length !== 2 || tracks.map(track => track.id).join(',') !== 'names,countries') {
        issues.push({ path: 'payload.tracks', message: 'The name and country Moodle tracks are required in source order.' });
        return;
    }
    const expectedAudio = [
        [NAME_AUDIO_SHA256, '/academy/content/lessons/l1-l03/moodle-1-a-1.mp3', 45.88],
        [COUNTRY_AUDIO_SHA256, '/academy/content/lessons/l1-l03/moodle-2-a-2.mp3', 75.453333],
    ] as const;
    const promptIds = new Set<string>();
    const sourceIds = new Set<string>();
    const errorTags = new Set<string>();
    tracks.forEach((track: MoodleListeningChoiceTrack, index: number) => {
        const [digest, url, duration] = expectedAudio[index];
        if (!text(track.title?.en) || !text(track.title?.ja)
            || track.audio?.payloadSha256 !== digest || track.audio.url !== url
            || track.audio.durationSeconds !== duration || track.audio.transcriptStatus !== 'not-provided-do-not-invent'
            || !text(track.audio.sourceId) || !Array.isArray(track.prompts) || track.prompts.length !== 3) {
            issues.push({ path: `payload.tracks.${index}`, message: 'Each exact Moodle audio track needs its original delivery and three choices.' });
            return;
        }
        track.prompts.forEach((prompt: MoodleListeningChoicePrompt, promptIndex: number) => {
            if (!text(prompt.id) || promptIds.has(prompt.id) || !text(prompt.sourceQuestionId) || sourceIds.has(prompt.sourceQuestionId)
                || !text(prompt.prompt) || prompt.options?.length !== 2 || prompt.options.map(option => option.id).join(',') !== 'a,b'
                || prompt.options.some((option: MoodleListeningChoiceOption) => !text(option.label)) || !model.conceptIds.includes(prompt.conceptId)
                || !text(prompt.errorTag) || errorTags.has(prompt.errorTag)
                || !['a', 'b'].includes(prompt.correctOptionId)) {
                issues.push({ path: `payload.tracks.${index}.prompts.${promptIndex}`, message: 'Every exact audio prompt needs ordered A/B choices and deterministic evidence.' });
            }
            promptIds.add(prompt.id);
            sourceIds.add(prompt.sourceQuestionId);
            errorTags.add(prompt.errorTag);
        });
    });
}

function render(
    model: MoodleListeningChoiceModel,
    host: ActivityHost,
    submit: (response: MoodleListeningChoiceResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-moodle-listening-choice';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const reference = renderSourceReference(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-moodle-listening-choice-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.tracks.forEach(track => form.append(renderTrack(model, track)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-moodle-listening-choice-check';
    check.textContent = host.language === 'ja' ? '聞き取りを確認する' : 'Check the listening choices';
    form.append(check);
    const answerKey = renderAnswerKey(model);
    const status = statusRegion('academy-kit-feedback academy-moodle-listening-choice-feedback');
    root.append(heading, teaching, reference, form, answerKey, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '六つのAかBをすべて選んでください。' : 'Choose A or B for all six source prompts.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            answerKey.hidden = false;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { form.querySelector<HTMLInputElement>('input')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: MoodleListeningChoiceModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-moodle-listening-choice-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const article = document.createElement('article');
        const title = document.createElement('h3');
        title.append(...localizedNodes(step.title));
        const pattern = document.createElement('p');
        pattern.className = 'academy-moodle-listening-choice-pattern academy-japanese';
        pattern.lang = 'ja';
        pattern.textContent = step.pattern;
        const instruction = document.createElement('p');
        instruction.append(...localizedNodes(step.instruction));
        article.append(title, pattern, instruction);
        section.append(article);
    });
    return section;
}

function renderSourceReference(model: MoodleListeningChoiceModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'academy-moodle-listening-choice-source';
    figure.dataset.lessonPhase = 'source-reference';
    const image = document.createElement('img');
    image.src = model.provenance.moodle.sourceImage.url;
    image.alt = text(model.provenance.moodle.sourceImage.alt[language === 'ja' ? 'ja' : 'en']);
    image.loading = 'eager';
    const caption = document.createElement('figcaption');
    caption.append(...localizedNodes(model.payload.sourceCaption));
    figure.append(image, caption);
    return figure;
}

function renderTrack(model: MoodleListeningChoiceModel, track: MoodleListeningChoiceTrack): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-moodle-listening-choice-track';
    section.dataset.trackId = track.id;
    const title = document.createElement('h3');
    title.append(...localizedNodes(track.title));
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = track.audio.url;
    audio.dataset.sourceSha256 = track.audio.payloadSha256;
    audio.setAttribute('aria-label', track.title.en);
    section.append(title, audio);
    track.prompts.forEach((prompt, index) => section.append(renderPrompt(model, track, prompt, index)));
    return section;
}

function renderPrompt(
    model: MoodleListeningChoiceModel,
    track: MoodleListeningChoiceTrack,
    prompt: MoodleListeningChoicePrompt,
    index: number,
): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-moodle-listening-choice-prompt';
    fieldset.dataset.sourceQuestionId = prompt.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.append(document.createTextNode(`${index + 1}. ${prompt.prompt}`));
    fieldset.append(legend);
    prompt.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `${model.id}:${track.id}:${prompt.id}`;
        input.value = option.id;
        input.required = true;
        label.append(input, document.createTextNode(`${option.id}. ${option.label}`));
        fieldset.append(label);
    });
    return fieldset;
}

function renderAnswerKey(model: MoodleListeningChoiceModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-moodle-listening-choice-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const title = document.createElement('h3');
    title.textContent = 'Source choices after your attempt';
    const list = document.createElement('ol');
    prompts(model).forEach(prompt => {
        const answer = prompt.options.find(option => option.id === prompt.correctOptionId)!;
        const item = document.createElement('li');
        item.textContent = `${prompt.prompt} ${answer.id}. ${answer.label}`;
        list.append(item);
    });
    section.append(title, list);
    return section;
}

function responseFromForm(model: MoodleListeningChoiceModel, form: HTMLFormElement): MoodleListeningChoiceResponse | null {
    const answers = prompts(model).map(prompt => {
        const selected = new FormData(form).get(promptInputName(model, prompt));
        return typeof selected === 'string' && (selected === 'a' || selected === 'b')
            ? { promptId: prompt.id, optionId: selected }
            : null;
    });
    return answers.every((answer): answer is MoodleListeningChoiceResponse['answers'][number] => answer !== null)
        ? { answers }
        : null;
}

function promptInputName(model: MoodleListeningChoiceModel, prompt: MoodleListeningChoicePrompt): string {
    const track = model.payload.tracks.find(candidate => candidate.prompts.includes(prompt));
    return `${model.id}:${track!.id}:${prompt.id}`;
}

function parseResponse(model: MoodleListeningChoiceModel, response: MoodleListeningChoiceResponse): ReadonlyMap<string, 'a' | 'b'> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== prompts(model).length) {
        throw new TypeError('Every exact Moodle listening prompt needs one A or B answer.');
    }
    const values = new Map<string, 'a' | 'b'>();
    response.answers.forEach(answer => {
        if (!prompts(model).some(prompt => prompt.id === answer.promptId) || values.has(answer.promptId)
            || !['a', 'b'].includes(answer.optionId)) {
            throw new TypeError('Listening answers must use each exact source prompt once.');
        }
        values.set(answer.promptId, answer.optionId);
    });
    return values;
}

function prompts(model: MoodleListeningChoiceModel): readonly MoodleListeningChoicePrompt[] {
    return model.payload.tracks.flatMap(track => track.prompts);
}
