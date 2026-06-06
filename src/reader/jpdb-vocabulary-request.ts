import { parseHtmlDocument } from './dom';
import { jpdbSearchUrl, requestPublicJpdbText, unique } from './jpdb-public-lookup';
import { absoluteJpdbUrl, cleanText } from './jpdb-text';
import {
    JPDB_COMPOUND_LIMIT,
    JPDB_EXAMPLE_LIMIT,
    JPDB_USED_IN_VOCABULARY_LIMIT,
    JPDB_VOCABULARY_BASE_URL,
} from './jpdb-vocabulary-constants';
import { mergeBy, uniqueBy } from './jpdb-vocabulary-dom';
import { vocabularyRoot } from './jpdb-vocabulary-root';
import type { JpdbVocabularyInfo, VocabularySupplementKind, VocabularySupplementUrl } from './jpdb-vocabulary-types';

export function vocabularyLookupUrls(vid: number, spelling: string, reading: string): string[] {
    const urls: string[] = [];
    if (vid > 0) {
        urls.push(`${JPDB_VOCABULARY_BASE_URL}/${vid}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading || spelling)}`);
    }
    unique([spelling, reading].filter(Boolean))
        .forEach(query => urls.push(jpdbSearchUrl(query)));
    return unique(urls);
}

export function vocabularySupplementUrls(html: string, spelling: string, reading: string, currentUrl = ''): VocabularySupplementUrl[] {
    const doc = parseHtmlDocument(html);
    const current = absoluteJpdbUrl(currentUrl);
    return uniqueBy([
        ...vocabularyDetailUrls(doc, spelling, reading),
        ...vocabularyExpandUrls(doc),
    ], supplement => `${supplement.kind}:${supplement.url}`)
        .filter(supplement => !current || supplement.url !== current);
}

function vocabularyDetailUrls(doc: Document, spelling: string, reading: string): VocabularySupplementUrl[] {
    if (!doc.querySelector('.results.search')) return [];
    const root = vocabularyRoot(doc, spelling, reading);
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('a.view-conjugations-link[href*="/vocabulary/"]'))
        .filter(link => /more details/i.test(cleanText(link.textContent ?? '')))
        .map(link => absoluteJpdbUrl(link.getAttribute('href') ?? link.href))
        .filter(Boolean)
        .map(url => ({ url, kind: 'details' as const }));
}

function vocabularyExpandUrls(doc: Document): VocabularySupplementUrl[] {
    return Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="expand="]'))
        .map(link => vocabularyExpandSupplement(link.getAttribute('href') ?? link.href))
        .filter((supplement): supplement is VocabularySupplementUrl => supplement !== null);
}

function vocabularyExpandSupplement(value: string): VocabularySupplementUrl | null {
    try {
        const url = new URL(value, 'https://jpdb.io');
        const expand = url.searchParams.get('expand') ?? '';
        if (expand.includes('e')) return { url: url.toString(), kind: 'examples' };
        if (expand.includes('v')) return { url: url.toString(), kind: 'used-in-vocabulary' };
    } catch {
        return null;
    }
    return null;
}

export function needsSupplement(info: JpdbVocabularyInfo, kind: VocabularySupplementKind): boolean {
    if (kind === 'details') {
        return info.examples.length < JPDB_EXAMPLE_LIMIT
            || (info.usedInVocabulary?.length ?? 0) < JPDB_USED_IN_VOCABULARY_LIMIT
            || info.compounds.length < JPDB_COMPOUND_LIMIT;
    }
    if (kind === 'examples') return info.examples.length < JPDB_EXAMPLE_LIMIT;
    return (info.usedInVocabulary?.length ?? 0) < JPDB_USED_IN_VOCABULARY_LIMIT;
}

export function mergeVocabularyInfo(primary: JpdbVocabularyInfo, supplemental: JpdbVocabularyInfo): JpdbVocabularyInfo {
    return {
        meanings: unique([...primary.meanings, ...supplemental.meanings]).slice(0, 8),
        compounds: mergeBy(primary.compounds, supplemental.compounds, compound => `${compound.term}\t${compound.reading}`, JPDB_COMPOUND_LIMIT),
        usedInVocabulary: mergeBy(
            primary.usedInVocabulary ?? [],
            supplemental.usedInVocabulary ?? [],
            entry => `${entry.term}\t${entry.reading}`,
            JPDB_USED_IN_VOCABULARY_LIMIT,
        ),
        examples: mergeBy(primary.examples, supplemental.examples, example => example.sentence, JPDB_EXAMPLE_LIMIT),
    };
}

export function requestText(url: string, proxyUrl = '', timeoutMs = 8000): Promise<string> {
    return requestPublicJpdbText(url, {
        proxyUrl,
        timeoutMs,
        credentials: 'same-origin',
        withCredentials: true,
        failureLabel: 'JPDB vocabulary request',
        timeoutLabel: 'JPDB vocabulary request timed out.',
    });
}
