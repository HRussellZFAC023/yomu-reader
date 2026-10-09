import { escapeHtml } from '../dom/index';
import { renderFrequencyPill } from './definition-render';
import { formatUiText, uiText } from '../app/i18n';
import { bestFrequencyEntries, formatLookupUrl } from '../dictionaries/display';
import { canUseMobileAnkiHandoff, mobileAnkiHandoffAppName, type AnkiLookupResult } from '../anki/index';
import { ankiIcon, copyIcon, externalLinkIcon, moreIcon } from '../ui/icons';
import { replaceOptionalElement } from '../app/dom-helpers';
import type { JPDBCard, ReaderSettings } from '../app/types';
import { frequencyProviderForLookupId, type FrequencyProvider, type ProviderFrequencyRank, type ProviderFrequencyRanks } from '../cards/frequency-ranks';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';
import { extractFrequency } from '../dictionaries/yomitan/ranking';
import { isJapaneseKanjiCharacter } from '../lookup/japanese-script';
import { currentAccountDataSurfaceIsTrusted } from '../app/account-data-surface';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

interface WordPillContext {
    query: string;
    word: string;
    reading: string;
    vid: string;
    sid: string;
}

export interface WordPillRenderOptions {
    card: JPDBCard;
    jpdbUrl: string;
    settings: ReaderSettings;
    metaEntries?: YomitanMetaEntry[];
    overrideQuery?: string;
    inert?: boolean;
    ankiLookup?: AnkiLookupResult;
    frequencyRanks?: ProviderFrequencyRanks;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    dictionaryLabel: (name: string) => string;
    trustedAccountDataSurface?: boolean;
    /** The word popup draws Copy as an icon beside audio, so its row leaves Copy out. */
    copyBesideAudio?: boolean;
}

type LookupLink = ReaderSettings['dictionaryLookupLinks'][number];

// Jiten and JPDB lead the row: their pages carry the word's frequency and deck
// state. Other destinations (Yomu search, Bunpro, Jisho, a custom link) wait
// behind one "More" so the row stays a single line on a phone.
const LEAD_LOOKUP_LINK_IDS: ReadonlySet<string> = new Set(['jiten', 'jpdb']);

export function renderWordPills(options: WordPillRenderOptions): string {
    const context = wordPillContext(options.card, options.overrideQuery);
    const query = context.query;
    const language = options.settings.interfaceLanguage;
    const enabledLinks = options.settings.dictionaryLookupLinks
        .filter(link => link.enabled && !(options.copyBesideAudio && isCopyLookupLink(link)));
    const { pills: frequencyPills, mergedLiveRanks } = frequencyPillsByLookupId(options);
    const linkPills = enabledLinks
        .map(link => ({ link, html: renderConfiguredLookupPill(options, context, language, query, link, frequencyPills, mergedLiveRanks) }))
        .filter(pill => pill.html);
    const { lead, more } = splitLookupPills(linkPills);
    const ankiPill = renderAnkiPill(options, language, query);
    const configuredFrequencyIds = new Set(enabledLinks.filter(link => isFrequencyLookupPill(link)).map(link => link.id));
    const leftoverFrequencyPills = Array.from(frequencyPills)
        .filter(([id]) => !configuredFrequencyIds.has(id))
        .map(([, html]) => html);
    const pills = [...lead, ankiPill, ...leftoverFrequencyPills, renderMoreLookupPills(more, language)].filter(Boolean);
    return pills.length ? `<div class="jpdb-reader-word-pills">${pills.join('')}</div>` : '';
}

/** Copy, as an icon beside the audio button; '' when the Copy link is turned off. */
export function renderCopyWordControl(settings: ReaderSettings, card: JPDBCard, inert = false): string {
    if (!settings.dictionaryLookupLinks.some(link => link.enabled && isCopyLookupLink(link))) return '';
    const language = settings.interfaceLanguage;
    const title = uiText(language, 'copyWordTitle');
    const label = `${title}: ${wordPillContext(card).query}`;
    const disabled = inert ? ' aria-disabled="true" tabindex="-1"' : '';
    const command = inert ? '' : privateCommandAttributes({ kind: 'card-action', action: 'copy-word' });
    return `<button class="jpdb-reader-icon-btn jpdb-reader-copy-control" data-action="copy-word"${command} type="button"${disabled} title="${escapeHtml(title)}" aria-label="${escapeHtml(label)}">${copyIcon()}</button>`;
}

function isCopyLookupLink(link: LookupLink): boolean {
    return link.action === 'copy' || link.id === 'copy';
}

function splitLookupPills(pills: Array<{ link: LookupLink; html: string }>): { lead: string[]; more: string[] } {
    const others = pills.filter(pill => !isFrequencyLookupPill(pill.link) && !isCopyLookupLink(pill.link) && !LEAD_LOOKUP_LINK_IDS.has(pill.link.id));
    // Without Jiten or JPDB, the first other destination leads instead.
    const promoted = pills.some(pill => LEAD_LOOKUP_LINK_IDS.has(pill.link.id)) ? undefined : others[0];
    const waiting = others.filter(pill => pill !== promoted);
    // A menu holding a single link helps no one: it stays in the row.
    if (waiting.length <= 1) return { lead: pills.map(pill => pill.html), more: [] };
    return { lead: pills.filter(pill => !waiting.includes(pill)).map(pill => pill.html), more: waiting.map(pill => pill.html) };
}

function renderMoreLookupPills(more: string[], language: ReaderSettings['interfaceLanguage']): string {
    if (!more.length) return '';
    const label = escapeHtml(uiText(language, 'moreLookupLinks'));
    return `<details class="jpdb-reader-pill-more"><summary class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-pill-more-toggle" title="${label}" aria-label="${label}">${moreIcon()}</summary>${more.join('')}</details>`;
}

export function renderSelectionLookupPills(selected: string, settings: ReaderSettings): string {
    const query = selected.trim();
    if (!query) return '';
    const context: WordPillContext = {
        query,
        word: query,
        reading: query,
        vid: '0',
        sid: '0',
    };
    const language = settings.interfaceLanguage;
    const pills = settings.dictionaryLookupLinks
        .filter(link => link.enabled)
        .map(link => renderSelectionLookupPill(context, language, link))
        .filter(Boolean);
    return pills.length ? `<div class="jpdb-reader-word-pills jpdb-reader-selection-pills">${pills.join('')}</div>` : '';
}

export function updateHeadingWordPills(popover: HTMLElement, options: WordPillRenderOptions): void {
    const heading = popover.querySelector<HTMLElement>('.jpdb-reader-heading');
    if (!heading) return;
    replaceOptionalElement(heading, '.jpdb-reader-word-pills', renderWordPills(options));
}

function renderSelectionLookupPill(
    context: WordPillContext,
    language: ReaderSettings['interfaceLanguage'],
    link: ReaderSettings['dictionaryLookupLinks'][number],
): string {
    if (isCopyLookupLink(link)) return renderSelectionCopyPill(language, context.query);
    const url = formatLookupUrl(link.urlTemplate, context);
    if (!url) return '';
    const title = lookupSelectionPillTitle(language, link);
    return `<a class="${lookupLinkPillClass(link.id)}" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${context.query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
}

function lookupSelectionPillTitle(language: ReaderSettings['interfaceLanguage'], link: ReaderSettings['dictionaryLookupLinks'][number]): string {
    return link.id === 'jpdb'
        ? uiText(language, 'openOnJpdb')
        : uiText(language, 'openOnLookup').replace('{label}', link.label);
}

function renderLookupLinkPill(
    options: WordPillRenderOptions,
    context: WordPillContext,
    language: ReaderSettings['interfaceLanguage'],
    query: string,
    link: ReaderSettings['dictionaryLookupLinks'][number],
    mergedLiveRanks: MergedLiveRanks,
): string {
    if (isCopyLookupLink(link)) return renderCopyPill(language, query, options.inert);
    const url = lookupLinkPillUrl(options, context, link);
    if (!url) return '';
    // Merge a provider's live rank inline (e.g. "Jiten #18447"). Bunpro shows
    // its primary corpus rank the same way; the full per-corpus breakdown
    // rides in the tooltip so the pill row stays one number wide.
    const rank = linkPillLiveRank(link, mergedLiveRanks);
    const baseTitle = lookupLinkPillTitle(options, language, link);
    const title = rank?.detail ? `${baseTitle}\n${rank.detail}` : baseTitle;
    const label = rank ? `${link.label} ${rank.display ?? `#${rank.rank}`}` : link.label;
    if (options.inert) {
        return `<span class="${lookupLinkPillClass(link.id)}" role="link" aria-disabled="true" tabindex="-1" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(label)} ${externalLinkIcon()}</span>`;
    }
    return `<a class="${lookupLinkPillClass(link.id)}" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(label)} ${externalLinkIcon()}</a>`;
}

// The live-frequency rank is shown inline on its sibling link pill.
interface MergedLiveRank {
    rank: number;
    display?: string;
    // Per-corpus breakdown appended to the pill tooltip (Bunpro only).
    detail?: string;
}

type MergedLiveRanks = Map<FrequencyProvider, MergedLiveRank>;

function linkPillLiveRank(link: ReaderSettings['dictionaryLookupLinks'][number], mergedLiveRanks: MergedLiveRanks): MergedLiveRank | null {
    const provider = link.id === 'jiten' ? 'jiten' : link.id === 'jpdb' ? 'jpdb' : link.id === 'bunpro' ? 'bunpro' : null;
    return provider ? mergedLiveRanks.get(provider) ?? null : null;
}

const BUNPRO_FREQUENCY_LIST_LABELS: Record<string, [string, string]> = {
    general: ['General', '一般'],
    anime: ['Anime', 'アニメ'],
    novels: ['Novels', '小説'],
    netflix: ['Netflix', 'Netflix'],
    dictionary: ['Dictionary', '辞書'],
};

function bunproFrequencyDetail(
    language: ReaderSettings['interfaceLanguage'],
    lists: Array<{ list: string; rank: number }>,
): string {
    const japanese = language === 'ja';
    return lists
        .map(entry => {
            const label = BUNPRO_FREQUENCY_LIST_LABELS[entry.list];
            const corpus = label ? label[japanese ? 1 : 0] : entry.list;
            return `${corpus} #${entry.rank.toLocaleString('en-US')}`;
        })
        .join(' · ');
}

function renderConfiguredLookupPill(
    options: WordPillRenderOptions,
    context: WordPillContext,
    language: ReaderSettings['interfaceLanguage'],
    query: string,
    link: ReaderSettings['dictionaryLookupLinks'][number],
    frequencyPills: Map<string, string>,
    mergedLiveRanks: MergedLiveRanks,
): string {
    // A live-frequency link whose rank was merged into a link pill returns no
    // standalone pill (frequencyPills won't hold it); otherwise it renders as before.
    if (isFrequencyLookupPill(link)) return frequencyPills.get(link.id) ?? '';
    return renderLookupLinkPill(options, context, language, query, link, mergedLiveRanks);
}

function isFrequencyLookupPill(link: ReaderSettings['dictionaryLookupLinks'][number]): boolean {
    return link.action === 'frequency-live' || link.action === 'frequency-local';
}

function lookupLinkPillUrl(
    options: WordPillRenderOptions,
    context: WordPillContext,
    link: ReaderSettings['dictionaryLookupLinks'][number],
): string {
    if (link.id === 'jiten' && options.overrideQuery && isSingleKanji(options.overrideQuery)) {
        return `https://jiten.moe/kanji/${encodeURIComponent(options.overrideQuery)}`;
    }
    return link.id === 'jpdb' && (Boolean(options.overrideQuery) || options.isJpdbBackedCard(options.card))
        ? options.jpdbUrl
        : formatLookupUrl(link.urlTemplate, context);
}

function lookupLinkPillTitle(
    options: WordPillRenderOptions,
    language: ReaderSettings['interfaceLanguage'],
    link: ReaderSettings['dictionaryLookupLinks'][number],
): string {
    if (link.id !== 'jpdb') return uiText(language, 'openOnLookup').replace('{label}', link.label);
    return options.overrideQuery ? uiText(language, 'openKanjiOnJpdb') : uiText(language, 'openOnJpdb');
}

function lookupLinkPillClass(id: string | undefined): string {
    return `jpdb-reader-pill jpdb-reader-action-pill${id === 'jpdb' ? ' jpdb-reader-jpdb-pill' : ''}`;
}

function renderAnkiPill(
    options: WordPillRenderOptions,
    language: ReaderSettings['interfaceLanguage'],
    query: string,
): string {
    if (!ankiPillSurfaceIsTrusted(options)) return '';
    const lookup = ankiPillLookup(options);
    if (!lookup) return '';
    if (lookup.primary) return renderEditAnkiPill(lookup, language, query, options.inert);
    return renderNewAnkiPill(options, lookup, language, query);
}

function ankiPillSurfaceIsTrusted(options: WordPillRenderOptions): boolean {
    return options.trustedAccountDataSurface ?? currentAccountDataSurfaceIsTrusted();
}

function ankiPillLookup(options: WordPillRenderOptions): AnkiLookupResult | undefined {
    if (options.overrideQuery) return undefined;
    if (!options.settings.ankiEnabled) return undefined;
    return options.ankiLookup;
}

function renderNewAnkiPill(options: WordPillRenderOptions, lookup: AnkiLookupResult, language: ReaderSettings['interfaceLanguage'], query: string): string {
    if (lookup.state !== 'not-in-deck') return '';
    const mobileHandoff = canUseMobileAnkiHandoff(options.settings);
    if (!ankiAddIsAllowed(lookup, mobileHandoff)) return '';
    return ankiPillButton({
        action: 'anki',
        title: ankiAddTitle(language, mobileHandoff),
        query,
        language,
        inert: options.inert,
    });
}

function ankiAddIsAllowed(lookup: AnkiLookupResult, mobileHandoff: boolean): boolean {
    return mobileHandoff || lookup.trusted !== false;
}

function ankiAddTitle(language: ReaderSettings['interfaceLanguage'], mobileHandoff: boolean): string {
    return mobileHandoff ? mobileAnkiHandoffButtonLabel(language) : uiText(language, 'addToAnki');
}

function renderEditAnkiPill(
    lookup: AnkiLookupResult,
    language: ReaderSettings['interfaceLanguage'],
    query: string,
    inert = false,
): string {
    const noteId = Number(lookup.primary?.noteId);
    if (!Number.isFinite(noteId) || noteId <= 0) return '';
    return ankiPillButton({
        action: 'anki-edit',
        title: uiText(language, 'editInAnki'),
        query,
        language,
        inert,
        noteId,
    });
}

function mobileAnkiHandoffButtonLabel(language: ReaderSettings['interfaceLanguage']): string {
    const app = mobileAnkiHandoffAppName();
    return language === 'ja' ? formatUiText(language, 'sendToMobileAnki', { app }) : ['Send', 'to', app].join(' ');
}

function ankiPillButton(options: {
    action: 'anki' | 'anki-edit';
    title: string;
    query: string;
    language: ReaderSettings['interfaceLanguage'];
    inert?: boolean;
    noteId?: number;
}): string {
    const label = uiText(options.language, 'anki');
    const title = escapeHtml(options.title);
    const ariaLabel = escapeHtml(`${options.title}: ${options.query}`);
    const content = `${escapeHtml(label)} ${ankiIcon()}`;
    if (options.inert) {
        return `<span class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-anki-pill" role="button" aria-disabled="true" tabindex="-1" title="${title}" aria-label="${ariaLabel}">${content}</span>`;
    }
    const noteAttribute = options.action === 'anki-edit' && options.noteId ? ` data-note-id="${options.noteId}"` : '';
    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-anki-pill" data-action="${options.action}"${noteAttribute}${privateCommandAttributes({ kind: 'card-action', action: options.action, noteId: options.noteId })} type="button" title="${title}" aria-label="${ariaLabel}">${content}</button>`;
}

function renderSelectionCopyPill(language: ReaderSettings['interfaceLanguage'], query: string): string {
    const copyTitle = uiText(language, 'copyWordTitle');
    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" data-action="copy-selection" type="button" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${copyIcon()}</button>`;
}

function renderCopyPill(language: ReaderSettings['interfaceLanguage'], query: string, inert = false): string {
    const copyTitle = uiText(language, 'copyWordTitle');
    if (inert) {
        return `<span class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" role="button" aria-disabled="true" tabindex="-1" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${copyIcon()}</span>`;
    }
    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" data-action="copy-word"${privateCommandAttributes({ kind: 'card-action', action: 'copy-word' })} type="button" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${copyIcon()}</button>`;
}

function frequencyPillsByLookupId(options: WordPillRenderOptions): { pills: Map<string, string>; mergedLiveRanks: MergedLiveRanks } {
    const mergeIntoLinkPill = options.settings.showLookupPillFrequency !== false;
    const enabledLinkIds = new Set(options.settings.dictionaryLookupLinks.filter(link => link.enabled).map(link => link.id));
    const kanjiQuery = options.overrideQuery && isSingleKanji(options.overrideQuery) ? options.overrideQuery.trim() : null;
    const state = localFrequencyPills(options, mergeIntoLinkPill && !kanjiQuery, enabledLinkIds);
    mergeLiveFrequencyRanks(options, state, mergeIntoLinkPill, enabledLinkIds, kanjiQuery);
    return { pills: state.pills, mergedLiveRanks: state.mergedLiveRanks };
}

interface FrequencyPillState {
    pills: Map<string, string>;
    mergedLiveRanks: MergedLiveRanks;
    localProviders: Set<FrequencyProvider>;
}

function localFrequencyPills(
    options: WordPillRenderOptions,
    mergeIntoLinkPill: boolean,
    enabledLinkIds: Set<string>,
): FrequencyPillState {
    const localLabel = (dictionary: string) => localFrequencyLookupLabel(options.settings, dictionary) || options.dictionaryLabel(dictionary);
    const state: FrequencyPillState = {
        pills: new Map(),
        mergedLiveRanks: new Map(),
        localProviders: new Set(),
    };
    for (const entry of bestFrequencyEntries(options.metaEntries ?? [])) {
        mergeLocalFrequencyEntry(options, state, entry, localLabel, mergeIntoLinkPill, enabledLinkIds);
    }
    return state;
}

function mergeLocalFrequencyEntry(
    options: WordPillRenderOptions,
    state: FrequencyPillState,
    entry: YomitanMetaEntry,
    localLabel: (dictionary: string) => string,
    mergeIntoLinkPill: boolean,
    enabledLinkIds: Set<string>,
): void {
    if (entry.mode !== 'freq' || !localFrequencyEnabled(options.settings, entry.dictionary)) return;
    const provider = localFrequencyProvider(entry.dictionary);
    const rank = extractFrequency(entry.data);
    if (provider && rank && mergeIntoLinkPill && enabledLinkIds.has(provider)) {
        state.mergedLiveRanks.set(provider, { rank });
        state.localProviders.add(provider);
        return;
    }
    const html = renderFrequencyPill(entry, localLabel);
    if (!html) return;
    state.pills.set(localFrequencyLookupPillId(entry.dictionary), html);
    if (provider) state.localProviders.add(provider);
}

function mergeLiveFrequencyRanks(
    options: WordPillRenderOptions,
    state: FrequencyPillState,
    mergeIntoLinkPill: boolean,
    enabledLinkIds: Set<string>,
    kanjiQuery: string | null,
): void {
    // When the toggle is on, fold each live rank into its sibling link pill.
    // Disabled lookup/frequency pills intentionally do not fall back to a
    // standalone chip; the rank should live with the lookup pill or stay hidden.
    // A kanji popover only shows kanji-source evidence for the displayed kanji;
    // word popovers never show kanji-source evidence.
    for (const link of options.settings.dictionaryLookupLinks) {
        if (link.action !== 'frequency-live' || !link.enabled) continue;
        const provider = liveFrequencyProvider(link);
        if (!provider || (!kanjiQuery && state.localProviders.has(provider))) continue;
        const rank = liveFrequencyEvidence(options, provider);
        if (!rank) continue;
        if (kanjiQuery ? (rank.source !== 'kanji' || rank.spelling !== kanjiQuery) : rank.source === 'kanji') continue;
        if (!mergeIntoLinkPill || !enabledLinkIds.has(provider)) continue;
        state.mergedLiveRanks.set(provider, {
            rank: rank.rank,
            display: rank.display,
            // Bunpro's per-corpus ranks stay one pill wide: the primary rank
            // renders inline and the breakdown rides in the tooltip.
            detail: provider === 'bunpro' && rank.lists?.length
                ? bunproFrequencyDetail(options.settings.interfaceLanguage, rank.lists)
                : undefined,
        });
    }
}

function localFrequencyEnabled(settings: ReaderSettings, dictionary: string): boolean {
    const preference = settings.dictionaryPreferences.find(item => item.name === dictionary);
    const lookupLink = settings.dictionaryLookupLinks.find(link => link.id === localFrequencyLookupPillId(dictionary));
    return (preference?.enabled ?? true) && (lookupLink?.enabled ?? true);
}

function localFrequencyLookupLabel(settings: ReaderSettings, dictionary: string): string {
    return settings.dictionaryLookupLinks.find(link => link.id === localFrequencyLookupPillId(dictionary))?.label.trim() ?? '';
}

function localFrequencyLookupPillId(dictionary: string): string {
    return `frequency-local:${dictionary}`;
}

function liveFrequencyProvider(link: ReaderSettings['dictionaryLookupLinks'][number]): FrequencyProvider | null {
    return frequencyProviderForLookupId(link.id);
}

function liveFrequencyEvidence(options: WordPillRenderOptions, provider: FrequencyProvider): ProviderFrequencyRank | null {
    return options.frequencyRanks?.[provider] ?? null;
}

function localFrequencyProvider(dictionary: string): 'jiten' | 'jpdb' | null {
    const normalized = dictionary.toLowerCase();
    if (/\bjiten\b/.test(normalized)) return 'jiten';
    if (/\bjpdb\b|jpdbv?\d*/.test(normalized)) return 'jpdb';
    return null;
}

function wordPillContext(card: JPDBCard, overrideQuery?: string): WordPillContext {
    return {
        query: overrideQuery || card.spelling || card.reading,
        word: overrideQuery || card.spelling,
        reading: overrideQuery || card.reading || card.spelling,
        vid: String(Math.max(0, card.vid)),
        sid: String(Math.max(0, card.sid)),
    };
}

function isSingleKanji(value: string): boolean {
    const character = value.trim();
    // Preserve the historical BMP contract exactly (including 々/〆/〇 and
    // the old U+9FAF ceiling), while the shared predicate admits assigned
    // supplementary ideographs without treating either surrogate as a glyph.
    return /^[\u4e00-\u9faf\u3400-\u4dbf\u3005-\u3007]$/u.test(character)
        || (character.length > 1 && isJapaneseKanjiCharacter(character));
}
