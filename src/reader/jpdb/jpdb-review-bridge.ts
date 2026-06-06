import { parseJpdbReviewCardValue } from './jpdb-page-targets';
import { cleanText, firstJapaneseRunOrEmpty } from './jpdb-text';
import type { JPDBGrade } from '../types';

const JPDB_REVIEW_BRIDGE_CHANNEL = 'yomu-jpdb-review-bridge';

export interface JpdbReviewBridgeCard {
    id: string;
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
    channel.onmessage = event => {
        const message = event.data as Partial<BridgeMessage> | null;
        if (!message || message.source !== 'jpdb' || message.type !== 'status') return;
        latest = normalizeStatus(message.status);
        listeners.forEach(listener => listener(latest));
    };

    const post = (message: BridgeMessage) => channel.postMessage(message);
    return {
        latestStatus: () => latest,
        requestCurrent: () => post({ type: 'request-current', source: 'newtab' }),
        reveal: () => post({ type: 'command', source: 'newtab', command: 'reveal' }),
        grade: grade => post({ type: 'command', source: 'newtab', command: 'grade', grade }),
        onUpdate(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close: () => channel.close(),
    };
}

export function initJpdbReviewPageBridge(): void {
    if (typeof BroadcastChannel !== 'function') return;
    if (location.hostname !== 'jpdb.io' || !location.pathname.startsWith('/review')) return;

    const channel = new BroadcastChannel(JPDB_REVIEW_BRIDGE_CHANNEL);
    const publish = () => {
        channel.postMessage({
            type: 'status',
            source: 'jpdb',
            status: parseJpdbReviewDocument(document, location.href),
        } satisfies BridgeMessage);
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

    new MutationObserver(schedulePublish).observe(document.body, { childList: true, subtree: true, attributes: true });
    publish();
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

function clickRevealControl(): void {
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
