import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { gmStorageDelete, gmStorageSet } from '../../src/reader/app/storage';
import {
    AnkiMediaDataUrlCache,
    ankiAccountContextKey,
} from '../../src/reader/anki/account-context';
import { sensitiveFingerprint } from '../../src/reader/core/sensitive-fingerprint';
import {
    jitenStatsDateKey,
    loadJitenDailyStats,
    recordJitenDailyStats,
} from '../../src/reader/dictionaries/jiten-stats-cache';
import { resetActiveLearningTargetLanguage } from '../../src/reader/languages/target-runtime';
import { NEW_TAB_CACHE_KEY } from '../../src/reader/newtab/cache';
import {
    newTabProviderContexts,
    newTabReviewProviderContext,
    type NewTabProviderContexts,
} from '../../src/reader/newtab/provider-context-policy';
import { NewTabReviewSubmitter } from '../../src/reader/newtab/review-submitter';
import { NewTabTargetResources } from '../../src/reader/newtab/target-resources';
import { testEnSettings } from './helpers/settings-fixture';

const JITEN_DAILY_STATS_KEY = 'jpdb-reader-jiten-daily-stats';
const MANAGED_KEYS = [NEW_TAB_CACHE_KEY, JITEN_DAILY_STATS_KEY] as const;

beforeEach(async () => {
    resetActiveLearningTargetLanguage();
    await Promise.all(MANAGED_KEYS.map(key => gmStorageDelete(key)));
});

afterEach(async () => {
    await Promise.all(MANAGED_KEYS.map(key => gmStorageDelete(key)));
});

describe('opaque provider fingerprints', () => {
    it('is deterministic, whitespace-normalized, distinct, and does not expose its input', () => {
        const secret = 'account-a-private-token';
        const fingerprint = sensitiveFingerprint(secret);

        expect(fingerprint).toMatch(/^[0-9a-f]{16}:\d+$/u);
        expect(sensitiveFingerprint(`  ${secret}  `)).toBe(fingerprint);
        expect(sensitiveFingerprint(secret)).toBe(fingerprint);
        expect(sensitiveFingerprint('account-b-private-token')).not.toBe(fingerprint);
        expect(fingerprint).not.toContain(secret);
        expect(sensitiveFingerprint('')).toBe('');
    });

    it('partitions every New Tab provider identity without retaining raw credentials or endpoints', () => {
        const base = providerSettings();
        const contexts = newTabProviderContexts(base);

        expect(newTabProviderContexts({ ...base })).toEqual(contexts);
        expectChangedProvider(base, contexts, { apiKey: 'jpdb-account-b' }, 'jpdb');
        expectChangedProvider(base, contexts, { jitenApiKey: 'jiten-account-b' }, 'jiten');
        expectChangedProvider(base, contexts, { bunproFrontendApiToken: 'bunpro-account-b' }, 'bunpro');
        expectChangedProvider(base, contexts, { wanikaniApiToken: 'wanikani-account-b' }, 'wanikani');
        expectChangedProvider(base, contexts, { ankiConnectUrl: 'http://127.0.0.1:9876' }, 'anki');

        const throughOtherProxy = newTabProviderContexts({ ...base, corsProxyUrl: 'https://proxy-b.example/' });
        expect(throughOtherProxy.key).not.toBe(contexts.key);
        expect(throughOtherProxy.jpdb).not.toBe(contexts.jpdb);
        expect(throughOtherProxy.jiten).not.toBe(contexts.jiten);
        expect(throughOtherProxy.bunpro).not.toBe(contexts.bunpro);
        expect(throughOtherProxy.wanikani).not.toBe(contexts.wanikani);
        expect(throughOtherProxy.anki).toBe(contexts.anki);

        const serialized = JSON.stringify(contexts);
        for (const sensitiveValue of [
            base.apiKey,
            base.jitenApiKey,
            base.bunproFrontendApiToken,
            base.wanikaniApiToken,
            base.ankiConnectUrl,
            base.corsProxyUrl,
        ]) {
            expect(serialized).not.toContain(sensitiveValue);
        }
    });

    it('partitions Anki accounts by endpoint and language profile', () => {
        const base = providerSettings();
        const account = ankiAccountContextKey(base);

        expect(ankiAccountContextKey({ ...base })).toBe(account);
        expect(ankiAccountContextKey({ ...base, ankiConnectUrl: `  ${base.ankiConnectUrl}  ` })).toBe(account);
        expect(ankiAccountContextKey({ ...base, ankiConnectUrl: 'http://127.0.0.1:9876' })).not.toBe(account);
        expect(ankiAccountContextKey({ ...base, activeLanguageProfileId: 'learner-fr-ja' })).not.toBe(account);
        expect(account).not.toContain(base.ankiConnectUrl);
        expect(account).not.toContain(base.activeLanguageProfileId);
    });
});

describe('New Tab offline card account boundary', () => {
    it('accepts network cards only for the provider context that wrote them', async () => {
        const fixture = targetResourcesFixture();
        const remote = offlineCard('jpdb', 'jpdb-api', '遠隔');

        await fixture.resources.writeOffline([remote], 'JPDB');
        expect((await fixture.resources.readOffline()).cards.map(card => card.spelling)).toEqual(['遠隔']);

        fixture.setProviderContext('jpdb', 'account-b');
        expect(await fixture.resources.readOffline()).toEqual({ cards: [], sourceLabel: '' });
    });

    it('keeps JPDB cards available when only the unrelated Anki account changes', async () => {
        const fixture = targetResourcesFixture();
        await fixture.resources.writeOffline([offlineCard('jpdb', 'jpdb-api', '継続')], 'JPDB');

        fixture.setProviderContext('anki', 'account-b');

        expect((await fixture.resources.readOffline()).cards.map(card => card.spelling)).toEqual(['継続']);
    });

    it('rejects legacy unscoped network cards', async () => {
        const fixture = targetResourcesFixture();
        await gmStorageSet(NEW_TAB_CACHE_KEY, {
            at: Date.now(),
            targetLanguage: 'ja',
            sourceLabel: 'Legacy JPDB',
            cards: [offlineCard('jpdb', 'jpdb-api', '旧式')],
        });

        expect(await fixture.resources.readOffline()).toEqual({ cards: [], sourceLabel: '' });
    });

    it('keeps local dictionary and Yomu SRS cards portable across provider changes', async () => {
        const fixture = targetResourcesFixture();
        const cards = [
            offlineCard('local', 'dictionary', '辞書'),
            offlineCard('yomu-local', 'yomu-local', '自習'),
        ];

        await fixture.resources.writeOffline(cards, 'Local study');
        fixture.setProviderContext('anki', 'account-b');

        const restored = await fixture.resources.readOffline();
        expect(restored.sourceLabel).toBe('Local study');
        expect(restored.cards.map(card => card.spelling)).toEqual(['辞書', '自習']);
    });

    it('drops old-account cards without discarding local cards from a mixed cache', async () => {
        const fixture = targetResourcesFixture();
        await fixture.resources.writeOffline([
            offlineCard('jpdb', 'jpdb-api', '遠隔'),
            offlineCard('local', 'dictionary', '辞書'),
            offlineCard('yomu-local', 'yomu-local', '自習'),
        ], 'Mixed study');

        fixture.setProviderContext('jpdb', 'account-b');

        expect((await fixture.resources.readOffline()).cards.map(card => card.spelling)).toEqual(['辞書', '自習']);
    });
});

describe('provider-specific review completion boundary', () => {
    it('keeps a JPDB completion current across Anki rotation and suppresses a JPDB account switch', async () => {
        const contexts = newTabProviderContexts(providerSettings());
        const first = deferred<void>();
        const second = deferred<void>();
        const reviewCard = vi.fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);
        const publishGradedCardState = vi.fn();
        const submitter = new NewTabReviewSubmitter({
            getSettings: () => ({ ...providerSettings(), jpdbMiningEnabled: true }),
            providerContextForTarget: target => newTabReviewProviderContext(contexts, target),
            text: key => String(key),
            jpdb: { reviewCard } as never,
            publishGradedCardState,
            armJitenUndo: vi.fn(),
            reviewLiveJpdb: vi.fn(),
            reviewAnki: vi.fn(),
        });
        const card = offlineCard('jpdb', 'jpdb-api', '継続');

        const acrossAnkiRotation = submitter.submitTarget(card, 'jpdb-api', 'okay');
        contexts.anki = 'anki-account-b';
        first.resolve();
        await acrossAnkiRotation;
        expect(publishGradedCardState).toHaveBeenCalledOnce();

        const acrossJpdbSwitch = submitter.submitTarget(card, 'jpdb-api', 'hard');
        contexts.jpdb = 'jpdb-account-b';
        second.resolve();
        await acrossJpdbSwitch;
        expect(publishGradedCardState).toHaveBeenCalledOnce();
    });
});

describe('Jiten daily stats account boundary', () => {
    it('keeps same-day counters separate by credential and persists no raw credential', () => {
        const morning = new Date('2026-08-10T08:00:00Z');
        const evening = new Date('2026-08-10T18:00:00Z');
        const day = jitenStatsDateKey(morning);
        const accountA = 'jiten-account-a-secret';
        const accountB = 'jiten-account-b-secret';

        recordJitenDailyStats({ newCardsToday: 8, reviewsToday: 21 }, morning, accountA);
        recordJitenDailyStats({ newCardsToday: 2, reviewsToday: 5 }, evening, accountB);

        expect(loadJitenDailyStats(accountA)[day]).toMatchObject({ newCardsToday: 8, reviewsToday: 21 });
        expect(loadJitenDailyStats(accountB)[day]).toMatchObject({ newCardsToday: 2, reviewsToday: 5 });
        expect(loadJitenDailyStats('jiten-account-c-secret')).toEqual({});
        expect(localStorage.getItem(JITEN_DAILY_STATS_KEY)).not.toContain(accountA);
        expect(localStorage.getItem(JITEN_DAILY_STATS_KEY)).not.toContain(accountB);
    });

    it('does not attribute legacy unscoped counters to a signed-in account', () => {
        const when = new Date('2026-08-09T12:00:00Z');
        const day = jitenStatsDateKey(when);
        recordJitenDailyStats({ newCardsToday: 3, reviewsToday: 12 }, when);

        expect(loadJitenDailyStats()[day]).toMatchObject({ newCardsToday: 3, reviewsToday: 12 });
        expect(loadJitenDailyStats('jiten-account-a-secret')).toEqual({});
    });
});

describe('Anki account-partitioned media cache', () => {
    it('reuses a filename only inside the same account and clear forces a refetch', async () => {
        let account = 'account-a';
        let calls = 0;
        const retrieve = vi.fn(async () => ++calls === 1 ? 'QQ==' : calls === 2 ? 'Qg==' : 'Qw==');
        const cache = new AnkiMediaDataUrlCache(() => account, retrieve);

        const firstA = await cache.load(' voice.mp3 ', 'missing');
        expect(await cache.load('voice.mp3', 'missing')).toBe(firstA);

        account = 'account-b';
        expect(await cache.load('voice.mp3', 'missing')).toBe('data:audio/mpeg;base64,Qg==');
        account = 'account-a';
        expect(await cache.load('voice.mp3', 'missing')).toBe(firstA);
        expect(retrieve).toHaveBeenCalledTimes(2);

        cache.clear();
        expect(await cache.load('voice.mp3', 'missing')).toBe('data:audio/mpeg;base64,Qw==');
        expect(retrieve).toHaveBeenCalledTimes(3);
    });

    it('does not share an in-flight retrieval after the account changes', async () => {
        let account = 'account-a';
        const first = deferred<string | false>();
        const retrieve = vi.fn()
            .mockImplementationOnce(() => first.promise)
            .mockResolvedValueOnce('Qg==');
        const cache = new AnkiMediaDataUrlCache(() => account, retrieve);

        const pendingA = cache.load('voice.mp3', 'missing');
        account = 'account-b';
        await expect(cache.load('voice.mp3', 'missing')).resolves.toBe('data:audio/mpeg;base64,Qg==');
        first.resolve('QQ==');
        await expect(pendingA).resolves.toBe('data:audio/mpeg;base64,QQ==');
        expect(retrieve).toHaveBeenCalledTimes(2);
    });
});

function providerSettings(): ReaderSettings {
    return {
        ...testEnSettings(),
        apiKey: 'jpdb-account-a',
        jitenApiKey: 'jiten-account-a',
        bunproFrontendApiToken: 'bunpro-account-a',
        wanikaniApiToken: 'wanikani-account-a',
        ankiConnectUrl: 'http://127.0.0.1:8765',
        corsProxyUrl: 'https://proxy-a.example/',
    };
}

function expectChangedProvider(
    base: ReaderSettings,
    original: NewTabProviderContexts,
    changes: Partial<ReaderSettings>,
    provider: Exclude<keyof NewTabProviderContexts, 'key'>,
): void {
    const changed = newTabProviderContexts({ ...base, ...changes });
    expect(changed.key).not.toBe(original.key);
    expect(changed[provider]).not.toBe(original[provider]);
}

function targetResourcesFixture(): {
    resources: NewTabTargetResources;
    setProviderContext(provider: Exclude<keyof NewTabProviderContexts, 'key'>, value: string): void;
} {
    const settings = { ...testEnSettings(), newTabOfflineEnabled: true, newTabOfflineLimit: 20 };
    const providerContexts: NewTabProviderContexts = {
        key: 'aggregate-a',
        jpdb: 'account-a',
        jiten: 'account-a',
        bunpro: 'account-a',
        wanikani: 'account-a',
        anki: 'account-a',
    };
    return {
        resources: new NewTabTargetResources({
            getSettings: () => settings,
            providerContexts: () => providerContexts,
            parser: {} as never,
            dictionaries: {} as never,
            localSearchWithTimeout: async <T>(promise: Promise<T>) => promise,
        }),
        setProviderContext(provider, value): void {
            providerContexts[provider] = value;
            providerContexts.key = `${provider}:${value}`;
        },
    };
}

function offlineCard(
    source: JPDBCard['source'],
    reviewSource: JPDBCard['reviewSource'],
    spelling: string,
): JPDBCard {
    return {
        vid: spelling.charCodeAt(0),
        sid: 1,
        rid: 1,
        spelling,
        reading: spelling,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['test'], partOfSpeech: [] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source,
        reviewSource,
    };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(settle => { resolve = settle; });
    return { promise, resolve };
}
