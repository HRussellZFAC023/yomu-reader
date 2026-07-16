import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import { localizedNodes, showEvaluation, statusRegion } from '../activity-kit/shared';
import type { KatakanaRowSwitchboardModel, KatakanaRowSwitchboardResponse, KatakanaSwitchboardRowId, KatakanaSwitchboardVowelId } from './manifest';

type Setting = Readonly<{ rowId?: KatakanaSwitchboardRowId; vowelColumnId?: KatakanaSwitchboardVowelId }>;

export function renderKatakanaRowSwitchboard(
    model: KatakanaRowSwitchboardModel,
    host: ActivityHost,
    submit: (response: KatakanaRowSwitchboardResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const settings = new Map<string, Setting>();
    let activeIndex = 0;
    let playback: { dispose(): void } | undefined;
    let playbackRequest = 0;
    let submitting = false;

    const root = document.createElement('section');
    root.className = 'academy-activity academy-katakana-row-switchboard';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2'); heading.tabIndex = -1; heading.append(...localizedNodes(model.prompt));
    const teaching = document.createElement('div'); teaching.className = 'academy-katakana-switchboard-teaching';
    for (const step of model.payload.teaching) {
        const card = document.createElement('article');
        const source = document.createElement('p'); source.className = 'academy-source-record'; source.textContent = step.sourceLabel;
        const pattern = document.createElement('p'); pattern.className = 'academy-katakana-switchboard-pattern academy-japanese'; pattern.lang = 'ja'; pattern.textContent = step.pattern;
        const explanation = document.createElement('p'); explanation.append(...localizedNodes(step.explanation));
        card.append(source, pattern, explanation); teaching.append(card);
    }
    const sources = document.createElement('div'); sources.className = 'academy-katakana-switchboard-sources';
    for (const visual of model.payload.sourceVisuals) {
        const figure = document.createElement('figure');
        const image = document.createElement('img'); image.src = visual.url; image.alt = host.language === 'ja' ? visual.label.ja : visual.label.en; image.loading = 'lazy';
        const caption = document.createElement('figcaption'); caption.append(...localizedNodes(visual.label));
        figure.append(image, caption); sources.append(figure);
    }
    const audioNote = document.createElement('p'); audioNote.className = 'academy-katakana-switchboard-audio-note';
    audioNote.textContent = host.language === 'ja'
        ? '音は、先生のPDF音声ではなく、確認済みのよむ発音サポートです。'
        : 'Audio is verified Yomu pronunciation support, not an audio track from the Moodle PDFs.';
    const boardHeading = document.createElement('p'); boardHeading.append(...localizedNodes(model.payload.switchboardLabel));
    const signals = document.createElement('div'); signals.className = 'academy-katakana-switchboard-signals'; signals.setAttribute('role', 'group');
    const panel = document.createElement('div'); panel.className = 'academy-katakana-switchboard-panel';
    const rowControls = document.createElement('div'); rowControls.className = 'academy-katakana-switchboard-control'; rowControls.setAttribute('role', 'group');
    const vowelControls = document.createElement('div'); vowelControls.className = 'academy-katakana-switchboard-control'; vowelControls.setAttribute('role', 'group');
    panel.append(rowControls, vowelControls);
    const submitButton = document.createElement('button'); submitButton.type = 'button'; submitButton.className = 'academy-button academy-button-primary academy-katakana-switchboard-submit'; submitButton.textContent = host.language === 'ja' ? '十の音の設定を確認' : 'Check ten signal settings';
    const status = statusRegion('academy-katakana-switchboard-status'); const feedback = statusRegion('academy-katakana-switchboard-feedback');
    root.append(heading, teaching, sources, audioNote, boardHeading, signals, panel, submitButton, status, feedback);
    host.replace(root);

    const activeRound = () => model.payload.rounds[activeIndex];
    const complete = (setting: Setting | undefined): setting is Required<Setting> => Boolean(setting?.rowId && setting.vowelColumnId);
    const render = (): void => {
        signals.replaceChildren(...model.payload.rounds.map((round, index) => {
            const setting = settings.get(round.id);
            const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-switchboard-signal';
            button.dataset.active = String(index === activeIndex); button.dataset.answered = String(complete(setting)); button.disabled = submitting;
            button.textContent = host.language === 'ja' ? `音 ${index + 1}` : `Signal ${index + 1}`;
            button.setAttribute('aria-label', host.language === 'ja'
                ? `${index + 1}番の音を聞く${complete(setting) ? '。行と母音を設定しました。' : ''}`
                : `Listen to signal ${index + 1}${complete(setting) ? '. Row and vowel set.' : ''}`);
            button.addEventListener('click', () => { activeIndex = index; playActive(); render(); }, { signal: lifecycle.signal });
            return button;
        }));
        const active = activeRound(); const setting = settings.get(active.id) ?? {};
        rowControls.replaceChildren(controlTitle(host.language === 'ja' ? '行のスイッチ' : 'Row switch'), ...model.payload.rows.map(row => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-switchboard-option';
            button.dataset.selected = String(setting.rowId === row.id); button.disabled = submitting; button.append(...localizedNodes(row.label));
            button.addEventListener('click', () => setRow(row.id), { signal: lifecycle.signal }); return button;
        }));
        vowelControls.replaceChildren(controlTitle(host.language === 'ja' ? '母音のダイヤル' : 'Vowel dial'), ...model.payload.columns.map(column => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'academy-katakana-switchboard-option';
            button.dataset.selected = String(setting.vowelColumnId === column.id); button.disabled = submitting; button.textContent = column.label.toUpperCase();
            button.addEventListener('click', () => setVowel(column.id), { signal: lifecycle.signal }); return button;
        }));
        submitButton.disabled = submitting || !model.payload.rounds.every(round => complete(settings.get(round.id)));
    };

    const setRow = (rowId: KatakanaSwitchboardRowId): void => setSetting({ ...settings.get(activeRound().id), rowId });
    const setVowel = (vowelColumnId: KatakanaSwitchboardVowelId): void => setSetting({ ...settings.get(activeRound().id), vowelColumnId });
    const setSetting = (setting: Setting): void => {
        if (submitting) return;
        settings.set(activeRound().id, setting);
        const next = model.payload.rounds.findIndex(round => !complete(settings.get(round.id)));
        if (complete(setting) && next >= 0) activeIndex = next;
        status.textContent = complete(setting)
            ? (next >= 0 ? (host.language === 'ja' ? '設定しました。次の音を聞きます。' : 'Setting recorded. Listen to the next signal.') : (host.language === 'ja' ? '十の設定がそろいました。確認できます。' : 'All ten settings are ready to check.'))
            : (host.language === 'ja' ? '行と母音の両方を選びます。' : 'Select both a row and vowel.');
        render();
        if (complete(setting) && next >= 0) playActive();
    };

    const playActive = (): void => {
        const round = activeRound(); playbackRequest += 1; playback?.dispose(); playback = undefined;
        const request = playbackRequest; status.textContent = host.language === 'ja' ? '音を再生しています…' : 'Playing signal…';
        const start = host.playPronunciation ? host.playPronunciation(round.kana, round.kana) : browserPronunciation(round.kana);
        void start.then(disposable => {
            if (lifecycle.signal.aborted || request !== playbackRequest) { disposable.dispose(); return; }
            playback = disposable;
            status.textContent = host.language === 'ja' ? '聞こえた音の行と母音を設定します。' : 'Set the heard sound’s row and vowel.';
        }).catch(() => { if (request === playbackRequest) status.textContent = host.language === 'ja' ? '音声を再生できません。' : 'Audio is unavailable.'; });
    };

    submitButton.addEventListener('click', () => {
        if (submitting || !model.payload.rounds.every(round => complete(settings.get(round.id)))) return;
        submitting = true; render();
        const response: KatakanaRowSwitchboardResponse = {
            answers: model.payload.rounds.map(round => ({ signalId: round.id, ...settings.get(round.id)! as Required<Setting> })),
        };
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome; status.textContent = ''; showEvaluation(feedback, evaluation, host);
        }).catch(error => { submitting = false; render(); status.textContent = error instanceof Error ? error.message : String(error); });
    }, { signal: lifecycle.signal });

    render();
    return { focus() { signals.querySelector<HTMLButtonElement>('button')?.focus(); }, dispose() { lifecycle.abort(); playback?.dispose(); root.remove(); } };
}

function controlTitle(value: string): HTMLElement {
    const title = document.createElement('p'); title.className = 'academy-katakana-switchboard-control-title'; title.textContent = value; return title;
}

async function browserPronunciation(kana: string): Promise<{ dispose(): void }> {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('Browser speech is unavailable.');
    const utterance = new SpeechSynthesisUtterance(kana); utterance.lang = 'ja-JP'; speechSynthesis.speak(utterance);
    return { dispose: () => speechSynthesis.cancel() };
}
