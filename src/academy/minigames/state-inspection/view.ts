import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { StateInspectionModel, StateInspectionResponse, StateInspectionRound } from './manifest';

export function renderStateInspection(
    model: StateInspectionModel,
    host: ActivityHost,
    submit: (response: StateInspectionResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-state-inspection';
    if (isPreparedState(model)) root.classList.add('academy-prepared-state-audit');
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sources = renderSources(model, host.language);
    const sourceAudio = renderSourceAudio(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-state-inspection-form';
    form.setAttribute('aria-labelledby', heading.id);
    const rounds = document.createElement('div');
    rounds.className = 'academy-state-inspection-round-groups';
    model.payload.taskHeadings.forEach(group => {
        const section = document.createElement('section');
        const groupHeading = document.createElement('h3');
        groupHeading.textContent = group.text;
        const list = document.createElement('ol');
        list.className = 'academy-state-inspection-rounds';
        model.payload.rounds.filter(round => round.sourceTask === group.sourceTask)
            .forEach(round => list.append(renderRound(model, round, host)));
        section.append(groupHeading, list);
        rounds.append(section);
    });
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-state-inspection-check';
    check.textContent = isConditionalActivity(model)
        ? (host.language === 'ja' ? '八つの条件形を確認する' : 'Check the eight conditional responses')
        : isVolitionalActivity(model)
        ? (host.language === 'ja' ? '八つの意向形を確認する' : 'Check the eight volitional forms')
        : isMessageHandoff(model)
        ? (host.language === 'ja' ? '八つの Chapter 30 応答を確認する' : 'Check the eight Chapter 30 responses')
        : isPreparedState(model)
            ? (host.language === 'ja' ? '八つの準備状態を確認する' : 'Check the eight prepared-state reports')
            : (host.language === 'ja' ? '八つの状態を確認する' : 'Check the eight state reports');
    form.append(rounds, check);

    const actions = document.createElement('div');
    actions.className = 'academy-state-inspection-actions';
    const returnToTeaching = action(host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching', 'return');
    const replayLabel = isConditionalActivity(model)
        ? (host.language === 'ja' ? '八つの条件形をもう一度' : 'Replay all eight conditional responses')
        : isVolitionalActivity(model)
        ? (host.language === 'ja' ? '八つの意向形をもう一度' : 'Replay all eight volitional forms')
        : isMessageHandoff(model)
        ? (host.language === 'ja' ? '八つの Chapter 30 応答をもう一度' : 'Replay all eight Chapter 30 responses')
        : (host.language === 'ja' ? '八つをもう一度' : `Replay all eight ${isPreparedState(model) ? 'prepared-state ' : ''}reports`);
    const replay = action(replayLabel, 'replay');
    returnToTeaching.hidden = true;
    replay.hidden = true;
    actions.append(returnToTeaching, replay);
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-state-inspection-feedback');
    root.append(heading, teaching, ...(sourceAudio ? [sourceAudio] : []), sources, form, actions, key, status);
    host.replace(root);

    returnToTeaching.addEventListener('click', () => {
        const teachingHeading = teaching.querySelector<HTMLElement>('h3');
        teachingHeading?.focus();
        teaching.scrollIntoView?.({ block: 'start' });
        host.announce(host.language === 'ja' ? '先生の説明に戻りました。' : 'Returned to Sensei’s teaching.');
    }, { signal: lifecycle.signal });

    replay.addEventListener('click', () => {
        resetForReplay(rounds, form, key, returnToTeaching, replay);
        firstControl(form)?.focus();
        host.announce(isConditionalActivity(model)
            ? (host.language === 'ja'
                ? '八つの条件形を最初からやり直せます。'
                : 'All eight conditional responses are ready for a fresh replay.')
            : isVolitionalActivity(model)
            ? (host.language === 'ja'
                ? '八つの意向形を最初からやり直せます。'
                : 'All eight volitional forms are ready for a fresh replay.')
            : isMessageHandoff(model)
            ? (host.language === 'ja'
                ? '八つの Chapter 30 応答を最初からやり直せます。'
                : 'All eight Chapter 30 responses are ready for a fresh replay.')
            : (host.language === 'ja'
                ? '八つの状態を最初から報告できます。'
                : `All eight ${isPreparedState(model) ? 'prepared-state ' : ''}reports are ready for a fresh replay.`));
    }, { signal: lifecycle.signal });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '八つの問題に一つずつ答えてください。'
                : 'Complete one response for each of the eight source prompts.';
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
                form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')
                    .forEach(control => { control.disabled = true; });
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { firstControl(form)?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: StateInspectionModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.className = 'academy-japanese academy-state-inspection-source-text';
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderSources(model: StateInspectionModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-sources';
    section.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => {
        section.append(renderInspectableSourceVisual(
            visual,
            language,
            'academy-state-inspection-source',
            'lazy',
        ));
    });
    return section;
}

function renderSourceAudio(model: StateInspectionModel, language: 'ja' | 'en' | undefined): HTMLElement | undefined {
    const source = model.provenance.moodle.media.audio;
    if (!source) return undefined;
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-audio';
    section.dataset.lessonPhase = 'source-listening';
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? 'Track 13 を聞く' : 'Listen to Track 13';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = source.url;
    audio.dataset.sourceSha256 = source.payloadSha256;
    audio.setAttribute('aria-label', language === 'ja'
        ? 'Moodle Track 13 原音声。何度でも再生できます。'
        : 'Original Moodle Track 13 audio. Replay as needed.');
    section.append(heading, audio);
    return section;
}

function renderRound(model: StateInspectionModel, round: StateInspectionRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-state-inspection-round';
    item.dataset.roundId = round.id;
    item.dataset.interaction = round.interaction;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = round.sourcePrompt;
    fieldset.append(legend);
    if (round.interaction === 'state-select') fieldset.append(renderSelect(model, round, host));
    else if (round.interaction === 'action-choice') fieldset.append(renderChoices(model, round, host));
    else fieldset.append(renderTyped(model, round, host));
    item.append(fieldset);
    return item;
}

function renderSelect(model: StateInspectionModel, round: StateInspectionRound, host: ActivityHost): HTMLElement {
    const label = document.createElement('label');
    label.className = 'academy-state-inspection-select-label';
    const copy = document.createElement('span');
    copy.textContent = isConditionalActivity(model)
        ? (host.language === 'ja' ? '条件形を選ぶ' : 'Choose the conditional form')
        : isProbabilityBriefing(model)
        ? (host.language === 'ja' ? '原文の確実さの例を選ぶ' : 'Choose the source probability line')
        : isVolitionalActivity(model)
        ? (host.language === 'ja' ? '必要な意向形を選ぶ' : 'Choose the required volitional form')
        : isPreparedState(model)
        ? (host.language === 'ja' ? '残っている準備状態' : 'Choose the prepared or neutral state')
        : (host.language === 'ja' ? '見えている状態' : 'Choose the visible resulting state');
    const select = document.createElement('select');
    select.name = fieldName(model, round);
    select.dataset.roundControl = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    select.append(placeholder, ...round.options.map(option => optionNode(option.value, option.label[host.language === 'ja' ? 'ja' : 'en'])));
    label.append(copy, select);
    return label;
}

function renderChoices(model: StateInspectionModel, round: StateInspectionRound, host: ActivityHost): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'academy-state-inspection-choices';
    round.options.forEach(option => {
        const label = document.createElement('label');
        label.className = 'academy-state-inspection-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = fieldName(model, round);
        input.value = option.value;
        input.dataset.roundControl = '';
        const copy = document.createElement('span');
        copy.className = 'academy-japanese';
        copy.lang = 'ja';
        copy.textContent = option.label[host.language === 'ja' ? 'ja' : 'en'];
        label.append(input, copy);
        controls.append(label);
    });
    return controls;
}

function renderTyped(model: StateInspectionModel, round: StateInspectionRound, host: ActivityHost): HTMLElement {
    const label = document.createElement('label');
    label.className = 'academy-state-inspection-typed-label';
    const copy = document.createElement('span');
    copy.textContent = isConditionalActivity(model)
        ? (host.language === 'ja' ? '条件形の応答を日本語で書く' : 'Type the conditional response in Japanese')
        : isProbabilityBriefing(model)
        ? (host.language === 'ja' ? '原文の確実さの例を入力する' : 'Type the exact source probability line')
        : isVolitionalActivity(model)
        ? (host.language === 'ja' ? '意向形を日本語で書く' : 'Type the volitional form in Japanese')
        : isMessageHandoff(model)
        ? (host.language === 'ja' ? '日本語で応答する' : 'Type your response in Japanese')
        : isPreparedState(model)
            ? (host.language === 'ja' ? '準備状態の報告' : 'Type the prepared-state report')
            : (host.language === 'ja' ? '状態の報告' : 'Type the resulting-state report');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = fieldName(model, round);
    input.autocomplete = 'off';
    input.lang = 'ja';
    input.dataset.roundControl = '';
    label.append(copy, input);
    return label;
}

function showRepairRows(
    model: StateInspectionModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-state-inspection-hints')) return;
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: StateInspectionRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-state-inspection-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-state-inspection-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-state-inspection-hint-output');
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

function renderAnswerKey(model: StateInspectionModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = isNaraGuidance(model)
        ? (language === 'ja'
            ? '試したあとの、先生の印刷例（選択肢とヒントはよむ補助）'
            : 'Sensei’s printed examples after your attempt; choices and hints are Yomu scaffolding')
        : isConditionalActivity(model)
        ? (language === 'ja'
            ? '試したあとの、先生の原文形と出典を分けたよむ補完'
            : 'Sensei source forms and separately attributed Yomu conditional joins after your attempt')
        : isProbabilityBriefing(model)
        ? (language === 'ja'
            ? '試したあとの、先生の原文例'
            : 'Sensei’s source examples after your attempt')
        : isVolitionalActivity(model)
        ? (language === 'ja'
            ? '試したあとの、よむ派生の意向形'
            : 'Yomu-derived volitional forms after your attempt')
        : isMessageHandoff(model)
        ? (language === 'ja'
            ? '試したあとの、先生の例と出典を分けたよむ補完'
            : 'Sensei examples and separately attributed Yomu completions after your attempt')
        : (language === 'ja'
            ? '試したあとの、よむ派生文'
            : `Yomu-derived ${isPreparedState(model) ? 'prepared-state ' : ''}reports after your attempt`);
    const answers = document.createElement('ol');
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.className = 'academy-japanese';
        item.lang = 'ja';
        item.textContent = round.answerExpression;
        answers.append(item);
    });
    section.append(heading, answers);
    model.provenance.moodle.answerSheets?.forEach(visual => {
        section.append(renderInspectableSourceVisual(
            visual,
            language,
            'academy-state-inspection-source academy-state-inspection-answer-source',
            'lazy',
        ));
    });
    return section;
}

function responseFromForm(model: StateInspectionModel, form: HTMLFormElement): StateInspectionResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is StateInspectionResponse['answers'][number] => answer !== null)
        ? { answers }
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
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')
        .forEach(control => { control.disabled = false; });
    rounds.querySelectorAll<HTMLElement>('.academy-state-inspection-round').forEach(item => {
        item.hidden = false;
        item.querySelector('.academy-state-inspection-hints')?.remove();
    });
    key.hidden = true;
    returnButton.hidden = true;
    replayButton.hidden = true;
}

function fieldName(model: StateInspectionModel, round: StateInspectionRound): string {
    return `${model.id}:${round.id}:answer`;
}

function optionNode(value: string, label: string): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
}

function action(label: string, actionName: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `academy-button academy-button-secondary academy-state-inspection-${actionName}`;
    button.textContent = label;
    return button;
}

function firstControl(form: HTMLFormElement): HTMLElement | null {
    return form.querySelector<HTMLElement>('[data-round-control]');
}

function isPreparedState(model: StateInspectionModel): boolean {
    return model.responseKind === 'moodle-chapter-30-prepared-state-audit';
}

function isMessageHandoff(model: StateInspectionModel): boolean {
    return model.responseKind === 'moodle-chapter-30-message-handoff';
}

function isVolitionalPlan(model: StateInspectionModel): boolean {
    return model.responseKind === 'moodle-chapter-31-volitional-plan';
}

function isVolitionalActivity(model: StateInspectionModel): boolean {
    return isVolitionalPlan(model) || model.responseKind === 'moodle-chapter-31-intention-route';
}

function isProbabilityBriefing(model: StateInspectionModel): boolean {
    return model.responseKind === 'moodle-chapter-32-probability-briefing';
}

function isConditionalActivity(model: StateInspectionModel): boolean {
    return model.responseKind === 'moodle-chapter-35-conditional-workshop'
        || model.responseKind === 'moodle-chapter-35-adjective-noun-conditionals'
        || model.responseKind === 'moodle-chapter-35-nara-guidance-workshop';
}

function isNaraGuidance(model: StateInspectionModel): boolean {
    return model.responseKind === 'moodle-chapter-35-nara-guidance-workshop';
}
