import { escapeHtml } from '../dom/index';
import { renderFrequencyPills } from './definition-render';
import { formatUiText, uiText } from '../app/i18n';
import { formatLookupUrl, lookupPillStyle } from '../dictionaries/display';
import { canUseMobileAnkiHandoff, mobileAnkiHandoffAppName, type AnkiLookupResult } from '../anki/index';
import { ankiIcon, copyIcon, externalLinkIcon } from '../ui/icons';
import { replaceOptionalElement } from '../app/dom-helpers';
import type { JPDBCard, ReaderSettings } from '../app/types';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

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
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    dictionaryLabel: (name: string) => string;
}

export function renderWordPills(options: WordPillRenderOptions): string {
    const context = wordPillContext(options.card, options.overrideQuery);
    const query = context.query;
    const language = options.settings.interfaceLanguage;
    const enabledLinks = options.settings.dictionaryLookupLinks.filter(link => link.enabled);
    const linkPills = enabledLinks
        .map(link => renderLookupLinkPill(options, context, language, query, link))
        .filter(Boolean);
    const ankiPill = renderAnkiPill(options, language, query);
    const frequencyPills = renderFrequencyPills(options.metaEntries ?? [], options.settings, options.dictionaryLabel);
    const pills = [...linkPills, ankiPill, ...frequencyPills].filter(Boolean);
    return pills.length ? `<div class="jpdb-reader-word-pills">${pills.join('')}</div>` : '';
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
    const style = lookupPillStyle(link.id || link.label);
    if (link.action === 'copy' || link.id === 'copy') return renderSelectionCopyPill(language, context.query, style);
    const url = formatLookupUrl(link.urlTemplate, context);
    if (!url) return '';
    const title = lookupSelectionPillTitle(language, link);
    return `<a class="${lookupLinkPillClass(link.id)}" href="${escapeHtml(url)}" target="_blank" rel="noopener"${lookupPillStyleAttribute(style)} title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${context.query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
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
): string {
    const style = lookupPillStyle(link.id || link.label);
    if (link.action === 'copy' || link.id === 'copy') return renderCopyPill(language, query, style, options.inert);
    const url = lookupLinkPillUrl(options, context, link);
    if (!url) return '';
    const title = lookupLinkPillTitle(options, language, link);
    if (options.inert) {
        return `<span class="${lookupLinkPillClass(link.id)}" role="link" aria-disabled="true" tabindex="-1"${lookupPillStyleAttribute(style)} title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</span>`;
    }
    return `<a class="${lookupLinkPillClass(link.id)}" href="${escapeHtml(url)}" target="_blank" rel="noopener"${lookupPillStyleAttribute(style)} title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
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
    const lookup = options.ankiLookup;
    if (options.overrideQuery || !options.settings.ankiEnabled || !lookup) return '';
    if (lookup.primary) return renderEditAnkiPill(lookup, language, query, options.inert);
    if (lookup.state !== 'not-in-deck') return '';
    const mobileHandoff = canUseMobileAnkiHandoff(options.settings);
    if (!mobileHandoff && lookup.trusted === false) return '';
    const title = mobileHandoff ? mobileAnkiHandoffButtonLabel(language) : uiText(language, 'addToAnki');
    return ankiPillButton({
        action: 'anki',
        title,
        query,
        language,
        inert: options.inert,
    });
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
    const styleAttribute = lookupPillStyleAttribute(lookupPillStyle('anki'));
    const label = uiText(options.language, 'anki');
    const title = escapeHtml(options.title);
    const ariaLabel = escapeHtml(`${options.title}: ${options.query}`);
    const content = `${escapeHtml(label)} ${ankiIcon()}`;
    if (options.inert) {
        return `<span class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-anki-pill" role="button" aria-disabled="true" tabindex="-1"${styleAttribute} title="${title}" aria-label="${ariaLabel}">${content}</span>`;
    }
    const noteAttribute = options.action === 'anki-edit' && options.noteId ? ` data-note-id="${options.noteId}"` : '';
    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-anki-pill" data-action="${options.action}"${noteAttribute} type="button"${styleAttribute} title="${title}" aria-label="${ariaLabel}">${content}</button>`;
}

function lookupPillStyleAttribute(style: string): string {
    return style ? ` style="${style}"` : '';
}

function renderSelectionCopyPill(language: ReaderSettings['interfaceLanguage'], query: string, style = lookupPillStyle('copy')): string {
    const copyTitle = uiText(language, 'copyWordTitle');
    const styleAttribute = style ? ` style="${style}"` : '';
    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" data-action="copy-selection" type="button"${styleAttribute} title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${escapeHtml(uiText(language, 'copyWord'))} ${copyIcon()}</button>`;
}

function renderCopyPill(language: ReaderSettings['interfaceLanguage'], query: string, style = lookupPillStyle('copy'), inert = false): string {
    const copyTitle = uiText(language, 'copyWordTitle');
    const styleAttribute = style ? ` style="${style}"` : '';
    if (inert) {
        return `<span class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" role="button" aria-disabled="true" tabindex="-1"${styleAttribute} title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${escapeHtml(uiText(language, 'copyWord'))} ${copyIcon()}</span>`;
    }
    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" data-action="copy-word" type="button"${styleAttribute} title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${escapeHtml(uiText(language, 'copyWord'))} ${copyIcon()}</button>`;
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
    return /^[\u4e00-\u9faf\u3400-\u4dbf\u3005-\u3007]$/u.test(value.trim());
}
