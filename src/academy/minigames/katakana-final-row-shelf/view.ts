import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, showEvaluation, statusRegion } from '../activity-kit/shared';
import type { KatakanaFinalRowShelfModel, KatakanaFinalRowShelfResponse } from './manifest';

export function renderKatakanaFinalRowShelf(
    model: KatakanaFinalRowShelfModel,
    host: ActivityHost,
    submit: (response: KatakanaFinalRowShelfResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const placements = new Map<string, string>();
    let activeIndex = 0;
    let playback: { dispose(): void } | undefined;
    let playbackRequest = 0;
    let submitting = false;

    const root = document.createElement('section');
    root.className = 'academy-activity academy-katakana-final-row-shelf';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2'); heading.tabIndex = -1; heading.append(...localizedNodes(model.prompt));
    const teaching = document.createElement('div'); teaching.className = 'academy-katakana-shelf-teaching';
    for (const step of model.payload.teaching) {
        const card = document.createElement('article');
        const source = document.createElement('p'); source.className = 'academy-source-record'; source.textContent = step.sourceLabel;
        const pattern = document.createElement('p'); pattern.className = 'academy-katakana-shelf-pattern academy-japanese'; pattern.lang = 'ja'; pattern.textContent = step.pattern;
        const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
        card.append(source, pattern, explanation); teaching.append(card);
    }
    const sources = document.createElement('div'); sources.className = 'academy-katakana-shelf-sources';
    for (const visual of model.payload.sourceVisuals) {
        const figure = document.createElement('figure');
        const image = document.createElement('img'); image.src = visual.url; image.alt = host.language === 'ja' ? visual.label.ja : visual.label.en; image.loading = 'lazy';
        const caption = document.createElement('figcaption'); caption.append(...localizedNodes(visual.label));
        figure.append(image, caption); sources.append(figure);
    }
    const audioNote = document.createElement('p'); audioNote.className = 'academy-katakana-shelf-audio-note';
    audioNote.textContent = host.language === 'ja'
        ? '音は、先生のPDF音声ではなく、確認済みのよむ発音サポートです。'
        : 'Audio is verified Yomu pronunciation support, not an audio track from the Moodle PDFs.';
    const shelfHeading = document.createElement('p'); shelfHeading.append(...localizedNodes(model.payload.shelfMapLabel));
    const signals = document.createElement('div'); signals.className = 'academy-katakana-shelf-signals'; signals.setAttribute('role', 'group');
    const shelves = document.createElement('div'); shelves.className = 'academy-katakana-shelf-map';
    const submitButton = document.createElement('button'); submitButton.type = 'button'; submitButton.className = 'academy-button academy-button-primary academy-katakana-shelf-submit'; submitButton.textContent = host.language === 'ja' ? '十六の音の置き場を確認' : 'Check sixteen signal placements';
    const status = statusRegion('academy-katakana-shelf-status'); const feedback = statusRegion('academy-katakana-shelf-feedback');
    root.append(heading, teaching, sources, audioNote, shelfHeading, signals, shelves, submitButton, status, feedback);
    host.replace(root);

    const activeRound = () => model.payload.rounds[activeIndex];
    const placedSignalFor = (slotId: string) => model.payload.rounds.find(round => placements.get(round.id) === slotId);
    const render = (): void => {
        signals.replaceChildren(...model.payload.rounds.map((round, index) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-shelf-signal';
            button.dataset.active = String(index === activeIndex); button.dataset.answered = String(placements.has(round.id)); button.disabled = submitting;
            button.textContent = host.language === 'ja' ? `音 ${index + 1}` : `Signal ${index + 1}`;
            button.setAttribute('aria-label', host.language === 'ja'
                ? `${index + 1}番の音を聞く${placements.has(round.id) ? '。置き場を選びました。' : ''}`
                : `Listen to signal ${index + 1}${placements.has(round.id) ? '. Shelf slot selected.' : ''}`);
            button.addEventListener('click', () => { activeIndex = index; playActive(); render(); }, { signal: lifecycle.signal });
            return button;
        }));
        shelves.replaceChildren(...model.payload.shelves.map(shelf => {
            const article = document.createElement('article'); article.className = 'academy-katakana-shelf-row';
            const title = document.createElement('h3'); title.append(...localizedNodes(shelf.label));
            const slots = document.createElement('div'); slots.className = 'academy-katakana-shelf-slots';
            slots.append(...shelf.slots.map(slot => {
                const occupant = placedSignalFor(slot.id);
                const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-shelf-slot';
                button.dataset.filled = String(Boolean(occupant)); button.disabled = submitting || (Boolean(occupant) && placements.get(activeRound().id) !== slot.id);
                button.textContent = occupant ? `${slot.label.toUpperCase()} · ${host.language === 'ja' ? '選択済み' : 'set'}` : slot.label.toUpperCase();
                button.setAttribute('aria-label', host.language === 'ja'
                    ? `${shelf.label.ja}の${slot.label}の位置${occupant ? '。すでに選択済みです。' : '。ここへ置く。'}`
                    : `${shelf.label.en}, ${slot.label} position${occupant ? '. Already selected.' : '. Place the active signal here.'}`);
                button.addEventListener('click', () => setPlacement(slot.id), { signal: lifecycle.signal });
                return button;
            }));
            article.append(title, slots); return article;
        }));
        submitButton.disabled = submitting || placements.size !== model.payload.rounds.length;
    };

    const setPlacement = (slotId: string): void => {
        if (submitting || placedSignalFor(slotId)) return;
        placements.set(activeRound().id, slotId);
        const next = model.payload.rounds.findIndex(round => !placements.has(round.id));
        if (next >= 0) activeIndex = next;
        status.textContent = next >= 0
            ? (host.language === 'ja' ? '置き場を記録しました。次の音を聞きます。' : 'Shelf slot recorded. Listen to the next signal.')
            : (host.language === 'ja' ? '十六の置き場がそろいました。確認できます。' : 'All sixteen placements are ready to check.');
        render();
        if (next >= 0) playActive();
    };

    const playActive = (): void => {
        const round = activeRound(); playbackRequest += 1; playback?.dispose(); playback = undefined;
        const request = playbackRequest; status.textContent = host.language === 'ja' ? '音を再生しています…' : 'Playing signal…';
        const start = host.playPronunciation ? host.playPronunciation(round.kana, round.kana) : browserPronunciation(round.kana);
        void start.then(disposable => {
            if (lifecycle.signal.aborted || request !== playbackRequest) { disposable.dispose(); return; }
            playback = disposable;
            status.textContent = host.language === 'ja' ? '聞こえた音の置き場を、先生の表で選びます。' : 'Choose the heard sound’s shelf slot in Sensei’s chart.';
        }).catch(() => { if (request === playbackRequest) status.textContent = host.language === 'ja' ? '音声を再生できません。' : 'Audio is unavailable.'; });
    };

    submitButton.addEventListener('click', () => {
        if (submitting || placements.size !== model.payload.rounds.length) return;
        submitting = true; render();
        const response: KatakanaFinalRowShelfResponse = {
            answers: model.payload.rounds.map(round => ({ signalId: round.id, slotId: placements.get(round.id)! })),
        };
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome; status.textContent = ''; showEvaluation(feedback, evaluation, host);
        }).catch(error => { submitting = false; render(); status.textContent = error instanceof Error ? error.message : String(error); });
    }, { signal: lifecycle.signal });

    render();
    return { focus() { signals.querySelector<HTMLButtonElement>('button')?.focus(); }, dispose() { lifecycle.abort(); playback?.dispose(); root.remove(); } };
}

async function browserPronunciation(kana: string): Promise<{ dispose(): void }> {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('Browser speech is unavailable.');
    const utterance = new SpeechSynthesisUtterance(kana); utterance.lang = 'ja-JP'; speechSynthesis.speak(utterance);
    return { dispose: () => speechSynthesis.cancel() };
}
