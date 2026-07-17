import './style.css';

import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityPlugin,
    ValidationIssue,
} from '../../domain/activity-runtime';
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
    validateReviewTargets,
} from '../activity-kit/shared';
import { createClassActivitySession, scoreClassActivity } from './engine';
import type {
    ClassActivityResponse,
    ClassActivityRole,
    ClassActivitySimulatorModel,
    ClassActivityTurn,
} from './model';

export const classActivitySimulatorPlugin: ActivityPlugin<ClassActivitySimulatorModel, ClassActivityResponse> = {
    kind: 'academy-class-simulator',
    validate: validateClassActivitySimulator,
    render,
    grade(model, response) {
        const scored = scoreClassActivity(model, response);
        return gradeFromScore(scored.score, 1, scored.errorTags, model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return reviewSeeds(model.payload.reviewTargets, result, model.sourceQuestionId);
    },
};

function validateClassActivitySimulator(model: ClassActivitySimulatorModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const payload = model.payload;
    const formats = ['pair', 'group', 'info-gap', 'role-card', 'board', 'race'];
    if (!formats.includes(payload?.format)) issues.push({ path: 'payload.format', message: 'A supported class activity format is required.' });
    if (!text(payload?.location?.en) || !text(payload?.location?.ja)) issues.push({ path: 'payload.location', message: 'A bilingual grounded location is required.' });
    if (!text(payload?.source?.lessonPackageId) || !text(payload?.source?.exactPrompt)) {
        issues.push({ path: 'payload.source', message: 'Lesson identity and an exact source prompt are required.' });
    }
    if (payload?.source?.promptLanguage !== 'en' && payload?.source?.promptLanguage !== 'ja') {
        issues.push({ path: 'payload.source.promptLanguage', message: 'The exact prompt language is required.' });
    }
    const sourceItem = payload?.source?.evidenceItem;
    if (sourceItem && (!text(sourceItem.title) || !/^[a-f0-9]{64}$/u.test(sourceItem.payloadSha256))) {
        issues.push({ path: 'payload.source.evidenceItem', message: 'Source evidence needs its exact title and SHA-256.' });
    }
    const corpora = new Set(payload?.source?.mappings?.map(mapping => mapping.corpus) ?? []);
    if (!corpora.has('moodle') || !corpora.has('minna') || !corpora.has('genki')) {
        issues.push({ path: 'payload.source.mappings', message: 'Moodle, Minna, and Genki source axes must remain explicit.' });
    }
    const roles = payload?.roles ?? [];
    const roleIds = new Set<string>();
    for (const [index, role] of roles.entries()) {
        if (!text(role.id) || roleIds.has(role.id)) issues.push({ path: `payload.roles.${index}.id`, message: 'Role ids must be non-empty and unique.' });
        roleIds.add(role.id);
        if (!text(role.name) || !text(role.characterId) || !text(role.label?.en) || !text(role.label?.ja)) {
            issues.push({ path: `payload.roles.${index}`, message: 'Each role needs a character, name, and bilingual label.' });
        }
    }
    const learners = roles.filter(role => role.controller === 'learner');
    const classmates = roles.filter(role => role.controller === 'classmate');
    if (learners.length !== 1 || classmates.length < 1) issues.push({ path: 'payload.roles', message: 'Use one learner role and at least one simulated classmate.' });
    if (payload?.format === 'pair' && roles.length !== 2) issues.push({ path: 'payload.roles', message: 'Pair work requires exactly two roles.' });
    if (payload?.format === 'group' && roles.length < 3) issues.push({ path: 'payload.roles', message: 'Group work requires at least three roles.' });
    if (payload?.format === 'info-gap' && roles.filter(role => role.privateCard).length < 2) {
        issues.push({ path: 'payload.roles', message: 'Information gaps require at least two private cards.' });
    }
    if (payload?.format === 'role-card' && roles.some(role => !role.privateCard)) {
        issues.push({ path: 'payload.roles', message: 'Every role-card participant needs a private card.' });
    }

    const turns = payload?.turns ?? [];
    const turnIds = new Set<string>();
    let previousActor = '';
    for (const [index, turn] of turns.entries()) {
        if (!text(turn.id) || turnIds.has(turn.id)) issues.push({ path: `payload.turns.${index}.id`, message: 'Turn ids must be non-empty and unique.' });
        turnIds.add(turn.id);
        const role = roles.find(candidate => candidate.id === turn.actorRoleId);
        if (!role) issues.push({ path: `payload.turns.${index}.actorRoleId`, message: 'Turn actor must reference a role.' });
        if (turn.kind === 'classmate' && role?.controller !== 'classmate') issues.push({ path: `payload.turns.${index}`, message: 'Classmate turns must use simulated roles.' });
        if (turn.kind !== 'classmate' && role?.controller !== 'learner') issues.push({ path: `payload.turns.${index}`, message: 'Learner turns must use the learner role.' });
        if (turn.kind === 'classmate' && (!text(turn.line?.en) || !text(turn.line?.ja))) issues.push({ path: `payload.turns.${index}.line`, message: 'Classmate dialogue must be bilingual.' });
        if (turn.kind === 'learner-choice') {
            if (!turn.options.length || !turn.acceptedOptionIds.length) issues.push({ path: `payload.turns.${index}`, message: 'Choice turns need options and accepted ids.' });
            if (turn.acceptedOptionIds.some(id => !turn.options.some(option => option.id === id))) issues.push({ path: `payload.turns.${index}.acceptedOptionIds`, message: 'Accepted ids must reference options.' });
        }
        if (turn.kind === 'learner-text' && !turn.acceptedAnswers?.length && !turn.requiredGroups?.length) {
            issues.push({ path: `payload.turns.${index}`, message: 'Text turns need exact answers or required term groups.' });
        }
        if (turn.kind !== 'classmate' && (!text(turn.evidence?.conceptId) || !model.conceptIds.includes(turn.evidence.conceptId) || !text(turn.evidence.errorTag))) {
            issues.push({ path: `payload.turns.${index}.evidence`, message: 'Learner turns need model-owned concept evidence and an error tag.' });
        }
        if (payload?.format === 'group' && previousActor === turn.actorRoleId) issues.push({ path: `payload.turns.${index}.actorRoleId`, message: 'Group turns must rotate speakers.' });
        previousActor = turn.actorRoleId;
    }
    if (!turns.length || !turns.some(turn => turn.kind !== 'classmate')) issues.push({ path: 'payload.turns', message: 'Ordered turns need learner evidence.' });

    if (payload?.format === 'board') {
        const spaces = payload.board?.spaces ?? [];
        const spaceIds = new Set(spaces.map(space => space.id));
        if (spaces.length < 3) issues.push({ path: 'payload.board.spaces', message: 'Board activities need at least three spaces.' });
        if (turns.some(turn => !turn.boardSpaceId || !spaceIds.has(turn.boardSpaceId))) issues.push({ path: 'payload.turns.boardSpaceId', message: 'Every board turn must occupy a declared space.' });
    } else if (payload?.board) issues.push({ path: 'payload.board', message: 'Board data belongs only to board activities.' });
    if (payload?.format === 'race') {
        if (payload.race?.pace !== 'untimed') issues.push({ path: 'payload.race.pace', message: 'Solo race activities must provide the untimed path.' });
        const checkpoints = payload.race?.checkpointCount ?? 0;
        if (checkpoints < 2 || turns.some(turn => !turn.checkpoint || turn.checkpoint > checkpoints)) {
            issues.push({ path: 'payload.race', message: 'Every race turn needs a valid checkpoint.' });
        }
    } else if (payload?.race) issues.push({ path: 'payload.race', message: 'Race data belongs only to race activities.' });
    validateFeedback(payload?.feedback, issues);
    validateReviewTargets(payload?.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(
    model: ClassActivitySimulatorModel,
    host: ActivityHost,
    submit: (response: ClassActivityResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-class-simulator';
    root.dataset.activityId = model.id;
    root.dataset.classFormat = model.payload.format;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const source = document.createElement('blockquote');
    source.className = 'academy-class-source-prompt';
    source.lang = model.payload.source.promptLanguage;
    source.dataset.jpdbReaderSurfaceIgnore = '';
    source.textContent = model.payload.source.exactPrompt;
    const provenance = document.createElement('p');
    provenance.className = 'academy-class-provenance';
    provenance.textContent = model.payload.source.mappings.map(mapping => mapping.reference).join(' · ');
    const location = document.createElement('p');
    location.className = 'academy-class-location';
    location.append(...localizedNodes(model.payload.location));
    const roster = renderRoster(model.payload.roles, host.language, lifecycle.signal);
    const formatSurface = renderFormatSurface(model);
    const transcript = document.createElement('ol');
    transcript.className = 'academy-class-transcript';
    transcript.setAttribute('aria-label', host.language === 'ja' ? '会話の記録' : 'Conversation transcript');
    const turnHost = document.createElement('div');
    turnHost.className = 'academy-class-turn';
    const status = statusRegion('academy-kit-feedback');
    status.id = `${model.id}-status`;
    root.append(heading, location, source, provenance, roster, formatSurface, transcript, turnHost, status);
    host.replace(root);

    let session = createClassActivitySession(model);
    const draw = (): void => {
        transcript.replaceChildren(...session.transcript.map(entry => {
            const item = document.createElement('li');
            const speaker = document.createElement('strong');
            speaker.textContent = `${entry.role.name}: `;
            const line = document.createElement('span');
            line.lang = entry.language;
            line.dataset.yomuRuntimeSurface = 'academy-activity';
            line.textContent = entry.text;
            item.append(speaker, line);
            return item;
        }));
        updateFormatSurface(formatSurface, model, session.currentTurn);
        turnHost.replaceChildren();
        const turn = session.currentTurn;
        if (!turn) {
            const commit = button(host.language === 'ja' ? '活動を確認' : 'Check activity');
            commit.classList.add('academy-button-primary');
            commit.addEventListener('click', () => {
                setPending(root, true);
                void submit(session.response).then(evaluation => {
                    root.dataset.outcome = evaluation.result.outcome;
                    showEvaluation(status, evaluation, host);
                    if (evaluation.result.outcome === 'lapse') {
                        const retry = button(host.language === 'ja' ? 'もう一度' : 'Try again');
                        retry.addEventListener('click', () => {
                            session = createClassActivitySession(model);
                            delete root.dataset.outcome;
                            status.replaceChildren();
                            setPending(root, false);
                            draw();
                        }, { signal: lifecycle.signal, once: true });
                        status.append(retry);
                        retry.focus();
                    }
                }).catch(error => {
                    setPending(root, false);
                    status.textContent = error instanceof Error ? error.message : String(error);
                    commit.focus();
                });
            }, { signal: lifecycle.signal });
            turnHost.append(commit);
            commit.focus();
            return;
        }
        turnHost.append(renderTurn(turn, model.payload.roles, host, () => {
            session.continueClassmate();
            host.announce(host.language === 'ja' ? 'クラスメートの番が終わりました。' : 'Classmate turn complete.');
            draw();
        }, value => {
            try {
                session.answer(value);
                host.announce(host.language === 'ja' ? 'あなたの答えを記録しました。' : 'Your turn was recorded.');
                draw();
            } catch (error) {
                status.replaceChildren(assessedJapanese(error instanceof Error ? error.message : String(error)));
            }
        }, lifecycle.signal));
        turnHost.querySelector<HTMLElement>('button, input')?.focus();
    };
    draw();
    return {
        focus() { root.querySelector<HTMLElement>('button, input, h2')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderRoster(
    roles: readonly ClassActivityRole[],
    language: ActivityHost['language'],
    signal: AbortSignal,
): HTMLElement {
    const roster = document.createElement('ul');
    roster.className = 'academy-class-roster';
    roster.setAttribute('aria-label', language === 'ja' ? '活動の役割' : 'Activity roles');
    for (const role of roles) {
        const item = document.createElement('li');
        item.dataset.controller = role.controller;
        const name = document.createElement('strong');
        name.textContent = role.name;
        const label = document.createElement('span');
        label.append(...localizedNodes(role.label));
        item.append(name, label);
        if (role.privateCard && role.controller === 'learner') {
            const show = language === 'ja' ? '役割カードを見る' : 'Show role card';
            const hide = language === 'ja' ? '役割カードを隠す' : 'Hide role card';
            const reveal = button(show);
            reveal.setAttribute('aria-expanded', 'false');
            const card = document.createElement('p');
            card.className = 'academy-class-private-card';
            card.hidden = true;
            card.append(...localizedNodes(role.privateCard));
            reveal.addEventListener('click', () => {
                card.hidden = !card.hidden;
                reveal.setAttribute('aria-expanded', String(!card.hidden));
                reveal.textContent = card.hidden ? show : hide;
            }, { signal });
            item.append(reveal, card);
        } else if (role.privateCard) {
            const held = document.createElement('span');
            held.className = 'academy-class-held-card';
            held.textContent = language === 'ja' ? 'クラスメートが持つ非公開カード' : 'Private card held by classmate';
            item.append(held);
        }
        roster.append(item);
    }
    return roster;
}

function renderTurn(
    turn: ClassActivityTurn,
    roles: readonly ClassActivityRole[],
    host: ActivityHost,
    continueClassmate: () => void,
    answer: (value: string) => void,
    signal: AbortSignal,
): HTMLElement {
    const section = document.createElement('section');
    const role = roles.find(candidate => candidate.id === turn.actorRoleId);
    const title = document.createElement('h3');
    title.textContent = host.language === 'ja'
        ? `${role?.name ?? turn.actorRoleId}の番`
        : `${role?.name ?? turn.actorRoleId}'s turn`;
    section.append(title);
    if (turn.kind === 'classmate') {
        const cue = document.createElement('p');
        cue.append(...localizedNodes(turn.line));
        const next = button(host.language === 'ja' ? `${role?.name ?? '相手'}の話を聞く` : `Hear ${role?.name ?? 'classmate'}`);
        next.addEventListener('click', continueClassmate, { signal, once: true });
        section.append(cue, next);
        return section;
    }
    const prompt = document.createElement('p');
    prompt.append(...localizedNodes(turn.prompt));
    section.append(prompt);
    if (turn.kind === 'learner-choice') {
        const options = document.createElement('div');
        options.className = 'academy-class-options';
        for (const option of turn.options) {
            const choose = button('');
            choose.replaceChildren(assessedJapanese(option.label.ja));
            choose.addEventListener('click', () => answer(option.id), { signal, once: true });
            options.append(choose);
        }
        section.append(options);
    } else {
        const form = document.createElement('form');
        const label = document.createElement('label');
        label.append(...localizedNodes(turn.inputLabel));
        const input = document.createElement('input');
        input.type = 'text';
        input.lang = 'ja';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.dataset.jpdbReaderSurfaceIgnore = '';
        const send = button(host.language === 'ja' ? '答える' : 'Take turn');
        send.type = 'submit';
        label.append(input);
        form.append(label, send);
        form.addEventListener('submit', event => { event.preventDefault(); answer(input.value); }, { signal });
        section.append(form);
    }
    return section;
}

function renderFormatSurface(model: ClassActivitySimulatorModel): HTMLElement {
    const surface = document.createElement('div');
    surface.className = 'academy-class-format-surface';
    surface.setAttribute('aria-label', `${model.payload.format} activity progress`);
    if (model.payload.format === 'board') {
        surface.replaceChildren(...(model.payload.board?.spaces ?? []).map(space => {
            const cell = document.createElement('span');
            cell.dataset.spaceId = space.id;
            cell.append(...localizedNodes(space.label));
            return cell;
        }));
    } else if (model.payload.format === 'race') {
        const label = document.createElement('p');
        label.append(...localizedNodes(model.payload.race!.finishLabel));
        const meter = document.createElement('progress');
        meter.max = model.payload.race!.checkpointCount;
        meter.value = 0;
        meter.setAttribute('aria-label', 'Untimed race checkpoints');
        surface.append(label, meter);
    } else {
        const label = document.createElement('p');
        label.textContent = `${model.payload.format.replace('-', ' ')} · ${model.payload.roles.length} roles`;
        surface.append(label);
    }
    return surface;
}

function updateFormatSurface(surface: HTMLElement, model: ClassActivitySimulatorModel, turn: ClassActivityTurn | null): void {
    if (model.payload.format === 'board') {
        for (const cell of surface.querySelectorAll<HTMLElement>('[data-space-id]')) {
            cell.toggleAttribute('data-current', cell.dataset.spaceId === turn?.boardSpaceId);
        }
    }
    if (model.payload.format === 'race') {
        const meter = surface.querySelector<HTMLProgressElement>('progress');
        if (meter) meter.value = turn?.checkpoint ? Math.max(0, turn.checkpoint - 1) : meter.max;
    }
}

function button(label: string): HTMLButtonElement {
    const result = document.createElement('button');
    result.type = 'button';
    result.className = 'academy-button';
    result.textContent = label;
    return result;
}

export { createClassActivitySession } from './engine';
export type * from './model';
