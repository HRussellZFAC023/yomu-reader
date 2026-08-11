import type { JPDBCard } from '../app/types';
import { uniqueTrimmedStrings } from '../core/string-utils';
import type { YomuSrsProviderId, YomuSrsQueueSnapshot, YomuSrsReviewable, YomuSrsReviewableKind } from '../srs/types';
import { NEW_TAB_SOURCE_LABELS } from './controller-config';
import { stableNegativeNewTabId } from './kanji-helpers';
import type { NewTabLoadResult } from './source-orchestrator';
import { newTabCardMatchesActiveTarget, normalizeNewTabCard } from './study-queue';

export type NewTabSrsAdapterSource = Extract<YomuSrsProviderId, 'bunpro' | 'wanikani' | 'yomu-local'>;

interface NewTabSrsSourceStatus {
    source: NewTabSrsAdapterSource;
    sourceLabel: string;
    selected: boolean;
    localSourceAvailable: boolean;
    hasCredential: boolean;
    bunproCredentialExpired: boolean;
}

interface LabelledCredentialSource {
    label: string;
    hasCredential(): boolean;
}

interface SrsCardProviderPolicy {
    readonly reviewSource: JPDBCard['reviewSource'];
    fields(card: YomuSrsReviewable, providerKey: string): Partial<JPDBCard>;
}

const SRS_CARD_PROVIDER_POLICIES: Partial<Record<YomuSrsProviderId, SrsCardProviderPolicy>> = {
    bunpro: {
        reviewSource: 'bunpro-api',
        fields: card => ({
            bunproReviewId: card.providerReviewId,
            bunproReviewableId: optionalPositiveNumber(card.providerReviewableId),
            bunproReviewableType: bunproReviewableType(card.kind),
            bunproSrsLevel: card.srsLevel,
            bunproReviewSessionId: card.reviewSession?.id,
            bunproReviewInputMode: card.reviewSession?.inputMode,
            bunproReviewEndpoint: card.reviewSession?.endpoint,
        }),
    },
    wanikani: {
        reviewSource: 'wanikani-api',
        fields: card => ({
            wanikaniAssignmentId: optionalPositiveNumber(card.providerCardId),
            wanikaniSubjectId: optionalPositiveNumber(card.providerReviewableId),
            wanikaniSubjectType: wanikaniSubjectType(card),
            wanikaniSrsStage: card.srsLevel,
            wanikaniAudioUrls: wanikaniAudioUrls(card),
        }),
    },
    'yomu-local': {
        reviewSource: 'yomu-local',
        fields: card => ({ sourceCardKey: card.providerCardId }),
    },
};

/** Adapt provider-neutral SRS reviewables to the card contract owned by New Tab. */
export function newTabCardFromSrsReviewable(card: YomuSrsReviewable): JPDBCard | null {
    const policy = SRS_CARD_PROVIDER_POLICIES[card.providerId];
    if (!policy) return null;
    const expression = card.expression.trim();
    if (!expression) return null;
    const reading = reviewableReading(card, expression);
    const providerKey = `${card.providerId}:${card.providerCardId}`;
    return normalizeNewTabCard({
        vid: stableNegativeNewTabId(`srs-vocab:${providerKey}`),
        sid: stableNegativeNewTabId(`srs-sentence:${providerKey}`),
        rid: stableNegativeNewTabId(`srs-review:${reviewableIdentity(card)}`),
        spelling: expression,
        reading,
        language: card.language,
        frequencyRank: null,
        partOfSpeech: reviewablePartOfSpeech(card),
        meanings: card.meanings,
        sentence: card.sentence,
        cardState: card.state,
        pitchAccent: [],
        ...reviewableTiming(card),
        wordWithReading: reviewableWordWithReading(expression, reading),
        source: card.providerId as NewTabSrsAdapterSource,
        reviewSource: policy.reviewSource,
        sourceDeckName: card.srsLevel,
        sourceCardKey: providerKey,
        ...policy.fields(card, providerKey),
    });
}

export function newTabSrsSourceLabel(source: NewTabSrsAdapterSource, adapter?: LabelledCredentialSource): string {
    return adapter?.label || NEW_TAB_SOURCE_LABELS[source];
}

export function newTabSrsSourceHasCredential(adapter?: LabelledCredentialSource): boolean {
    return adapter?.hasCredential() === true;
}

export function canBrowseNewTabSrsSource(source: NewTabSrsAdapterSource, localSourceAvailable: boolean): boolean {
    return source !== 'yomu-local' || localSourceAvailable;
}

export function unavailableNewTabSrsLoad(status: NewTabSrsSourceStatus): NewTabLoadResult | null {
    return unavailableLocalSrsLoad(status)
        ?? missingCredentialSrsLoad(status)
        ?? expiredBunproSrsLoad(status);
}

export function newTabSrsLoadErrorMessage(failed: boolean): NewTabLoadResult['emptyMessageKey'] {
    return failed ? 'couldNotLoadWords' : undefined;
}

export function newTabCardsFromSrsQueue(snapshot: YomuSrsQueueSnapshot | null, limit: number): JPDBCard[] {
    return (snapshot?.cards ?? [])
        .filter(newTabCardMatchesActiveTarget)
        .map(newTabCardFromSrsReviewable)
        .filter(isNewTabCard)
        .slice(0, limit);
}

function isNewTabCard(card: JPDBCard | null): card is JPDBCard {
    return card !== null;
}

function unavailableLocalSrsLoad(status: NewTabSrsSourceStatus): NewTabLoadResult | null {
    if (canBrowseNewTabSrsSource(status.source, status.localSourceAvailable)) return null;
    return {
        cards: [],
        sourceLabel: status.sourceLabel,
        reviewCountMode: status.selected,
        emptyMessageKey: 'couldNotLoadWords',
    };
}

const MISSING_SRS_CREDENTIAL_MESSAGES: Record<NewTabSrsAdapterSource, NonNullable<NewTabLoadResult['emptyMessageKey']>> = {
    bunpro: 'bunproTokenMissing',
    wanikani: 'wanikaniAddApiKeyRequired',
    'yomu-local': 'couldNotLoadWords',
};

function missingCredentialSrsLoad(status: NewTabSrsSourceStatus): NewTabLoadResult | null {
    if (status.hasCredential) return null;
    return {
        cards: [],
        sourceLabel: status.sourceLabel,
        reviewCountMode: true,
        emptyMessageKey: MISSING_SRS_CREDENTIAL_MESSAGES[status.source],
    };
}

function expiredBunproSrsLoad(status: NewTabSrsSourceStatus): NewTabLoadResult | null {
    if (status.source !== 'bunpro' || !status.bunproCredentialExpired) return null;
    return {
        cards: [],
        sourceLabel: status.sourceLabel,
        reviewCountMode: true,
        emptyMessageKey: 'bunproTokenExpired',
    };
}

function reviewableTiming(card: YomuSrsReviewable): Pick<JPDBCard, 'dueAt' | 'lastReviewAt'> {
    return {
        dueAt: card.dueAt ?? null,
        lastReviewAt: card.lastReviewAt ?? null,
    };
}

function reviewableIdentity(card: YomuSrsReviewable): string {
    return card.providerReviewId || card.providerCardId;
}

function reviewableReading(card: YomuSrsReviewable, expression: string): string {
    return card.reading.trim() || expression;
}

function reviewableWordWithReading(expression: string, reading: string): string {
    return reading && reading !== expression ? `${expression}【${reading}】` : expression;
}

const WANIKANI_SUBJECT_TYPES = new Set<NonNullable<JPDBCard['wanikaniSubjectType']>>([
    'radical',
    'kanji',
    'vocabulary',
    'kana_vocabulary',
]);

const WANIKANI_FALLBACK_SUBJECT_TYPES: Record<YomuSrsReviewableKind, NonNullable<JPDBCard['wanikaniSubjectType']>> = {
    kanji: 'kanji',
    unknown: 'radical',
    vocabulary: 'vocabulary',
    grammar: 'vocabulary',
    sentence: 'vocabulary',
};

function wanikaniSubjectType(card: YomuSrsReviewable): JPDBCard['wanikaniSubjectType'] {
    const type = (card.raw as { subject?: { type?: unknown } } | undefined)?.subject?.type;
    return typeof type === 'string' && WANIKANI_SUBJECT_TYPES.has(type as NonNullable<JPDBCard['wanikaniSubjectType']>)
        ? type as NonNullable<JPDBCard['wanikaniSubjectType']>
        : WANIKANI_FALLBACK_SUBJECT_TYPES[card.kind];
}

function wanikaniAudioUrls(card: YomuSrsReviewable): string[] | undefined {
    const urls = (card.raw as { subject?: { audio?: Array<{ url?: unknown }> } } | undefined)?.subject?.audio
        ?.map(item => typeof item.url === 'string' ? item.url : '')
        .filter(Boolean);
    return urls?.length ? urls : undefined;
}

function reviewablePartOfSpeech(card: YomuSrsReviewable): string[] {
    const existing = uniqueTrimmedStrings([
        card.partOfSpeech ?? '',
        ...card.meanings.flatMap(meaning => meaning.partOfSpeech ?? []),
    ]);
    return existing.length ? existing : card.kind === 'grammar' ? ['grammar'] : [];
}

function optionalPositiveNumber(value: string | undefined): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}

function bunproReviewableType(kind: YomuSrsReviewableKind): JPDBCard['bunproReviewableType'] {
    return kind === 'grammar' || kind === 'vocabulary' || kind === 'sentence' ? kind : 'unknown';
}
