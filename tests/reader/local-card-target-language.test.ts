import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import {
    activeLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages';
import { ReaderParser } from '../../src/reader/lookup/parser';
import type { ReaderParserDependencies } from '../../src/reader/lookup/parser';
import { renderPronunciation } from '../../src/reader/popup/pronunciation';
import type { LearningTargetModule } from '../../src/reader/languages/types';

describe('local card target language', () => {
    afterEach(() => {
        setActiveLearningTargetLanguage('ja');
    });

    it('stamps a non-Japanese target onto cards before local SRS identity is built', () => {
        setActiveLearningTargetLanguage('es');
        const parser = new ReaderParser({
            getSettings: () => DEFAULT_SETTINGS,
            jpdb: {} as ReaderParserDependencies['jpdb'],
            dictionaries: {} as ReaderParserDependencies['dictionaries'],
        });

        const card = parser.localCardFromEntry({
            dictionary: 'Spanish',
            expression: 'casa',
            reading: '',
            glossary: ['house'],
        });

        expect(activeLearningTargetLanguage()).toBe('es');
        expect(card.language).toBe('es');
    });

    it('target-scopes fallback identity and renders its non-Japanese pronunciation as IPA', () => {
        const parser = new ReaderParser({
            getSettings: () => DEFAULT_SETTINGS,
            jpdb: {} as ReaderParserDependencies['jpdb'],
            dictionaries: {} as ReaderParserDependencies['dictionaries'],
        });
        setActiveLearningTargetLanguage('es');
        const spanish = parser.fallbackCardFromText('gratis');
        setActiveLearningTargetLanguage('ja');
        const japanese = parser.fallbackCardFromText('gratis');

        expect(spanish.language).toBe('es');
        expect(spanish.vid).not.toBe(japanese.vid);
        expect(renderPronunciation({
            card: spanish,
            settings: DEFAULT_SETTINGS,
            metaEntries: [{
                expression: 'gratis',
                mode: 'ipa',
                data: { reading: '', transcriptions: [{ ipa: '/ˈɡɾatis/' }] },
                dictionary: 'Spanish IPA',
            }],
            dictionaryLabel: name => name,
        })).toContain('data-pronunciation-kind="ipa"');
    });

    it('never leaves a dangling surrogate at the fallback spelling cap', () => {
        const parser = new ReaderParser({
            getSettings: () => DEFAULT_SETTINGS,
            jpdb: {} as ReaderParserDependencies['jpdb'],
            dictionaries: {} as ReaderParserDependencies['dictionaries'],
        });
        const card = parser.fallbackCardFromText(`${'我'.repeat(79)}𡃁tail`);

        expect(card.spelling).toBe('我'.repeat(79));
        expect(card.spelling).not.toMatch(/[\uD800-\uDFFF]/u);
    });

    it('discards an in-flight parse after an away-and-back target switch', async () => {
        let resolveMatches!: (matches: never[]) => void;
        const findTermMatches = vi.fn((
            _text: string,
            _limit: number,
            _preferences: unknown[],
            _target: LearningTargetModule,
        ) => new Promise<never[]>(resolve => {
            resolveMatches = resolve;
        }));
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, localDictionariesEnabled: true }),
            jpdb: {} as ReaderParserDependencies['jpdb'],
            dictionaries: { findTermMatches } as unknown as ReaderParserDependencies['dictionaries'],
        });
        setActiveLearningTargetLanguage('es');
        const parsed = parser.parse(['casa'], { allowSegmentedFallback: true });
        await vi.waitFor(() => expect(findTermMatches).toHaveBeenCalled());

        setActiveLearningTargetLanguage('ja');
        setActiveLearningTargetLanguage('es');
        resolveMatches([]);

        await expect(parsed).resolves.toEqual([[]]);
        expect(findTermMatches.mock.calls[0]?.[3]).toMatchObject({ language: 'es' });
    });
});
