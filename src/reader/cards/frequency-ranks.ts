import type { JPDBCard, ReaderSettings } from '../app/types';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';

export type FrequencyProvider = 'jiten' | 'jpdb';
export type FrequencyRankSource = 'card' | 'live-search' | 'kanji';

export interface ProviderFrequencyRank {
    provider: FrequencyProvider;
    rank: number;
    spelling: string;
    reading: string;
    source: FrequencyRankSource;
    // Verbatim site wording when the provider does not expose a plain rank
    // (JPDB kanji pages say "Top 300-400"); pills render this instead of "#rank".
    display?: string;
}

export type ProviderFrequencyRanks = Partial<Record<FrequencyProvider, ProviderFrequencyRank>>;

export function frequencyProviderForLookupId(id: string | undefined): FrequencyProvider | null {
    if (id === 'jiten-frequency') return 'jiten';
    if (id === 'jpdb-frequency') return 'jpdb';
    return null;
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
    const matches = candidates.filter(candidate =>
        normalizeIdentityText(candidate.spelling) === spelling
        && normalizeIdentityText(candidate.reading) === reading,
    );
    if (matches.length !== 1) return null;
    const match = matches[0];
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
