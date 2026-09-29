import { describe, expect, it } from 'vitest';
import { selectAnkiLibraryChoices } from '../../src/reader/settings/anki-library-selection';
import type { AnkiLibraryScanResult, AnkiModelScanResult } from '../../src/reader/anki/types';

const model = (modelName: string): AnkiModelScanResult => ({ modelName, fields: [], suggestions: [], score: 1 });
const scan: AnkiLibraryScanResult = {
    deckNames: ['Reading', 'Listening'],
    models: [model('Lapis'), model('よむ Japanese')],
    suggestedModel: model('Lapis'),
};

describe('Anki library selection policy', () => {
    it('keeps a listed deck and note type even when another model is suggested', () => {
        expect(selectAnkiLibraryChoices(scan, ' Listening ', 'よむ Japanese')).toEqual({
            selectedDeck: 'Listening', selectedModel: 'よむ Japanese',
        });
    });

    it('preserves custom choices missing from an incomplete multi-deck scan', () => {
        expect(selectAnkiLibraryChoices(scan, 'My deck', 'My note type')).toEqual({
            selectedDeck: 'My deck', selectedModel: 'My note type',
        });
    });

    it('replaces an absent shipped default with scanned choices', () => {
        expect(selectAnkiLibraryChoices(scan, 'Yomu', 'Yomu Japanese')).toEqual({
            selectedDeck: 'Reading', selectedModel: 'Lapis',
        });
    });

    it('retains existing single-deck selection behavior', () => {
        expect(selectAnkiLibraryChoices({ ...scan, deckNames: ['Reading'] }, 'Missing deck', 'Custom')).toEqual({
            selectedDeck: 'Reading', selectedModel: 'Custom',
        });
    });

    it('leaves choices intact when no library data is available', () => {
        expect(selectAnkiLibraryChoices({ deckNames: [], models: [], suggestedModel: null }, 'Yomu', 'Yomu Japanese')).toEqual({
            selectedDeck: 'Yomu', selectedModel: 'Yomu Japanese',
        });
    });
});
