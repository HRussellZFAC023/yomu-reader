import { booleanValue, finiteNumber, hasOwn, objectRecord, stringValue } from './values';
import { NEW_TAB_PAGE_URL } from '../app/constants';
import { activeLanguageProfile } from '../languages';
import { yomitanDictionaryIdentity } from '../dictionaries/yomitan/zip-normalize';
import { IMMERSION_KIT_SEARCH_URL_TEMPLATE, NADESHIKO_SEARCH_URL_TEMPLATE } from '../immersion/search-links';
import { hasTargetLookupSites, isTargetLookupLinkId, targetLookupLinks } from './lookup-links';
import type { DictionaryLookupLink, DictionaryPreference, ReaderSettings } from '../app/types';

export const MAX_EXTRA_LOOKUP_LINKS = 16;

const JPDB_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jpdb',
    label: 'JPDB',
    urlTemplate: 'https://jpdb.io/search?q={query}',
    enabled: true,
};

// The live-frequency pills are merged into their sibling link pill (Jiten/JPDB)
// when showLookupPillFrequency is on, so the label is just the site name — the
// rank renders inline as "Jiten #18447". Both default on so the rank shows out of
// the box on fresh installs; existing users keep whatever they saved (we don't
// override a deliberately disabled pill — they can enable it in settings).
const JITEN_LIVE_FREQUENCY_PILL: DictionaryLookupLink = {
    id: 'jiten-frequency',
    label: 'Jiten',
    urlTemplate: '',
    enabled: true,
    action: 'frequency-live',
};

const JPDB_LIVE_FREQUENCY_PILL: DictionaryLookupLink = {
    id: 'jpdb-frequency',
    label: 'JPDB',
    urlTemplate: '',
    enabled: true,
    action: 'frequency-live',
};

const JISHO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jisho',
    label: 'Jisho',
    urlTemplate: 'https://jisho.org/search/{query}',
    enabled: false,
};

const YOMU_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'yomu-search',
    label: 'Yomu',
    urlTemplate: `${NEW_TAB_PAGE_URL}index.html?q={query}`,
    enabled: true,
};

const JITEN_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jiten',
    label: 'Jiten',
    urlTemplate: 'https://jiten.moe/parse?text={query}',
    enabled: true,
};

const BUNPRO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'bunpro',
    label: 'Bunpro',
    urlTemplate: 'https://bunpro.jp/search?query={query}',
    enabled: true,
};

const BUNPRO_LIVE_FREQUENCY_PILL: DictionaryLookupLink = {
    id: 'bunpro-frequency',
    label: 'Bunpro',
    urlTemplate: '',
    enabled: true,
    action: 'frequency-live',
};

const WEBLIO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'weblio',
    label: 'Weblio',
    urlTemplate: 'https://www.weblio.jp/content/{query}',
    enabled: false,
};

const REMOVED_GOO_LOOKUP_LINK_ID = 'goo';

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
    urlTemplate: IMMERSION_KIT_SEARCH_URL_TEMPLATE,
    enabled: false,
};

const NADESHIKO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'nadeshiko',
    label: 'Nadeshiko',
    urlTemplate: NADESHIKO_SEARCH_URL_TEMPLATE,
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
    YOMU_LOOKUP_LINK,
    JITEN_LOOKUP_LINK,
    JITEN_LIVE_FREQUENCY_PILL,
    JPDB_LOOKUP_LINK,
    JPDB_LIVE_FREQUENCY_PILL,
    BUNPRO_LOOKUP_LINK,
    BUNPRO_LIVE_FREQUENCY_PILL,
    JISHO_LOOKUP_LINK,
    WEBLIO_LOOKUP_LINK,
    KOTOBANK_LOOKUP_LINK,
    TAKOBOTO_LOOKUP_LINK,
    WIKTIONARY_LOOKUP_LINK,
    IMMERSION_KIT_LOOKUP_LINK,
    NADESHIKO_LOOKUP_LINK,
    UCHISEN_LOOKUP_LINK,
    COPY_LOOKUP_LINK,
];

export const MAX_LOOKUP_LINK_ROWS = DEFAULT_DICTIONARY_LOOKUP_LINKS.length + MAX_EXTRA_LOOKUP_LINKS;

type LegacyLookupLinkSpec = Pick<DictionaryLookupLink, 'id' | 'label' | 'urlTemplate' | 'enabled'> & {
    action?: DictionaryLookupLink['action'];
};

const LEGACY_DEFAULT_LOOKUP_LINK_SET: LegacyLookupLinkSpec[] = [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    { ...JISHO_LOOKUP_LINK, enabled: true },
    COPY_LOOKUP_LINK,
];

const PREVIOUS_DEFAULT_LOOKUP_LINK_ID_ORDERS = [[
    // The Yomu-first default immediately before the Nadeshiko search pill was
    // added. Untouched installs receive the new pill beside Immersion Kit;
    // custom orders still keep their order and get new built-ins appended.
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    JITEN_LIVE_FREQUENCY_PILL.id,
    JPDB_LOOKUP_LINK.id,
    JPDB_LIVE_FREQUENCY_PILL.id,
    BUNPRO_LOOKUP_LINK.id,
    BUNPRO_LIVE_FREQUENCY_PILL.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id,
], [
    // The jiten-first default that shipped before Yomu was promoted to the front
    // of the pill row. Users who never re-ordered their pills are migrated to the
    // current Yomu-first default order instead of being pinned to the old layout.
    JITEN_LOOKUP_LINK.id,
    JITEN_LIVE_FREQUENCY_PILL.id,
    JPDB_LOOKUP_LINK.id,
    JPDB_LIVE_FREQUENCY_PILL.id,
    YOMU_LOOKUP_LINK.id,
    BUNPRO_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id,
], [
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id,
], [
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    YOMU_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id,
], [
    JPDB_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id,
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
]];

export function normalizeDictionaryLookupLinkSettings(
    value: Partial<ReaderSettings> | null,
    targetLanguage = 'ja',
): ReaderSettings['dictionaryLookupLinks'] {
    const links = normalizeDictionaryLookupLinks(
        value?.dictionaryLookupLinks,
        !hasOwn(value, 'dictionaryLookupLinks') && Boolean(value?.apiKey?.trim()),
        targetLanguage,
    );
    if (targetLanguage === 'ja' && isPreviousDefaultLookupLinkSet(value?.dictionaryLookupLinks)) {
        return savedLookupLinksInDefaultOrder(links);
    }
    return targetLanguage === 'ja' && isLegacyDefaultLookupLinkSet(value?.dictionaryLookupLinks)
        ? legacyDefaultLookupLinksWithNewBuiltIns(links)
        : links;
}

/**
 * Where a dictionary nobody has ordered yet sits.
 *
 * The definition-source editor numbers its rows from 0, and the built-in
 * sources (Jiten 0, JPDB 1, Bunpro 2, WaniKani 3, ... Anki 90) live in that
 * same space. An imported dictionary that fell back to its ARRAY INDEX
 * therefore landed on 0 and tied with Jiten, and the tie was broken
 * alphabetically -- which is why "Jiten" sat above Jitendex, JMdict and
 * JMnedict however the shelf was arranged (GitHub #43). Unordered means last,
 * and 1000 is already what `orderedDefinitionSourceIds` uses for a dictionary
 * with no preference row at all.
 */
export const UNORDERED_DICTIONARY_PRIORITY_BASE = 1000;

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
        priority: finiteNumber(record.priority, UNORDERED_DICTIONARY_PRIORITY_BASE + index),
        allowSecondarySearches: booleanValue(record.allowSecondarySearches, false),
        type: normalizeDictionaryType(record.type, name),
    };
}

/**
 * The built-in pill row for a target.
 *
 * Japanese returns `DEFAULT_DICTIONARY_LOOKUP_LINKS` unchanged — same entries,
 * same order, same enabled flags — because every existing install is Japanese
 * and none of them may see their row move. Any other target gets the verified
 * hotlink set from `config/multilingual/lookup-links.json`, wrapped in the same
 * two pills that are language-neutral: Yomu's own search at the front and Copy
 * at the back. The Jiten/JPDB/Bunpro pills are deliberately absent — those are
 * Japanese services and pointing a Spanish word at them returns nothing.
 */
export function defaultDictionaryLookupLinks(
    mode: 'jpdb' | 'local' = 'local',
    targetLanguage = 'ja',
): DictionaryLookupLink[] {
    // `jpdb` mode narrows the row to the parser's own pills, which only exist for
    // Japanese. Applying it to another target would leave that learner with just
    // the Yomu pill and no dictionary at all.
    if (targetLanguage !== 'ja' && hasTargetLookupSites(targetLanguage)) {
        return [YOMU_LOOKUP_LINK, ...targetLookupLinks(targetLanguage), COPY_LOOKUP_LINK]
            .map((link, index) => ({ ...link, priority: index }));
    }
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link, index) => ({
        ...link,
        priority: index,
        enabled: mode === 'jpdb' ? link.id === 'jpdb' || link.id === 'jiten' || link.id === 'yomu-search' || link.id === 'bunpro' || link.id === 'jiten-frequency' || link.id === 'jpdb-frequency' || link.id === 'bunpro-frequency' : link.enabled,
    }));
}

/**
 * The pill row rebuilt for a different target.
 *
 * Switching target replaces the built-in rows with the incoming target's
 * verified hotlinks, because the outgoing target's sites cannot answer for it —
 * a Spanish word is a definition in `dle.rae.es` and a 404 in `words.hk`. Two
 * things survive the switch: every learner-owned or locally discovered row, and
 * the on/off state of any built-in both sets share (Wiktionary, Tatoeba, Forvo,
 * Glosbe, Yomu, Copy). That includes `frequency-local:*` rows: auto-discovering
 * an installed frequency dictionary must not turn a badge back on after the
 * learner disabled it.
 */
export function dictionaryLookupLinksForTarget(
    previous: DictionaryLookupLink[],
    targetLanguage: string,
): DictionaryLookupLink[] {
    const previousById = new Map(previous.map(link => [link.id, link]));
    const defaults = defaultDictionaryLookupLinks('local', targetLanguage).map(link => {
        const saved = previousById.get(link.id);
        return saved ? { ...link, enabled: saved.enabled } : link;
    });
    const defaultIds = new Set(defaults.map(link => link.id));
    const japaneseDefaultIds = new Set(DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => link.id));
    const portable = previous.filter(link => (
        !defaultIds.has(link.id)
        && !japaneseDefaultIds.has(link.id)
        && !isTargetLookupLinkId(link.id)
    ));
    return normalizeDictionaryLookupLinks(
        insertPortableLookupLinks(defaults, portable),
        false,
        targetLanguage,
    );
}

function insertPortableLookupLinks(
    defaults: DictionaryLookupLink[],
    portable: DictionaryLookupLink[],
): DictionaryLookupLink[] {
    const links = [...defaults];
    for (const link of portable) {
        const requestedIndex = typeof link.priority === 'number' && Number.isFinite(link.priority)
            ? Math.max(0, link.priority)
            : links.length;
        links.splice(Math.min(requestedIndex, links.length), 0, link);
    }
    return links;
}

function legacyDefaultLookupLinksWithNewBuiltIns(links: DictionaryLookupLink[]): DictionaryLookupLink[] {
    const linkById = new Map(links.map(link => [link.id, link]));
    return defaultDictionaryLookupLinks('local').map(defaultLink => {
        const link = linkById.get(defaultLink.id) ?? defaultLink;
        if (link.id === JPDB_LOOKUP_LINK.id || link.id === YOMU_LOOKUP_LINK.id) return { ...link, enabled: true };
        if (link.id === JISHO_LOOKUP_LINK.id) return { ...link, enabled: false };
        return link;
    });
}

function isLegacyDefaultLookupLinkSet(value: unknown): boolean {
    const links = normalizeLegacyLookupLinkSet(value);
    return Boolean(links && LEGACY_DEFAULT_LOOKUP_LINK_SET.every((expected, index) => (
        matchesLegacyLookupLink(links[index], expected)
    )));
}

function isPreviousDefaultLookupLinkSet(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    const links = normalizeLookupLinkSet(value, value.length);
    if (!links) return false;
    const linkIds = links.map(link => link.id).filter(id => !isRemovedBuiltInLookupLinkId(id));
    return PREVIOUS_DEFAULT_LOOKUP_LINK_ID_ORDERS.some(ids => {
        const expectedIds = ids.filter(id => !isRemovedBuiltInLookupLinkId(id));
        return linkIds.length === expectedIds.length && expectedIds.every((id, index) => linkIds[index] === id);
    });
}

function normalizeLegacyLookupLinkSet(value: unknown): DictionaryLookupLink[] | null {
    return normalizeLookupLinkSet(value, LEGACY_DEFAULT_LOOKUP_LINK_SET.length);
}

function normalizeLookupLinkSet(value: unknown, length: number): DictionaryLookupLink[] | null {
    if (!Array.isArray(value) || value.length !== length) return null;
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

export function normalizeDictionaryLookupLinks(
    value: unknown,
    preferJpdb = false,
    targetLanguage = 'ja',
): DictionaryLookupLink[] {
    const builtIns = defaultDictionaryLookupLinks(defaultLookupLinkMode(preferJpdb), targetLanguage);
    if (!Array.isArray(value)) return builtIns;

    const normalized: DictionaryLookupLink[] = [];
    const seen = new Set<string>();
    const defaults = new Map(builtIns.map(link => [link.id, link]));
    let extras = 0;
    const add = (link: DictionaryLookupLink) => {
        const id = link.id.trim();
        if (!id || seen.has(id)) return;
        const builtIn = defaults.get(id);
        const known = Boolean(builtIn);
        // A built-in belongs to the target whose catalogue/default row names
        // it.  Before target-aware lookup links shipped, every stored payload
        // already carried Japanese defaults.  Merely changing `builtIns` above
        // caused those old rows to be counted as learner-owned extras, so an
        // upgraded Spanish profile rendered RAE beside Jiten, JPDB, Jisho and
        // Bunpro.  The settings dialog rebuilt the row when the target changed
        // there, but startup normalization never reconciled a target selected
        // by an older build or another browser tab.
        //
        // Filter only known Yomu catalogue/default ids.  Truly custom rows —
        // including local frequency pills — remain portable exactly as before.
        if (!known && isBuiltInLookupLinkForAnotherTarget(id)) return;
        if (!known && extras >= MAX_EXTRA_LOOKUP_LINKS) return;
        seen.add(id);
        // Stored built-ins carry only learner choices. Their provider payload
        // belongs to the active target's checked catalogue: otherwise a shared
        // ID such as Wiktionary or Tatoeba keeps the outgoing target's URL.
        normalized.push(builtIn
            ? { ...builtIn, enabled: link.enabled, priority: link.priority }
            : { ...link, id });
        if (!known) extras++;
    };

    for (const item of value) {
        const link = normalizeDictionaryLookupLink(item);
        if (link && !isRemovedBuiltInLookupLink(link)) add(link);
    }

    appendMissingBuiltInLookupLinks(builtIns, seen, add);

    return withLookupLinkPriorities(normalized);
}

function isBuiltInLookupLinkForAnotherTarget(id: string): boolean {
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.some(link => link.id === id)
        || isTargetLookupLinkId(id);
}

function isRemovedBuiltInLookupLink(link: DictionaryLookupLink): boolean {
    return isRemovedBuiltInLookupLinkId(link.id);
}

function isRemovedBuiltInLookupLinkId(id: string): boolean {
    return id === REMOVED_GOO_LOOKUP_LINK_ID;
}

export function defaultLookupLinkMode(preferJpdb: boolean): 'jpdb' | 'local' {
    return preferJpdb ? 'jpdb' : 'local';
}

function savedLookupLinksInDefaultOrder(links: DictionaryLookupLink[]): DictionaryLookupLink[] {
    const linkById = new Map(links.map(link => [link.id, link]));
    return withLookupLinkPriorities(DEFAULT_DICTIONARY_LOOKUP_LINKS.map(defaultLink => linkById.get(defaultLink.id) ?? defaultLink));
}

function withLookupLinkPriorities(links: DictionaryLookupLink[]): DictionaryLookupLink[] {
    return links.map((link, index) => ({
        ...link,
        priority: link.priority === undefined || link.priority === Number.MAX_SAFE_INTEGER ? index : link.priority,
    }));
}

// A jiten-above-jpdb splice used to run on EVERY normalize, so a learner who
// dragged the JPDB pill above Jiten had it put back on the next save. The
// shipped default already lists Jiten first, so the order it enforced is the
// order a fresh install gets anyway; nothing but a deliberate drag was ever
// changed by it.

function appendMissingBuiltInLookupLinks(builtIns: DictionaryLookupLink[], seen: Set<string>, add: (link: DictionaryLookupLink) => void): void {
    for (const builtIn of builtIns) {
        if (!seen.has(builtIn.id)) add(builtIn);
    }
}

function normalizeDictionaryLookupLink(value: unknown): DictionaryLookupLink | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<DictionaryLookupLink> & { id?: unknown; label?: unknown; urlTemplate?: unknown; enabled?: unknown; action?: unknown; priority?: unknown };
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
        priority: finiteNumber(record.priority, Number.MAX_SAFE_INTEGER),
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
    return action === 'copy'
        || action === 'frequency-live'
        || action === 'frequency-local'
        || Boolean(urlTemplate && isSafeLookupUrlTemplate(urlTemplate));
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
    if (record.action === 'copy' || id === 'copy') return 'copy';
    if (record.action === 'frequency-live' || id === 'jiten-frequency' || id === 'jpdb-frequency') return 'frequency-live';
    if (record.action === 'frequency-local' || id.startsWith('frequency-local:')) return 'frequency-local';
    return 'open';
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

export function mergeDictionaryPreferences(current: DictionaryPreference[], names: string[], types: Record<string, DictionaryPreference['type']> = {}, replaced: string[] = []): DictionaryPreference[] {
    const merged = new Map(current.map(item => [item.name, item]));
    // Importing a newer revision of an installed dictionary deletes the old
    // revision's data, so its preference row must retire with it — otherwise
    // settings keeps listing an enabled source that can never render again.
    // The new revision inherits the retired row's customization.
    const inherited = retireReplacedDictionaryPreferences(merged, names, replaced);
    for (const name of names) {
        mergeDictionaryPreference(merged, name, types[name] ?? inferDictionaryTypeFromName(name), inherited.get(name));
    }
    return normalizeDictionaryPreferences([...merged.values()]);
}

/**
 * Captures dictionary preferences and the active profile's dictionary snapshot
 * in one settings value. Persisting only the root preferences lets profile
 * normalization disable a newly imported dictionary when the profile already
 * owns an independent snapshot.
 */
export function captureActiveLanguageProfileDictionaries(
    settings: ReaderSettings,
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
): ReaderSettings {
    const active = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    if (!active) return { ...settings, dictionaryPreferences };
    const ordered = [...dictionaryPreferences].sort((left, right) => left.priority - right.priority);
    const dictionaries = {
        installed: ordered.map(preference => preference.name),
        enabled: ordered.filter(preference => preference.enabled).map(preference => preference.name),
        order: ordered.map(preference => preference.name),
    };
    return {
        ...settings,
        dictionaryPreferences,
        languageProfiles: settings.languageProfiles.map(profile => profile.id === active.id
            ? { ...profile, dictionaries }
            : profile),
    };
}

// Self-heal for installs that imported a newer dictionary revision before
// replaced revisions retired their preference rows: a row whose dictionary has
// no installed data is dropped when a same-identity sibling IS installed (that
// import deleted its data). Rows without an installed sibling are kept — this
// origin may simply never have imported anything, and preferences are global.
export function retireStaleDictionaryPreferences(current: DictionaryPreference[], installedTitles: string[]): DictionaryPreference[] {
    if (!installedTitles.length) return current;
    const installed = new Set(installedTitles);
    const installedIdentities = new Set(installedTitles.map(yomitanDictionaryIdentity));
    return current.filter(row => installed.has(row.name)
        || !installedIdentities.has(yomitanDictionaryIdentity(row.name)));
}

function retireReplacedDictionaryPreferences(
    merged: Map<string, DictionaryPreference>,
    names: string[],
    replaced: string[],
): Map<string, DictionaryPreference> {
    const inherited = new Map<string, DictionaryPreference>();
    for (const title of replaced) {
        if (names.includes(title)) continue;
        const row = merged.get(title);
        if (!row) continue;
        merged.delete(title);
        for (const name of names) {
            const candidate = inherited.get(name);
            if (!candidate || row.priority < candidate.priority) inherited.set(name, row);
        }
    }
    return inherited;
}

function mergeDictionaryPreference(merged: Map<string, DictionaryPreference>, name: string, type: DictionaryPreference['type'], inherit?: DictionaryPreference): void {
    const existing = merged.get(name);
    if (!existing) {
        const defaults = defaultDictionaryPreference(name, type, UNORDERED_DICTIONARY_PRIORITY_BASE + merged.size);
        merged.set(name, inherit
            ? {
                ...defaults,
                // A stale alias equal to the old title is a default, not a
                // customization — the new revision keeps its own name then.
                alias: inherit.alias && inherit.alias !== inherit.name ? inherit.alias : name,
                enabled: inherit.enabled,
                priority: inherit.priority,
                allowSecondarySearches: inherit.allowSecondarySearches ?? false,
            }
            : defaults);
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
    if (value === 'terms' || value === 'kanji' || value === 'frequency' || value === 'pronunciation' || value === 'metadata') return value;
    return inferDictionaryTypeFromName(name);
}

function inferDictionaryTypeFromName(name: string): DictionaryPreference['type'] {
    const normalized = name.toLowerCase();
    if (/\b(?:ipa|pronunciation|phonetic)\b/.test(normalized)) return 'pronunciation';
    if (/\b(?:frequency|freq|jpdbv?\d*|bccwj|jiten|cc100|kwdlc|aozora|netflix|novel|anime|vn)\b/.test(normalized)) return 'frequency';
    if (/\b(?:kanjidic|kanji)\b/.test(normalized)) return 'kanji';
    return 'terms';
}
