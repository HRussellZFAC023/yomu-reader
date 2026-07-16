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
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';

export interface FavorDirectionListeningTask {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3;
    readonly sourceQuestionId: string;
    readonly beneficiaryDirection: 'left' | 'right';
    readonly arrow: '←' | '→';
    readonly answer: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface FavorDirectionListeningModel extends ActivityModel {
    readonly kind: 'academy-favor-direction-listening';
    readonly responseKind: 'moodle-track-79-favor-direction';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l12';
        readonly packageOrder: 39;
        readonly answerVisibility: 'after-attempt';
        readonly repairScope: 'missed-source-items-only';
        readonly moodle: {
            readonly moduleId: 8121261;
            readonly archiveId: 'archive-000032';
            readonly archiveSha256: string;
            readonly worksheet: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: string;
                readonly page: 2;
                readonly url: string;
                readonly sha256: string;
            };
            readonly audio: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly locator: string;
                readonly url: string;
                readonly durationSeconds: 78.92525;
            };
            readonly answerKeyBasis: 'worksheet-beneficiary-direction-and-original-audio-reviewed';
            readonly excludedAudioSection: 'section-1-explicitly-skipped-by-worksheet';
        };
    };
    readonly payload: {
        readonly sourceCaption: LocalizedText;
        readonly prerequisiteContext: readonly Readonly<{ pattern: string; explanation: LocalizedText }>[];
        readonly instruction: string;
        readonly tasks: readonly FavorDirectionListeningTask[];
        readonly transcript: readonly Readonly<{ speaker: string; text: string }>[];
        readonly feedback: ActivityFeedbackSet;
    };
}

export interface FavorDirectionListeningResponse {
    readonly answers: readonly Readonly<{ taskId: string; direction: string; phrase: string }>[];
}

export const favorDirectionListeningPlugin: ActivityPlugin<FavorDirectionListeningModel, FavorDirectionListeningResponse> = {
    kind: 'academy-favor-direction-listening',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const errors = model.payload.tasks.flatMap(task => {
            const answer = answers.get(task.id)!;
            const phraseMatches = task.acceptedAnswers.some(candidate => normalizeJapanese(candidate) === answer.phrase);
            return answer.direction === task.beneficiaryDirection && phraseMatches ? [] : [task.errorTag];
        });
        return gradeFromScore((model.payload.tasks.length - errors.length) / model.payload.tasks.length, 1, errors, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.tasks.flatMap(task => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(task.errorTag)) return [];
            return [{
                id: `review:l2-l12:track79:${task.id}`,
                conceptId: task.conceptId,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: task.sourceQuestionId,
                content: { expression: `${task.arrow} ${task.answer}`, meanings: [`Track 79 item ${task.sourceOrder}`] },
            } satisfies ReviewSeed];
        });
    },
};

function validate(model: FavorDirectionListeningModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const moodle = model.provenance?.moodle;
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'Assessed answer support is required.' });
    if (model.provenance?.packageId !== 'l2-l12' || model.provenance.packageOrder !== 39
        || model.provenance.answerVisibility !== 'after-attempt' || model.provenance.repairScope !== 'missed-source-items-only'
        || moodle?.moduleId !== 8121261 || moodle.archiveId !== 'archive-000032'
        || moodle.archiveSha256 !== '62c3a814d3590157a8498d34e5ca172c5afa6608d9f9be1ad149a4ca4b99d4fe'
        || moodle.worksheet?.payloadSha256 !== '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617'
        || moodle.worksheet.page !== 2 || moodle.worksheet.sha256 !== '8fbb6b9881e26e31bb614c0b3a2048780c3b590d457e9418a7ffeec7f828bc8c'
        || moodle.audio?.payloadSha256 !== '612ff9f8f70e5ce4ac79b3c6826e12e6b2a7c4d2ccccf5a017df7509f474c63e'
        || moodle.audio.durationSeconds !== 78.92525
        || moodle.answerKeyBasis !== 'worksheet-beneficiary-direction-and-original-audio-reviewed'
        || moodle.excludedAudioSection !== 'section-1-explicitly-skipped-by-worksheet') {
        issues.push({ path: 'provenance.moodle', message: 'The exact Track 79 worksheet page, audio bytes, task boundary, and reviewed-answer basis are required.' });
    }
    if (!/^\/academy\/content\/listening\/media\/academy-listening-[a-f0-9]{16}\.mp3$/u.test(moodle?.audio?.url ?? '')) {
        issues.push({ path: 'provenance.moodle.audio.url', message: 'Track 79 must use its packaged listening binding.' });
    }
    if (!text(model.payload?.sourceCaption?.ja) || !text(model.payload?.sourceCaption?.en)
        || !Array.isArray(model.payload?.prerequisiteContext) || model.payload.prerequisiteContext.length !== 4
        || model.payload.prerequisiteContext.some(item => !text(item.pattern) || !text(item.explanation?.ja) || !text(item.explanation?.en))) {
        issues.push({ path: 'payload.prerequisiteContext', message: 'Four bilingual beneficiary-direction prerequisites are required before assessment.' });
    }
    const tasks = model.payload?.tasks;
    if (!Array.isArray(tasks) || tasks.length !== 3 || tasks.map(task => task.sourceOrder).join(',') !== '1,2,3') {
        issues.push({ path: 'payload.tasks', message: 'All three Track 79 worksheet items are required in source order.' });
    } else {
        const ids = new Set<string>();
        tasks.forEach((task, index) => {
            const expectedArrow = task.beneficiaryDirection === 'left' ? '←' : '→';
            if (!text(task.id) || ids.has(task.id) || !text(task.sourceQuestionId) || task.arrow !== expectedArrow
                || !text(task.answer) || !task.acceptedAnswers.some((answer: string) => normalizeJapanese(answer) === normalizeJapanese(task.answer))
                || !model.conceptIds.includes(task.conceptId) || !text(task.errorTag)) {
                issues.push({ path: `payload.tasks.${index}`, message: 'Every Track 79 item needs exact source identity, beneficiary direction, and a deterministic phrase.' });
            }
            ids.add(task.id);
        });
    }
    if (!Array.isArray(model.payload?.transcript) || model.payload.transcript.length !== 19
        || model.payload.transcript.some(line => !text(line.speaker) || !text(line.text))) {
        issues.push({ path: 'payload.transcript', message: 'The complete reviewed Track 79 transcript is required after an attempt.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function render(
    model: FavorDirectionListeningModel,
    host: ActivityHost,
    submit: (response: FavorDirectionListeningResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-favor-direction-listening';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const context = renderPrerequisiteContext(model, host.language);
    const caption = document.createElement('p');
    caption.append(...localizedNodes(model.payload.sourceCaption));
    const source = renderInspectableSourceVisual({
        title: model.provenance.moodle.worksheet.title,
        page: 2,
        url: model.provenance.moodle.worksheet.url,
        sha256: model.provenance.moodle.worksheet.sha256,
        alt: {
            ja: 'Moodle の Track 79 「〜てもらう」矢印リスニング課題、2ページ目',
            en: 'Moodle Track 79 beneficiary-arrow listening worksheet, page 2',
        },
    }, host.language, 'academy-favor-direction-listening-source');
    source.dataset.lessonPhase = 'source-reference';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = model.provenance.moodle.audio.url;
    audio.dataset.sourceSha256 = model.provenance.moodle.audio.payloadSha256;
    audio.setAttribute('aria-label', 'Track 79');
    const form = document.createElement('form');
    form.className = 'academy-favor-direction-listening-form';
    form.setAttribute('aria-labelledby', heading.id);
    const instruction = document.createElement('p');
    instruction.lang = 'ja';
    instruction.textContent = model.payload.instruction;
    form.append(instruction);
    model.payload.tasks.forEach(task => form.append(renderTask(model, task)));
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'academy-button academy-button-primary academy-favor-direction-listening-check';
    submitButton.textContent = host.language === 'ja' ? 'Track 79 を確認する' : 'Check Track 79';
    const status = statusRegion('academy-kit-feedback academy-favor-direction-listening-feedback');
    form.append(submitButton);
    root.append(heading, context, caption, source, audio, form, status);
    host.replace(root);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            appendPostAttemptSupport(root, model, host.language);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                applyMissedOnlyRepair(form, evaluation.result.errorTags);
                submitButton.textContent = host.language === 'ja' ? '間違えた項目だけ再確認' : 'Recheck missed items';
                setPending(root, false);
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });
    return { focus() { form.querySelector<HTMLInputElement>('input:not([hidden])')?.focus(); }, dispose() { lifecycle.abort(); root.remove(); } };
}

function renderPrerequisiteContext(model: FavorDirectionListeningModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-favor-direction-listening-context';
    section.dataset.lessonPhase = 'teach-before-assess';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '聞く前の受け手の見方' : 'Recipient viewpoint before listening';
    const list = document.createElement('dl');
    model.payload.prerequisiteContext.forEach(item => {
        const term = document.createElement('dt');
        term.lang = 'ja';
        term.textContent = item.pattern;
        const definition = document.createElement('dd');
        definition.append(...localizedNodes(item.explanation));
        list.append(term, definition);
    });
    section.append(title, list);
    return section;
}

function renderTask(model: FavorDirectionListeningModel, task: FavorDirectionListeningTask): HTMLElement {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.errorTag = task.errorTag;
    fieldset.dataset.sourceQuestionId = task.sourceQuestionId;
    const legend = document.createElement('legend');
    legend.textContent = `${task.sourceOrder}`;
    const directions = document.createElement('div');
    directions.className = 'academy-favor-direction-listening-directions';
    (['left', 'right'] as const).forEach(direction => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = directionName(model, task.id);
        input.value = direction;
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = direction === 'left' ? '←' : '→';
        label.append(input, arrow);
        directions.append(label);
    });
    const phrase = document.createElement('label');
    const phraseLabel = document.createElement('span');
    phraseLabel.textContent = '〜てもらう';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.lang = 'ja';
    input.dataset.jpdbReaderSurfaceIgnore = '';
    input.name = phraseName(model, task.id);
    input.setAttribute('aria-label', `Track 79 item ${task.sourceOrder} phrase`);
    phrase.append(phraseLabel, input);
    fieldset.append(legend, directions, phrase);
    return fieldset;
}

function appendPostAttemptSupport(root: HTMLElement, model: FavorDirectionListeningModel, language: 'ja' | 'en' | undefined): void {
    if (root.querySelector('[data-listening-support]')) return;
    const support = document.createElement('section');
    support.className = 'academy-favor-direction-listening-support';
    support.dataset.listeningSupport = 'after-attempt';
    const title = document.createElement('h3');
    title.textContent = language === 'ja' ? '試行後の台本と答え' : 'Transcript and answers after your attempt';
    const transcript = document.createElement('ol');
    model.payload.transcript.forEach(line => {
        const item = document.createElement('li');
        item.textContent = `${line.speaker}: ${line.text}`;
        transcript.append(item);
    });
    const answers = document.createElement('dl');
    model.payload.tasks.forEach(task => {
        const term = document.createElement('dt');
        term.textContent = `${task.sourceOrder}`;
        const definition = document.createElement('dd');
        definition.textContent = `${task.arrow} ${task.answer}`;
        answers.append(term, definition);
    });
    support.append(title, transcript, answers);
    root.append(support);
}

function applyMissedOnlyRepair(form: HTMLFormElement, errorTags: readonly string[]): void {
    const missed = new Set(errorTags);
    form.dataset.repairScope = 'missed-source-items-only';
    form.querySelectorAll<HTMLElement>('[data-error-tag]').forEach(row => {
        row.toggleAttribute('hidden', !missed.has(row.dataset.errorTag ?? ''));
    });
}

function responseFromForm(model: FavorDirectionListeningModel, form: HTMLFormElement): FavorDirectionListeningResponse {
    const data = new FormData(form);
    return {
        answers: model.payload.tasks.map(task => ({
            taskId: task.id,
            direction: String(data.get(directionName(model, task.id)) ?? ''),
            phrase: String(data.get(phraseName(model, task.id)) ?? ''),
        })),
    };
}

function parseResponse(
    model: FavorDirectionListeningModel,
    response: FavorDirectionListeningResponse,
): ReadonlyMap<string, Readonly<{ direction: 'left' | 'right'; phrase: string }>> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.tasks.length) {
        throw new TypeError('All three Track 79 direction-and-phrase items need one response.');
    }
    const answers = new Map<string, Readonly<{ direction: 'left' | 'right'; phrase: string }>>();
    response.answers.forEach(answer => {
        if (!model.payload.tasks.some(task => task.id === answer.taskId) || answers.has(answer.taskId)
            || (answer.direction !== 'left' && answer.direction !== 'right') || typeof answer.phrase !== 'string') {
            throw new TypeError('Track 79 responses must address each exact source item once.');
        }
        answers.set(answer.taskId, { direction: answer.direction, phrase: normalizeJapanese(answer.phrase) });
    });
    return answers;
}

function directionName(model: FavorDirectionListeningModel, taskId: string): string { return `${model.id}:${taskId}:direction`; }
function phraseName(model: FavorDirectionListeningModel, taskId: string): string { return `${model.id}:${taskId}:phrase`; }
