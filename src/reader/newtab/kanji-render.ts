import { escapeHtml, htmlToFirstElement } from '../dom';
import { el } from '../dom-builder';
import type { JpdbKanjiInfo } from '../jpdb-kanji';
import { firstCardMeaning } from './index';
import { uiText } from '../i18n';
import { newTabText } from './i18n';
import { kanjiSourceStateKey } from '../definition-source-render';
import { KANJI_JPDB_SOURCE_ID } from '../source-sections';
import type { JPDBCard, ReaderSettings } from '../types';

export function renderNewTabKanjiInfoSection(
    card: JPDBCard,
    facts: [string, string][],
    readings: string[],
    localMeanings: string[],
    fullInfo: JpdbKanjiInfo | null,
    sourceAttributes: (sourceStateKey: string, initiallyExpanded?: boolean) => string,
    title: string,
    language: ReaderSettings['interfaceLanguage'],
): HTMLElement {
    const section = htmlToFirstElement(`
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-newtab-kanji-info-source" ${sourceAttributes(kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID))}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
        </details>
    `) as HTMLDetailsElement | null;
    if (!section) return el('div');
    section.append(el('div', { class: 'jpdb-reader-local-entry jpdb-reader-newtab-kanji-info-body' },
        renderNewTabKanjiFactSection(card, facts),
        renderNewTabKanjiReadingSection(readings),
        renderNewTabKanjiLocalMeanings(localMeanings),
        renderNewTabKanjiComponents(fullInfo, language),
        renderNewTabKanjiVocabulary(fullInfo, language),
        renderNewTabKanjiMnemonic(fullInfo)));
    return section;
}

function renderNewTabKanjiFactSection(card: JPDBCard, facts: [string, string][]): HTMLElement {
    return facts.length
        ? el('div', { class: 'jpdb-reader-kanji-facts' }, facts.map(([label, value]) => el('span', { title: `${label}: ${value}` }, el('strong', {}, label), el('span', { class: 'jpdb-reader-kanji-fact-value' }, value))))
        : el('div', { class: 'jpdb-reader-help' }, firstCardMeaning(card));
}

function renderNewTabKanjiReadingSection(readings: string[]): HTMLElement | null {
    return readings.length ? el('div', { class: 'jpdb-reader-kanji-readings' }, readings.map(reading => el('span', {}, reading))) : null;
}

function renderNewTabKanjiLocalMeanings(localMeanings: string[]): HTMLElement | null {
    return localMeanings.length ? el('div', { class: 'jpdb-reader-newtab-kanji-vocab' }, localMeanings.map(meaning => el('span', {}, meaning))) : null;
}

function renderNewTabKanjiComponents(fullInfo: JpdbKanjiInfo | null, language: ReaderSettings['interfaceLanguage']): HTMLElement | null {
    return fullInfo?.components.length
        ? el('div', { class: 'jpdb-reader-component-grid' }, fullInfo.components.slice(0, 8).map(component => el('button', {
            class: 'jpdb-reader-component-card jpdb-reader-component-button',
            type: 'button',
            dataset: { action: 'kanji', kanji: component.kanji },
            title: `${uiText(language, 'showKanji')}: ${component.kanji}`,
        }, el('strong', {}, component.kanji), el('span', {}, component.keyword))))
        : null;
}

function renderNewTabKanjiVocabulary(fullInfo: JpdbKanjiInfo | null, language: ReaderSettings['interfaceLanguage']): HTMLElement | null {
    return fullInfo?.vocabulary.length
        ? el('div', { class: 'jpdb-reader-newtab-kanji-vocab' }, fullInfo.vocabulary.slice(0, 5).map(item => el('button', {
            class: 'jpdb-reader-newtab-kanji-popover-word',
            type: 'button',
            dataset: { action: 'similar-word', expression: item.expression, reading: item.reading },
            title: `${newTabText(language, 'lookUp')}: ${item.expression}`,
        },
        el('strong', {}, item.expression),
        el('span', { class: 'jpdb-reader-newtab-kanji-vocab-detail' }, [item.reading, item.meaning].filter(Boolean).join(' \u00b7 ')))))
        : null;
}

function renderNewTabKanjiMnemonic(fullInfo: JpdbKanjiInfo | null): HTMLElement | null {
    return fullInfo?.mnemonic ? el('p', { class: 'jpdb-reader-newtab-kanji-mnemonic' }, fullInfo.mnemonic) : null;
}
