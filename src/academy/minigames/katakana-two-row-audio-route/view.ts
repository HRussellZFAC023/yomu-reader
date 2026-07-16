import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, showEvaluation, statusRegion } from '../activity-kit/shared';
import type { KatakanaTwoRowAudioRouteModel, KatakanaTwoRowAudioRouteResponse } from './manifest';

export function renderKatakanaTwoRowAudioRoute(
    model: KatakanaTwoRowAudioRouteModel,
    host: ActivityHost,
    submit: (response: KatakanaTwoRowAudioRouteResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const answers = new Map<string, string>();
    let activeIndex = 0;
    let playback: { dispose(): void } | undefined;
    let playbackRequest = 0;
    let submitting = false;

    const root = document.createElement('section');
    root.className = 'academy-activity academy-katakana-two-row-audio-route';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2'); heading.tabIndex = -1; heading.append(...localizedNodes(model.prompt));
    const teaching = document.createElement('div'); teaching.className = 'academy-katakana-route-teaching';
    for (const step of model.payload.teaching) {
        const card = document.createElement('article');
        const source = document.createElement('p'); source.className = 'academy-source-record'; source.textContent = step.sourceLabel;
        const pattern = document.createElement('p'); pattern.className = 'academy-katakana-route-pattern academy-japanese'; pattern.lang = 'ja'; pattern.textContent = step.pattern;
        const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
        card.append(source, pattern, explanation); teaching.append(card);
    }
    const sources = document.createElement('div'); sources.className = 'academy-katakana-route-sources';
    for (const visual of model.payload.sourceVisuals) {
        const figure = document.createElement('figure');
        const image = document.createElement('img'); image.src = visual.url; image.alt = host.language === 'ja' ? visual.label.ja : visual.label.en; image.loading = 'lazy';
        const caption = document.createElement('figcaption'); caption.append(...localizedNodes(visual.label));
        figure.append(image, caption); sources.append(figure);
    }
    const audioNote = document.createElement('p'); audioNote.className = 'academy-katakana-route-audio-note';
    audioNote.textContent = host.language === 'ja'
        ? '音は、先生のPDF音声ではなく、よむの発音サポートです。'
        : 'Audio is Yomu pronunciation support, not an audio track from the Moodle PDFs.';
    const routeHeading = document.createElement('p'); routeHeading.append(...localizedNodes(model.payload.routeLabel));
    const signals = document.createElement('div'); signals.className = 'academy-katakana-route-signals'; signals.setAttribute('role', 'group');
    const grid = document.createElement('div'); grid.className = 'academy-katakana-route-grid'; grid.setAttribute('role', 'group');
    const submitButton = document.createElement('button'); submitButton.type = 'button'; submitButton.className = 'academy-button academy-button-primary academy-katakana-route-submit'; submitButton.textContent = host.language === 'ja' ? '十の音の道順を確認' : 'Check the ten-signal route';
    const status = statusRegion('academy-katakana-route-status'); const feedback = statusRegion('academy-katakana-route-feedback');
    root.append(heading, teaching, sources, audioNote, routeHeading, signals, grid, submitButton, status, feedback);
    host.replace(root);

    const activeRound = () => model.payload.rounds[activeIndex];
    const cellId = (rowId: string, columnId: string) => `${rowId}:${columnId}`;
    const render = (): void => {
        signals.replaceChildren(...model.payload.rounds.map((round, index) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-route-signal';
            button.dataset.active = String(index === activeIndex); button.dataset.answered = String(answers.has(round.id)); button.disabled = submitting;
            button.textContent = host.language === 'ja' ? `音 ${index + 1}` : `Signal ${index + 1}`;
            button.setAttribute('aria-label', host.language === 'ja'
                ? `${index + 1}番の音を聞く${answers.has(round.id) ? '。道順を選びました。' : ''}`
                : `Listen to signal ${index + 1}${answers.has(round.id) ? '. Route coordinate chosen.' : ''}`);
            button.addEventListener('click', () => { activeIndex = index; playActive(); render(); }, { signal: lifecycle.signal });
            return button;
        }));
        const cells: HTMLElement[] = [];
        const corner = document.createElement('span'); corner.className = 'academy-katakana-route-grid-label'; corner.textContent = host.language === 'ja' ? '行 / 母音' : 'Row / vowel'; cells.push(corner);
        for (const column of model.payload.columns) {
            const label = document.createElement('span'); label.className = 'academy-katakana-route-grid-label'; label.textContent = column.label; cells.push(label);
        }
        for (const row of model.payload.rows) {
            const label = document.createElement('span'); label.className = 'academy-katakana-route-row-label'; label.append(...localizedNodes(row.label)); cells.push(label);
            for (const column of model.payload.columns) {
                const id = cellId(row.id, column.id); const selected = answers.get(activeRound().id) === id;
                const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-route-cell'; button.dataset.selected = String(selected); button.disabled = submitting;
                button.textContent = `${row.id.toUpperCase()}-${column.label.toUpperCase()}`;
                button.setAttribute('aria-label', host.language === 'ja' ? `${row.label.ja}、${column.label}の位置` : `${row.label.en}, ${column.label} position`);
                button.addEventListener('click', () => chooseCell(id), { signal: lifecycle.signal }); cells.push(button);
            }
        }
        grid.replaceChildren(...cells);
        submitButton.disabled = submitting || answers.size !== model.payload.rounds.length;
    };

    const playActive = (): void => {
        const round = activeRound();
        playbackRequest += 1; playback?.dispose(); playback = undefined;
        const request = playbackRequest; status.textContent = host.language === 'ja' ? '音を再生しています…' : 'Playing signal…';
        const start = host.playPronunciation ? host.playPronunciation(round.kana, round.kana) : browserPronunciation(round.kana);
        void start.then(disposable => {
            if (lifecycle.signal.aborted || request !== playbackRequest) { disposable.dispose(); return; }
            playback = disposable;
            status.textContent = host.language === 'ja' ? '聞こえた音の行と母音の位置を選びます。' : 'Choose the heard sound’s row and vowel coordinate.';
        }).catch(() => { if (request === playbackRequest) status.textContent = host.language === 'ja' ? '音声を再生できません。' : 'Audio is unavailable.'; });
    };

    const chooseCell = (selectedCellId: string): void => {
        if (submitting) return;
        answers.set(activeRound().id, selectedCellId);
        const next = model.payload.rounds.findIndex(round => !answers.has(round.id));
        if (next >= 0) activeIndex = next;
        status.textContent = next >= 0
            ? (host.language === 'ja' ? '道順を記録しました。次の音を聞きます。' : 'Route coordinate recorded. Listen to the next signal.')
            : (host.language === 'ja' ? '十の音の道順がそろいました。確認できます。' : 'All ten route coordinates are ready to check.');
        render();
        if (next >= 0) playActive();
    };

    submitButton.addEventListener('click', () => {
        if (submitting || answers.size !== model.payload.rounds.length) return;
        submitting = true; render();
        const response: KatakanaTwoRowAudioRouteResponse = {
            answers: model.payload.rounds.map(round => ({ roundId: round.id, cellId: answers.get(round.id)! })),
        };
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome; status.textContent = ''; showEvaluation(feedback, evaluation, host);
        }).catch(error => { submitting = false; render(); status.textContent = error instanceof Error ? error.message : String(error); });
    }, { signal: lifecycle.signal });

    render();
    return {
        focus() { signals.querySelector<HTMLButtonElement>('button')?.focus(); },
        dispose() { lifecycle.abort(); playback?.dispose(); root.remove(); },
    };
}

async function browserPronunciation(kana: string): Promise<{ dispose(): void }> {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('Browser speech is unavailable.');
    const utterance = new SpeechSynthesisUtterance(kana); utterance.lang = 'ja-JP'; speechSynthesis.speak(utterance);
    return { dispose: () => speechSynthesis.cancel() };
}
