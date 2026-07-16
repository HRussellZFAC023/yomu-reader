import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { assessedJapanese, localizedNodes, showEvaluation, statusRegion } from '../activity-kit/shared';
import type { KatakanaShapeRelayModel, KatakanaShapeRelayResponse } from './manifest';

export function renderKatakanaShapeRelay(
    model: KatakanaShapeRelayModel,
    host: ActivityHost,
    submit: (response: KatakanaShapeRelayResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const placements = new Map<string, string>();
    let activeRoundId = model.payload.rounds[0].id;
    let playback: { dispose(): void } | undefined;
    let playbackRequest = 0;
    let submitting = false;

    const root = document.createElement('section');
    root.className = 'academy-activity academy-katakana-shape-relay';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = document.createElement('div');
    teaching.className = 'academy-katakana-relay-teaching';
    for (const step of model.payload.teaching) {
        const block = document.createElement('article');
        const source = document.createElement('p');
        source.className = 'academy-source-record';
        source.textContent = step.sourceLabel;
        const pattern = document.createElement('p');
        pattern.className = 'academy-katakana-relay-pattern academy-japanese';
        pattern.lang = 'ja';
        pattern.textContent = step.pattern;
        const explanation = document.createElement('p');
        explanation.append(...localizedNodes(step.explanation));
        block.append(source, pattern, explanation);
        teaching.append(block);
    }
    const sources = document.createElement('div');
    sources.className = 'academy-katakana-relay-sources';
    for (const visual of model.payload.sourceVisuals) {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = visual.url;
        image.alt = host.language === 'ja' ? visual.label.ja : visual.label.en;
        image.loading = 'lazy';
        const caption = document.createElement('figcaption');
        caption.append(...localizedNodes(visual.label));
        figure.append(image, caption);
        sources.append(figure);
    }
    const audioNote = document.createElement('p');
    audioNote.className = 'academy-katakana-relay-audio-note';
    audioNote.textContent = host.language === 'ja'
        ? '音は、先生のPDF音声ではなく、よむの発音サポートです。'
        : 'Audio is Yomu pronunciation support, not an audio track from the Moodle PDFs.';
    const boardHeading = document.createElement('p');
    boardHeading.append(...localizedNodes(model.payload.stationLabel));
    const board = document.createElement('div');
    board.className = 'academy-katakana-relay-board';
    board.setAttribute('role', 'group');
    const tileHeading = document.createElement('p');
    tileHeading.append(...localizedNodes(model.payload.tileLabel));
    const tiles = document.createElement('div');
    tiles.className = 'academy-katakana-relay-tiles';
    tiles.setAttribute('role', 'group');
    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.className = 'academy-button academy-button-primary academy-katakana-relay-submit';
    submitButton.textContent = host.language === 'ja' ? '五つの札を確認' : 'Check five relay tiles';
    const status = statusRegion('academy-katakana-relay-status');
    const feedback = statusRegion('academy-katakana-relay-feedback');
    root.append(heading, teaching, sources, audioNote, boardHeading, board, tileHeading, tiles, submitButton, status, feedback);
    host.replace(root);

    const activeRound = () => model.payload.rounds.find(round => round.id === activeRoundId)!;
    const usedTiles = () => new Set(placements.values());
    const render = (): void => {
        board.replaceChildren(...model.payload.rounds.map((round, index) => {
            const station = document.createElement('button');
            station.type = 'button';
            station.className = 'academy-katakana-relay-station';
            station.dataset.active = String(round.id === activeRoundId);
            const number = document.createElement('span');
            number.className = 'academy-katakana-relay-number';
            number.textContent = String(index + 1);
            const value = document.createElement('span');
            value.className = 'academy-katakana-relay-value academy-japanese';
            value.lang = 'ja';
            const selected = placements.get(round.id);
            value.textContent = selected ? model.payload.rounds.find(candidate => candidate.id === selected)?.kana ?? '' : '·';
            station.setAttribute('aria-label', host.language === 'ja'
                ? `${index + 1}番の音を聞く。${selected ? `${value.textContent}を置きました。` : '札はまだです。'}`
                : `Listen to relay signal ${index + 1}. ${selected ? `${value.textContent} placed.` : 'Tile not placed.'}`);
            station.append(number, value);
            station.addEventListener('click', () => selectStation(round.id), { signal: lifecycle.signal });
            return station;
        }));
        tiles.replaceChildren(...model.payload.rounds.map(round => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'academy-katakana-relay-tile';
            tile.dataset.kanaId = round.id;
            tile.disabled = submitting || (usedTiles().has(round.id) && placements.get(activeRoundId) !== round.id);
            tile.setAttribute('aria-label', host.language === 'ja' ? `${round.kana}の札を置く` : `Place ${round.kana}`);
            tile.append(assessedJapanese(round.kana));
            tile.addEventListener('click', () => placeTile(round.id), { signal: lifecycle.signal });
            return tile;
        }));
        submitButton.disabled = submitting || placements.size !== model.payload.rounds.length;
    };

    const selectStation = (roundId: string): void => {
        if (submitting) return;
        activeRoundId = roundId;
        playbackRequest += 1;
        playback?.dispose();
        playback = undefined;
        render();
        const round = activeRound();
        status.textContent = host.language === 'ja' ? '音を再生しています…' : 'Playing relay signal…';
        const request = ++playbackRequest;
        const start = host.playPronunciation
            ? host.playPronunciation(round.kana, round.kana)
            : browserPronunciation(round.kana);
        void start.then(disposable => {
            if (lifecycle.signal.aborted || request !== playbackRequest) {
                disposable.dispose();
                return;
            }
            playback = disposable;
            status.textContent = host.language === 'ja' ? 'もう一度聞くには、この番号を押します。' : 'Press this relay signal to hear it again.';
        }).catch(() => {
            if (request === playbackRequest) status.textContent = host.language === 'ja' ? '音声を再生できません。' : 'Audio is unavailable.';
        });
    };

    const placeTile = (kanaId: string): void => {
        if (submitting) return;
        const previous = placements.get(activeRoundId);
        if (previous === kanaId) placements.delete(activeRoundId);
        else placements.set(activeRoundId, kanaId);
        render();
        status.textContent = host.language === 'ja' ? '札を置きました。番号を押すと音を聞き直せます。' : 'Tile placed. Press a relay signal to listen again.';
    };

    submitButton.addEventListener('click', () => {
        if (submitting || placements.size !== model.payload.rounds.length) return;
        submitting = true;
        render();
        status.textContent = host.language === 'ja' ? '五つの札を確認しています…' : 'Checking five relay tiles…';
        const response: KatakanaShapeRelayResponse = {
            placements: model.payload.rounds.map(round => ({ roundId: round.id, kanaId: placements.get(round.id)! })),
        };
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            status.textContent = '';
            showEvaluation(feedback, evaluation, host);
        }).catch(error => {
            submitting = false;
            render();
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    render();
    return {
        focus() { board.querySelector<HTMLButtonElement>('button')?.focus(); },
        dispose() { lifecycle.abort(); playback?.dispose(); root.remove(); },
    };
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
