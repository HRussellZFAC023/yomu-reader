import type { InterfaceLanguage, JPDBCard, ReaderSettings } from '../app/types';
import {
    effectiveBunproFrontendApiToken,
    effectiveBunproLegacyApiKey,
    effectiveJitenApiKey,
    effectiveJpdbApiKey,
    effectiveWanikaniApiToken,
} from '../settings/api-credential';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';
import type { NewTabConcreteSource } from './source';
import type { NewTabReviewTarget } from './review-targets';

export interface NewTabProviderContexts {
    key: string;
    jpdb: string;
    jiten: string;
    bunpro: string;
    wanikani: string;
    anki: string;
}

type NewTabAccountProvider = Exclude<keyof NewTabProviderContexts, 'key'>;

const REVIEW_ACCOUNT_PROVIDER: Record<NewTabReviewTarget, NewTabAccountProvider | null> = {
    'jpdb-api': 'jpdb',
    'jpdb-live': 'jpdb',
    'jiten-api': 'jiten',
    'bunpro-api': 'bunpro',
    'wanikani-api': 'wanikani',
    anki: 'anki',
    'yomu-local': null,
};

const CARD_ACCOUNT_PROVIDERS: ReadonlyArray<readonly [NewTabAccountProvider, (card: JPDBCard) => boolean]> = [
    ['jpdb', card => card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live'],
    ['jiten', card => card.source === 'jiten' || card.reviewSource === 'jiten-api' || hasJitenIdentity(card)],
    ['bunpro', card => card.source === 'bunpro' || card.reviewSource === 'bunpro-api'],
    ['wanikani', card => card.source === 'wanikani' || card.reviewSource === 'wanikani-api'],
    ['anki', card => card.source === 'anki' || card.reviewSource === 'anki' || hasAnkiIdentity(card)],
];

// A single opaque identity plus provider-specific partitions. Secrets and
// private endpoints never become browse keys, DOM data, or log payloads.
export function newTabProviderContexts(settings: ReaderSettings): NewTabProviderContexts {
    const proxy = settings.corsProxyUrl.trim();
    const jpdb = contextFingerprint(effectiveJpdbApiKey(settings), proxy);
    const jiten = contextFingerprint(effectiveJitenApiKey(settings), proxy);
    const bunpro = contextFingerprint(effectiveBunproFrontendApiToken(settings), effectiveBunproLegacyApiKey(settings), proxy);
    const wanikani = contextFingerprint(effectiveWanikaniApiToken(settings), proxy);
    const anki = contextFingerprint(settings.ankiConnectUrl.trim(), settings.activeLanguageProfileId);
    return {
        jpdb,
        jiten,
        bunpro,
        wanikani,
        anki,
        key: contextFingerprint(
            jpdb,
            jiten,
            bunpro,
            wanikani,
            anki,
            settings.bunproFrontendApiTokenExpiresAt,
            settings.ankiDeck.trim(),
            settings.ankiModel.trim(),
            settings.ankiEnabled,
            settings.newTabAnkiEnabled,
        ),
    };
}

export function newTabProviderContext(settings: ReaderSettings): string {
    return newTabProviderContexts(settings).key;
}

export function newTabAnkiProviderContext(settings: ReaderSettings): string {
    return newTabProviderContexts(settings).anki;
}

/** Returns the one account identity that owns a provider review operation. */
export function newTabReviewProviderContext(contexts: NewTabProviderContexts, target: NewTabReviewTarget): string {
    const provider = REVIEW_ACCOUNT_PROVIDER[target];
    return provider ? contexts[provider] : '';
}

/** Fingerprints exactly the provider accounts touched by one review operation. */
function newTabReviewProvidersContext(contexts: NewTabProviderContexts, targets: readonly NewTabReviewTarget[]): string {
    const relevant = targets.map(target => newTabReviewProviderContext(contexts, target)).filter(Boolean);
    return relevant.length ? contextFingerprint(...relevant) : '';
}

export function newTabReviewProvidersAreCurrent(
    expected: NewTabProviderContexts,
    current: NewTabProviderContexts,
    targets: readonly NewTabReviewTarget[],
): boolean {
    return newTabReviewProvidersContext(expected, targets) === newTabReviewProvidersContext(current, targets);
}

/** Binds an offline card only to providers whose private state it carries. */
export function newTabCardProviderContext(contexts: NewTabProviderContexts, card: JPDBCard): string {
    const relevant = CARD_ACCOUNT_PROVIDERS
        .filter(([, ownsCard]) => ownsCard(card))
        .map(([provider]) => contexts[provider]);
    return relevant.length ? contextFingerprint(...relevant) : '';
}

function contextFingerprint(...parts: unknown[]): string {
    return sensitiveFingerprint(JSON.stringify(parts));
}

function hasJitenIdentity(card: JPDBCard): boolean {
    return typeof card.jitenWordId === 'number' && card.jitenWordId > 0;
}

function hasAnkiIdentity(card: JPDBCard): boolean {
    return Boolean(card.ankiCardId || card.ankiRenderedCards?.length);
}

export interface NewTabSourceCacheIdentity {
    source: NewTabConcreteSource;
    settings: ReaderSettings;
    interfaceLanguage: InterfaceLanguage;
    targetLanguage: string;
    targetGeneration: number;
    activeJpdbDeck: string;
    activeAnkiDeck: string;
}

export function newTabSourceCacheSignature(identity: NewTabSourceCacheIdentity): string {
    const { settings } = identity;
    return JSON.stringify({
        source: identity.source,
        language: identity.interfaceLanguage,
        targetLanguage: identity.targetLanguage,
        targetGeneration: identity.targetGeneration,
        providerContext: newTabProviderContext(settings),
        jpdbMiningEnabled: settings.jpdbMiningEnabled,
        jpdbReviewMode: settings.newTabJpdbReviewMode,
        jpdbDeck: settings.newTabJpdbDeck,
        activeJpdbDeck: identity.activeJpdbDeck,
        ankiEnabled: settings.ankiEnabled,
        ankiNewTabEnabled: settings.newTabAnkiEnabled,
        ankiDeck: settings.ankiDeck,
        activeAnkiDeck: identity.activeAnkiDeck,
        ankiModel: settings.ankiModel,
        ankiDisabledDecks: settings.newTabAnkiDisabledDecks,
        bunproTokenExpiresAt: settings.bunproFrontendApiTokenExpiresAt,
        bunproMiningEnabled: settings.bunproMiningEnabled,
        wanikaniReviewEnabled: settings.wanikaniReviewEnabled,
        yomuLocalSrsEnabled: settings.yomuLocalSrsEnabled,
        dictionaries: settings.localDictionariesEnabled,
        dictionaryPreferences: settings.dictionaryPreferences,
    });
}

// UT-44: deck-picker values of the form jiten:<id> scope to a Jiten study deck.
export function jitenScopedDeckId(pickedDeck: string): number | null {
    if (!pickedDeck.startsWith('jiten:')) return null;
    const id = Number(pickedDeck.slice('jiten:'.length));
    return Number.isFinite(id) && id > 0 ? Math.floor(id) : null;
}
