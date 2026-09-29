import type { AnkiLibraryScanResult } from '../anki/types';

const DEFAULT_DECK_NAMES = new Set(['', 'よむ', 'Yomu']);
const DEFAULT_MODEL_NAMES = new Set(['', 'よむ Japanese', 'Yomu Japanese']);

export function selectAnkiLibraryChoices(
    scan: AnkiLibraryScanResult,
    currentDeck: string,
    currentModel: string,
): { selectedDeck: string; selectedModel: string } {
    const deck = currentDeck.trim();
    const model = currentModel.trim();
    const replaceDeck = scan.deckNames.length > 0
        && !scan.deckNames.includes(deck)
        && (scan.deckNames.length === 1 || DEFAULT_DECK_NAMES.has(deck));

    // An absent custom note type may belong to another Anki profile or an
    // incompletely loaded collection. A suggestion must not erase that choice.
    const preserveModel = Boolean(model) && (scan.models.some(candidate => candidate.modelName === model)
        || !DEFAULT_MODEL_NAMES.has(model));
    return {
        selectedDeck: replaceDeck ? scan.deckNames[0]! : deck,
        selectedModel: preserveModel ? model : scan.suggestedModel?.modelName || model,
    };
}
