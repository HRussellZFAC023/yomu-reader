import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JpdbClient as JpdbClientFacade } from '../../src/reader/jpdb/jpdb-companion';
import { JpdbVocabularyClient as JpdbVocabularyClientFacade } from '../../src/reader/jpdb/jpdb-vocabulary-companion';
import { JpdbPublicPitchClient as JpdbPublicPitchClientFacade } from '../../src/reader/jpdb/jpdb-public-pitch-companion';
import { initJpdbReviewPageBridge as initJpdbReviewPageBridgeFacade } from '../../src/reader/jpdb/jpdb-review-bridge-companion';
import { renderJpdbDefinitionSource as renderJpdbDefinitionSourceFacade } from '../../src/reader/jpdb/jpdb-definition-source-render-companion';
import { renderedJpdbRelatedWords as renderedJpdbRelatedWordsFacade } from '../../src/reader/jpdb/jpdb-related-words-companion';
import {
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS as JITEN_BACKGROUND_DETAIL_TIMEOUT_MS_FACADE,
    JitenPublicVocabularyClient as JitenPublicVocabularyClientFacade,
    parsedCardHydrationKey as parsedCardHydrationKeyFacade,
    publicJitenBackoffRemainingMs as publicJitenBackoffRemainingMsFacade,
} from '../../src/reader/dictionaries/jiten-public-vocabulary-companion';
import { renderJitenDefinitionSource as renderJitenDefinitionSourceFacade } from '../../src/reader/jiten/jiten-definition-source-render-companion';

import { JpdbClient } from '../../src/reader/jpdb/jpdb';
import { JpdbVocabularyClient } from '../../src/reader/jpdb/jpdb-vocabulary';
import { JpdbPublicPitchClient } from '../../src/reader/jpdb/jpdb-public-pitch';
import {
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    JitenPublicVocabularyClient,
    parsedCardHydrationKey,
} from '../../src/reader/dictionaries/jiten-public-vocabulary';
import type { JPDBCard } from '../../src/reader/app/types';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

type CompanionHost = typeof globalThis & { __yomuCompanions?: Record<string, unknown> };

const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__yomuCompanions');

function setCompanions(value: Record<string, unknown>): void {
    (globalThis as CompanionHost).__yomuCompanions = value;
}

afterEach(() => {
    if (originalDescriptor) {
        Object.defineProperty(globalThis, '__yomuCompanions', originalDescriptor);
    } else {
        delete (globalThis as CompanionHost).__yomuCompanions;
    }
});

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return { vid: 12, sid: 34, spelling: '猫', reading: 'ねこ', ...overrides } as JPDBCard;
}

// ---------------------------------------------------------------------------
// ADR-0003 split: the Greasy Fork core keeps delegating shells for the JPDB and
// Jiten provider suites. Each shell must (a) reach the companion when it is
// loaded and (b) answer the documented "provider not configured" value — never
// throw — when it is not.
// ---------------------------------------------------------------------------
describe('JPDB companion facades', () => {
    it('delegate to the registered JPDB companion', async () => {
        const CompanionJpdbClient = vi.fn(function CompanionJpdbClient(this: Record<string, unknown>) {
            this.tag = 'companion-jpdb';
        });
        const CompanionVocabularyClient = vi.fn(function CompanionVocabularyClient(this: Record<string, unknown>) {
            this.tag = 'companion-vocabulary';
        });
        const CompanionPublicPitchClient = vi.fn(function CompanionPublicPitchClient(this: Record<string, unknown>) {
            this.tag = 'companion-pitch';
        });
        const dispose = () => {};
        const initJpdbReviewPageBridge = vi.fn(() => dispose);
        const renderJpdbDefinitionSource = vi.fn(() => '<jpdb-source>');
        const relatedWord = { word: document.createElement('span'), token: {} };
        const renderedJpdbRelatedWords = vi.fn(() => [relatedWord]);
        setCompanions({
            jpdb: {
                JpdbClient: CompanionJpdbClient,
                JpdbVocabularyClient: CompanionVocabularyClient,
                JpdbPublicPitchClient: CompanionPublicPitchClient,
                initJpdbReviewPageBridge,
                renderJpdbDefinitionSource,
                renderedJpdbRelatedWords,
            },
        });

        const apiKey = () => 'key';
        const proxy = () => 'proxy';
        expect(new JpdbClientFacade(apiKey, proxy)).toMatchObject({ tag: 'companion-jpdb' });
        expect(CompanionJpdbClient).toHaveBeenCalledWith(apiKey, proxy);
        expect(new JpdbVocabularyClientFacade(proxy)).toMatchObject({ tag: 'companion-vocabulary' });
        expect(CompanionVocabularyClient).toHaveBeenCalledWith(proxy);
        expect(new JpdbPublicPitchClientFacade(proxy)).toMatchObject({ tag: 'companion-pitch' });
        expect(CompanionPublicPitchClient).toHaveBeenCalledWith(proxy);
        expect(initJpdbReviewPageBridgeFacade()).toBe(dispose);
        const attributes = () => '';
        expect(renderJpdbDefinitionSourceFacade(card(), attributes)).toBe('<jpdb-source>');
        expect(renderedJpdbRelatedWordsFacade(document)).toEqual([relatedWord]);
    });

    it('are inert — never throwing — without the JPDB companion', async () => {
        setCompanions({});

        // tsc never follows the build alias, so the facade's class expression
        // types as {}; the runtime contract is "stands in for JpdbClient".
        const client = new JpdbClientFacade(() => '', () => '') as unknown as JpdbClient;
        await expect(client.parse(['猫'])).resolves.toEqual([]);
        await expect(client.listDecks()).resolves.toEqual([]);
        await expect(client.listDeckCards('1')).resolves.toEqual([]);
        await expect(client.ping()).resolves.toBe(false);
        await expect(client.isInUserDeckPool(card())).resolves.toBe(false);
        await expect(client.reviewCard(card(), 'good' as never)).resolves.toBeUndefined();
        await expect(client.addToDeck('1', card())).resolves.toBeUndefined();
        await expect(client.removeFromDeck('1', card())).resolves.toBeUndefined();
        await expect(client.refreshCardState(card())).resolves.toBeUndefined();
        expect(client.getCard(12, 34)).toBeUndefined();
        expect(() => client.clear()).not.toThrow();

        const vocabulary = new JpdbVocabularyClientFacade(() => '') as unknown as JpdbVocabularyClient;
        await expect(vocabulary.lookup(12, '猫', 'ねこ')).resolves.toBeNull();
        await expect(vocabulary.search('猫')).resolves.toEqual([]);
        expect(() => vocabulary.clear()).not.toThrow();

        const pitch = new JpdbPublicPitchClientFacade(() => '') as unknown as JpdbPublicPitchClient;
        await expect(pitch.lookup('猫', 'ねこ')).resolves.toEqual([]);
        expect(initJpdbReviewPageBridgeFacade()).toBeUndefined();
        expect(renderJpdbDefinitionSourceFacade(card(), () => '')).toBe('');
        expect(renderedJpdbRelatedWordsFacade(document)).toEqual([]);
    });

    // A method the real client exposes but the disabled shell forgets becomes
    // "x.foo is not a function" for anyone whose companion failed to load, so
    // the two surfaces are pinned to each other.
    it('cover every JPDB client method core calls, on both the shell and the implementation', () => {
        setCompanions({});
        const shell = new JpdbClientFacade(() => '', () => '') as unknown as Record<string, unknown>;
        for (const method of [
            'parse', 'reviewCard', 'addToDeck', 'listDecks', 'ping', 'listDeckCards',
            'isInUserDeckPool', 'removeFromDeck', 'getCard', 'clear', 'refreshCardState',
        ]) {
            expect(typeof shell[method], `disabled JpdbClient shell is missing ${method}`).toBe('function');
            expect(typeof (JpdbClient.prototype as unknown as Record<string, unknown>)[method], `JpdbClient no longer implements ${method}`).toBe('function');
        }

        const vocabularyShell = new JpdbVocabularyClientFacade(() => '') as unknown as Record<string, unknown>;
        for (const method of ['clear', 'lookup', 'search']) {
            expect(typeof vocabularyShell[method], `disabled JpdbVocabularyClient shell is missing ${method}`).toBe('function');
            expect(typeof (JpdbVocabularyClient.prototype as unknown as Record<string, unknown>)[method], `JpdbVocabularyClient no longer implements ${method}`).toBe('function');
        }

        const pitchShell = new JpdbPublicPitchClientFacade(() => '') as unknown as Record<string, unknown>;
        expect(typeof pitchShell.lookup).toBe('function');
        expect(typeof (JpdbPublicPitchClient.prototype as unknown as Record<string, unknown>).lookup).toBe('function');
    });
});

describe('Jiten companion facades', () => {
    it('delegate to the registered Jiten companion', () => {
        const CompanionClient = vi.fn(function CompanionClient(this: Record<string, unknown>) {
            this.tag = 'companion-jiten';
        });
        setCompanions({
            jiten: {
                JitenPublicVocabularyClient: CompanionClient,
                JITEN_BACKGROUND_DETAIL_TIMEOUT_MS: 4000,
                parsedCardHydrationKey: vi.fn(() => 'companion-key'),
                publicJitenBackoffRemainingMs: vi.fn(() => 4200),
                renderJitenDefinitionSource: vi.fn(() => '<jiten-source>'),
            },
        });

        const options = { proxyUrl: 'https://proxy.example/' };
        expect(new JitenPublicVocabularyClientFacade(options)).toMatchObject({ tag: 'companion-jiten' });
        expect(CompanionClient).toHaveBeenCalledWith(options);
        expect(parsedCardHydrationKeyFacade(card())).toBe('companion-key');
        expect(publicJitenBackoffRemainingMsFacade()).toBe(4200);
        expect(renderJitenDefinitionSourceFacade(card(), () => '')).toBe('<jiten-source>');
    });

    it('are inert — never throwing — without the Jiten companion', async () => {
        setCompanions({});

        const client = new JitenPublicVocabularyClientFacade() as unknown as JitenPublicVocabularyClient;
        await expect(client.lookup('猫')).resolves.toBeNull();
        await expect(client.lookupMany(['猫'])).resolves.toEqual(new Map());
        await expect(client.hydrateCards([card()])).resolves.toEqual(new Map());
        await expect(client.parse(['猫が'])).resolves.toEqual([]);
        expect(() => client.clear()).not.toThrow();
        expect(publicJitenBackoffRemainingMsFacade()).toBe(0);
        expect(renderJitenDefinitionSourceFacade(card(), () => '')).toBe('');
    });

    it('covers every Jiten public client method core calls, on both the shell and the implementation', () => {
        setCompanions({});
        const shell = new JitenPublicVocabularyClientFacade() as unknown as Record<string, unknown>;
        for (const method of ['lookup', 'lookupMany', 'parse', 'hydrateCards', 'clear']) {
            expect(typeof shell[method], `disabled JitenPublicVocabularyClient shell is missing ${method}`).toBe('function');
            expect(typeof (JitenPublicVocabularyClient.prototype as unknown as Record<string, unknown>)[method], `JitenPublicVocabularyClient no longer implements ${method}`).toBe('function');
        }
    });

    // The facade cannot re-export these from the implementation without pulling
    // the whole companion module back into the size-limited core, so the values
    // are duplicated — and pinned here so they can never silently drift.
    it('keeps the duplicated core-side values byte-identical to the implementation', () => {
        setCompanions({});
        expect(JITEN_BACKGROUND_DETAIL_TIMEOUT_MS_FACADE).toBe(JITEN_BACKGROUND_DETAIL_TIMEOUT_MS);
        for (const sample of [card(), card({ vid: 0, sid: 0 }), card({ vid: 999999, sid: 7 })]) {
            expect(parsedCardHydrationKeyFacade(sample)).toBe(parsedCardHydrationKey(sample));
        }
    });
});

// ---------------------------------------------------------------------------
// The split only holds if the three moving parts agree: a companion library in
// the manifest, an entry that registers it, and a build alias that swaps each
// core import for the facade. Any one of them missing ships either a companion
// nobody loads or a core that still bundles the implementation.
// ---------------------------------------------------------------------------
describe('Greasy Fork split manifest', () => {
    const { GREASY_FORK_LIBRARIES } = require('../../scripts/lib/greasyfork-libraries.cjs') as {
        GREASY_FORK_LIBRARIES: Array<{ id: string; label: string; entry: string; fileName: string; globalName: string }>;
    };
    const viteConfigSource = readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8');
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
        yomu?: { allowedRequireUrls?: string[] };
    };

    it.each(['jpdb', 'jiten'])('publishes the %s companion with an entry that registers it', id => {
        const library = GREASY_FORK_LIBRARIES.find(candidate => candidate.id === id);
        expect(library, `${id} is missing from GREASY_FORK_LIBRARIES`).toBeDefined();
        const entryPath = path.join(repoRoot, library!.entry);
        expect(existsSync(entryPath), `${library!.entry} does not exist`).toBe(true);
        expect(readFileSync(entryPath, 'utf8')).toContain(`registerYomuCompanion('${id}'`);
        expect(readFileSync(path.join(repoRoot, 'src/reader/companions/register-build-companions.ts'), 'utf8'))
            .toContain(`import './${id}';`);
    });

    it('loads every focused companion through one deduplicated userscript runtime', () => {
        const runtime = GREASY_FORK_LIBRARIES.find(candidate => candidate.id === 'runtime');
        expect(runtime).toBeDefined();
        expect(readFileSync(path.join(repoRoot, runtime!.entry), 'utf8'))
            .toContain("import './register-build-companions';");
        expect(packageJson.yomu?.allowedRequireUrls ?? [])
            .toEqual([`https://yomureader.com/greasyfork/${runtime!.fileName}`]);
    });

    it('removes only the generated IIFE wrapper indent from the injected runtime', () => {
        const runtime = GREASY_FORK_LIBRARIES.find(candidate => candidate.id === 'runtime');
        expect(runtime).toBeDefined();
        const built = readFileSync(path.join(repoRoot, 'dist', 'greasyfork', runtime!.fileName), 'utf8');
        expect(built).toMatch(/^\(function\(\) \{\n"use strict";\nfunction /);
        expect(built).toContain('\n  return ');
    });

    it.each([
        ['../jpdb/jpdb', 'src/reader/jpdb/jpdb-companion.ts'],
        ['../jpdb/jpdb-vocabulary', 'src/reader/jpdb/jpdb-vocabulary-companion.ts'],
        ['../jpdb/jpdb-public-pitch', 'src/reader/jpdb/jpdb-public-pitch-companion.ts'],
        ['../jpdb/jpdb-review-bridge', 'src/reader/jpdb/jpdb-review-bridge-companion.ts'],
        ['../jpdb/jpdb-definition-source-render', 'src/reader/jpdb/jpdb-definition-source-render-companion.ts'],
        ['../jpdb/jpdb-related-words', 'src/reader/jpdb/jpdb-related-words-companion.ts'],
        ['../dictionaries/jiten-public-vocabulary', 'src/reader/dictionaries/jiten-public-vocabulary-companion.ts'],
        ['../jiten/jiten-definition-source-render', 'src/reader/jiten/jiten-definition-source-render-companion.ts'],
    ])('aliases %s to its core-side facade in the split build', (specifier, facade) => {
        expect(existsSync(path.join(repoRoot, facade)), `${facade} does not exist`).toBe(true);
        const segments = facade.replace(/^src\/reader\//, '').split('/');
        const aliasLine = `alias['${specifier}'] = path.join(configRoot, 'src', 'reader', ${segments.map(segment => `'${segment}'`).join(', ')});`;
        expect(viteConfigSource, `vite.config.ts is missing the split alias for ${specifier}`).toContain(aliasLine);
    });
});
