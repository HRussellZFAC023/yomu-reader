import type { JPDBCard } from '../app/types';
import type { JitenPublicVocabularyClient } from '../dictionaries/jiten-public-vocabulary';
import type { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import { contextPitchPattern } from './pitch-accent';

export interface PublicPitchLookupClients {
    jitenPublicVocabulary?: Pick<JitenPublicVocabularyClient, 'lookup'>;
    jpdbPublicPitch?: Pick<JpdbPublicPitchClient, 'lookup'>;
}

export async function lookupPublicPitchAccent(
    card: JPDBCard,
    clients: PublicPitchLookupClients,
    readingOverride = '',
): Promise<string[]> {
    const jitenPitch = publicJitenPitchForCard(
        card,
        await clients.jitenPublicVocabulary?.lookup(card.spelling).catch(() => null) ?? null,
        readingOverride,
    );
    if (jitenPitch.length) return jitenPitch;
    return await clients.jpdbPublicPitch?.lookup(card.spelling, readingOverride || card.reading).catch(() => []) ?? [];
}

export function publicJitenPitchForCard(card: JPDBCard, candidate: JPDBCard | null | undefined, readingOverride = ''): string[] {
    if (!candidate?.pitchAccent.length) return [];

    const requestedSpelling = normalizedLookupText(card.spelling);
    const candidateSpelling = normalizedLookupText(candidate.spelling);
    const requestedReading = normalizedLookupText(readingOverride || card.reading);
    const candidateReading = normalizedLookupText(candidate.reading);
    const spellingMatches = Boolean(requestedSpelling && candidateSpelling === requestedSpelling);
    const readingMatches = Boolean(requestedReading && candidateReading === requestedReading);
    if (requestedReading && candidateReading && !readingMatches) return [];
    if (!spellingMatches && !readingMatches) return [];

    const reading = requestedReading || candidateReading || requestedSpelling;
    const contextual = candidate.pitchAccent.filter(pattern => contextPitchPattern([pattern], reading));
    return contextual.length ? contextual : candidate.pitchAccent;
}

function normalizedLookupText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}
