import type { JPDBCard, ReaderSettings } from '../app/types';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';

export type FrequencyProvider = 'jiten' | 'jpdb';
export type FrequencyRankSource = 'card' | 'live-search';

export interface ProviderFrequencyRank {
    provider: FrequencyProvider;
    rank: number;
    spelling: string;
    reading: string;
    source: FrequencyRankSource;
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
