import type { JPDBCard, ReaderSettings } from '../app/types';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';
import { formatMetaFrequency } from '../dictionaries/groups-core';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';
import { learningTargetModuleFor } from '../languages/registry';

export type FrequencyProvider = 'jiten' | 'jpdb' | 'bunpro';
export type FrequencyRankSource = 'card' | 'live-search' | 'kanji';

export interface ProviderFrequencyListRank {
    list: string;
    rank: number;
}

export interface ProviderFrequencyRank {
    provider: FrequencyProvider;
    rank: number;
    spelling: string;
    reading: string;
    source: FrequencyRankSource;
    // Verbatim site wording when the provider does not expose a plain rank
    // (JPDB kanji pages say "Top 300-400"); pills render this instead of "#rank".
    display?: string;
    // Bunpro exposes one rank per corpus (anime/novels/netflix/general/dictionary).
    // `rank` preserves a primary value for the generic evidence contract; the
    // full list renders as separate visible pills and MUST NOT be collapsed.
    lists?: ProviderFrequencyListRank[];
}

export type ProviderFrequencyRanks = Partial<Record<FrequencyProvider, ProviderFrequencyRank>>;

/**
 * A corpus rank and a context count are different evidence.  The former wins
 * whenever it exists; the latter is only the honest, target-generic fallback
 * for a language whose installed catalogue has no frequency list.
 */
export function hasFrequencyRankEvidence(
    card: JPDBCard,
    metaEntries: readonly YomitanMetaEntry[],
    providerRanks?: ProviderFrequencyRanks,
): boolean {
    return frequencyRank(card.frequencyRank) !== null
        || metaEntries.some(entry => entry.mode === 'freq' && Boolean(formatMetaFrequency(entry.data)))
        || Object.values(providerRanks ?? {}).some(evidence => frequencyRank(evidence?.rank) !== null);
}

/** Count non-overlapping occurrences of the exact lookup surface in its sentence. */
export function contextOccurrenceCount(card: JPDBCard, context: string | undefined): number {
    if (!context) return 0;
    const target = learningTargetModuleFor(card.language ?? 'ja');
    const normalize = target?.normalizeText ?? normalizeIdentityText;
    const surface = normalize(card.spelling);
    const text = normalize(context);
    if (!surface || !text) return 0;

    let count = 0;
    let offset = text.indexOf(surface);
    while (offset >= 0) {
        count++;
        offset = text.indexOf(surface, offset + surface.length);
    }
    return count;
}

export function frequencyProviderForLookupId(id: string | undefined): FrequencyProvider | null {
    if (id === 'jiten-frequency') return 'jiten';
    if (id === 'jpdb-frequency') return 'jpdb';
    if (id === 'bunpro-frequency') return 'bunpro';
    return null;
}

// Primary-rank preference for the inline pill number: the broadest corpus wins;
// niche corpora only lead when the broader ones are null for the word.
const BUNPRO_PRIMARY_LIST_ORDER = ['general', 'dictionary', 'netflix', 'anime', 'novels'];

export function bunproFrequencyRank(
    card: JPDBCard,
    info: { expression: string; reading: string; frequencies: ProviderFrequencyListRank[] } | null,
): ProviderFrequencyRank | null {
    const lists = (info?.frequencies ?? []).filter(entry => Number.isInteger(entry.rank) && entry.rank > 0);
    if (!info || !lists.length) return null;
    const primary = [...lists].sort((a, b) =>
        listOrderIndex(a.list) - listOrderIndex(b.list))[0]!;
    return {
        provider: 'bunpro',
        rank: primary.rank,
        spelling: normalizeIdentityText(card.spelling || info.expression),
        reading: normalizeIdentityText(card.reading || info.reading),
        source: 'live-search',
        lists,
    };
}

function listOrderIndex(list: string): number {
    const index = BUNPRO_PRIMARY_LIST_ORDER.indexOf(list);
    return index < 0 ? BUNPRO_PRIMARY_LIST_ORDER.length : index;
}

export function liveFrequencyEnabled(settings: ReaderSettings, provider: FrequencyProvider): boolean {
    const frequencyEnabled = settings.dictionaryLookupLinks.some(link =>
        link.enabled && frequencyProviderForLookupId(link.id) === provider,
    );
    const lookupEnabled = settings.dictionaryLookupLinks.some(link => link.enabled && link.id === provider);
    return frequencyEnabled && lookupEnabled;
}

// Kanji popovers show KANJI frequency (Jiten's kanji API exposes a numeric rank,
// JPDB's kanji page a "Top 300-400" band), never the word rank of the card the
// kanji was opened from — word-pills only merges kanji-source evidence whose
// spelling matches the displayed kanji.
export function kanjiFrequencyRanks(
    kanji: string,
    jitenKanjiRank: number | null | undefined,
    jpdbKanjiFrequency: string | null | undefined,
): ProviderFrequencyRanks {
    const ranks: ProviderFrequencyRanks = {};
    const jitenRank = frequencyRank(jitenKanjiRank ?? null);
    if (jitenRank) {
        ranks.jiten = { provider: 'jiten', rank: jitenRank, spelling: kanji, reading: kanji, source: 'kanji' };
    }
    const jpdb = jpdbKanjiFrequencyEvidence(kanji, jpdbKanjiFrequency ?? '');
    if (jpdb) ranks.jpdb = jpdb;
    return ranks;
}

function jpdbKanjiFrequencyEvidence(kanji: string, frequency: string): ProviderFrequencyRank | null {
    const text = frequency.trim();
    const match = /([\d,]+)/.exec(text);
    const rank = match?.[1] ? Number.parseInt(match[1].replace(/,/g, ''), 10) : NaN;
    if (!Number.isInteger(rank) || rank <= 0) return null;
    return {
        provider: 'jpdb',
        rank,
        spelling: kanji,
        reading: kanji,
        source: 'kanji',
        display: /^top\b/i.test(text) ? text : undefined,
    };
}

export function cardFrequencyRanks(card: JPDBCard, isJpdbBackedCard: (card: JPDBCard) => boolean): ProviderFrequencyRanks {
    const rank = frequencyRank(card.frequencyRank);
    if (!rank) return {};
    const provider = card.source === 'jiten' || card.reviewSource === 'jiten-api'
        ? 'jiten'
        : isJpdbBackedCard(card)
            ? 'jpdb'
            : null;
    return provider ? {
        [provider]: rankEvidence(provider, rank, card, 'card'),
    } : {};
}

export function jitenFrequencyRankForCard(card: JPDBCard, info: JitenVocabularyInfo | null): ProviderFrequencyRank | null {
    const rank = frequencyRank(info?.mainReading?.frequencyRank);
    return rank ? rankEvidence('jiten', rank, card, 'live-search') : null;
}

export function exactJitenFrequencyRank(card: JPDBCard, candidates: JPDBCard[]): ProviderFrequencyRank | null {
    return exactSearchFrequencyRank('jiten', card, candidates);
}

export function exactJpdbFrequencyRank(card: JPDBCard, candidates: JPDBCard[]): ProviderFrequencyRank | null {
    return exactSearchFrequencyRank('jpdb', card, candidates);
}

function exactSearchFrequencyRank(provider: FrequencyProvider, card: JPDBCard, candidates: JPDBCard[]): ProviderFrequencyRank | null {
    const spelling = normalizeIdentityText(card.spelling);
    const reading = normalizeIdentityText(card.reading);
    // The spelling+reading identity is the safety guarantee (never borrow a
    // differently-read homograph's rank). Providers can list the SAME identity
    // more than once (jpdb has two 今日/きょう entries, only one ranked), so take
    // the first ranked match in the provider's own result order rather than
    // demanding a unique match — that requirement silently dropped the rank for
    // every duplicated word.
    const match = candidates.find(candidate =>
        normalizeIdentityText(candidate.spelling) === spelling
        && normalizeIdentityText(candidate.reading) === reading
        && frequencyRank(candidate.frequencyRank) !== null,
    );
    const rank = frequencyRank(match?.frequencyRank);
    return match && rank ? rankEvidence(provider, rank, match, 'live-search') : null;
}

export function withFrequencyRank(ranks: ProviderFrequencyRanks, evidence: ProviderFrequencyRank | null): ProviderFrequencyRanks {
    return evidence ? { ...ranks, [evidence.provider]: evidence } : ranks;
}

function rankEvidence(provider: FrequencyProvider, rank: number, card: JPDBCard, source: FrequencyRankSource): ProviderFrequencyRank {
    return {
        provider,
        rank,
        spelling: normalizeIdentityText(card.spelling),
        reading: normalizeIdentityText(card.reading),
        source,
    };
}

function frequencyRank(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeIdentityText(value: string): string {
    return value.normalize('NFKC').trim();
}
