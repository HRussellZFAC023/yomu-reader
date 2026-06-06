import { booleanValue, finiteNumber, hasOwn, objectRecord, stringValue } from './values';
import type { DictionaryLookupLink, DictionaryPreference, ReaderSettings } from '../types';

export const MAX_DICTIONARY_LOOKUP_LINKS = 12;

export const JPDB_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jpdb',
    label: 'JPDB',
    urlTemplate: 'https://jpdb.io/search?q={query}',
    enabled: true,
};

export const JISHO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jisho',
    label: 'Jisho',
    urlTemplate: 'https://jisho.org/search/{query}',
    enabled: true,
};

export const JITEN_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jiten',
    label: 'Jiten',
    urlTemplate: 'https://jiten.moe/parse?text={query}',
    enabled: true,
};

const WEBLIO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'weblio',
    label: 'Weblio',
    urlTemplate: 'https://www.weblio.jp/content/{query}',
    enabled: false,
};

const GOO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'goo',
    label: 'goo',
    urlTemplate: 'https://dictionary.goo.ne.jp/srch/all/{query}/m0u/',
    enabled: false,
};

const KOTOBANK_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'kotobank',
    label: 'Kotobank',
    urlTemplate: 'https://kotobank.jp/search?q={query}',
    enabled: false,
};

const TAKOBOTO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'takoboto',
    label: 'Takoboto',
    urlTemplate: 'https://takoboto.jp/?q={query}',
    enabled: false,
};

const WIKTIONARY_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'wiktionary-ja',
    label: 'Wiktionary',
    urlTemplate: 'https://ja.wiktionary.org/wiki/{query}',
    enabled: false,
};

const IMMERSION_KIT_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'immersion-kit',
    label: 'Immersion Kit',
    urlTemplate: 'https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1',
    enabled: false,
};

const UCHISEN_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'uchisen',
    label: 'Uchisen',
    urlTemplate: 'https://uchisen.com/kanji/{query}',
    enabled: false,
};

export const COPY_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'copy',
    label: 'Copy',
    urlTemplate: '',
    enabled: true,
    action: 'copy',
};

export const DEFAULT_DICTIONARY_LOOKUP_LINKS: DictionaryLookupLink[] = [
    JPDB_LOOKUP_LINK,
    JITEN_LOOKUP_LINK,
    JISHO_LOOKUP_LINK,
    WEBLIO_LOOKUP_LINK,
    GOO_LOOKUP_LINK,
    KOTOBANK_LOOKUP_LINK,
    TAKOBOTO_LOOKUP_LINK,
    WIKTIONARY_LOOKUP_LINK,
    IMMERSION_KIT_LOOKUP_LINK,
    UCHISEN_LOOKUP_LINK,
    COPY_LOOKUP_LINK,
];

type LegacyLookupLinkSpec = Pick<DictionaryLookupLink, 'id' | 'label' | 'urlTemplate' | 'enabled'> & {
    action?: DictionaryLookupLink['action'];
};

const LEGACY_DEFAULT_LOOKUP_LINK_SET: LegacyLookupLinkSpec[] = [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    JISHO_LOOKUP_LINK,
    COPY_LOOKUP_LINK,
];

export function normalizeDictionaryLookupLinkSettings(value: Partial<ReaderSettings> | null): ReaderSettings['dictionaryLookupLinks'] {
    const links = normalizeDictionaryLookupLinks(
        value?.dictionaryLookupLinks,
        !hasOwn(value, 'dictionaryLookupLinks') && Boolean(value?.apiKey?.trim()),
    );
    return isLegacyDefaultLookupLinkSet(value?.dictionaryLookupLinks)
        ? legacyDefaultLookupLinksWithNewBuiltIns(links)
        : links;
}

export function normalizeDictionaryPreferences(value: unknown): DictionaryPreference[] {
    if (!Array.isArray(value)) return [];
    return value
        .map(normalizeDictionaryPreference)
        .filter((item): item is DictionaryPreference => item !== null)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function normalizeDictionaryPreference(item: unknown, index: number): DictionaryPreference | null {
    const record = objectRecord(item);
    if (!record) return null;
    const name = stringValue(record.name);
    if (!name.trim()) return null;
    const alias = stringValue(record.alias);
    return {
        name,
        alias: alias.trim() ? alias : name,
        enabled: booleanValue(record.enabled, true),
        priority: finiteNumber(record.priority, index),
        allowSecondarySearches: booleanValue(record.allowSecondarySearches, false),
        type: normalizeDictionaryType(record.type, name),
    };
}

export function defaultDictionaryLookupLinks(mode: 'jpdb' | 'local' = 'local'): DictionaryLookupLink[] {
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => ({
        ...link,
        enabled: mode === 'jpdb' ? link.id === 'jpdb' || link.id === 'jiten' || link.id === 'jisho' : link.enabled,
    }));
}

function legacyDefaultLookupLinksWithNewBuiltIns(links: DictionaryLookupLink[]): DictionaryLookupLink[] {
    const linkById = new Map(links.map(link => [link.id, link]));
    return defaultDictionaryLookupLinks('local').map(defaultLink => {
        const link = linkById.get(defaultLink.id) ?? defaultLink;
        return link.id === JPDB_LOOKUP_LINK.id ? { ...link, enabled: true } : link;
    });
}

function isLegacyDefaultLookupLinkSet(value: unknown): boolean {
    const links = normalizeLegacyLookupLinkSet(value);
    return Boolean(links && LEGACY_DEFAULT_LOOKUP_LINK_SET.every((expected, index) => (
        matchesLegacyLookupLink(links[index], expected)
    )));
}

function normalizeLegacyLookupLinkSet(value: unknown): DictionaryLookupLink[] | null {
    if (!Array.isArray(value) || value.length !== LEGACY_DEFAULT_LOOKUP_LINK_SET.length) return null;
    const links = value.map(normalizeDictionaryLookupLink);
    return links.every(isDictionaryLookupLink) ? links : null;
}

function isDictionaryLookupLink(link: DictionaryLookupLink | null): link is DictionaryLookupLink {
    return link !== null;
}

function matchesLegacyLookupLink(link: DictionaryLookupLink | undefined, expected: LegacyLookupLinkSpec): boolean {
    return Boolean(link
        && link.id === expected.id
        && link.label === expected.label
        && link.urlTemplate === expected.urlTemplate
        && link.enabled === expected.enabled
        && (expected.action === undefined || link.action === expected.action));
}

export function normalizeDictionaryLookupLinks(value: unknown, preferJpdb = false): DictionaryLookupLink[] {
    const builtIns = defaultDictionaryLookupLinks(defaultLookupLinkMode(preferJpdb));
    if (!Array.isArray(value)) return builtIns;

    const normalized: DictionaryLookupLink[] = [];
    const seen = new Set<string>();
    const add = (link: DictionaryLookupLink) => {
        const id = link.id.trim();
        if (!id || seen.has(id) || normalized.length >= MAX_DICTIONARY_LOOKUP_LINKS) return;
        seen.add(id);
        normalized.push({ ...link, id });
    };

    for (const item of value) {
        const link = normalizeDictionaryLookupLink(item);
        if (link) add(link);
    }

    appendMissingBuiltInLookupLinks(builtIns, seen, add);

    return normalized.slice(0, MAX_DICTIONARY_LOOKUP_LINKS);
}

function defaultLookupLinkMode(preferJpdb: boolean): 'jpdb' | 'local' {
    return preferJpdb ? 'jpdb' : 'local';
}

function appendMissingBuiltInLookupLinks(builtIns: DictionaryLookupLink[], seen: Set<string>, add: (link: DictionaryLookupLink) => void): void {
    for (const builtIn of builtIns) {
        if (!seen.has(builtIn.id)) add(builtIn);
    }
}

function normalizeDictionaryLookupLink(value: unknown): DictionaryLookupLink | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<DictionaryLookupLink> & { id?: unknown; label?: unknown; urlTemplate?: unknown; enabled?: unknown; action?: unknown };
    const id = normalizedLookupLinkId(record);
    const label = normalizedLookupLinkLabel(record, id);
    const urlTemplate = normalizedLookupLinkUrlTemplate(record);
    const action = normalizedLookupLinkAction(record, id);
    if (!isUsableDictionaryLookupLink(id, label, urlTemplate, action)) return null;
    return {
        id,
        label,
        urlTemplate,
        enabled: normalizedLookupLinkEnabled(record),
        action,
    };
}

function normalizedLookupLinkUrlTemplate(record: { urlTemplate?: unknown }): string {
    return typeof record.urlTemplate === 'string' ? record.urlTemplate.trim() : '';
}

function normalizedLookupLinkEnabled(record: { enabled?: unknown }): boolean {
    return typeof record.enabled === 'boolean' ? record.enabled : true;
}

function isUsableDictionaryLookupLink(
    id: string,
    label: string,
    urlTemplate: string,
    action: DictionaryLookupLink['action'],
): boolean {
    if (!id || !label) return false;
    return action === 'copy' || Boolean(urlTemplate && isSafeLookupUrlTemplate(urlTemplate));
}

function normalizedLookupLinkId(record: { id?: unknown; label?: unknown }): string {
    if (typeof record.id === 'string' && record.id.trim()) return record.id.trim();
    return typeof record.label === 'string' ? `custom-${stableLookupLinkId(record.label)}` : '';
}

function normalizedLookupLinkLabel(record: { label?: unknown }, id: string): string {
    return typeof record.label === 'string' && record.label.trim()
        ? record.label.trim().slice(0, 24)
        : id;
}

function normalizedLookupLinkAction(record: { action?: unknown }, id: string): DictionaryLookupLink['action'] {
    return record.action === 'copy' || id === 'copy' ? 'copy' : 'open';
}

function stableLookupLinkId(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return slug || 'lookup';
}

function isSafeLookupUrlTemplate(value: string): boolean {
    try {
        const url = new URL(value.replace(/\{[^}]+\}/g, 'x'));
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export function mergeDictionaryPreferences(current: DictionaryPreference[], names: string[], types: Record<string, DictionaryPreference['type']> = {}): DictionaryPreference[] {
    const merged = new Map(current.map(item => [item.name, item]));
    for (const name of names) {
        mergeDictionaryPreference(merged, name, types[name] ?? inferDictionaryTypeFromName(name));
    }
    return normalizeDictionaryPreferences([...merged.values()]);
}

function mergeDictionaryPreference(merged: Map<string, DictionaryPreference>, name: string, type: DictionaryPreference['type']): void {
    const existing = merged.get(name);
    if (!existing) {
        merged.set(name, defaultDictionaryPreference(name, type, merged.size));
        return;
    }
    if (!existing.type) merged.set(name, { ...existing, type });
}

function defaultDictionaryPreference(name: string, type: DictionaryPreference['type'], priority: number): DictionaryPreference {
    return {
        name,
        alias: name,
        enabled: true,
        priority,
        allowSecondarySearches: false,
        type,
    };
}

function normalizeDictionaryType(value: unknown, name = ''): DictionaryPreference['type'] {
    if (value === 'terms' || value === 'kanji' || value === 'frequency' || value === 'metadata') return value;
    return inferDictionaryTypeFromName(name);
}

function inferDictionaryTypeFromName(name: string): DictionaryPreference['type'] {
    const normalized = name.toLowerCase();
    if (/\b(?:frequency|freq|jpdbv?\d*|bccwj|jiten|cc100|kwdlc|aozora|netflix|novel|anime|vn)\b/.test(normalized)) return 'frequency';
    if (/\b(?:kanjidic|kanji)\b/.test(normalized)) return 'kanji';
    return 'terms';
}
