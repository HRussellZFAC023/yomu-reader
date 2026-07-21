import { formatUiText, uiText } from '../app/i18n';
import { escapeHtml, htmlToFirstElement } from '../dom';
import { externalLinkIcon } from '../ui/icons';
import type { InterfaceLanguage } from '../app/types';

export const IMMERSION_KIT_SEARCH_URL_TEMPLATE = 'https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1';
export const NADESHIKO_SEARCH_URL_TEMPLATE = 'https://nadeshiko.co/search/{query}';

const EXTERNAL_EXAMPLE_SEARCHES = [
    { id: 'immersion-kit', label: 'Immersion Kit', urlTemplate: IMMERSION_KIT_SEARCH_URL_TEMPLATE },
    { id: 'nadeshiko', label: 'Nadeshiko', urlTemplate: NADESHIKO_SEARCH_URL_TEMPLATE },
] as const;

export function renderImmersionSearchLinksHtml(query: string, language: InterfaceLanguage): string {
    const links = externalExampleSearchLinks(query);
    if (!links.length) return '';
    return `
        <div class="jpdb-reader-immersion-search-links" aria-label="${escapeHtml(uiText(language, 'exampleSearchLinks'))}">
            ${links.map(link => renderExternalExampleSearchLink(link, language)).join('')}
        </div>
    `;
}

export function renderImmersionSearchLinks(query: string, language: InterfaceLanguage): HTMLElement | null {
    const html = renderImmersionSearchLinksHtml(query, language);
    return html ? htmlToFirstElement(html) : null;
}

export function externalExampleSearchLinks(query: string): Array<{ id: string; label: string; url: string }> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];
    return EXTERNAL_EXAMPLE_SEARCHES.map(search => ({
        id: search.id,
        label: search.label,
        url: search.urlTemplate.replace('{query}', encodeURIComponent(normalizedQuery)),
    }));
}

function renderExternalExampleSearchLink(
    link: { id: string; label: string; url: string },
    language: InterfaceLanguage,
): string {
    const label = formatUiText(language, 'viewOnLookup', { label: link.label });
    return `<a class="jpdb-reader-immersion-search-link" data-immersion-search-source="${link.id}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(label)} ${externalLinkIcon()}</a>`;
}
