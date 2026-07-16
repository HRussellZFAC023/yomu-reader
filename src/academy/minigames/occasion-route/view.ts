import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, setPending, showEvaluation, statusRegion } from '../activity-kit/shared';
import { renderInspectableSourceVisual } from '../source-visual';
import type { OccasionRouteModel, OccasionRouteMode, OccasionRouteResponse, OccasionRouteRound } from './manifest';

export function renderOccasionRoute(
    model: OccasionRouteModel,
    host: ActivityHost,
    submit: (response: OccasionRouteResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-occasion-route';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sources = renderSources(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-occasion-route-form';
    form.setAttribute('aria-labelledby', heading.id);
    const taskHeading = document.createElement('h3');
    taskHeading.textContent = model.payload.taskHeading;
    const rounds = document.createElement('ol');
    rounds.className = 'academy-occasion-route-rounds';
    model.payload.rounds.forEach(round => rounds.append(renderRound(model, round, host)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-occasion-route-check';
    check.textContent = host.language === 'ja' ? '四つのルートを確認する' : 'Check the four routes';
    form.append(taskHeading, rounds, check);

    const actions = document.createElement('div');
    actions.className = 'academy-occasion-route-actions';
    const returnToTeaching = document.createElement('button');
    returnToTeaching.type = 'button';
    returnToTeaching.className = 'academy-button academy-button-secondary academy-occasion-route-return';
    returnToTeaching.textContent = host.language === 'ja' ? '先生の説明へ戻る' : 'Return to Sensei’s teaching';
    returnToTeaching.hidden = true;
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'academy-button academy-button-secondary academy-occasion-route-replay';
    replay.textContent = host.language === 'ja' ? '四つのルートをもう一度' : 'Replay all four routes';
    replay.hidden = true;
    actions.append(returnToTeaching, replay);
    const key = renderAnswerKey(model, host.language);
    const status = statusRegion('academy-kit-feedback academy-occasion-route-feedback');
    root.append(heading, teaching, sources, form, actions, key, status);
    host.replace(root);

    returnToTeaching.addEventListener('click', () => {
        const teachingHeading = teaching.querySelector<HTMLElement>('h3');
        teachingHeading?.focus();
        teaching.scrollIntoView?.({ block: 'start' });
        host.announce(host.language === 'ja' ? '先生の説明に戻りました。' : 'Returned to Sensei’s teaching.');
    }, { signal: lifecycle.signal });

    replay.addEventListener('click', () => {
        resetForReplay(rounds, form, key, returnToTeaching, replay, host.language);
        form.querySelector<HTMLInputElement>('input')?.focus();
        host.announce(host.language === 'ja' ? '四つのルートを最初から選べます。' : 'All four occasion routes are ready for a fresh replay.');
    }, { signal: lifecycle.signal });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '四つの問題で肯定か否定のルートを一つずつ選んでください。'
                : 'Choose an affirmative or negative route for each source pair.';
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

function renderTeaching(model: OccasionRouteModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-occasion-route-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.tabIndex = -1;
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.className = 'academy-japanese academy-occasion-route-source-text';
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderSources(model: OccasionRouteModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-occasion-route-sources';
    section.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => {
        section.append(renderInspectableSourceVisual(visual, language, 'academy-occasion-route-source'));
    });
    return section;
}

function renderRound(model: OccasionRouteModel, round: OccasionRouteRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-occasion-route-round';
    item.dataset.roundId = round.id;
    item.dataset.sourceQuestionId = round.sourceQuestionId;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = round.sourcePrompt;
    const controls = document.createElement('div');
    controls.className = 'academy-occasion-route-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', host.language === 'ja' ? 'ときの前の形' : 'Form before toki');
    controls.append(
        routeChoice(model.id, round, 'affirmative', host),
        routeChoice(model.id, round, 'negative', host),
    );
    const output = document.createElement('div');
    output.className = 'academy-occasion-route-monitor academy-japanese';
    output.lang = 'ja';
    output.setAttribute('aria-live', 'polite');
    controls.addEventListener('change', () => updateMonitor(round, fieldset, output, host));
    fieldset.append(legend, controls, output);
    item.append(fieldset);
    updateMonitor(round, fieldset, output, host);
    return item;
}

function routeChoice(
    modelId: string,
    round: OccasionRouteRound,
    mode: OccasionRouteMode,
    host: ActivityHost,
): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = `academy-occasion-route-choice academy-occasion-route-${mode}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `${modelId}:${round.id}:mode`;
    input.value = mode;
    const title = document.createElement('strong');
    title.textContent = mode === 'affirmative'
        ? (host.language === 'ja' ? 'する・ある' : 'Action or state present')
        : (host.language === 'ja' ? 'しない・ない' : 'Action or state absent');
    const form = document.createElement('span');
    form.className = 'academy-japanese';
    form.lang = 'ja';
    form.textContent = mode === 'affirmative' ? round.affirmativeClause : round.negativeClause;
    label.append(input, title, form);
    return label;
}

function updateMonitor(
    round: OccasionRouteRound,
    fieldset: HTMLElement,
    output: HTMLElement,
    host: ActivityHost,
): void {
    const mode = fieldset.querySelector<HTMLInputElement>('input:checked')?.value;
    if (mode === 'affirmative' || mode === 'negative') {
        const occasion = mode === 'affirmative' ? round.affirmativeClause : round.negativeClause;
        output.textContent = `${occasion}、${round.mainClause}`;
    } else {
        output.textContent = host.language === 'ja'
            ? '二つの文をつなぐルートを選びます。'
            : 'Choose the route that joins the two source sentences.';
    }
}

function showRepairRows(
    model: OccasionRouteModel,
    list: HTMLElement,
    errorTags: readonly string[],
    host: ActivityHost,
): void {
    model.payload.rounds.forEach(round => {
        const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
        if (!item) return;
        const missed = errorTags.includes(round.errorTag);
        item.hidden = !missed;
        if (!missed || item.querySelector('.academy-occasion-route-hints')) return;
        item.append(renderHints(model.id, round, host));
    });
}

function renderHints(modelId: string, round: OccasionRouteRound, host: ActivityHost): HTMLElement {
    const root = document.createElement('section');
    root.className = 'academy-occasion-route-hints';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-secondary academy-occasion-route-hint';
    button.textContent = host.language === 'ja' ? 'ヒントを見る' : 'Show earned hint';
    const output = statusRegion('academy-occasion-route-hint-output');
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

function renderAnswerKey(model: OccasionRouteModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-occasion-route-key';
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

function responseFromForm(model: OccasionRouteModel, form: HTMLFormElement): OccasionRouteResponse | null {
    const data = new FormData(form);
    const routes = model.payload.rounds.map(round => {
        const mode = data.get(`${model.id}:${round.id}:mode`);
        return mode === 'affirmative' || mode === 'negative' ? { roundId: round.id, mode } : null;
    });
    return routes.every((route): route is OccasionRouteResponse['routes'][number] => route !== null)
        ? { routes }
        : null;
}

function resetForReplay(
    rounds: HTMLElement,
    form: HTMLFormElement,
    key: HTMLElement,
    returnButton: HTMLButtonElement,
    replayButton: HTMLButtonElement,
    language: 'ja' | 'en' | undefined,
): void {
    form.reset();
    form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(control => { control.disabled = false; });
    rounds.querySelectorAll<HTMLElement>('.academy-occasion-route-round').forEach(item => {
        item.hidden = false;
        item.querySelector('.academy-occasion-route-hints')?.remove();
        const monitor = item.querySelector<HTMLElement>('.academy-occasion-route-monitor');
        if (monitor) monitor.textContent = language === 'ja'
            ? '二つの文をつなぐルートを選びます。'
            : 'Choose the route that joins the two source sentences.';
    });
    key.hidden = true;
    returnButton.hidden = true;
    replayButton.hidden = true;
}
