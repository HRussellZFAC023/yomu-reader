import { parseJpdbReviewCardValue } from './jpdb-page-targets';
import { cleanText, firstJapaneseRunOrEmpty } from './jpdb-text';
import type { JPDBGrade } from '../app/types';

const JPDB_REVIEW_BRIDGE_CHANNEL = 'yomu-jpdb-review-bridge';
// The review page heartbeats faster than consumers' staleness clock, so an
// idle-but-open review tab never reads as stale while a closed or frozen one
// flips to disconnected within one staleness window.
const JPDB_REVIEW_BRIDGE_HEARTBEAT_MS = 12_000;
const JPDB_REVIEW_BRIDGE_STALE_MS = 30_000;

export interface JpdbReviewBridgeCard {
    id: string;
    deckMembership?: string;
    kind: 'vocabulary' | 'kanji';
    phase: 'front' | 'back';
    prompt: string;
    answer: string;
    spelling: string;
    reading: string;
    sentence: string;
    kanji: string;
    keyword: string;
    itemsLeft: number | null;
    href: string;
}

export interface JpdbReviewBridgeStatus {
    connected: boolean;
    loginRequired: boolean;
    card: JpdbReviewBridgeCard | null;
    message: string;
    stale?: boolean;
    // UT-23: jpdb.io/learn exposes the due composition the API cannot —
    // kanji reviews only exist on jpdb.io itself.
    learnSummary?: JpdbLearnSummary;
}

export interface JpdbLearnSummary {
    dueItems: number;
    dueVocabulary: number;
    dueKanji: number;
    newItems: number;
}

type BridgeMessage =
    | { type: 'request-current'; source: 'newtab' }
    | { type: 'command'; source: 'newtab'; command: 'reveal' }
    | { type: 'command'; source: 'newtab'; command: 'grade'; grade: JPDBGrade }
    | { type: 'status'; source: 'jpdb'; status: JpdbReviewBridgeStatus };

interface ParsedReviewDocument {
    cardValue: string;
    phase: JpdbReviewBridgeCard['phase'];
    kind: JpdbReviewBridgeCard['kind'];
    prompt: string;
    answer: string;
    spelling: string;
    reading: string;
    sentence: string;
    kanji: string;
    keyword: string;
}

export interface JpdbReviewBridgeClient {
    latestStatus(): JpdbReviewBridgeStatus;
    requestCurrent(): void;
    reveal(): void;
    grade(grade: JPDBGrade): void;
    onUpdate(listener: (status: JpdbReviewBridgeStatus) => void): () => void;
    close(): void;
}

const EMPTY_STATUS: JpdbReviewBridgeStatus = {
    connected: false,
    loginRequired: false,
    card: null,
    message: 'Open JPDB review in another tab to use live reviews.',
};

export function createJpdbReviewBridgeClient(): JpdbReviewBridgeClient {
    if (typeof BroadcastChannel !== 'function') {
        return {
            latestStatus: () => EMPTY_STATUS,
            requestCurrent: () => undefined,
            reveal: () => undefined,
            grade: () => undefined,
            onUpdate: () => () => undefined,
            close: () => undefined,
        };
    }

    const channel = new BroadcastChannel(JPDB_REVIEW_BRIDGE_CHANNEL);
    const listeners = new Set<(status: JpdbReviewBridgeStatus) => void>();
    let latest = EMPTY_STATUS;
    let staleTimer: number | undefined;

    const notify = () => listeners.forEach(listener => listener(latest));
    const markStale = () => {
        if (!latest.connected) return;
        latest = staleJpdbReviewBridgeStatus();
        notify();
    };
    const scheduleStaleCheck = () => {
        window.clearTimeout(staleTimer);
        staleTimer = window.setTimeout(markStale, JPDB_REVIEW_BRIDGE_STALE_MS);
    };
    channel.onmessage = event => {
        const message = event.data as Partial<BridgeMessage> | null;
        if (!message || message.source !== 'jpdb' || message.type !== 'status') return;
        latest = normalizeStatus(message.status);
        scheduleStaleCheck();
        notify();
    };

    const post = (message: BridgeMessage) => channel.postMessage(message);
    const requestCurrent = () => post({ type: 'request-current', source: 'newtab' });
    // Refresh on focus: returning to the study tab re-asks the review tab for
    // its current card instead of trusting whatever was last broadcast.
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') requestCurrent();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return {
        latestStatus: () => latest,
        requestCurrent,
        reveal: () => post({ type: 'command', source: 'newtab', command: 'reveal' }),
        grade: grade => post({ type: 'command', source: 'newtab', command: 'grade', grade }),
        onUpdate(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close: () => {
            window.clearTimeout(staleTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
            channel.close();
        },
    };
}

function staleJpdbReviewBridgeStatus(): JpdbReviewBridgeStatus {
    return {
        connected: false,
        loginRequired: false,
        card: null,
        stale: true,
        message: 'JPDB review tab stopped responding. Reopen jpdb.io/review to continue live reviews.',
    };
}

// Tears down the currently-installed page bridge (if any). A same-window
// re-boot — a higher-priority runtime superseding a lower one on the live
// jpdb.io/review page (boot.ts destroyExistingApps/discardPageRuntimeForRealBoot)
// — destroys the old ReaderApp and inits a new one WITHOUT navigating, so
// 'pagehide' never fires. Without this, each re-init stacked another
// MutationObserver + heartbeat interval + BroadcastChannel on top of the last.
let disposeActiveJpdbReviewBridge: (() => void) | undefined;

export function initJpdbReviewPageBridge(): (() => void) | undefined {
    if (typeof BroadcastChannel !== 'function') return undefined;
    const onLearnPage = location.hostname === 'jpdb.io' && location.pathname.startsWith('/learn');
    if (location.hostname !== 'jpdb.io' || (!location.pathname.startsWith('/review') && !onLearnPage)) return undefined;

    // Reap any prior bridge before installing a fresh one (idempotent re-init).
    disposeActiveJpdbReviewBridge?.();

    const channel = new BroadcastChannel(JPDB_REVIEW_BRIDGE_CHANNEL);
    const publish = () => {
        const status = onLearnPage
            ? jpdbLearnPageStatus(document)
            : parseJpdbReviewDocument(document, location.href);
        channel.postMessage({ type: 'status', source: 'jpdb', status } satisfies BridgeMessage);
    };
    const schedulePublish = debounce(publish, 160);
    channel.onmessage = event => {
        const message = event.data as Partial<BridgeMessage> | null;
        if (!message || message.source !== 'newtab') return;
        if (message.type === 'request-current') {
            publish();
            return;
        }
        if (message.type !== 'command') return;
        if (message.command === 'reveal') clickRevealControl();
        if (message.command === 'grade' && message.grade) clickGradeControl(message.grade);
        window.setTimeout(publish, 300);
        window.setTimeout(publish, 900);
    };

    const observer = new MutationObserver(schedulePublish);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    publish();

    // Heartbeat feeds consumers' staleness clock while the review tab idles;
    // pagehide flips them to disconnected immediately instead of leaving the
    // last card lingering as a live review target.
    const heartbeat = window.setInterval(publish, JPDB_REVIEW_BRIDGE_HEARTBEAT_MS);
    const bridgeAbort = new AbortController();
    const dispose = (): void => {
        if (disposeActiveJpdbReviewBridge === dispose) disposeActiveJpdbReviewBridge = undefined;
        window.clearInterval(heartbeat);
        observer.disconnect();
        bridgeAbort.abort();
        try { channel.close(); } catch { /* already closed */ }
    };
    // A real tab close/navigation additionally tells consumers the review tab
    // is gone; an in-place ReaderApp.destroy() (via the returned disposer) stays
    // silent so the superseding bridge takes over without a disconnected blip.
    window.addEventListener('pagehide', () => {
        channel.postMessage({
            type: 'status',
            source: 'jpdb',
            status: {
                connected: false,
                loginRequired: false,
                card: null,
                message: 'JPDB review tab closed. Reopen jpdb.io/review to continue live reviews.',
            },
        } satisfies BridgeMessage);
        dispose();
    }, { signal: bridgeAbort.signal });
    disposeActiveJpdbReviewBridge = dispose;
    return dispose;
}

// UT-23: jpdb.io/learn shows "You have N due items (V vocabulary and K
// kanji) and M new items …" — the only place kanji dues are visible.
export function jpdbLearnPageStatus(doc: Document): JpdbReviewBridgeStatus {
    const text = doc.body?.textContent?.replace(/\s+/g, ' ') ?? '';
    const due = /(\d+)\s+due items?\s*\((\d+)\s+vocabulary and\s+(\d+)\s+kanji\)/i.exec(text);
    const fresh = /(\d[\d,]*)\s+new items?/i.exec(text);
    const learnSummary = due ? {
        dueItems: Number(due[1]),
        dueVocabulary: Number(due[2]),
        dueKanji: Number(due[3]),
        newItems: fresh ? Number(fresh[1].replace(/,/g, '')) : 0,
    } : undefined;
    return {
        connected: true,
        loginRequired: false,
        card: null,
        message: learnSummary ? 'JPDB learn page connected.' : 'JPDB learn page open, summary not detected.',
        ...(learnSummary ? { learnSummary } : {}),
    };
}

export function parseJpdbReviewDocument(doc: Document, href = ''): JpdbReviewBridgeStatus {
    if (reviewLoginRequired(doc)) {
        return { connected: true, loginRequired: true, card: null, message: 'Log in to JPDB, then open /review again.' };
    }

    const parsed = parsedReviewDocument(doc, href);
    if (!hasDetectedReviewCard(parsed.spelling, parsed.kanji, parsed.cardValue)) {
        return { connected: true, loginRequired: false, card: null, message: 'JPDB review is open but no review card was detected.' };
    }

    return {
        connected: true,
        loginRequired: false,
        message: '',
        card: reviewBridgeCard(parsed, doc, href),
    };
}

function parsedReviewDocument(doc: Document, href: string): ParsedReviewDocument {
    const url = safeUrl(href);
    const { cardValue, response } = reviewRequestState(doc, url);
    const cardState = parseJpdbReviewCardValue(cardValue, response);
    const text = reviewDocumentText(doc);
    const { kanji, isKanji } = reviewKindInfo(doc, cardState, text.kindLabel, text.highlighted);
    const phase = reviewPhase(doc, url, cardState.phase);
    const fields = reviewCardTextFields(doc, isKanji, text.sentence, text.highlighted, kanji, text.keyword);
    return {
        cardValue,
        phase,
        kind: isKanji ? 'kanji' : 'vocabulary',
        keyword: text.keyword,
        sentence: text.sentence,
        kanji,
        ...fields,
    };
}

function reviewDocumentText(doc: Document): { kindLabel: string; sentence: string; highlighted: string; keyword: string } {
    const sentenceElement = doc.querySelector<HTMLElement>('.card-sentence .sentence, .sentence, .plain');
    return {
        kindLabel: cleanText(doc.querySelector<HTMLElement>('.kind')?.textContent ?? ''),
        sentence: cleanText(sentenceElement?.textContent ?? ''),
        highlighted: cleanText(doc.querySelector<HTMLElement>('.highlight')?.textContent ?? ''),
        keyword: reviewKeywordText(doc),
    };
}

function reviewKeywordText(doc: Document): string {
    return sectionText(doc, 'Keyword') || cleanText(doc.querySelector<HTMLElement>('.keyword')?.textContent ?? '');
}

function reviewCardTextFields(
    doc: Document,
    isKanji: boolean,
    sentence: string,
    highlighted: string,
    kanji: string,
    keyword: string,
): Pick<ParsedReviewDocument, 'prompt' | 'answer' | 'spelling' | 'reading'> {
    const plain = cleanText(doc.querySelector<HTMLElement>('.plain')?.textContent ?? '');
    const spelling = reviewCardSpelling(isKanji, kanji, highlighted, sentence, plain);
    const prompt = reviewCardPrompt(isKanji, keyword, plain, kanji, sentence, spelling);
    return {
        prompt,
        answer: isKanji ? kanji : spelling,
        spelling,
        reading: isKanji ? '' : readingFromDocument(doc),
    };
}

function reviewCardSpelling(isKanji: boolean, kanji: string, highlighted: string, sentence: string, plain: string): string {
    return isKanji ? kanji : highlighted || firstJapaneseRunOrEmpty(sentence) || plain;
}

function reviewCardPrompt(isKanji: boolean, keyword: string, plain: string, kanji: string, sentence: string, spelling: string): string {
    return isKanji ? keyword || plain || kanji : sentence || spelling;
}

function reviewBridgeCard(parsed: ParsedReviewDocument, doc: Document, href: string): JpdbReviewBridgeCard {
    return {
        id: parsed.cardValue || `${parsed.spelling}:${parsed.reading}`,
        deckMembership: reviewDeckMembership(doc),
        kind: parsed.kind,
        phase: parsed.phase,
        prompt: parsed.prompt,
        answer: parsed.answer,
        spelling: parsed.spelling || parsed.kanji,
        reading: parsed.reading,
        sentence: parsed.sentence,
        kanji: parsed.kanji,
        keyword: parsed.keyword,
        itemsLeft: itemsLeft(doc),
        href,
    };
}

function reviewRequestState(doc: Document, url: URL | null): { cardValue: string; response: string | null } {
    return {
        cardValue: url?.searchParams.get('c')
            ?? doc.querySelector<HTMLInputElement>('input[name="c"]')?.value
            ?? '',
        response: url?.searchParams.get('r')
            ?? doc.querySelector<HTMLInputElement>('input[name="r"]')?.value
            ?? null,
    };
}

function reviewLoginRequired(doc: Document): boolean {
    return Boolean(doc.querySelector('form[action*="/login"], input[name="password"], a[href^="/login"]'));
}

function reviewKindInfo(
    doc: Document,
    cardState: ReturnType<typeof parseJpdbReviewCardValue>,
    kindLabel: string,
    highlighted: string,
): { kanji: string; isKanji: boolean } {
    const kanji = cardState.kanji || firstKanji(doc.querySelector<HTMLElement>('.kanji, a.kanji.plain')?.textContent ?? '');
    return {
        kanji,
        isKanji: cardState.isKanji || /kanji/i.test(kindLabel) || pageHasKanjiCard(doc, kanji, highlighted),
    };
}

function pageHasKanjiCard(doc: Document, kanji: string, highlighted: string): boolean {
    return Boolean(kanji && !highlighted && doc.querySelector('.kanji'));
}

function reviewPhase(doc: Document, url: URL | null, phase: ReturnType<typeof parseJpdbReviewCardValue>['phase']): JpdbReviewBridgeCard['phase'] {
    return phase === 'after' || url?.searchParams.has('r') || Boolean(doc.querySelector('.review-hidden, .answer-box'))
        ? 'back'
        : 'front';
}

function hasDetectedReviewCard(spelling: string, kanji: string, cardValue: string): boolean {
    return Boolean(spelling || kanji || cardValue);
}

// The review back shows "Part of the Persona 5 deck (3x)" — carry it to the
// study tab so the live card keeps JPDB's own deck-membership line (SH-4).
function reviewDeckMembership(doc: Document): string {
    const lines: string[] = [];
    doc.querySelectorAll<HTMLElement>('a[href*="/deck?"], a[href*="/deck/"]').forEach(link => {
        const container = link.parentElement;
        const text = cleanText(container?.textContent ?? '');
        if (/part of/i.test(text) && !lines.includes(text)) lines.push(text);
    });
    return lines.join(' · ');
}

function clickRevealControl(): void {
    // Live-verified stable id on jpdb.io/review fronts.
    const showAnswer = document.querySelector<HTMLElement>('#show-answer');
    if (showAnswer) {
        showAnswer.click();
        return;
    }
    const direct = findControl(['reveal', 'show answer', 'answer']);
    if (direct) {
        direct.click();
        return;
    }
    const form = Array.from(document.querySelectorAll<HTMLFormElement>('form'))
        .find(item => Boolean(item.querySelector('[name="r"]')) || item.action.includes('/review'));
    const submit = form?.querySelector<HTMLElement>('button, input[type="submit"]');
    if (submit) submit.click();
    else form?.requestSubmit?.();
}

function clickGradeControl(grade: JPDBGrade): void {
    // Live-verified 2026-06-11: jpdb.io/review renders each grade as a form
    // with a stable submit id (#grade-1 .. #grade-5); prefer the id over text
    // matching so ✘/✔ prefixes or copy changes cannot break grading.
    const direct = document.querySelector<HTMLElement>(JPDB_GRADE_CONTROL_IDS[grade] ?? '');
    if (direct) {
        direct.click();
        return;
    }
    const terms = gradeTerms(grade);
    const control = findControl(terms);
    if (control) {
        control.click();
        return;
    }
    const form = Array.from(document.querySelectorAll<HTMLFormElement>('form'))
        .find(item => terms.some(term => formText(item).includes(term)));
    const submit = form?.querySelector<HTMLElement>('button, input[type="submit"]');
    if (submit) submit.click();
    else form?.requestSubmit?.();
}

function findControl(terms: string[]): HTMLElement | null {
    const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], a[href]'));
    return controls.find(control => {
        if (control.closest('[data-jpdb-reader-root]')) return false;
        const text = formText(control);
        return terms.some(term => text.includes(term));
    }) ?? null;
}

function gradeTerms(grade: JPDBGrade): string[] {
    return JPDB_GRADE_CONTROL_TERMS[grade] ?? [grade];
}

const JPDB_GRADE_CONTROL_IDS: Partial<Record<JPDBGrade, string>> = {
    nothing: '#grade-1',
    something: '#grade-2',
    hard: '#grade-3',
    okay: '#grade-4',
    easy: '#grade-5',
    fail: '#grade-1',
    pass: '#grade-4',
};

const JPDB_GRADE_CONTROL_TERMS: Record<JPDBGrade, string[]> = {
    nothing: ['nothing', 'again', 'forgot'],
    something: ['something'],
    hard: ['hard'],
    okay: ['okay', 'ok', 'good'],
    easy: ['easy'],
    fail: ['fail', 'nothing', 'again'],
    pass: ['pass', 'okay', 'good', 'easy'],
};

function formText(element: HTMLElement): string {
    const input = element as HTMLInputElement;
    return cleanText([
        element.textContent,
        input.value,
        input.name,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.className,
        element.getAttribute('data-grade'),
    ].filter(Boolean).join(' ')).toLocaleLowerCase();
}

function normalizeStatus(value: unknown): JpdbReviewBridgeStatus {
    if (!value || typeof value !== 'object') return EMPTY_STATUS;
    const status = value as Partial<JpdbReviewBridgeStatus>;
    return {
        connected: Boolean(status.connected),
        loginRequired: Boolean(status.loginRequired),
        card: status.card ?? null,
        message: typeof status.message === 'string' ? status.message : '',
    };
}

function sectionText(doc: Document, label: string): string {
    const heading = Array.from(doc.querySelectorAll<HTMLElement>('.subsection-label'))
        .find(element => cleanText(element.textContent ?? '').toLocaleLowerCase() === label.toLocaleLowerCase());
    return cleanText(heading?.parentElement?.querySelector<HTMLElement>('.subsection')?.textContent ?? '');
}

function readingFromDocument(doc: Document): string {
    return cleanText(doc.querySelector<HTMLElement>('.plain ruby rt, rt, .reading')?.textContent ?? '');
}

function itemsLeft(doc: Document): number | null {
    const text = cleanText(doc.body.textContent ?? '');
    const match = /items?\s+left\s*\((\d+)\)|items?\s+left\s+(\d+)/i.exec(text);
    if (!match) return null;
    const value = Number(match[1] ?? match[2]);
    return Number.isFinite(value) ? value : null;
}

function firstKanji(value: string): string {
    return Array.from(value).find(character => /[\u3400-\u9fff々〆]/u.test(character)) ?? '';
}

function safeUrl(value: string): URL | null {
    try {
        return value ? new URL(value, location.href) : new URL(location.href);
    } catch {
        return null;
    }
}

function debounce(callback: () => void, delay: number): () => void {
    let timer = 0;
    return () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(callback, delay);
    };
}
