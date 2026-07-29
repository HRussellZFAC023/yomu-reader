import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import {
    activeLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages';
import { ReaderParser } from '../../src/reader/lookup/parser';
import type { ReaderParserDependencies } from '../../src/reader/lookup/parser';

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
});
