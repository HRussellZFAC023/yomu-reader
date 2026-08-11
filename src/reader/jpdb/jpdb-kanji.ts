import { Logger } from '../app/logger';
import { requestText as requestReaderText } from '../network/http';
import { parseHtmlDocument } from '../dom';
import { escapeRegExp } from '../core/string-utils';
import { absoluteJpdbUrl, cleanText, JAPANESE_RE, parseJpdbVocabularyUrl } from './jpdb-text';

export interface JpdbKanjiReading {
    reading: string;
    share: string;
    common: boolean;
}

export interface JpdbKanjiComponent {
    kanji: string;
    keyword: string;
}

export interface JpdbKanjiVocabulary {
    expression: string;
    reading: string;
    meaning: string;
    url: string;
}

export type JpdbKanjiActionRole = 'mine' | 'known' | 'neverforget' | 'forget' | 'blacklist' | 'review' | 'other';

export interface JpdbKanjiAction {
    id: string;
    kanji: string;
    label: string;
    role: JpdbKanjiActionRole;
    kind: 'form' | 'link';
    method: 'GET' | 'POST';
    url: string;
    payload: Record<string, string>;
    enabled: boolean;
}

export interface JpdbKanjiInfo {
    kanji: string;
    keyword: string;
    frequency: string;
    type: string;
    kanken: string;
    heisig: string;
    oldForms: string[];
    readings: JpdbKanjiReading[];
    components: JpdbKanjiComponent[];
    usedInKanji?: JpdbKanjiComponent[];
    mnemonic: string;
    vocabulary: JpdbKanjiVocabulary[];
    actions: JpdbKanjiAction[];
    loggedIn: boolean;
    kanjiReviewsEnabled: boolean;
}

const JPDB_KANJI_BASE_URL = 'https://jpdb.io/kanji';
const log = Logger.scope('JpdbKanji');

export class JpdbKanjiClient {
    private cache = new Map<string, Promise<JpdbKanjiInfo | null>>();
    private actions = new Map<string, JpdbKanjiAction>();
    private generation = 0;

    constructor(private readonly getCorsProxyUrl: () => string = () => '') {}

    lookup(kanji: string): Promise<JpdbKanjiInfo | null> {
        const key = Array.from(kanji)[0] ?? kanji;
        if (!key) return Promise.resolve(null);
        let promise = this.cache.get(key);
        if (!promise) {
            promise = this.fetchInfo(key, this.generation);
            this.cache.set(key, promise);
        }
        return promise;
    }

    async performAction(actionId: string): Promise<JpdbKanjiInfo | null> {
        const generation = this.generation;
        const action = this.actions.get(actionId);
        if (!action) throw new Error('JPDB kanji action is no longer available.');
        if (!action.enabled) throw new Error('JPDB kanji action is disabled.');
        log.info('Performing JPDB kanji action', { kanji: action.kanji, role: action.role, kind: action.kind });
        await requestText(action.url, '', {
            method: action.method,
            payload: action.payload,
            allowProxyFallback: false,
            allowConfiguredProxy: false,
            credentials: 'same-origin',
        });
        if (generation !== this.generation) return null;
        this.cache.delete(action.kanji);
        return this.lookup(action.kanji);
    }

    clear(): void {
        this.generation++;
        this.cache.clear();
        this.actions.clear();
    }

    private async fetchInfo(kanji: string, generation: number): Promise<JpdbKanjiInfo | null> {
        const html = await requestText(`${JPDB_KANJI_BASE_URL}/${encodeURIComponent(kanji)}`, this.getCorsProxyUrl()).catch(error => {
            log.warn('Kanji page request failed', { kanji }, error);
            return '';
        });
        const info = html ? parseJpdbKanjiHtml(html, kanji) : null;
        if (info && generation === this.generation) {
            visibleJpdbKanjiActions(info).forEach(action => this.actions.set(action.id, action));
        }
        return info;
    }
}

export function clearJpdbKanjiClient(client: JpdbKanjiClient): void {
    client.clear?.();
}

export function parseJpdbKanjiHtml(html: string, kanji: string): JpdbKanjiInfo | null {
    const doc = parseHtmlDocument(html);
    const keyword = sectionText(doc, 'Keyword') || metaKeyword(doc, kanji);
    if (!keyword) return null;

    const parsed = parsedJpdbKanjiPage(doc);
    const actions = kanjiActions(doc, kanji);
    const visibleActions = actions.filter(isVisibleKanjiAction);
    return {
        kanji,
        keyword,
        ...parsed,
        mnemonic: sectionText(doc, 'Mnemonic'),
        actions,
        loggedIn: isLoggedIn(doc),
        kanjiReviewsEnabled: visibleActions.length > 0,
    };
}

function parsedJpdbKanjiPage(doc: Document): Pick<JpdbKanjiInfo, 'frequency' | 'type' | 'kanken' | 'heisig' | 'oldForms' | 'readings' | 'components' | 'usedInKanji' | 'vocabulary'> {
    const infoRows = infoTableRows(doc);
    return {
        frequency: infoRows.get('Frequency') ?? '',
        type: infoRows.get('Type') ?? '',
        kanken: infoRows.get('Kanken') ?? '',
        heisig: infoRows.get('Heisig') ?? '',
        oldForms: oldForms(doc),
        readings: readings(doc),
        components: components(doc),
        usedInKanji: usedInKanji(doc),
        vocabulary: vocabulary(doc).slice(0, 8),
    };
}

export function visibleJpdbKanjiActions(info: JpdbKanjiInfo | null): JpdbKanjiAction[] {
    if (!info?.kanjiReviewsEnabled) return [];
    return info.actions.filter(isVisibleKanjiAction).slice(0, 3);
}

export function jpdbKanjiActionClass(action: JpdbKanjiAction): string {
    return KANJI_ACTION_CLASS_BY_ROLE[action.role] ?? '';
}

const KANJI_ACTION_CLASS_BY_ROLE: Record<JpdbKanjiAction['role'], string> = {
    mine: 'add',
    review: 'add',
    known: 'nf',
    neverforget: 'nf',
    blacklist: 'blacklist',
    forget: 'nf danger',
    other: '',
};

function isVisibleKanjiAction(action: JpdbKanjiAction): boolean {
    return action.enabled && action.role !== 'other';
}

function isLoggedIn(doc: Document): boolean {
    return !doc.querySelector('a[href="/login"], a[href^="/login?"], form[action="/login"], form[action^="/login?"]');
}

function kanjiActions(doc: Document, kanji: string): JpdbKanjiAction[] {
    const menu = doc.querySelector('.result.kanji .menu, .kanji .menu, .menu');
    if (!menu) return [];
    const actions: JpdbKanjiAction[] = [];
    const push = (action: Omit<JpdbKanjiAction, 'id'>) => {
        const id = `jpdb-kanji:${encodeURIComponent(kanji)}:${actions.length}`;
        actions.push({ ...action, id });
    };

    menu.querySelectorAll<HTMLFormElement>('form').forEach(form => {
        const method = ((form.getAttribute('method') || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST';
        const url = absoluteJpdbUrl(form.getAttribute('action') || `/kanji/${encodeURIComponent(kanji)}`, 'https://jpdb.io/');
        const submitters = Array.from(form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input[type="submit"], input[type="button"]'))
            .filter(submitter => cleanText(labelForControl(submitter)) && submitter.getAttribute('type')?.toLowerCase() !== 'button');
        const controls = submitters.length ? submitters : [form];
        controls.forEach(control => {
            const action = kanjiFormAction(form, control, kanji, method, url);
            if (action) push(action);
        });
    });

    menu.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
        if (link.closest('form')) return;
        const label = cleanText(labelForControl(link));
        if (!label) return;
        const url = absoluteJpdbUrl(link.getAttribute('href') ?? '', 'https://jpdb.io/');
        push({
            kanji,
            label,
            role: classifyKanjiAction(label, url),
            kind: 'link',
            method: 'GET',
            url,
            payload: {},
            enabled: !isDisabled(link),
        });
    });

    return actions.filter(action => action.role !== 'other' || /kanji|review|deck|blacklist|known|forget/i.test(action.label));
}

function labelForControl(element: Element): string {
    if (element instanceof HTMLInputElement) return inputControlLabel(element);
    return element.getAttribute('aria-label') || (element as HTMLElement).title || element.textContent || '';
}

function kanjiFormAction(
    form: HTMLFormElement,
    control: HTMLFormElement | HTMLButtonElement | HTMLInputElement,
    kanji: string,
    method: 'GET' | 'POST',
    url: string,
): Omit<JpdbKanjiAction, 'id'> | null {
    const label = cleanText(control instanceof HTMLFormElement ? form.textContent ?? '' : labelForControl(control));
    if (!label) return null;
    return {
        kanji,
        label,
        role: classifyKanjiAction(label, `${url} ${kanjiFormActionContext(form, control)}`),
        kind: 'form',
        method,
        url,
        payload: formPayload(form, control instanceof HTMLFormElement ? null : control),
        enabled: kanjiFormActionEnabled(form, control),
    };
}

function kanjiFormActionContext(form: HTMLFormElement, control: HTMLFormElement | HTMLButtonElement | HTMLInputElement): string {
    return control instanceof HTMLFormElement ? form.textContent ?? '' : control.getAttribute('value') ?? '';
}

function kanjiFormActionEnabled(form: HTMLFormElement, control: HTMLFormElement | HTMLButtonElement | HTMLInputElement): boolean {
    if (control instanceof HTMLFormElement) return !isDisabled(form);
    return !isDisabled(control) && !isDisabled(form);
}

function classifyKanjiAction(label: string, context: string): JpdbKanjiActionRole {
    const labelText = label.toLowerCase();
    const text = `${label} ${context}`.toLowerCase();
    if (KANJI_ACTION_OTHER_RE.test(labelText)) return 'other';
    return KANJI_ACTION_PATTERNS.find(({ pattern }) => pattern.test(text))?.role ?? 'other';
}

function inputControlLabel(element: HTMLInputElement): string {
    return element.getAttribute('aria-label') || element.title || element.value || element.name;
}

const KANJI_ACTION_OTHER_RE = /\b(enable|settings?|configure|preferences?|history|stats?|open|view)\b/;
const KANJI_ACTION_PATTERNS: Array<{ role: JpdbKanjiActionRole; pattern: RegExp }> = [
    { role: 'blacklist', pattern: /\b(blacklist|unblacklist|block|ignore|suspend)\b/ },
    { role: 'neverforget', pattern: /\b(never[-\s]?forget|always\s+remember)\b/ },
    { role: 'forget', pattern: /\b(forget|remove|delete|unlearn)\b/ },
    { role: 'known', pattern: /\b(known|know|learned|mark\s+known|remember)\b/ },
    { role: 'review', pattern: /\b(review|due|study)\b/ },
    { role: 'mine', pattern: /\b(add|mine|mining|deck|prioriti[sz]e|learn)\b/ },
];

function formPayload(form: HTMLFormElement, submitter: Element | null): Record<string, string> {
    const payload: Record<string, string> = {};
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => {
        addFormControlPayload(payload, control);
    });
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
        const name = submitter.name;
        if (name) payload[name] = submitter.value;
    }
    return payload;
}

function addFormControlPayload(payload: Record<string, string>, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
    if (!control.name || !shouldIncludeFormControl(control)) return;
    payload[control.name] = control.value;
}

function shouldIncludeFormControl(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
    return !(control instanceof HTMLInputElement) || shouldIncludeInputControl(control);
}

function shouldIncludeInputControl(control: HTMLInputElement): boolean {
    const type = control.type.toLowerCase();
    if (IGNORED_FORM_INPUT_TYPES.has(type)) return false;
    return !CHECKED_FORM_INPUT_TYPES.has(type) || control.checked;
}

const IGNORED_FORM_INPUT_TYPES = new Set(['submit', 'button', 'image', 'reset', 'file']);
const CHECKED_FORM_INPUT_TYPES = new Set(['checkbox', 'radio']);

function isDisabled(element: Element): boolean {
    return element.hasAttribute('disabled')
        || element.getAttribute('aria-disabled') === 'true'
        || element.classList.contains('disabled')
        || element.classList.contains('is-disabled');
}

function sectionText(doc: Document, label: string): string {
    const heading = Array.from(doc.querySelectorAll('.subsection-label'))
        .find(element => cleanText(element.textContent ?? '') === label);
    const section = heading?.parentElement?.querySelector('.subsection') ?? null;
    const value = cleanText(section?.textContent ?? '');
    return isMissingSectionValue(value, section) ? '' : value;
}

function infoTableRows(doc: Document): Map<string, string> {
    const rows = new Map<string, string>();
    doc.querySelectorAll('.cross-table tr').forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 2) return;
        const key = cleanText(cells[0].textContent ?? '');
        const value = cleanInfoTableValue(cells[1]);
        if (value) rows.set(key, value);
    });
    return rows;
}

function oldForms(doc: Document): string[] {
    const row = Array.from(doc.querySelectorAll('.cross-table tr'))
        .find(item => cleanText(item.querySelector('td')?.textContent ?? '') === 'Old form');
    return Array.from(row?.querySelectorAll('a[href^="/kanji/"]') ?? [])
        .map(link => cleanText(link.textContent ?? ''))
        .filter(Boolean);
}

function readings(doc: Document): JpdbKanjiReading[] {
    const seen = new Set<string>();
    const entries: JpdbKanjiReading[] = [];
    doc.querySelectorAll('.kanji-reading-list-common > div, .kanji-reading-list > div').forEach(row => {
        const link = row.querySelector('a');
        const reading = cleanText(link?.textContent ?? '');
        if (!reading || seen.has(reading)) return;
        seen.add(reading);
        entries.push({
            reading,
            share: cleanText(row.textContent ?? '').replace(reading, '').trim(),
            common: row.closest('.kanji-reading-list-common') !== null,
        });
    });
    return entries;
}

function components(doc: Document): JpdbKanjiComponent[] {
    return kanjiSectionEntries(doc, label => label.startsWith('Composed of'));
}

function usedInKanji(doc: Document): JpdbKanjiComponent[] {
    return kanjiSectionEntries(doc, label => label.startsWith('Used in kanji'));
}

function kanjiSectionEntries(doc: Document, matchesLabel: (label: string) => boolean): JpdbKanjiComponent[] {
    return Array.from(doc.querySelectorAll('.subsection-composed-of-kanji'))
        .filter(section => matchesLabel(cleanText(section.querySelector('.subsection-label')?.textContent ?? '')))
        .flatMap(section => Array.from(section.querySelectorAll('.subsection > div')))
        .map(element => ({
            kanji: cleanText(element.querySelector('.spelling')?.textContent ?? ''),
            keyword: cleanText(element.querySelector('.description')?.textContent ?? ''),
        }))
        .filter(component => component.kanji && component.keyword);
}

function vocabulary(doc: Document): JpdbKanjiVocabulary[] {
    const entries: JpdbKanjiVocabulary[] = [];
    doc.querySelectorAll('.subsection-used-in .used-in').forEach(element => {
        const entry = jpdbKanjiVocabularyEntry(element);
        if (entry) entries.push(entry);
    });
    return entries;
}

function jpdbKanjiVocabularyEntry(element: Element): JpdbKanjiVocabulary | null {
    const link = element.querySelector<HTMLAnchorElement>('.jp a[href^="/vocabulary/"]');
    if (!link) return null;
    const expression = jpdbKanjiVocabularyExpression(link);
    const meaning = jpdbKanjiVocabularyMeaning(element);
    if (!isJpdbKanjiVocabularyEntry(expression, meaning)) return null;
    return {
        expression,
        reading: jpdbKanjiVocabularyReading(link),
        meaning,
        url: absoluteJpdbUrl(jpdbKanjiVocabularyHref(link)),
    };
}

function jpdbKanjiVocabularyExpression(link: HTMLAnchorElement): string {
    const identity = parseJpdbVocabularyUrl(jpdbKanjiVocabularyHref(link));
    return identity?.expression || textWithoutRuby(link);
}

function jpdbKanjiVocabularyReading(link: HTMLAnchorElement): string {
    return parseJpdbVocabularyUrl(jpdbKanjiVocabularyHref(link))?.reading ?? '';
}

function jpdbKanjiVocabularyMeaning(element: Element): string {
    return cleanText(element.querySelector('.en')?.textContent ?? '');
}

function jpdbKanjiVocabularyHref(link: HTMLAnchorElement): string {
    return link.getAttribute('href') ?? '';
}

function isJpdbKanjiVocabularyEntry(expression: string, meaning: string): boolean {
    return JAPANESE_RE.test(expression) && Boolean(meaning);
}

function textWithoutRuby(element: Element): string {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('rt, rp').forEach(node => node.remove());
    return cleanText(clone.textContent ?? '');
}

function metaKeyword(doc: Document, kanji: string): string {
    const description = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
    const match = new RegExp(`${escapeRegExp(kanji)}[^—-]*[—-]\\s*([^\\n]+)`).exec(description);
    return cleanText(match?.[1] ?? '');
}

function cleanInfoTableValue(cell: Element): string {
    return cleanText(cell.textContent ?? '').replace(/\s+\?$/, '');
}

function isMissingSectionValue(value: string, section: Element | null): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === '' || normalized === 'missing' || (section?.querySelector('.keyword-missing') !== null);
}


function requestText(
    url: string,
    proxyUrl = '',
    options: {
        method?: 'GET' | 'POST';
        payload?: Record<string, string>;
        allowProxyFallback?: boolean;
        allowConfiguredProxy?: boolean;
        credentials?: RequestCredentials;
    } = {},
): Promise<string> {
    const method = options.method ?? 'GET';
    const body = requestTextBody(options.payload);
    const requestUrl = requestTextUrl(url, method, body);
    const headers = requestTextHeaders(method);
    return requestReaderText(requestUrl, {
        method,
        headers,
        data: method === 'POST' ? body : undefined,
        proxyUrl,
        credentials: options.credentials ?? 'omit',
        redirect: 'follow',
        timeoutMs: 8000,
        allowPublicProxies: options.allowProxyFallback ?? method === 'GET',
        allowConfiguredProxy: options.allowConfiguredProxy,
        failureLabel: 'JPDB kanji request',
        timeoutLabel: 'JPDB kanji request timed out.',
    });
}

function requestTextBody(payload: Record<string, string> | undefined): string {
    return payload && Object.keys(payload).length ? new URLSearchParams(payload).toString() : '';
}

function requestTextUrl(url: string, method: 'GET' | 'POST', body: string): string {
    return method === 'GET' && body ? `${url}${url.includes('?') ? '&' : '?'}${body}` : url;
}

function requestTextHeaders(method: 'GET' | 'POST'): Record<string, string> | undefined {
    return method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined;
}
