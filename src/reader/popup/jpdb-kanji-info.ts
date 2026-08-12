import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { jpdbKanjiActionClass, visibleJpdbKanjiActions, type JpdbKanjiAction, type JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import type { InterfaceLanguage } from '../app/types';
import { sourceStateAttribute } from './source-state';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

export function renderJpdbKanjiInfo(info: JpdbKanjiInfo | null, language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string, title = uiText(language, 'readingsComponents')): string {
    if (!info) return '';
    const facts = [
        [uiText(language, 'factKeyword'), info.keyword],
        [uiText(language, 'factType'), info.type],
        [uiText(language, 'factFrequency'), info.frequency],
        [language === 'ja' ? '漢検' : 'Kanken', info.kanken],
        ['Heisig', info.heisig],
        [uiText(language, 'factOldForms'), info.oldForms.join(', ')],
    ].filter(([, value]) => Boolean(value?.trim()));
    const factSection = renderJpdbKanjiFactSection(facts);
    const readingsSection = renderJpdbKanjiReadings(info);
    const componentSection = renderJpdbKanjiComponents(info, language);
    const vocabularySection = renderJpdbKanjiVocabulary(info, language);
    const mnemonicSection = renderJpdbKanjiMnemonic(info, language);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${expandedAttribute(initiallyExpanded)}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <div class="jpdb-reader-local-entry">
                ${factSection}
                ${readingsSection}
                ${componentSection}
                ${vocabularySection}
                ${mnemonicSection}
            </div>
        </details>
    `;
}

function expandedAttribute(initiallyExpanded: boolean): string {
    return initiallyExpanded ? 'open' : '';
}

function renderJpdbKanjiFactSection(facts: string[][]): string {
    if (!facts.length) return '';
    return `<div class="jpdb-reader-kanji-facts">
        ${facts.map(([label, value]) => `<span title="${escapeHtml(`JPDB · ${label}: ${value}`)}"><strong>${escapeHtml(label)}</strong><span class="jpdb-reader-kanji-fact-value">${escapeHtml(value)}</span></span>`).join('')}
    </div>`;
}

function renderJpdbKanjiReadings(info: JpdbKanjiInfo): string {
    if (!info.readings.length) return '';
    return `<div class="jpdb-reader-kanji-readings">
        ${info.readings.slice(0, 8).map(reading => `<span>${escapeHtml(reading.reading)}${reading.share ? ` ${escapeHtml(reading.share)}` : ''}</span>`).join('')}
    </div>`;
}

function renderJpdbKanjiComponents(info: JpdbKanjiInfo, language: InterfaceLanguage): string {
    if (!info.components.length) return '';
    return `<div class="jpdb-reader-component-grid">
        ${info.components.map(component => `<button class="jpdb-reader-component-card jpdb-reader-component-button" type="button" data-action="kanji" data-kanji="${escapeHtml(component.kanji)}"${privateCommandAttributes({ kind: 'kanji-lookup', kanji: component.kanji })} title="${escapeHtml(`${uiText(language, 'showKanji')}: ${component.kanji}`)}">
            <strong>${escapeHtml(component.kanji)}</strong>
            <span>${escapeHtml(component.keyword)}</span>
        </button>`).join('')}
    </div>`;
}

function renderJpdbKanjiVocabulary(info: JpdbKanjiInfo, language: InterfaceLanguage): string {
    if (!info.vocabulary.length) return '';
    return `<section data-kanji-similar-words>
        <div class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(uiText(language, 'sourceNameWordsUsingKanji'))}</div>
        <div class="jpdb-reader-similar-grid">
            ${info.vocabulary.slice(0, 8).map(item => `<button
                class="jpdb-reader-similar-word"
                type="button"
                data-action="similar-word"
                data-expression="${escapeHtml(item.expression)}"
                data-reading="${escapeHtml(item.reading)}"${privateCommandAttributes({ kind: 'kanji-word', expression: item.expression, reading: item.reading })}>
                <span class="jpdb-reader-similar-word-head">
                    <span>${escapeHtml(item.expression)}</span>
                    ${item.reading ? `<small>${escapeHtml(item.reading)}</small>` : ''}
                </span>
                ${item.meaning ? `<span class="jpdb-reader-similar-meaning">${escapeHtml(item.meaning)}</span>` : ''}
            </button>`).join('')}
        </div>
    </section>`;
}

function renderJpdbKanjiMnemonic(info: JpdbKanjiInfo, language: InterfaceLanguage): string {
    return info.mnemonic ? `<details><summary>${uiText(language, 'jpdbMnemonic')}</summary><p>${escapeHtml(info.mnemonic)}</p></details>` : '';
}

export function renderJpdbKanjiMiningControls(info: JpdbKanjiInfo | null, language: InterfaceLanguage): string {
    const actions = visibleJpdbKanjiActions(info);
    if (!actions.length) return '';
    return `
        <div class="jpdb-reader-mining-details jpdb-reader-kanji-mining" role="group" aria-label="${escapeHtml(uiText(language, 'deckActions'))}">
            <div class="jpdb-reader-row jpdb-reader-mining-action-row jpdb-reader-kanji-mining-row" style="--cols: ${actions.length}">
                ${actions.map(action => `<button
                    class="jpdb-reader-btn ${escapeHtml(jpdbKanjiActionClass(action))}"
                    type="button"
                    data-action="jpdb-kanji-action"
                    data-kanji-action-id="${escapeHtml(action.id)}"
                    ${privateCommandAttributes({ kind: 'jpdb-kanji-action', actionId: action.id })}
                    title="${escapeHtml(jpdbKanjiActionLabel(action, language))}">${escapeHtml(jpdbKanjiActionLabel(action, language))}</button>`).join('')}
            </div>
        </div>
    `;
}

function jpdbKanjiActionLabel(action: JpdbKanjiAction, language: InterfaceLanguage): string {
    switch (action.role) {
        case 'mine':
            return uiText(language, 'jpdbKanjiActionMine');
        case 'known':
            return uiText(language, 'jpdbKanjiActionKnown');
        case 'neverforget':
            return uiText(language, 'jpdbKanjiActionNeverForget');
        case 'forget':
            return uiText(language, 'jpdbKanjiActionForget');
        case 'blacklist':
            return uiText(language, 'jpdbKanjiActionBlacklist');
        case 'review':
            return uiText(language, 'jpdbKanjiActionReview');
        default:
            return action.label;
    }
}
