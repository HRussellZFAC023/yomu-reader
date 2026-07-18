import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';

export interface KanjiKeywordSource {
    text: string | undefined;
    label: string;
    canonical?: boolean;
}

const MAX_VISIBLE_KANJI_KEYWORDS = 5;

export function renderKanjiKeywordChips(sources: KanjiKeywordSource[], language: InterfaceLanguage): string {
    const keywords = new Map<string, { text: string; labels: string[]; canonical: boolean }>();
    for (const { text, label, canonical } of sources) {
        const normalized = text?.trim();
        if (!normalized) continue;
        const key = normalized.toLocaleLowerCase();
        const existing = keywords.get(key) ?? { text: normalized, labels: [], canonical: false };
        if (!existing.labels.includes(label)) existing.labels.push(label);
        existing.canonical ||= Boolean(canonical);
        keywords.set(key, existing);
    }
    const all = Array.from(keywords.values());
    const shown = all.slice(0, MAX_VISIBLE_KANJI_KEYWORDS);
    const overflow = all.slice(MAX_VISIBLE_KANJI_KEYWORDS);
    const chips = shown.map(keyword => renderKanjiKeywordChip(keyword)).join('') + renderKanjiKeywordOverflowChip(overflow);
    return chips
        ? `<div class="jpdb-reader-kanji-keywords">${chips}</div>`
        : `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'kanjiDetailsUnavailable'))}</div>`;
}

function renderKanjiKeywordChip(keyword: { text: string; labels: string[]; canonical: boolean }): string {
    return `<span class="jpdb-reader-kanji-keyword"${keyword.canonical ? ' data-canonical=""' : ''} title="${escapeHtml(keyword.labels.join(' · '))}">`
        + `<small class="jpdb-reader-kanji-keyword-source">${escapeHtml(keyword.labels.join('/'))}</small>`
        + `<span class="jpdb-reader-kanji-keyword-text">${escapeHtml(keyword.text)}</span></span>`;
}

function renderKanjiKeywordOverflowChip(overflow: Array<{ text: string }>): string {
    if (!overflow.length) return '';
    return `<span class="jpdb-reader-kanji-keyword jpdb-reader-kanji-keyword-more" title="${escapeHtml(overflow.map(keyword => keyword.text).join(' · '))}">+${overflow.length}</span>`;
}
