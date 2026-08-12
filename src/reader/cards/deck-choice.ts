import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { ACADEMY_SRS_LABEL } from '../app/constants';
import type { ApiDeck, JPDBDeck, ReaderSettings } from '../app/types';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

type SrsDeckSource = 'jpdb' | 'jiten' | 'bunpro' | 'yomu-local' | 'anki';
const NON_JPDB_DECK_SOURCES = new Set<SrsDeckSource>(['anki', 'jiten', 'bunpro', 'yomu-local']);

export interface DeckChoiceRenderOptions {
    includeJpdb?: boolean;
    includeJiten?: boolean;
    includeBunpro?: boolean;
    includeYomuLocal?: boolean;
    jitenDecks?: ApiDeck[];
}

export function renderDeckChoiceOptions(
    settings: ReaderSettings,
    jpdbDecks: JPDBDeck[],
    ankiDecks: string[],
    optionsOrIncludeJpdb: DeckChoiceRenderOptions | boolean = {},
): string {
    const renderOptions = normalizeDeckChoiceRenderOptions(optionsOrIncludeJpdb);
    const options: Array<[string, string]> = [];
    if (renderOptions.includeJpdb) addJpdbDeckChoiceOptions(settings, options, jpdbDecks);
    if (renderOptions.includeJiten) addJitenDeckChoiceOptions(options, renderOptions.jitenDecks ?? []);
    if (renderOptions.includeBunpro) addDeckChoiceOption(options, 'bunpro', 'bunpro', 'Bunpro');
    if (renderOptions.includeYomuLocal && settings.yomuLocalSrsEnabled) addDeckChoiceOption(options, 'yomu-local', 'yomu-local', ACADEMY_SRS_LABEL);
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

function addJitenDeckChoiceOptions(options: Array<[string, string]>, jitenDecks: ApiDeck[]): void {
    for (const deck of jitenDecks) addDeckChoiceOption(options, 'jiten', deck.id, `Jiten: ${deck.name}`);
}

function addAnkiDeckChoiceOptions(settings: ReaderSettings, options: Array<[string, string]>, ankiDecks: string[]): void {
    const configuredDeck = settings.ankiDeck || 'よむ';
    addDeckChoiceOption(options, 'anki', configuredDeck, `Anki: ${configuredDeck}`);
    for (const deck of ankiDecks) addDeckChoiceOption(options, 'anki', deck, `Anki: ${deck}`);
}

function addDeckChoiceOption(
    options: Array<[string, string]>,
    source: SrsDeckSource,
    value: string,
    label: string,
): void {
    const normalizedValue = value.trim();
    const key = `${source}:${normalizedValue}`;
    if (!normalizedValue || options.some(([existing]) => existing === key)) return;
    options.push([key, label]);
}

function renderDeckChoiceOption([value, label]: [string, string]): string {
    const [rawSource, ...idParts] = value.split(':');
    const source = deckChoiceSource(rawSource);
    const deckId = idParts.join(':');
    const capability = privateCommandAttributes({ kind: 'deck-choice', source, id: deckId });
    return `<option value="${escapeHtml(value)}" data-deck-source="${escapeHtml(source)}" data-deck-id="${escapeHtml(deckId)}"${capability}>${escapeHtml(label)}</option>`;
}

function deckChoiceSource(value: string): SrsDeckSource {
    return NON_JPDB_DECK_SOURCES.has(value as SrsDeckSource) ? value as SrsDeckSource : 'jpdb';
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

function normalizeDeckChoiceRenderOptions(value: DeckChoiceRenderOptions | boolean): DeckChoiceRenderOptions {
    return typeof value === 'boolean' ? { includeJpdb: value } : value;
}
