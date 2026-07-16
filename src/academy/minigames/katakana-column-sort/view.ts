import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { assessedJapanese, localizedNodes, showEvaluation, statusRegion } from '../activity-kit/shared';
import type { KatakanaColumnSortModel, KatakanaColumnSortResponse } from './manifest';

export function renderKatakanaColumnSort(
    model: KatakanaColumnSortModel,
    host: ActivityHost,
    submit: (response: KatakanaColumnSortResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const placements = new Map<string, string>();
    let selectedKanaId: string | undefined;
    let playback: { dispose(): void } | undefined;
    let playbackRequest = 0;
    let submitting = false;

    const root = document.createElement('section');
    root.className = 'academy-activity academy-katakana-column-sort';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = document.createElement('div');
    teaching.className = 'academy-katakana-sort-teaching';
    for (const step of model.payload.teaching) {
        const card = document.createElement('article');
        const source = document.createElement('p'); source.className = 'academy-source-record'; source.textContent = step.sourceLabel;
        const pattern = document.createElement('p'); pattern.className = 'academy-katakana-sort-pattern academy-japanese'; pattern.lang = 'ja'; pattern.textContent = step.pattern;
        const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
        card.append(source, pattern, explanation); teaching.append(card);
    }
    const sources = document.createElement('div');
    sources.className = 'academy-katakana-sort-sources';
    for (const visual of model.payload.sourceVisuals) {
        const figure = document.createElement('figure');
        const image = document.createElement('img'); image.src = visual.url; image.alt = host.language === 'ja' ? visual.label.ja : visual.label.en; image.loading = 'lazy';
        const caption = document.createElement('figcaption'); caption.append(...localizedNodes(visual.label));
        figure.append(image, caption); sources.append(figure);
    }
    const audioNote = document.createElement('p');
    audioNote.className = 'academy-katakana-sort-audio-note';
    audioNote.textContent = host.language === 'ja'
        ? '音は、先生のPDF音声ではなく、よむの発音サポートです。'
        : 'Audio is Yomu pronunciation support, not an audio track from the Moodle PDFs.';
    const signalHeading = document.createElement('p'); signalHeading.append(...localizedNodes(model.payload.signalLabel));
    const signals = document.createElement('div'); signals.className = 'academy-katakana-sort-signals'; signals.setAttribute('role', 'group');
    const tileHeading = document.createElement('p'); tileHeading.append(...localizedNodes(model.payload.tileLabel));
    const tiles = document.createElement('div'); tiles.className = 'academy-katakana-sort-tiles'; tiles.setAttribute('role', 'group');
    const columns = document.createElement('div'); columns.className = 'academy-katakana-sort-columns'; columns.setAttribute('role', 'group');
    const submitButton = document.createElement('button'); submitButton.type = 'button'; submitButton.className = 'academy-button academy-button-primary academy-katakana-sort-submit'; submitButton.textContent = host.language === 'ja' ? 'カ行を確認' : 'Check ka row';
    const status = statusRegion('academy-katakana-sort-status');
    const feedback = statusRegion('academy-katakana-sort-feedback');
    root.append(heading, teaching, sources, audioNote, signalHeading, signals, tileHeading, tiles, columns, submitButton, status, feedback);
    host.replace(root);

    const placedIn = (columnId: string) => [...placements.entries()].find(([, value]) => value === columnId)?.[0];
    const render = (): void => {
        signals.replaceChildren(...model.payload.rounds.map((round, index) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-sort-signal'; button.disabled = submitting;
            button.textContent = host.language === 'ja' ? `音 ${index + 1}` : `Signal ${index + 1}`;
            button.setAttribute('aria-label', host.language === 'ja' ? `${index + 1}番の音を聞く` : `Listen to signal ${index + 1}`);
            button.addEventListener('click', () => play(round.kana), { signal: lifecycle.signal });
            return button;
        }));
        tiles.replaceChildren(...model.payload.rounds.map(round => {
            const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'academy-katakana-sort-tile'; tile.dataset.kanaId = round.id;
            tile.dataset.selected = String(selectedKanaId === round.id); tile.disabled = submitting || placements.has(round.id);
            tile.setAttribute('aria-label', host.language === 'ja' ? `${round.kana}の札を選ぶ` : `Select ${round.kana} tile`);
            tile.append(assessedJapanese(round.kana));
            tile.addEventListener('click', () => { selectedKanaId = round.id; status.textContent = host.language === 'ja' ? '母音の列を選びます。' : 'Choose its vowel column.'; render(); }, { signal: lifecycle.signal });
            return tile;
        }));
        columns.replaceChildren(...model.payload.columns.map(column => {
            const placed = placedIn(column.id);
            const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-sort-column'; button.dataset.columnId = column.id; button.disabled = submitting;
            button.setAttribute('aria-label', host.language === 'ja' ? `${column.label}の列${placed ? '。札があります。' : '。札はまだです。'}` : `${column.label} column${placed ? '. Tile placed.' : '. Empty.'}`);
            const label = document.createElement('span'); label.className = 'academy-katakana-sort-column-label'; label.textContent = column.label;
            const value = document.createElement('span'); value.className = 'academy-katakana-sort-column-value academy-japanese'; value.lang = 'ja'; value.textContent = placed ? model.payload.rounds.find(round => round.id === placed)?.kana ?? '' : '·';
            button.append(label, value);
            button.addEventListener('click', () => {
                if (!selectedKanaId) { status.textContent = host.language === 'ja' ? '先にカタカナ札を選びます。' : 'Select a katakana tile first.'; return; }
                const previous = placedIn(column.id);
                if (previous) placements.delete(previous);
                placements.set(selectedKanaId, column.id);
                selectedKanaId = undefined;
                status.textContent = host.language === 'ja' ? '札を列に置きました。' : 'Tile placed in the column.';
                render();
            }, { signal: lifecycle.signal });
            return button;
        }));
        submitButton.disabled = submitting || placements.size !== model.payload.rounds.length;
    };

    const play = (kana: string): void => {
        playbackRequest += 1; playback?.dispose(); playback = undefined;
        const request = playbackRequest;
        status.textContent = host.language === 'ja' ? '音を再生しています…' : 'Playing signal…';
        const start = host.playPronunciation ? host.playPronunciation(kana, kana) : browserPronunciation(kana);
        void start.then(disposable => {
            if (lifecycle.signal.aborted || request !== playbackRequest) { disposable.dispose(); return; }
            playback = disposable;
            status.textContent = host.language === 'ja' ? 'もう一度聞くには同じ音を押します。' : 'Press the same signal to hear it again.';
        }).catch(() => { if (request === playbackRequest) status.textContent = host.language === 'ja' ? '音声を再生できません。' : 'Audio is unavailable.'; });
    };

    submitButton.addEventListener('click', () => {
        if (submitting || placements.size !== model.payload.rounds.length) return;
        submitting = true; render();
        const response: KatakanaColumnSortResponse = { placements: [...placements.entries()].map(([kanaId, columnId]) => ({ kanaId, columnId })) };
        void submit(response).then(evaluation => { root.dataset.outcome = evaluation.result.outcome; status.textContent = ''; showEvaluation(feedback, evaluation, host); }).catch(error => {
            submitting = false; render(); status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    render();
    return { focus() { signals.querySelector<HTMLButtonElement>('button')?.focus(); }, dispose() { lifecycle.abort(); playback?.dispose(); root.remove(); } };
}

async function browserPronunciation(kana: string): Promise<{ dispose(): void }> {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('Browser speech is unavailable.');
    const utterance = new SpeechSynthesisUtterance(kana); utterance.lang = 'ja-JP'; speechSynthesis.speak(utterance);
    return { dispose: () => speechSynthesis.cancel() };
}
