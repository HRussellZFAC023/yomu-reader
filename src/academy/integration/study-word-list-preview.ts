// Pure, self-mounting-free builder for the 単語リスト "tonight's desk" preview sheet that fronts a
// Study session: the learner sees the words waiting on the desk, taps any card to peek at its
// reading/meaning, then runs the 3…2…1…はじめ！ ritual to open the session. It consumes the canonical
// Study seam types by `import type` only — it never mounts, schedules, or grades on its own, so a
// live caller (world-flow / study-module) owns wiring it in front of `mountAcademyStudyModule`.
import type { AcademyStudyCountdown, AcademyStudyVocabulary } from './study-module';

export type StudyDeskLanguage = 'ja' | 'en';

export interface StudyDeskPreviewOptions {
    readonly language: StudyDeskLanguage;
    readonly vocabulary: readonly AcademyStudyVocabulary[];
    /**
     * The canonical Study clock this preview fronts. Only its declared duration is read, so the
     * はじめ！ stamp can promise how long the desk stays open. Passing the live clock keeps the
     * preview honest without letting it start, pause, or mutate the session.
     */
    readonly countdown?: Pick<AcademyStudyCountdown, 'durationMs'>;
    readonly document?: Document;
    /** Fires once the 3…2…1…はじめ！ ritual completes; the caller then mounts the real session. */
    readonly onBegin?: () => void;
    /** Scheduler seam for the ritual ticks; defaults to setTimeout so tests can drive it directly. */
    readonly schedule?: (run: () => void, delayMs: number) => void;
    /** Cadence of the ritual ticks in ms (default 700). */
    readonly stepMs?: number;
}

export interface StudyDeskPreview {
    readonly element: HTMLElement;
    /** Toggle a single card's reading/meaning (tap-to-peek). Returns whether it is now revealed. */
    peek(id: string): boolean;
    /** Run the 3…2…1…はじめ！ opening ritual, invoking `onBegin` at the end. */
    begin(): void;
    dispose(): void;
}

interface DeskCopy {
    readonly title: string;
    readonly subtitle: string;
    readonly peekHint: string;
    readonly emptyDesk: string;
    readonly beginLabel: string;
    readonly durationSuffix: (minutes: number) => string;
    readonly noReading: string;
}

const COPY: Readonly<Record<StudyDeskLanguage, DeskCopy>> = {
    ja: {
        title: '単語リスト',
        subtitle: '今夜の机',
        peekHint: 'タップして確認',
        emptyDesk: '今夜の机には単語がありません。',
        beginLabel: 'はじめ！',
        durationSuffix: minutes => `${minutes}分間`,
        noReading: '——',
    },
    en: {
        title: 'Word list',
        subtitle: "Tonight's desk",
        peekHint: 'Tap to peek',
        emptyDesk: 'No words are waiting on the desk tonight.',
        beginLabel: 'Start!',
        durationSuffix: minutes => `${minutes} min`,
        noReading: '—',
    },
};

export function renderStudyDeskPreview(options: StudyDeskPreviewOptions): StudyDeskPreview {
    const doc = options.document ?? document;
    const copy = COPY[options.language];
    const schedule = options.schedule ?? ((run, delayMs) => { setTimeout(run, delayMs); });
    const stepMs = options.stepMs ?? 700;

    const element = doc.createElement('section');
    element.className = 'academy-study-desk';
    element.dataset.studyDesk = '';
    element.setAttribute('aria-label', copy.title);

    const header = doc.createElement('header');
    header.className = 'academy-study-desk-header';
    const title = doc.createElement('h2');
    title.className = 'academy-study-desk-title';
    title.textContent = copy.title;
    const subtitle = doc.createElement('p');
    subtitle.className = 'academy-study-desk-subtitle';
    subtitle.textContent = copy.subtitle;
    header.append(title, subtitle);
    element.append(header);

    const cardsById = new Map<string, HTMLElement>();

    if (options.vocabulary.length === 0) {
        const empty = doc.createElement('p');
        empty.className = 'academy-study-desk-empty';
        empty.textContent = copy.emptyDesk;
        element.append(empty);
    } else {
        const list = doc.createElement('ul');
        list.className = 'academy-study-desk-list';
        for (const [index, entry] of options.vocabulary.entries()) {
            list.append(buildCard(doc, copy, entry, index, cardsById));
        }
        element.append(list);
    }

    const stamp = doc.createElement('div');
    stamp.className = 'academy-study-desk-stamp';
    const beginButton = doc.createElement('button');
    beginButton.type = 'button';
    beginButton.className = 'academy-study-desk-begin';
    beginButton.textContent = copy.beginLabel;
    const beginCaption = doc.createElement('span');
    beginCaption.className = 'academy-study-desk-begin-caption';
    beginCaption.hidden = true;
    if (options.countdown) {
        const minutes = Math.max(1, Math.round(options.countdown.durationMs / 60_000));
        beginCaption.textContent = copy.durationSuffix(minutes);
        beginCaption.hidden = false;
    }
    const ticker = doc.createElement('output');
    ticker.className = 'academy-study-desk-ticker';
    ticker.setAttribute('aria-live', 'assertive');
    ticker.hidden = true;
    stamp.append(beginButton, beginCaption, ticker);
    element.append(stamp);

    let ritualRunning = false;

    const toggle = (card: HTMLElement): boolean => {
        const open = card.dataset.peeked !== 'true';
        card.dataset.peeked = open ? 'true' : 'false';
        const peekButton = card.querySelector<HTMLButtonElement>('.academy-study-desk-card-peek');
        peekButton?.setAttribute('aria-expanded', String(open));
        return open;
    };

    const peek = (id: string): boolean => {
        const card = cardsById.get(id);
        return card ? toggle(card) : false;
    };

    const begin = (): void => {
        if (ritualRunning) return;
        ritualRunning = true;
        beginButton.disabled = true;
        ticker.hidden = false;
        element.dataset.ritual = 'running';
        const sequence: readonly string[] = ['3', '2', '1', copy.beginLabel];
        const step = (index: number): void => {
            if (index >= sequence.length) {
                element.dataset.ritual = 'done';
                options.onBegin?.();
                return;
            }
            ticker.textContent = sequence[index];
            schedule(() => step(index + 1), stepMs);
        };
        step(0);
    };

    beginButton.addEventListener('click', begin);
    const onListClick = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const card = target.closest<HTMLElement>('.academy-study-desk-card');
        if (card && element.contains(card)) toggle(card);
    };
    element.addEventListener('click', onListClick);

    return {
        element,
        peek,
        begin,
        dispose() {
            beginButton.removeEventListener('click', begin);
            element.removeEventListener('click', onListClick);
            cardsById.clear();
            element.remove();
        },
    };
}

function buildCard(
    doc: Document,
    copy: DeskCopy,
    entry: AcademyStudyVocabulary,
    index: number,
    registry: Map<string, HTMLElement>,
): HTMLElement {
    const item = doc.createElement('li');
    item.className = 'academy-study-desk-card';
    item.dataset.cardId = entry.id;
    item.dataset.peeked = 'false';

    const ordinal = doc.createElement('span');
    ordinal.className = 'academy-study-desk-card-ordinal';
    ordinal.textContent = String(index + 1);

    const peekButton = doc.createElement('button');
    peekButton.type = 'button';
    peekButton.className = 'academy-study-desk-card-peek';
    peekButton.setAttribute('aria-expanded', 'false');
    peekButton.setAttribute('aria-label', copy.peekHint);

    const expression = doc.createElement('span');
    expression.className = 'academy-study-desk-card-expression';
    expression.lang = 'ja';
    expression.textContent = entry.expression;

    const hidden = doc.createElement('span');
    hidden.className = 'academy-study-desk-card-hidden';
    const reading = doc.createElement('span');
    reading.className = 'academy-study-desk-card-reading';
    reading.lang = 'ja';
    reading.textContent = entry.reading?.trim() || copy.noReading;
    hidden.append(reading);
    if (entry.meaning?.trim()) {
        const meaning = doc.createElement('span');
        meaning.className = 'academy-study-desk-card-meaning';
        meaning.textContent = entry.meaning.trim();
        hidden.append(meaning);
    }

    peekButton.append(expression, hidden);
    item.append(ordinal, peekButton);

    if (entry.audioAvailable) {
        const audioMark = doc.createElement('span');
        audioMark.className = 'academy-study-desk-card-audio';
        audioMark.setAttribute('aria-hidden', 'true');
        audioMark.textContent = '🔊';
        item.append(audioMark);
    }
    if (entry.source?.trim()) {
        item.dataset.source = entry.source.trim();
    }

    registry.set(entry.id, item);
    return item;
}
