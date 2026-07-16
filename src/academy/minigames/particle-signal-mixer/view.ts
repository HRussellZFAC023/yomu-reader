import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type {
    ParticleSignalMixerModel,
    ParticleSignalMixerResponse,
    ParticleSignalRound,
} from './manifest';

export function renderParticleSignalMixer(
    model: ParticleSignalMixerModel,
    host: ActivityHost,
    submit: (response: ParticleSignalMixerResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-particle-signal-mixer';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sources = renderSources(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-particle-signal-form';
    form.setAttribute('aria-labelledby', heading.id);
    const rounds = document.createElement('ol');
    rounds.className = 'academy-particle-signal-rounds';
    model.payload.rounds.forEach(round => rounds.append(renderRound(model, round, host)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-particle-signal-check';
    check.textContent = host.language === 'ja' ? '四つの信号を確認する' : 'Check the four signals';
    form.append(rounds, check);

    const actions = document.createElement('div');
    actions.className = 'academy-particle-signal-actions';
    const returnToTeaching = document.createElement('button');
    returnToTeaching.type = 'button';
    returnToTeaching.className = 'academy-button academy-button-secondary academy-particle-signal-return';
    returnToTeaching.textContent = host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching';
    returnToTeaching.hidden = true;
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'academy-button academy-button-secondary academy-particle-signal-replay';
    replay.textContent = host.language === 'ja' ? '四つの信号をもう一度' : 'Replay all four signals';
    replay.hidden = true;
    actions.append(returnToTeaching, replay);
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-particle-signal-feedback');
    root.append(heading, teaching, sources, form, actions, key, status);
    host.replace(root);

    returnToTeaching.addEventListener('click', () => {
        const teachingHeading = teaching.querySelector<HTMLElement>('h3');
        teachingHeading?.focus();
        teaching.scrollIntoView?.({ block: 'start' });
        host.announce(host.language === 'ja' ? '先生の説明に戻りました。' : 'Returned to Sensei’s teaching.');
    }, { signal: lifecycle.signal });

    replay.addEventListener('click', () => {
        resetForReplay(rounds, form, key, returnToTeaching, replay);
        form.querySelector<HTMLInputElement>('input')?.focus();
        host.announce(host.language === 'ja' ? '四つの信号をもう一度調整できます。' : 'All four signals are ready for a fresh replay.');
    }, { signal: lifecycle.signal });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '四つの問題で普通形と「を・が」の信号を一つずつ選んでください。'
                : 'Choose one plain form and one wo/ga channel for each source item.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            key.hidden = false;
            returnToTeaching.hidden = false;
            replay.hidden = false;
            setPending(root, false);
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                showRepairRows(model, rounds, evaluation.result.errorTags, host);
            } else {
                form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')
                    .forEach(control => { control.disabled = true; });
            }
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

function renderTeaching(model: ParticleSignalMixerModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-particle-signal-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.className = 'academy-japanese academy-particle-signal-source-text';
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderSources(model: ParticleSignalMixerModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-particle-signal-sources';
    section.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => {
        section.append(renderInspectableSourceVisual(visual, language, 'academy-particle-signal-source'));
    });
    return section;
}

function renderRound(
    model: ParticleSignalMixerModel,
    round: ParticleSignalRound,
    host: ActivityHost,
): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-particle-signal-round';
    item.dataset.roundId = round.id;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${host.language === 'ja' ? '先生の問題' : 'Sensei item'} ${round.sourceTask}-${round.sourceItem}: ${round.sourcePrompt}`;
    const controls = document.createElement('div');
    controls.className = 'academy-particle-signal-controls';
    const forms = radioGroup(model.id, round, 'form', round.options.map(option => ({ value: option.id, label: option.label })), host);
    const particles = radioGroup(model.id, round, 'particle', [
        { value: 'を', label: 'を' },
        { value: 'が', label: 'が' },
    ], host);
    const output = document.createElement('div');
    output.className = 'academy-particle-signal-monitor academy-japanese';
    output.lang = 'ja';
    output.setAttribute('aria-live', 'polite');
    controls.addEventListener('change', () => updateMonitor(round, fieldset, output));
    controls.append(forms, particles);
    fieldset.append(legend, controls, output);
    item.append(fieldset);
    updateMonitor(round, fieldset, output);
    return item;
}

function radioGroup(
    modelId: string,
    round: ParticleSignalRound,
    kind: 'form' | 'particle',
    options: readonly Readonly<{ value: string; label: string }>[],
    host: ActivityHost,
): HTMLElement {
    const group = document.createElement('div');
    group.className = `academy-particle-signal-${kind}`;
    const title = document.createElement('p');
    title.textContent = kind === 'form'
        ? (host.language === 'ja' ? '普通形フェーダー' : 'Plain-form fader')
        : (host.language === 'ja' ? '外側の助詞チャンネル' : 'Outer-particle channel');
    const choices = document.createElement('div');
    choices.className = 'academy-particle-signal-choices';
    options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `${modelId}:${round.id}:${kind}`;
        input.value = option.value;
        const copy = document.createElement('span');
        copy.className = 'academy-japanese';
        copy.lang = 'ja';
        copy.textContent = option.label;
        label.append(input, copy);
        choices.append(label);
    });
    group.append(title, choices);
    return group;
}

function updateMonitor(round: ParticleSignalRound, fieldset: HTMLElement, output: HTMLElement): void {
    const optionId = fieldset.querySelector<HTMLInputElement>('input[name$=":form"]:checked')?.value;
    const particle = fieldset.querySelector<HTMLInputElement>('input[name$=":particle"]:checked')?.value;
    const option = round.options.find(candidate => candidate.id === optionId);
    output.textContent = option && particle
        ? `${option.label} ${round.phraseTail.replace(/^[をが]/u, particle)}`
        : '普通形 + 名詞 + を／が + 文末';
}

function showRepairRows(
    model: ParticleSignalMixerModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-particle-signal-hints')) return;
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: ParticleSignalRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-particle-signal-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-particle-signal-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-particle-signal-hint-output');
    let index = 0;
    button.addEventListener('click', () => {
        const hint = round.hints[index];
        if (!hint) return;
        index += 1;
        output.textContent = hint[host.language === 'ja' ? 'ja' : 'en'];
        output.dataset.hintIndex = String(index);
        button.textContent = host.language === 'ja' ? '次のヒント' : 'Next hint';
        button.disabled = index >= round.hints.length;
        void host.recordSupportUse?.({ activityId: modelId, supportKind: 'hint', choiceId: `${round.id}:hint-${index}` });
        host.announce(output.textContent);
    });
    root.append(button, output);
    return root;
}

function renderAnswerKey(model: ParticleSignalMixerModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-particle-signal-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの派生文' : 'Derived sentences after your attempt';
    const answers = document.createElement('ol');
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.className = 'academy-japanese';
        item.lang = 'ja';
        item.textContent = round.answerExpression;
        answers.append(item);
    });
    section.append(heading, answers);
    return section;
}

function responseFromForm(
    model: ParticleSignalMixerModel,
    form: HTMLFormElement,
): ParticleSignalMixerResponse | null {
    const data = new FormData(form);
    const signals = model.payload.rounds.map(round => {
        const optionId = data.get(`${model.id}:${round.id}:form`);
        const particle = data.get(`${model.id}:${round.id}:particle`);
        if (typeof optionId !== 'string' || (particle !== 'を' && particle !== 'が')) return null;
        return { roundId: round.id, optionId, particle };
    });
    return signals.every((signal): signal is ParticleSignalMixerResponse['signals'][number] => signal !== null)
        ? { signals }
        : null;
}

function resetForReplay(
    rounds: HTMLElement,
    form: HTMLFormElement,
    key: HTMLElement,
    returnButton: HTMLButtonElement,
    replayButton: HTMLButtonElement,
): void {
    form.reset();
    form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(control => { control.disabled = false; });
    rounds.querySelectorAll<HTMLElement>('.academy-particle-signal-round').forEach(item => {
        item.hidden = false;
        item.querySelector('.academy-particle-signal-hints')?.remove();
        const roundId = item.dataset.roundId;
        const monitor = item.querySelector<HTMLElement>('.academy-particle-signal-monitor');
        if (monitor && roundId) monitor.textContent = '普通形 + 名詞 + を／が + 文末';
    });
    key.hidden = true;
    returnButton.hidden = true;
    replayButton.hidden = true;
}
