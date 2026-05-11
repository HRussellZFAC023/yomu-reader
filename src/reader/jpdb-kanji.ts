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
    mnemonic: string;
    vocabulary: JpdbKanjiVocabulary[];
}

const JPDB_KANJI_BASE_URL = 'https://jpdb.io/kanji';
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

export class JpdbKanjiClient {
    private cache = new Map<string, Promise<JpdbKanjiInfo | null>>();

    lookup(kanji: string): Promise<JpdbKanjiInfo | null> {
        const key = Array.from(kanji)[0] ?? kanji;
        if (!key) return Promise.resolve(null);
        let promise = this.cache.get(key);
        if (!promise) {
            promise = this.fetchInfo(key);
            this.cache.set(key, promise);
        }
        return promise;
    }

    private async fetchInfo(kanji: string): Promise<JpdbKanjiInfo | null> {
        const html = await requestText(`${JPDB_KANJI_BASE_URL}/${encodeURIComponent(kanji)}`).catch(() => '');
        return html ? parseJpdbKanjiHtml(html, kanji) : null;
    }
}

export function parseJpdbKanjiHtml(html: string, kanji: string): JpdbKanjiInfo | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const keyword = sectionText(doc, 'Keyword') || metaKeyword(doc, kanji);
    if (!keyword) return null;

    const infoRows = infoTableRows(doc);
    return {
        kanji,
        keyword,
        frequency: infoRows.get('Frequency') ?? '',
        type: [infoRows.get('Type'), infoRows.get('')].filter(Boolean).join(', '),
        kanken: infoRows.get('Kanken') ?? '',
        heisig: infoRows.get('Heisig') ?? '',
        oldForms: oldForms(doc),
        readings: readings(doc),
        components: components(doc),
        mnemonic: sectionText(doc, 'Mnemonic'),
        vocabulary: vocabulary(doc).slice(0, 8),
    };
}

function sectionText(doc: Document, label: string): string {
    const heading = Array.from(doc.querySelectorAll('.subsection-label'))
        .find(element => cleanText(element.textContent ?? '') === label);
    const section = heading?.parentElement?.querySelector('.subsection');
    return cleanText(section?.textContent ?? '');
}

function infoTableRows(doc: Document): Map<string, string> {
    const rows = new Map<string, string>();
    doc.querySelectorAll('.cross-table tr').forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 2) return;
        const key = cleanText(cells[0].textContent ?? '');
        const value = cleanText(cells[1].textContent ?? '');
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
    return Array.from(doc.querySelectorAll('.subsection-composed-of-kanji .subsection > div'))
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

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requestText(url: string): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
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

    return fetch(url).then(response => {
        if (!response.ok) throw new Error(`JPDB kanji request failed (${response.status}).`);
        return response.text();
    });
}

function getUserscriptHttpRequest(): UserscriptHttpRequest | undefined {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    if (typeof GM !== 'undefined') return GM.xmlHttpRequest ?? GM.xmlhttpRequest;
    return undefined;
}
