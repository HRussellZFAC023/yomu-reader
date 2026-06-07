import { escapeHtml } from '../dom/index';
import { renderFrequencyPills } from './definition-render';
import { uiText } from '../app/i18n';
import { formatLookupUrl, lookupPillStyle } from '../dictionaries/display';
import { copyIcon, externalLinkIcon } from '../ui/icons';
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
    const frequencyPills = renderFrequencyPills(options.metaEntries ?? [], options.settings, options.dictionaryLabel);
    const pills = [...linkPills, ...frequencyPills];
    return pills.length ? `<div class="jpdb-reader-word-pills">${pills.join('')}</div>` : '';
}

export function updateHeadingWordPills(popover: HTMLElement, options: WordPillRenderOptions): void {
    const heading = popover.querySelector<HTMLElement>('.jpdb-reader-heading');
    if (!heading) return;
    replaceOptionalElement(heading, '.jpdb-reader-word-pills', renderWordPills(options));
}

function renderLookupLinkPill(
    options: WordPillRenderOptions,
    context: WordPillContext,
    language: ReaderSettings['interfaceLanguage'],
    query: string,
    link: ReaderSettings['dictionaryLookupLinks'][number],
): string {
    const style = lookupPillStyle(link.id || link.label);
    if (link.action === 'copy' || link.id === 'copy') return renderCopyPill(language, query, style);
    const url = lookupLinkPillUrl(options, context, link);
    if (!url) return '';
    const title = lookupLinkPillTitle(options, language, link);
    return `<a class="${lookupLinkPillClass(link.id)}" href="${escapeHtml(url)}" target="_blank" rel="noopener"${lookupPillStyleAttribute(style)} title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
}

function lookupLinkPillUrl(
    options: WordPillRenderOptions,
    context: WordPillContext,
    link: ReaderSettings['dictionaryLookupLinks'][number],
): string {
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

function lookupPillStyleAttribute(style: string): string {
    return style ? ` style="${style}"` : '';
}

function renderCopyPill(language: ReaderSettings['interfaceLanguage'], query: string, style = lookupPillStyle('copy')): string {
    const copyTitle = uiText(language, 'copyWordTitle');
    const styleAttribute = style ? ` style="${style}"` : '';
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
