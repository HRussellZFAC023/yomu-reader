import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import {
    assessedJapanese,
    localizedNodes,
    showEvaluation,
    statusRegion,
} from '../activity-kit/shared';
import { createKanaSoundMapSession } from './engine';
import type { KanaSoundMapModel, KanaSoundMapResponse } from './manifest';
import { setAcademyTooltip } from '../../ui/tooltip';

export function renderKanaSoundMap(
    model: KanaSoundMapModel,
    host: ActivityHost,
    submit: (response: KanaSoundMapResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const session = createKanaSoundMapSession(model);
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kana-sound-map';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const map = document.createElement('ol');
    map.className = 'academy-kana-sound-map-route';
    map.setAttribute('aria-label', host.language === 'ja' ? '五つの音の進み具合' : 'Five-sound progress');
    const transport = document.createElement('div');
    transport.className = 'academy-kana-sound-map-transport';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'academy-kana-sound-map-play';
    play.textContent = '▶';
    const playLabel = host.language === 'ja' ? '今の音を再生' : 'Play current sound';
    setAcademyTooltip(play, playLabel);
    const playbackStatus = statusRegion('academy-kana-sound-map-playback');
    transport.append(play, playbackStatus);
    const choiceHeading = document.createElement('p');
    choiceHeading.id = `${model.id}-choices`;
    choiceHeading.append(...localizedNodes(model.payload.choiceLabel));
    const choices = document.createElement('div');
    choices.className = 'academy-kana-sound-map-choices';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', choiceHeading.id);
    const status = statusRegion('academy-kana-sound-map-status');
    const feedback = statusRegion('academy-kana-sound-map-feedback');
    root.append(heading, map, transport, choiceHeading, choices, status, feedback);
    host.replace(root);

    let playback: { dispose(): void } | undefined;
    let playbackRequest = 0;
    let submitting = false;

    const renderMap = (): void => {
        const state = session.snapshot();
        map.replaceChildren(...model.payload.items.map((_, index) => {
            const position = document.createElement('li');
            position.className = 'academy-kana-sound-map-position';
            const selection = state.selections[index];
            const number = document.createElement('span');
            number.className = 'academy-kana-sound-map-number';
            number.textContent = String(index + 1);
            const value = document.createElement('span');
            value.className = 'academy-kana-sound-map-value';
            value.textContent = selection
                ? model.payload.items.find(candidate => candidate.id === selection.kanaId)?.kana ?? ''
                : '·';
            value.lang = selection ? 'ja' : '';
            position.dataset.state = selection ? 'committed' : index === state.index ? 'active' : 'waiting';
            position.setAttribute('aria-label', selection
                ? localized(host, `Sound ${index + 1}: committed ${value.textContent}`, `${index + 1}番の音：${value.textContent}を記録`)
                : localized(host, `Sound ${index + 1}: ${index === state.index ? 'current' : 'waiting'}`, `${index + 1}番の音：${index === state.index ? '今' : '待機'}`));
            position.append(number, value);
            return position;
        }));
    };

    const setDisabled = (disabled: boolean): void => {
        play.disabled = disabled;
        choices.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = disabled; });
    };

    const submitCompleted = (): void => {
        if (submitting) return;
        submitting = true;
        setDisabled(true);
        feedback.replaceChildren();
        status.textContent = localized(host, 'Checking all five choices…', '五つの答えを確認しています…');
        void submit(session.response()).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            status.textContent = '';
            showEvaluation(feedback, evaluation, host);
        }).catch(error => {
            submitting = false;
            status.textContent = '';
            const message = document.createElement('p');
            message.textContent = error instanceof Error ? error.message : String(error);
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'academy-button academy-button-primary academy-kana-sound-map-retry';
            retry.textContent = localized(host, 'Try submitting again', 'もう一度送信する');
            retry.addEventListener('click', submitCompleted, { signal: lifecycle.signal });
            feedback.replaceChildren(message, retry);
            host.announce(message.textContent);
            retry.focus();
        });
    };

    const choose = (kanaId: string): void => {
        if (submitting || session.snapshot().complete) return;
        const state = session.select(kanaId);
        playbackRequest += 1;
        playback?.dispose();
        playback = undefined;
        play.disabled = false;
        playbackStatus.textContent = '';
        renderMap();
        host.announce(localized(
            host,
            `Recorded sound ${state.index} of ${state.total}.`,
            `${state.total}問中${state.index}問を記録しました。`,
        ));
        if (!state.complete) {
            status.textContent = localized(host, 'Choice recorded. Listen to the next sound.', '記録しました。次の音を聞いてください。');
            play.focus();
            return;
        }
        submitCompleted();
    };

    for (const item of model.payload.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-kana-sound-map-choice';
        button.dataset.kanaId = item.id;
        button.setAttribute('aria-label', localized(host, `Choose ${item.kana}`, `${item.kana}を選ぶ`));
        button.append(assessedJapanese(item.kana));
        button.addEventListener('click', () => choose(item.id), { signal: lifecycle.signal });
        choices.append(button);
    }
    choices.addEventListener('keydown', event => moveChoiceFocus(event, choices), { signal: lifecycle.signal });

    play.addEventListener('click', () => {
        const state = session.snapshot();
        if (state.complete) return;
        const item = model.payload.items[state.index];
        const request = ++playbackRequest;
        playback?.dispose();
        play.disabled = true;
        playbackStatus.textContent = localized(host, `Playing sound ${state.index + 1}…`, `${state.index + 1}番の音を再生しています…`);
        const start = host.playPronunciation
            ? host.playPronunciation(item.kana, item.kana)
            : browserPronunciation(item.kana);
        void start.then(disposable => {
            if (lifecycle.signal.aborted || request !== playbackRequest) {
                disposable.dispose();
                return;
            }
            playback = disposable;
            play.disabled = false;
            playbackStatus.textContent = localized(host, 'Ready to replay.', 'もう一度聞けます。');
        }).catch(() => {
            if (request !== playbackRequest) return;
            play.disabled = false;
            playbackStatus.textContent = localized(host, 'Audio is unavailable.', '音声を再生できません。');
        });
    }, { signal: lifecycle.signal });

    renderMap();
    return {
        focus() { play.focus(); },
        dispose() {
            lifecycle.abort();
            playback?.dispose();
            root.remove();
        },
    };
}

function moveChoiceFocus(event: KeyboardEvent, root: HTMLElement): void {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const choices = [...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!choices.length) return;
    const current = Math.max(0, choices.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === 'Home' ? 0
        : event.key === 'End' ? choices.length - 1
            : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? (current + 1) % choices.length
                : (current - 1 + choices.length) % choices.length;
    event.preventDefault();
    choices[next].focus();
}

async function browserPronunciation(kana: string): Promise<{ dispose(): void }> {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        throw new Error('Browser speech is unavailable.');
    }
    const utterance = new SpeechSynthesisUtterance(kana);
    utterance.lang = 'ja-JP';
    speechSynthesis.speak(utterance);
    return { dispose: () => speechSynthesis.cancel() };
}

function localized(host: ActivityHost, en: string, ja: string): string {
    return host.language === 'ja' ? ja : en;
}
