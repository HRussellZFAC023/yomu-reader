import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import {
    activeLearningTargetGeneration,
    activeLearningTargetLanguage,
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/target-runtime';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';

function settingsForTarget(targetLanguage: string): ReaderSettings {
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        learningTargetChosen: true,
        activeLanguageProfileId: profile.id,
        languageProfiles: [{ ...profile, targetLanguage }],
    } as Partial<ReaderSettings>);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

const CARD = { spelling: '猫', reading: 'ねこ', source: 'fallback' } as JPDBCard;

beforeEach(() => resetActiveLearningTargetLanguage());

afterEach(() => {
    resetActiveLearningTargetLanguage();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('lookup target generations', () => {
    it('adopts New Tab settings as the active lookup target', () => {
        const invalidateForTargetChange = vi.fn();
        const runtime = new NewTabRuntime() as unknown as {
            settings: ReaderSettings;
            newTab?: { invalidateForTargetChange(): void; destroy(): void };
            syncLookupTarget(settings: ReaderSettings): void;
            destroy(): void;
        };
        runtime.newTab = { invalidateForTargetChange, destroy: vi.fn() };

        runtime.settings = settingsForTarget('ko');
        runtime.syncLookupTarget(runtime.settings);
        expect(activeLearningTargetLanguage()).toBe('ko');
        expect(invalidateForTargetChange).toHaveBeenCalledTimes(1);

        runtime.syncLookupTarget(runtime.settings);
        expect(invalidateForTargetChange).toHaveBeenCalledTimes(1);

        runtime.settings = settingsForTarget('yue');
        runtime.syncLookupTarget(runtime.settings);
        expect(activeLearningTargetLanguage()).toBe('yue-Hant');
        expect(invalidateForTargetChange).toHaveBeenCalledTimes(2);
        runtime.destroy();
    });

    it('drops a Reader popup whose initial card resolution crosses an away-and-back target switch', async () => {
        const pending = deferred<JPDBCard>();
        const mountInitialCardShell = vi.fn();
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            showCard(card: JPDBCard): Promise<void>;
            resolveLookupCardForInitialRender(card: JPDBCard): Promise<JPDBCard>;
            prioritizeQueuedPitchEnrichment(...args: unknown[]): void;
            mountInitialCardShell(...args: unknown[]): unknown;
            syncCardLookupTarget(settings: ReaderSettings): void;
        };
        app.resolveLookupCardForInitialRender = vi.fn(() => pending.promise);
        app.prioritizeQueuedPitchEnrichment = vi.fn();
        app.mountInitialCardShell = mountInitialCardShell;

        const render = app.showCard(CARD);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve(CARD);
        await render;

        expect(mountInitialCardShell).not.toHaveBeenCalled();
    });

    it('drops a Reader text lookup whose parse crosses an away-and-back target switch', async () => {
        const pending = deferred<JPDBToken[][]>();
        const showCard = vi.fn();
        const app = new ReaderApp() as unknown as {
            parser: {
                parse(): Promise<JPDBToken[][]>;
                isJpdbBackedCard(card: JPDBCard): boolean;
            };
            lookupText(text: string, sentence?: string): Promise<void>;
            showCard(...args: unknown[]): Promise<void>;
            destroy(): void;
        };
        app.parser = {
            parse: vi.fn(() => pending.promise),
            isJpdbBackedCard: () => true,
        };
        app.showCard = showCard;

        const lookup = app.lookupText('猫', '猫');
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve([{
            card: CARD,
            start: 0,
            end: 1,
            length: 1,
            rubies: [],
            pitchClass: '',
            sentence: '猫',
        }].map(token => [token]));
        await lookup;

        expect(showCard).not.toHaveBeenCalled();
        app.destroy();
    });

    it('does not cache or show a stale public pointer result after an away-and-back switch', async () => {
        const pending = deferred<Map<string, JPDBCard>>();
        const showPointerTextCard = vi.fn();
        const anchor = document.createElement('span');
        anchor.textContent = 'にほんごのじかん';
        document.body.append(anchor);
        const candidate = { text: anchor.textContent, offset: 1, start: 0, end: 8, anchor };
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            jitenPublicVocabulary: { parse(paragraphs: readonly string[]): Promise<JPDBToken[][]>; lookupMany(terms: readonly string[]): Promise<Map<string, JPDBCard>> };
            showPointerTextCard(...args: unknown[]): Promise<void>;
            showFirstPointerTextCandidate(
                pointerCandidate: typeof candidate,
                sentence: string,
                trigger: 'modal' | 'hover',
                options: { userGesture?: boolean },
            ): Promise<void>;
            destroy(): void;
        };
        app.settings = { ...DEFAULT_SETTINGS, apiKey: '', jpdbDefinitionsEnabled: true };
        app.jitenPublicVocabulary = {
            parse: vi.fn(async paragraphs => paragraphs.map(() => [])),
            lookupMany: vi.fn(() => pending.promise),
        };
        app.showPointerTextCard = showPointerTextCard;

        const lookup = app.showFirstPointerTextCandidate(candidate, candidate.text, 'modal', { userGesture: true });
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve(new Map([['にほんご', { ...CARD, spelling: '日本語', reading: 'にほんご', source: 'jiten' }]]));
        await expect(lookup).resolves.toBeUndefined();

        expect(showPointerTextCard).not.toHaveBeenCalled();
        app.destroy();
    });

    it('does not cache or show a stale public rendered expansion after an away-and-back switch', async () => {
        const resolvedCard = { ...CARD, spelling: '日本語', reading: 'にほんご', source: 'jiten' } as JPDBCard;
        const pending = deferred<JPDBCard | undefined>();
        const showRenderedWordCard = vi.fn();
        const word = document.createElement('span');
        word.textContent = 'に';
        word.dataset.sentence = 'にほんごのじかん';
        document.body.append(word);
        const fragmentCard = { ...CARD, spelling: 'に', reading: 'に', source: 'fallback' } as JPDBCard;
        const context = {
            sentence: word.dataset.sentence,
            anchor: word,
            trigger: 'modal' as const,
            navigation: 'reset' as const,
            insideReaderPopup: false,
        };
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            cardLookup: { captureTarget(): { isCurrent(): boolean } };
            parseJapanese(paragraphs: string[]): Promise<JPDBToken[][]>;
            showRenderedWordCard(...args: unknown[]): Promise<void>;
            showAuthoritativeSpanForRenderedWord(
                word: HTMLElement,
                card: JPDBCard,
                displayContext: typeof context,
                options: object,
                stackOverSettings: boolean,
                scope: { isCurrent(): boolean },
            ): Promise<boolean>;
            destroy(): void;
        };
        app.settings = { ...DEFAULT_SETTINGS, apiKey: '', jpdbDefinitionsEnabled: true };
        word.dataset.tokenStart = '0';
        word.dataset.tokenEnd = '1';
        const resolvedToken: JPDBToken = {
            card: resolvedCard,
            start: 0,
            end: 4,
            length: 4,
            rubies: [],
            pitchClass: '',
            sentence: word.dataset.sentence,
        };
        app.parseJapanese = vi.fn(() => pending.promise.then(() => [[resolvedToken]]));
        app.showRenderedWordCard = showRenderedWordCard;
        const scope = app.cardLookup.captureTarget();

        const lookup = app.showAuthoritativeSpanForRenderedWord(word, fragmentCard, context, {}, false, scope);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve(resolvedCard);
        await expect(lookup).resolves.toBe(true);

        expect(showRenderedWordCard).not.toHaveBeenCalled();
        app.destroy();
    });

    it('does not relabel a direct local Reader result after an away-and-back switch', async () => {
        const pending = deferred<Array<{ expression: string; reading: string; dictionary: string }>>();
        const showCard = vi.fn();
        const app = new ReaderApp() as unknown as {
            cardLookup: {
                captureTarget(): unknown;
                showLocalLookupCard(context: { selected: string }, sentence: string, target: unknown): Promise<boolean>;
            };
            localLookupEntries(selected: string): Promise<Array<{ expression: string; reading: string; dictionary: string }>>;
            showCard(...args: unknown[]): Promise<void>;
            destroy(): void;
        };
        app.localLookupEntries = vi.fn(() => pending.promise);
        app.showCard = showCard;
        const target = app.cardLookup.captureTarget();

        const lookup = app.cardLookup.showLocalLookupCard({ selected: 'casa' }, 'casa', target);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve([{ expression: 'casa', reading: 'casa', dictionary: 'Spanish' }]);

        await expect(lookup).resolves.toBe(false);
        expect(showCard).not.toHaveBeenCalled();
        app.destroy();
    });

    it('drops fallback and background Jiten results after an away-and-back target switch', async () => {
        const fallbackPending = deferred<JPDBToken[][]>();
        const hydrationPending = deferred<Map<string, JPDBCard>>();
        const resolved = { ...CARD, source: 'jiten' } as JPDBCard;
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            jiten: { parse(terms: string[]): Promise<JPDBToken[][]> };
            jitenPublicVocabulary: {
                lookupMany(): Promise<Map<string, JPDBCard>>;
                hydrateCards(): Promise<Map<string, JPDBCard>>;
            };
            cardLookup: {
                publicLookupFallbackCards(cards: readonly JPDBCard[]): Promise<Map<string, JPDBCard>>;
                publicLookupHydratableJitenCards(cards: readonly JPDBCard[]): Promise<Map<string, JPDBCard>>;
            };
            destroy(): void;
        };
        app.settings = { ...DEFAULT_SETTINGS, jitenApiKey: 'ak_test' };
        const parse = vi.fn((_terms: string[]) => fallbackPending.promise);
        app.jiten = { parse };
        app.jitenPublicVocabulary = {
            lookupMany: vi.fn(async () => new Map()),
            hydrateCards: vi.fn(() => hydrationPending.promise),
        };

        const fallback = app.cardLookup.publicLookupFallbackCards([CARD]);
        const hydration = app.cardLookup.publicLookupHydratableJitenCards([resolved]);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        const terms = parse.mock.calls[0]?.[0] ?? [];
        fallbackPending.resolve(terms.map(term => term === '猫' ? [{
            card: resolved, start: 0, end: term.length, length: term.length,
            rubies: [], pitchClass: 'unknown', sentence: term,
        }] : []));
        hydrationPending.resolve(new Map([['猫', resolved]]));

        await expect(fallback).resolves.toEqual(new Map());
        await expect(hydration).resolves.toEqual(new Map());
        expect(parse).toHaveBeenCalledTimes(1);
        app.destroy();
    });

    it('does not enter later fallback stages after the target generation becomes stale', async () => {
        const transportPending = deferred<JPDBToken[][]>();
        const batchTransportPending = deferred<JPDBToken[][]>();
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            jiten: { parse(): Promise<JPDBToken[][]> };
            jitenPublicVocabulary: { lookupMany(): Promise<Map<string, JPDBCard>> };
            cardLookup: {
                lookupFallbackApiCard(card: JPDBCard): Promise<JPDBCard | undefined>;
                publicLookupFallbackCards(cards: readonly JPDBCard[]): Promise<Map<string, JPDBCard>>;
            };
            destroy(): void;
        };
        app.settings = { ...DEFAULT_SETTINGS, jitenApiKey: 'ak_test' };
        const lookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        app.jitenPublicVocabulary = { lookupMany };

        const parse = vi.fn(() => transportPending.promise);
        app.jiten = { parse };
        const fallback = app.cardLookup.lookupFallbackApiCard(CARD);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        transportPending.reject(new Error('No configured proxy.'));
        await expect(fallback).resolves.toBeUndefined();
        expect(lookupMany).not.toHaveBeenCalled();

        app.jiten = { parse: vi.fn(() => batchTransportPending.promise) };
        const batch = app.cardLookup.publicLookupFallbackCards([CARD]);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        batchTransportPending.reject(new Error('No configured proxy.'));
        await expect(batch).resolves.toEqual(new Map());
        expect(lookupMany).not.toHaveBeenCalled();
        app.destroy();
    });

    it('does not record misses, cache cards, or mutate tokens from stale background resolution', async () => {
        const pending = deferred<Map<string, JPDBCard>>();
        const token = {
            card: CARD, start: 0, end: 1, length: 1, rubies: [], pitchClass: 'unknown', sentence: '猫',
        } as JPDBToken;
        const noteFallbackVocabularyMiss = vi.fn();
        const cacheCards = vi.fn();
        const app = new ReaderApp() as unknown as {
            publicLookupFallbackCards(): Promise<Map<string, JPDBCard>>;
            resolvePublicFallbackPitchTokens(tokens: JPDBToken[], options: { urgent: boolean }): Promise<JPDBToken[]>;
            noteFallbackVocabularyMiss(...args: unknown[]): void;
            parser: { cacheCards(cards: JPDBCard[]): void };
            destroy(): void;
        };
        app.publicLookupFallbackCards = vi.fn(() => pending.promise);
        app.noteFallbackVocabularyMiss = noteFallbackVocabularyMiss;
        app.parser = { cacheCards };

        const resolving = app.resolvePublicFallbackPitchTokens([token], { urgent: true });
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve(new Map());

        await expect(resolving).resolves.toEqual([]);
        expect(noteFallbackVocabularyMiss).not.toHaveBeenCalled();
        expect(cacheCards).not.toHaveBeenCalled();
        expect(token.card).toBe(CARD);
        app.destroy();
    });

    it('does not remember a rendered fallback resolved under a stale target generation', async () => {
        const pending = deferred<JPDBCard | undefined>();
        const rememberResolvedFallbackVocabulary = vi.fn();
        const cacheCards = vi.fn();
        const app = new ReaderApp() as unknown as {
            lookupFallbackApiCard(): Promise<JPDBCard | undefined>;
            resolveRenderedFallbackVocabulary(token: JPDBToken, options: { urgent: boolean }): Promise<JPDBCard | undefined>;
            rememberResolvedFallbackVocabulary(...args: unknown[]): void;
            parser: { cacheCards(cards: JPDBCard[]): void };
            destroy(): void;
        };
        app.lookupFallbackApiCard = vi.fn(() => pending.promise);
        app.rememberResolvedFallbackVocabulary = rememberResolvedFallbackVocabulary;
        app.parser = { cacheCards };
        const fallbackToken: JPDBToken = {
            card: CARD,
            start: 0,
            end: CARD.spelling.length,
            length: CARD.spelling.length,
            rubies: [],
            pitchClass: '',
        };

        const resolving = app.resolveRenderedFallbackVocabulary(fallbackToken, { urgent: true });
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve({ ...CARD, source: 'jiten' } as JPDBCard);

        await expect(resolving).resolves.toBeUndefined();
        expect(rememberResolvedFallbackVocabulary).not.toHaveBeenCalled();
        expect(cacheCards).not.toHaveBeenCalled();
        app.destroy();
    });

    it('adopts remote target settings before synchronizing reader background work', async () => {
        const styles = deferred<void>();
        const observedTargets: string[] = [];
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            embeddedFrame: boolean;
            cardLookup: { syncTarget(settings: ReaderSettings): void };
            subtitles: { refresh(): void; destroy(): void };
            ocr: { refresh(): void; destroy(): void };
            youtube: { refresh(): void; destroy(): void };
            applyPreferredJapaneseSiteLanguage(): void;
            applyTheme(): void;
            applyWordColors(): void;
            clearBridgeBackedCaches(): void;
            scheduleDictionaryRescan(): void;
            refreshDictionaryStyles(): Promise<void>;
            applyRemoteSettings(settings: ReaderSettings): Promise<void>;
            destroy(): void;
        };
        app.settings = settingsForTarget('ja');
        app.embeddedFrame = true;
        app.cardLookup = { syncTarget: vi.fn(() => observedTargets.push(activeLearningTargetLanguage())) };
        app.subtitles = { refresh: vi.fn(), destroy: vi.fn() };
        app.ocr = { refresh: vi.fn(() => observedTargets.push(activeLearningTargetLanguage())), destroy: vi.fn() };
        app.youtube = { refresh: vi.fn(), destroy: vi.fn() };
        app.applyPreferredJapaneseSiteLanguage = vi.fn();
        app.applyTheme = vi.fn();
        app.applyWordColors = vi.fn();
        app.clearBridgeBackedCaches = vi.fn();
        app.scheduleDictionaryRescan = vi.fn();
        app.refreshDictionaryStyles = vi.fn(() => styles.promise);

        const applied = app.applyRemoteSettings(settingsForTarget('ko'));
        expect(observedTargets).toEqual(['ko', 'ko']);
        styles.resolve();
        await applied;
        app.destroy();
    });

    it('does not adopt a transient settings-dialog probe as the active target', () => {
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            getSettingsDialog(): { dependencies: {
                setSettings(settings: ReaderSettings, options?: { transient?: boolean }): void;
            } } | undefined;
            destroy(): void;
        };
        app.settings = settingsForTarget('ja');
        const dialog = app.getSettingsDialog();
        expect(dialog).toBeDefined();
        const generation = activeLearningTargetGeneration();

        dialog!.dependencies.setSettings(settingsForTarget('ko'), { transient: true });

        expect(activeLearningTargetLanguage()).toBe('ja');
        expect(activeLearningTargetGeneration()).toBe(generation);
        app.destroy();
    });

    it('drops a New Tab text lookup resolved after the target changed away and back', async () => {
        const pending = deferred<JPDBCard>();
        const showLookupCard = vi.fn();
        const runtime = new NewTabRuntime() as unknown as {
            settings: ReaderSettings;
            lookupText(text: string): Promise<void>;
            lookupCard(term: string, reading: string): Promise<JPDBCard>;
            showLookupCard(...args: unknown[]): unknown;
            syncLookupTarget(settings: ReaderSettings): void;
            destroy(): void;
        };
        runtime.lookupCard = vi.fn(() => pending.promise);
        runtime.showLookupCard = showLookupCard;

        const lookup = runtime.lookupText('猫');
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve(CARD);
        await lookup;

        expect(showLookupCard).not.toHaveBeenCalled();
        runtime.destroy();
    });

    it('resolves New Tab text lookups through the active non-Japanese target', async () => {
        const koreanCard = { spelling: '한국어', reading: '한국어', source: 'local', language: 'ko' } as JPDBCard;
        const showLookupCard = vi.fn();
        const runtime = new NewTabRuntime() as unknown as {
            settings: ReaderSettings;
            lookupText(text: string): Promise<void>;
            lookupCard(term: string, reading: string, target: unknown): Promise<JPDBCard>;
            showLookupCard(...args: unknown[]): unknown;
            syncLookupTarget(settings: ReaderSettings): void;
            destroy(): void;
        };
        runtime.settings = settingsForTarget('ko');
        runtime.syncLookupTarget(runtime.settings);
        runtime.lookupCard = vi.fn(async () => koreanCard);
        runtime.showLookupCard = showLookupCard;

        await runtime.lookupText('한국어');

        expect(runtime.lookupCard).toHaveBeenCalledWith('한국어', '한국어', expect.objectContaining({
            language: 'ko',
            target: expect.objectContaining({ language: 'ko' }),
        }));
        expect(showLookupCard).toHaveBeenCalledWith(koreanCard, '한국어', undefined, expect.objectContaining({
            previousNavigationEntry: undefined,
        }));
        runtime.destroy();
    });

    it('dismisses only the stale New Tab lookup layer when settings are underneath it', () => {
        const runtime = new NewTabRuntime() as unknown as {
            settings: ReaderSettings;
            activeDialog?: HTMLElement;
            activeLookupPopover?: HTMLElement;
            nextLookupRenderRequest(): number;
            isCurrentLookupRender(popover: HTMLElement, requestId: number): boolean;
            syncLookupTarget(settings: ReaderSettings): void;
            destroy(): void;
        };
        const settings = document.createElement('form');
        settings.className = 'jpdb-reader-settings';
        const lookup = document.createElement('section');
        document.body.append(settings, lookup);
        runtime.activeDialog = settings;
        runtime.activeLookupPopover = lookup;
        const requestId = runtime.nextLookupRenderRequest();
        expect(runtime.isCurrentLookupRender(lookup, requestId)).toBe(true);

        runtime.settings = settingsForTarget('ko');
        runtime.syncLookupTarget(runtime.settings);

        expect(runtime.isCurrentLookupRender(lookup, requestId)).toBe(false);
        expect(lookup.isConnected).toBe(false);
        expect(settings.isConnected).toBe(true);
        runtime.destroy();
    });
});
