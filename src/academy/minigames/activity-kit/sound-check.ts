import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityModel,
    ActivityPlugin,
    ValidationIssue,
} from '../../domain/activity-runtime';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import { setAcademyTooltip } from '../../ui/tooltip';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    reviewSeeds,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from './shared';

interface SoundRoundBase {
    readonly id: string;
    readonly cue: LocalizedText;
    readonly spokenText: string;
    readonly reading?: string;
    readonly errorTag: string;
}

export interface MoraSoundRound extends SoundRoundBase {
    readonly task: 'mora-tap';
    readonly expectedMora: number;
}

export interface ChoiceSoundRound extends SoundRoundBase {
    readonly task: 'choice';
    readonly options: readonly Readonly<{ id: string; label: string }>[];
    readonly correctOptionId: string;
}

export type SoundCheckRound = MoraSoundRound | ChoiceSoundRound;

export interface SoundCheckAnswer {
    readonly roundId: string;
    readonly value: number | string;
}

export interface SoundCheckResponse {
    readonly answers: readonly SoundCheckAnswer[];
}

export interface SoundCheckModel extends ActivityModel {
    readonly kind: 'academy-sound-check';
    readonly responseKind: 'listening-and-pronunciation';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly rounds: readonly SoundCheckRound[];
        readonly passScore: number;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

export const soundCheckPlugin: ActivityPlugin<SoundCheckModel, SoundCheckResponse> = {
    kind: 'academy-sound-check',
    validate: validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const correct = model.payload.rounds.filter((round, index) => {
            const answer = answers[index].value;
            return round.task === 'mora-tap'
                ? answer === round.expectedMora
                : answer === round.correctOptionId;
        });
        const missed = model.payload.rounds.filter(round => !correct.includes(round));
        return gradeFromScore(
            correct.length / model.payload.rounds.length,
            model.payload.passScore,
            missed.map(round => round.errorTag),
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return reviewSeeds(model.payload.reviewTargets, result, model.sourceQuestionId);
    },
};

function validate(model: SoundCheckModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'Assessed listening requires the answer-support contract.' });
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length === 0) {
        issues.push({ path: 'payload.rounds', message: 'At least one sound round is required.' });
        return issues;
    }
    const ids = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (!text(round.id) || ids.has(round.id)) issues.push({ path: `${path}.id`, message: 'Round ids must be stable and unique.' });
        ids.add(round.id);
        if (!text(round.cue.en) || !text(round.cue.ja)) issues.push({ path: `${path}.cue`, message: 'A bilingual sound cue is required.' });
        if (!text(round.spokenText)) issues.push({ path: `${path}.spokenText`, message: 'A Japanese pronunciation target is required.' });
        if (!text(round.errorTag)) issues.push({ path: `${path}.errorTag`, message: 'A deterministic error tag is required.' });
        if (round.task === 'mora-tap') {
            if (!Number.isInteger(round.expectedMora) || round.expectedMora < 1 || round.expectedMora > 20) {
                issues.push({ path: `${path}.expectedMora`, message: 'Mora count must be an integer from 1 to 20.' });
            }
        } else {
            const optionIds = new Set(round.options.map((option: Readonly<{ id: string }>) => option.id));
            if (round.options.length < 2 || optionIds.size !== round.options.length || !optionIds.has(round.correctOptionId)) {
                issues.push({ path: `${path}.options`, message: 'Choice rounds need unique options and one matching answer.' });
            }
        }
    });
    validatePassScore(model.payload.passScore, issues);
    validateFeedback(model.payload.feedback, issues);
    validateReviewTargets(model.payload.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(
    model: SoundCheckModel,
    host: ActivityHost,
    submit: (response: SoundCheckResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-sound-check';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const transport = document.createElement('div');
    transport.className = 'academy-sound-transport';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-sound-play';
    play.textContent = '▶';
    const nowPlaying = statusRegion('academy-sound-now-playing');
    const roundHost = document.createElement('div');
    roundHost.className = 'academy-sound-round';
    const feedback = statusRegion('academy-kit-feedback');
    transport.append(play, nowPlaying);
    root.append(heading, transport, roundHost, feedback);
    host.replace(root);

    const answers: SoundCheckAnswer[] = [];
    let index = 0;
    let playback: { dispose(): void } | undefined;
    let submitting = false;

    const current = (): SoundCheckRound => model.payload.rounds[index];
    const setPlayLabel = (): void => {
        const label = host.language === 'ja' ? '音声を再生' : 'Play Japanese audio';
        setAcademyTooltip(play, label);
    };
    setPlayLabel();

    play.addEventListener('click', () => {
        playback?.dispose();
        play.disabled = true;
        nowPlaying.textContent = host.language === 'ja' ? '再生しています…' : 'Playing…';
        const round = current();
        const start = host.playPronunciation
            ? host.playPronunciation(round.spokenText, round.reading)
            : browserPronunciation(round.spokenText, round.reading);
        void start.then(disposable => {
            if (lifecycle.signal.aborted) {
                disposable.dispose();
                return;
            }
            playback = disposable;
            play.disabled = false;
            nowPlaying.textContent = host.language === 'ja' ? 'もう一度聞けます。' : 'Ready to replay.';
        }).catch(() => {
            play.disabled = false;
            nowPlaying.textContent = host.language === 'ja' ? '音声を再生できません。' : 'Audio is unavailable.';
        });
    }, { signal: lifecycle.signal });

    const record = (value: string | number): void => {
        if (submitting) return;
        answers.push({ roundId: current().id, value });
        host.announce(host.language === 'ja'
            ? `${model.payload.rounds.length}問中${index + 1}問を記録しました。`
            : `Recorded round ${index + 1} of ${model.payload.rounds.length}.`);
        index += 1;
        playback?.dispose();
        playback = undefined;
        nowPlaying.textContent = '';
        if (index < model.payload.rounds.length) {
            renderRound();
            queueMicrotask(() => roundHost.querySelector<HTMLElement>('button')?.focus());
            return;
        }
        submitting = true;
        play.disabled = true;
        roundHost.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
        void submit({ answers }).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(feedback, evaluation, host);
        }).catch(error => {
            submitting = false;
            play.disabled = false;
            feedback.textContent = error instanceof Error ? error.message : String(error);
        });
    };

    const renderRound = (): void => {
        const round = current();
        const progress = document.createElement('p');
        progress.className = 'academy-kit-progress';
        progress.textContent = host.language === 'ja'
            ? `${model.payload.rounds.length}問中${index + 1}問`
            : `Sound ${index + 1} of ${model.payload.rounds.length}`;
        const cue = document.createElement('p');
        cue.className = 'academy-sound-cue';
        cue.append(...localizedNodes(round.cue));
        const controls = round.task === 'mora-tap'
            ? renderMoraControls(host, record)
            : renderChoiceControls(round, record);
        roundHost.replaceChildren(progress, cue, controls);
    };

    renderRound();
    return {
        focus() { play.focus(); },
        dispose() {
            lifecycle.abort();
            playback?.dispose();
            root.remove();
        },
    };
}

function renderMoraControls(
    host: ActivityHost,
    record: (value: number) => void,
): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-mora-controls';
    const count = document.createElement('output');
    count.className = 'academy-mora-count';
    count.value = '0';
    count.setAttribute('aria-live', 'polite');
    const tap = document.createElement('button');
    tap.type = 'button';
    tap.className = 'academy-button academy-mora-tap';
    tap.textContent = host.language === 'ja' ? '拍をたたく' : 'Tap one mora';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'academy-button academy-button-quiet';
    reset.textContent = host.language === 'ja' ? 'やり直す' : 'Reset';
    const commit = document.createElement('button');
    commit.type = 'button';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '拍を確認' : 'Check rhythm';
    let taps = 0;
    const update = (): void => {
        count.value = String(taps);
        count.textContent = host.language === 'ja' ? `${taps}拍` : `${taps} mora`;
    };
    tap.addEventListener('click', () => { taps = Math.min(20, taps + 1); update(); });
    reset.addEventListener('click', () => { taps = 0; update(); tap.focus(); });
    commit.addEventListener('click', () => { if (taps > 0) record(taps); });
    update();
    root.append(count, tap, reset, commit);
    return root;
}

function renderChoiceControls(round: ChoiceSoundRound, record: (value: string) => void): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-sound-choices';
    root.setAttribute('role', 'group');
    round.options.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-sound-choice';
        button.append(assessedJapanese(option.label));
        button.addEventListener('click', () => record(option.id));
        root.append(button);
    });
    return root;
}

function parseResponse(model: SoundCheckModel, response: SoundCheckResponse): readonly SoundCheckAnswer[] {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every sound round needs one answer.');
    }
    return response.answers.map((answer, index) => {
        const round = model.payload.rounds[index];
        if (!answer || answer.roundId !== round.id) throw new TypeError('Sound answers must stay in round order.');
        if (round.task === 'mora-tap' && (!Number.isInteger(answer.value) || Number(answer.value) < 1)) {
            throw new TypeError('A mora round needs a positive tap count.');
        }
        if (round.task === 'choice' && !round.options.some(option => option.id === answer.value)) {
            throw new TypeError('A sound choice must use an authored option.');
        }
        return { roundId: answer.roundId, value: answer.value };
    });
}

async function browserPronunciation(term: string, reading?: string): Promise<{ dispose(): void }> {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        throw new Error('Browser speech is unavailable.');
    }
    const utterance = new SpeechSynthesisUtterance(reading || term);
    utterance.lang = 'ja-JP';
    speechSynthesis.speak(utterance);
    return { dispose: () => speechSynthesis.cancel() };
}
