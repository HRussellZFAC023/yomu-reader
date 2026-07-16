import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { ExperiencePostcardListeningModel, ExperiencePostcardListeningResponse } from './manifest';

export function renderExperiencePostcardListening(
    model: ExperiencePostcardListeningModel,
    host: ActivityHost,
    submit: (response: ExperiencePostcardListeningResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-experience-postcard-listening';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`; heading.tabIndex = -1; heading.append(...localizedNodes(model.prompt));
    const teaching = document.createElement('section'); teaching.className = 'academy-experience-postcard-teaching'; teaching.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const article = document.createElement('article'); const title = document.createElement('h3'); title.append(...localizedNodes(step.title));
        const pattern = document.createElement('p'); pattern.className = 'academy-experience-postcard-pattern academy-japanese'; pattern.lang = 'ja'; pattern.textContent = step.pattern;
        const instruction = document.createElement('p'); instruction.append(...localizedNodes(step.instruction)); article.append(title, pattern, instruction); teaching.append(article);
    });
    const sources = document.createElement('section'); sources.className = 'academy-experience-postcard-sources';
    sources.append(renderVisual(model.provenance.moodle.vocabularySheet, host.language), renderVisual(model.provenance.moodle.listeningSheet, host.language));
    const audio = document.createElement('audio'); audio.className = 'academy-experience-postcard-audio'; audio.controls = true; audio.preload = 'metadata'; audio.src = model.provenance.moodle.audio.url; audio.dataset.sourceSha256 = model.provenance.moodle.audio.payloadSha256;
    audio.setAttribute('aria-label', host.language === 'ja' ? 'Moodle B-21 原音声' : 'Original Moodle B-21 audio');
    const form = document.createElement('form'); form.className = 'academy-experience-postcard-form'; form.setAttribute('aria-labelledby', heading.id);
    const rail = document.createElement('ol'); rail.className = 'academy-experience-postcard-rail';
    model.payload.prompts.forEach(prompt => rail.append(renderStop(model, prompt, host.language)));
    const check = document.createElement('button'); check.type = 'submit'; check.className = 'academy-button academy-button-primary academy-experience-postcard-check'; check.textContent = host.language === 'ja' ? '三つの印を確認する' : 'Check the three stamps';
    form.append(rail, check);
    const key = renderAnswerKey(model, host.language); const status = statusRegion('academy-kit-feedback academy-experience-postcard-feedback');
    root.append(heading, teaching, sources, audio, form, key, status); host.replace(root);
    form.addEventListener('submit', event => {
        event.preventDefault(); const response = responseFromForm(model, form);
        if (!response) { const message = host.language === 'ja' ? '三つの場所すべてにA、B、Cの印を一つずつ選んでください。' : 'Choose one A, B, or C stamp at each of the three stops.'; status.textContent = message; host.announce(message); return; }
        setPending(root, true); void submit(response).then(evaluation => { root.dataset.outcome = evaluation.result.outcome; key.hidden = false; showEvaluation(status, evaluation, host); if (evaluation.result.outcome === 'lapse') setPending(root, false); }).catch(error => { setPending(root, false); status.textContent = error instanceof Error ? error.message : String(error); });
    }, { signal: lifecycle.signal });
    return { focus() { form.querySelector<HTMLInputElement>('input')?.focus(); }, dispose() { lifecycle.abort(); root.remove(); } };
}

function renderVisual(visual: ExperiencePostcardListeningModel['provenance']['moodle']['vocabularySheet'], language: 'ja' | 'en' | undefined): HTMLElement {
    return renderInspectableSourceVisual(visual, language, 'academy-experience-postcard-source');
}

function renderStop(model: ExperiencePostcardListeningModel, prompt: ExperiencePostcardListeningModel['payload']['prompts'][number], language: 'ja' | 'en' | undefined): HTMLElement {
    const item = document.createElement('li'); item.className = 'academy-experience-postcard-stop'; item.dataset.sourceQuestionId = prompt.sourceQuestionId;
    const fieldset = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = language === 'ja' ? `場所 ${prompt.sourceOrder}` : `Stop ${prompt.sourceOrder}`; fieldset.append(legend);
    (['a', 'b', 'c'] as const).forEach(optionId => { const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'radio'; input.name = `${model.id}:${prompt.id}`; input.value = optionId; input.required = true; const marker = document.createElement('span'); marker.className = 'academy-experience-postcard-marker'; marker.textContent = optionId.toUpperCase(); label.append(input, marker); fieldset.append(label); });
    item.append(fieldset); return item;
}

function renderAnswerKey(model: ExperiencePostcardListeningModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section'); section.className = 'academy-experience-postcard-key'; section.dataset.answerVisibility = 'after-attempt'; section.hidden = true;
    const heading = document.createElement('h3'); heading.textContent = language === 'ja' ? '試したあとのB-21の答え' : 'B-21 answers after your attempt'; const list = document.createElement('ol');
    model.payload.prompts.forEach(prompt => { const item = document.createElement('li'); item.textContent = `${prompt.sourceOrder}. ${prompt.correctOptionId.toUpperCase()} - ${prompt.reviewExpression}`; list.append(item); }); section.append(heading, list); return section;
}

function responseFromForm(model: ExperiencePostcardListeningModel, form: HTMLFormElement): ExperiencePostcardListeningResponse | null {
    const answers = model.payload.prompts.map(prompt => { const value = new FormData(form).get(`${model.id}:${prompt.id}`); return typeof value === 'string' && ['a', 'b', 'c'].includes(value) ? { promptId: prompt.id, optionId: value as 'a' | 'b' | 'c' } : null; });
    return answers.every((answer): answer is ExperiencePostcardListeningResponse['answers'][number] => answer !== null) ? { answers } : null;
}
