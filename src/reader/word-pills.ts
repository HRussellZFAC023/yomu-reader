import { escapeHtml } from './dom';
import { renderFrequencyPills } from './definition-source-render';
import { uiText } from './i18n';
import { formatLookupUrl, pillStyle } from './local-dictionary-display';
import { copyIcon, externalLinkIcon } from './popup-render';
import type { JPDBCard, ReaderSettings } from './types';
import type { YomitanMetaEntry } from './yomitan';

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
    const linkPills = options.settings.dictionaryLookupLinks
        .filter(link => link.enabled)
        .map(link => {
            const style = pillStyle(`lookup:${link.id || link.label}`);
            if (link.action === 'copy' || link.id === 'copy') {
                const copyTitle = uiText(language, 'copyWordTitle');
                return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" data-action="copy-word" type="button" style="${style}" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${escapeHtml(uiText(language, 'copyWord'))} ${copyIcon()}</button>`;
            }
            const url = link.id === 'jpdb' && (Boolean(options.overrideQuery) || options.isJpdbBackedCard(options.card))
                ? options.jpdbUrl
                : formatLookupUrl(link.urlTemplate, context);
            if (!url) return '';
            const title = link.id === 'jpdb'
                ? (options.overrideQuery ? uiText(language, 'openKanjiOnJpdb') : uiText(language, 'openOnJpdb'))
                : uiText(language, 'openOnLookup').replace('{label}', link.label);
            const classes = `jpdb-reader-pill jpdb-reader-action-pill${link.id === 'jpdb' ? ' jpdb-reader-jpdb-pill' : ''}`;
            return `<a class="${classes}" href="${escapeHtml(url)}" target="_blank" rel="noopener" style="${style}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
        })
        .filter(Boolean);
    const frequencyPills = renderFrequencyPills(options.metaEntries ?? [], options.settings, options.dictionaryLabel);
    const pills = [...linkPills, ...frequencyPills];
    return pills.length ? `<div class="jpdb-reader-word-pills">${pills.join('')}</div>` : '';
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
