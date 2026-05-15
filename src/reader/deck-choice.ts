import { escapeHtml } from './dom';
import { uiText } from './i18n';
import type { JPDBDeck, ReaderSettings } from './types';

export function renderDeckChoiceOptions(settings: ReaderSettings, jpdbDecks: JPDBDeck[], ankiDecks: string[], includeJpdb: boolean): string {
    const options: Array<[string, string]> = [];
    if (includeJpdb) addJpdbDeckChoiceOptions(settings, options, jpdbDecks);
    if (settings.ankiEnabled) addAnkiDeckChoiceOptions(settings, options, ankiDecks);
    if (!options.length) return '';
    return deckChoicePlaceholderOption(settings) + options.map(renderDeckChoiceOption).join('');
}

export function jpdbDeckLabel(settings: ReaderSettings, deckId: string, decks: JPDBDeck[]): string {
    void settings;
    if (deckId === 'forq') return 'FORQ';
    const deck = decks.find(candidate => candidate.id === deckId);
    return deck?.name || deckId;
}

function addJpdbDeckChoiceOptions(settings: ReaderSettings, options: Array<[string, string]>, jpdbDecks: JPDBDeck[]): void {
    const selected = settings.miningDeck.trim() || 'forq';
    addDeckChoiceOption(options, 'jpdb', 'forq', 'JPDB: FORQ');
    addDeckChoiceOption(options, 'jpdb', selected, `JPDB: ${jpdbDeckLabel(settings, selected, jpdbDecks)}`);
    for (const deck of jpdbDecks) {
        if (!isSpecialJpdbDeck(settings, deck)) addDeckChoiceOption(options, 'jpdb', deck.id, `JPDB: ${deck.name}`);
    }
}

function addAnkiDeckChoiceOptions(settings: ReaderSettings, options: Array<[string, string]>, ankiDecks: string[]): void {
    const configuredDeck = settings.ankiDeck || 'よむ';
    addDeckChoiceOption(options, 'anki', configuredDeck, `Anki: ${configuredDeck}`);
    for (const deck of ankiDecks) addDeckChoiceOption(options, 'anki', deck, `Anki: ${deck}`);
}

function addDeckChoiceOption(
    options: Array<[string, string]>,
    source: 'jpdb' | 'anki',
    value: string,
    label: string,
): void {
    const normalizedValue = value.trim();
    const key = `${source}:${normalizedValue}`;
    if (!normalizedValue || options.some(([existing]) => existing === key)) return;
    options.push([key, label]);
}

function renderDeckChoiceOption([value, label]: [string, string]): string {
    const [source, ...idParts] = value.split(':');
    const deckId = idParts.join(':');
    return `<option value="${escapeHtml(value)}" data-deck-source="${escapeHtml(source)}" data-deck-id="${escapeHtml(deckId)}">${escapeHtml(label)}</option>`;
}

function deckChoicePlaceholderOption(settings: ReaderSettings): string {
    return `<option value="" disabled selected>${escapeHtml(uiText(settings.interfaceLanguage, 'deck'))}</option>`;
}

function isSpecialJpdbDeck(settings: ReaderSettings, deck: JPDBDeck): boolean {
    const neverForgetDeck = settings.neverForgetDeck.trim();
    const blacklistDeck = settings.blacklistDeck.trim();
    if (deck.id === neverForgetDeck || deck.id === blacklistDeck) return true;
    return /never\s*-?\s*forget|blacklist|suspend/i.test(`${deck.id} ${deck.name}`);
}
