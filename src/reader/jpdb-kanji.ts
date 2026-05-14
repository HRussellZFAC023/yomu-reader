import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

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
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const log = Logger.scope('JpdbKanji');

export class JpdbKanjiClient {
    private cache = new Map<string, Promise<JpdbKanjiInfo | null>>();
    private actions = new Map<string, JpdbKanjiAction>();

    lookup(kanji: string): Promise<JpdbKanjiInfo | null> {
        const key = Array.from(kanji)[0] ?? kanji;
        if (!key) return Promise.resolve(null);
        let promise = this.cache.get(key);
        if (!promise) {
            log.debug('Lookup cache miss', { kanji: key });
            promise = this.fetchInfo(key);
            this.cache.set(key, promise);
        } else {
            log.debug('Lookup cache hit', { kanji: key });
        }
        return promise;
    }

    async performAction(actionId: string): Promise<JpdbKanjiInfo | null> {
        const action = this.actions.get(actionId);
        if (!action) throw new Error('JPDB kanji action is no longer available.');
        if (!action.enabled) throw new Error('JPDB kanji action is disabled.');
        log.info('Performing JPDB kanji action', { kanji: action.kanji, role: action.role, kind: action.kind });
        await requestText(action.url, {
            method: action.method,
            payload: action.payload,
        });
        this.cache.delete(action.kanji);
        return this.lookup(action.kanji);
    }

    private async fetchInfo(kanji: string): Promise<JpdbKanjiInfo | null> {
        const html = await requestText(`${JPDB_KANJI_BASE_URL}/${encodeURIComponent(kanji)}`).catch(error => {
            log.warn('Kanji page request failed', { kanji }, error);
            return '';
        });
        const info = html ? parseJpdbKanjiHtml(html, kanji) : null;
        if (info) {
            visibleJpdbKanjiActions(info).forEach(action => this.actions.set(action.id, action));
        }
        log.debug('Kanji info parsed', { kanji, found: Boolean(info) });
        return info;
    }
}

export function parseJpdbKanjiHtml(html: string, kanji: string): JpdbKanjiInfo | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const keyword = sectionText(doc, 'Keyword') || metaKeyword(doc, kanji);
    if (!keyword) return null;

    const infoRows = infoTableRows(doc);
    const actions = kanjiActions(doc, kanji);
    const visibleActions = actions.filter(isVisibleKanjiAction);
    return {
        kanji,
        keyword,
        frequency: infoRows.get('Frequency') ?? '',
        type: infoRows.get('Type') ?? '',
        kanken: infoRows.get('Kanken') ?? '',
        heisig: infoRows.get('Heisig') ?? '',
        oldForms: oldForms(doc),
        readings: readings(doc),
        components: components(doc),
        usedInKanji: usedInKanji(doc),
        mnemonic: sectionText(doc, 'Mnemonic'),
        vocabulary: vocabulary(doc).slice(0, 8),
        actions,
        loggedIn: isLoggedIn(doc),
        kanjiReviewsEnabled: visibleActions.length > 0,
    };
}

export function visibleJpdbKanjiActions(info: JpdbKanjiInfo | null): JpdbKanjiAction[] {
    if (!info?.kanjiReviewsEnabled) return [];
    return info.actions.filter(isVisibleKanjiAction).slice(0, 3);
}

export function jpdbKanjiActionClass(action: JpdbKanjiAction): string {
    if (action.role === 'mine' || action.role === 'review') return 'add';
    if (action.role === 'known' || action.role === 'neverforget') return 'nf';
    if (action.role === 'blacklist') return 'blacklist';
    if (action.role === 'forget') return 'nf danger';
    return '';
}

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
        const url = absoluteJpdbUrl(form.getAttribute('action') || `/kanji/${encodeURIComponent(kanji)}`);
        const submitters = Array.from(form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input[type="submit"], input[type="button"]'))
            .filter(submitter => cleanText(labelForControl(submitter)) && submitter.getAttribute('type')?.toLowerCase() !== 'button');
        const controls = submitters.length ? submitters : [form];
        controls.forEach(control => {
            const label = cleanText(control instanceof HTMLFormElement ? form.textContent ?? '' : labelForControl(control));
            if (!label) return;
            push({
                kanji,
                label,
                role: classifyKanjiAction(label, `${url} ${control instanceof HTMLFormElement ? form.textContent ?? '' : control.getAttribute('value') ?? ''}`),
                kind: 'form',
                method,
                url,
                payload: formPayload(form, control instanceof HTMLFormElement ? null : control),
                enabled: !(control instanceof HTMLFormElement) && isDisabled(control) ? false : !isDisabled(form),
            });
        });
    });

    menu.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
        if (link.closest('form')) return;
        const label = cleanText(labelForControl(link));
        if (!label) return;
        const url = absoluteJpdbUrl(link.getAttribute('href') ?? '');
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
    if (element instanceof HTMLInputElement) return element.getAttribute('aria-label') || element.title || element.value || element.name;
    return element.getAttribute('aria-label') || (element as HTMLElement).title || element.textContent || '';
}

function classifyKanjiAction(label: string, context: string): JpdbKanjiActionRole {
    const labelText = label.toLowerCase();
    const text = `${label} ${context}`.toLowerCase();
    if (/\b(enable|settings?|configure|preferences?|history|stats?|open|view)\b/.test(labelText)) return 'other';
    if (/\b(blacklist|unblacklist|block|ignore|suspend)\b/.test(text)) return 'blacklist';
    if (/\b(never[-\s]?forget|always\s+remember)\b/.test(text)) return 'neverforget';
    if (/\b(forget|remove|delete|unlearn)\b/.test(text)) return 'forget';
    if (/\b(known|know|learned|mark\s+known|remember)\b/.test(text)) return 'known';
    if (/\b(review|due|study)\b/.test(text)) return 'review';
    if (/\b(add|mine|mining|deck|prioriti[sz]e|learn)\b/.test(text)) return 'mine';
    return 'other';
}

function formPayload(form: HTMLFormElement, submitter: Element | null): Record<string, string> {
    const payload: Record<string, string> = {};
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => {
        if (control instanceof HTMLInputElement) {
            const type = control.type.toLowerCase();
            if (!control.name || type === 'submit' || type === 'button' || type === 'image' || type === 'reset' || type === 'file') return;
            if ((type === 'checkbox' || type === 'radio') && !control.checked) return;
            payload[control.name] = control.value;
            return;
        }
        if (!control.name) return;
        payload[control.name] = control.value;
    });
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
        const name = submitter.name;
        if (name) payload[name] = submitter.value;
    }
    return payload;
}

function isDisabled(element: Element): boolean {
    return element.hasAttribute('disabled')
        || element.getAttribute('aria-disabled') === 'true'
        || element.classList.contains('disabled')
        || element.classList.contains('is-disabled');
}

function absoluteJpdbUrl(value: string): string {
    try {
        return new URL(value || '/', 'https://jpdb.io').toString();
    } catch {
        return 'https://jpdb.io/';
    }
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
        const link = element.querySelector<HTMLAnchorElement>('.jp a[href^="/vocabulary/"]');
        if (!link) return;
        const { expression, reading } = vocabularyFromHref(link.getAttribute('href') ?? '');
        const fallbackExpression = expression || textWithoutRuby(link);
        const meaning = cleanText(element.querySelector('.en')?.textContent ?? '');
        if (!JAPANESE_RE.test(fallbackExpression) || !meaning) return;
        entries.push({
            expression: fallbackExpression,
            reading,
            meaning,
            url: new URL(link.getAttribute('href') ?? '', 'https://jpdb.io').toString(),
        });
    });
    return entries;
}

function vocabularyFromHref(href: string): { expression: string; reading: string } {
    const path = href.split('#')[0] ?? href;
    const parts = path.split('/').filter(Boolean);
    if (parts[0] !== 'vocabulary') return { expression: '', reading: '' };
    return {
        expression: decodePathPart(parts[2] ?? ''),
        reading: decodePathPart(parts[3] ?? ''),
    };
}

function decodePathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
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

function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function cleanInfoTableValue(cell: Element): string {
    return cleanText(cell.textContent ?? '').replace(/\s+\?$/, '');
}

function isMissingSectionValue(value: string, section: Element | null): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === '' || normalized === 'missing' || (section?.querySelector('.keyword-missing') !== null);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requestText(url: string, options: { method?: 'GET' | 'POST'; payload?: Record<string, string> } = {}): Promise<string> {
    const method = options.method ?? 'GET';
    const body = options.payload && Object.keys(options.payload).length ? new URLSearchParams(options.payload).toString() : '';
    const requestUrl = method === 'GET' && body ? `${url}${url.includes('?') ? '&' : '?'}${body}` : url;
    const headers = method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined;
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Kanji page request via userscript API');
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method,
                url: requestUrl,
                headers,
                data: method === 'POST' ? body : undefined,
                timeout: 8000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? ''));
                    else reject(new Error(`JPDB kanji request failed (${response.status}).`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('JPDB kanji request timed out.')),
            });
        });
    }

    const fetchUrl = publicFetchUrl(requestUrl, method);
    if (!fetchUrl) return Promise.reject(new Error('Cross-origin JPDB kanji request needs a userscript HTTP bridge.'));

    log.debug('Kanji page request via fetch');
    return fetch(fetchUrl, {
        method,
        headers,
        body: method === 'POST' ? body : undefined,
        credentials: 'include',
        redirect: 'follow',
    }).then(response => {
        if (!response.ok) throw new Error(`JPDB kanji request failed (${response.status}).`);
        return response.text();
    });
}

function publicFetchUrl(url: string, method: 'GET' | 'POST'): string | null {
    try {
        const target = new URL(url, location.href);
        if (target.origin === location.origin) return target.href;
        if (method === 'GET' && isLoopbackPage()) return `/__jpdb-reader-dictionary-proxy?url=${encodeURIComponent(target.href)}`;
        return null;
    } catch {
        return url;
    }
}

function isLoopbackPage(): boolean {
    return typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
}
