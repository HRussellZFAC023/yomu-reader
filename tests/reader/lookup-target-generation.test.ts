import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import {
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
        activeLanguageProfileId: profile.id,
        languageProfiles: [{ ...profile, targetLanguage }],
    } as Partial<ReaderSettings>);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
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
        const cacheCards = vi.fn();
        const showPointerTextCard = vi.fn();
        const anchor = document.createElement('span');
        anchor.textContent = 'にほんごのじかん';
        document.body.append(anchor);
        const candidate = { text: anchor.textContent, offset: 1, start: 0, end: 8, anchor };
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            parser: { cacheCards(cards: JPDBCard[]): void };
            jitenPublicVocabulary: { lookupMany(terms: readonly string[]): Promise<Map<string, JPDBCard>> };
            cardLookup: { captureTarget(): unknown };
            showPointerTextCard(...args: unknown[]): Promise<void>;
            showPublicJpdbPointerTextCandidate(
                pointerCandidate: typeof candidate,
                sentence: string,
                trigger: 'modal' | 'hover',
                options: { userGesture?: boolean },
                scope: unknown,
            ): Promise<boolean>;
            destroy(): void;
        };
        app.settings = { ...DEFAULT_SETTINGS, apiKey: '', jpdbDefinitionsEnabled: true };
        app.parser = { cacheCards };
        app.jitenPublicVocabulary = { lookupMany: vi.fn(() => pending.promise) };
        app.showPointerTextCard = showPointerTextCard;
        const scope = app.cardLookup.captureTarget();

        const lookup = app.showPublicJpdbPointerTextCandidate(candidate, candidate.text, 'modal', { userGesture: true }, scope);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve(new Map([['にほんご', { ...CARD, spelling: '日本語', reading: 'にほんご', source: 'jiten' }]]));
        await expect(lookup).resolves.toBe(true);

        expect(cacheCards).not.toHaveBeenCalled();
        expect(showPointerTextCard).not.toHaveBeenCalled();
        app.destroy();
    });

    it('does not cache or show a stale public rendered expansion after an away-and-back switch', async () => {
        const resolvedCard = { ...CARD, spelling: '日本語', reading: 'にほんご', source: 'jiten' } as JPDBCard;
        const pending = deferred<JPDBCard | undefined>();
        const cacheCards = vi.fn();
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
            parser: { cacheCards(cards: JPDBCard[]): void };
            cardLookup: { captureTarget(): unknown };
            resolvePublicJpdbRenderedWordCandidate(terms: string[], boundWait: boolean): Promise<JPDBCard | undefined>;
            showRenderedWordCard(...args: unknown[]): Promise<void>;
            showPublicJpdbRenderedWordCandidate(
                word: HTMLElement,
                card: JPDBCard,
                displayContext: typeof context,
                options: object,
                stackOverSettings: boolean,
                scope: unknown,
            ): Promise<boolean>;
            destroy(): void;
        };
        app.parser = { cacheCards };
        app.resolvePublicJpdbRenderedWordCandidate = vi.fn(() => pending.promise);
        app.showRenderedWordCard = showRenderedWordCard;
        const scope = app.cardLookup.captureTarget();

        const lookup = app.showPublicJpdbRenderedWordCandidate(word, fragmentCard, context, {}, false, scope);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        pending.resolve(resolvedCard);
        await expect(lookup).resolves.toBe(true);

        expect(cacheCards).not.toHaveBeenCalled();
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
