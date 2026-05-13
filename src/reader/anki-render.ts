import type { AnkiExistingNote, AnkiLookupResult } from './anki';
import { escapeHtml } from './dom';
import { contextLabel, type StoredMiningContext } from './mining-context';
import type { ReaderSettings } from './types';
import { uiText } from './i18n';

export function renderAnkiActionRow(ankiLookup: AnkiLookupResult, settings: ReaderSettings): string {
    if (!settings.ankiEnabled) return '';
    if (ankiLookup.primary) {
        return `
            <div class="jpdb-reader-row" style="--cols: 1">
                <button class="jpdb-reader-btn anki compact" data-action="anki-edit" data-note-id="${ankiLookup.primary.noteId}">Edit in Anki</button>
            </div>
        `;
    }
    return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${uiText(settings.interfaceLanguage, 'addToAnki')}</button></div>`;
}

export function renderAnkiExistingSection(ankiLookup: AnkiLookupResult, storedContext: StoredMiningContext | null): string {
    const note = ankiLookup.primary;
    if (!note) return '';
    const decks = note.deckNames.length ? note.deckNames.join(', ') : 'Anki';
    const sentence = note.fields.Sentence || note.fields.Example || note.fields.SentenceExpression || '';
    const meaning = note.fields.Meaning || note.fields.Definition || note.fields.Glossary || '';
    const source = note.fields.Source || note.fields.Url || '';
    const lastContext = storedContext
        ? `<div class="jpdb-reader-anki-context"><strong>Last seen</strong><span>${escapeHtml(contextLabel(storedContext))}</span><small>${escapeHtml(storedContext.sentence)}</small></div>`
        : '';
    return `
        <details class="jpdb-reader-anki-existing">
            <summary>
                <span><span class="jpdb-reader-state-dot jpdb-${note.state}"></span>Already in Anki</span>
                <small>${escapeHtml(decks)} · ${escapeHtml(note.modelName)}</small>
            </summary>
            <div class="jpdb-reader-anki-card-preview">
                ${sentence ? `<div><strong>Sentence</strong><span>${escapeHtml(sentence)}</span></div>` : ''}
                ${meaning ? `<div><strong>Meaning</strong><span>${escapeHtml(meaning.slice(0, 420))}</span></div>` : ''}
                ${source ? `<div><strong>Source</strong><span>${escapeHtml(source)}</span></div>` : ''}
                ${lastContext}
            </div>
        </details>
    `;
}

export function renderReviewButtons(
    settings: ReaderSettings,
    ankiNote: AnkiExistingNote | null = null,
    options: { disabled?: boolean; title?: string } = {},
): string {
    const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
    const disabledAttrs = options.disabled
        ? ` disabled title="${escapeHtml(options.title || 'Unavailable')}"`
        : (options.title ? ` title="${escapeHtml(options.title)}"` : '');
    if (settings.twoButtonReviews) {
        return `
            <div class="jpdb-reader-row" style="--cols: 2">
                <button class="jpdb-reader-btn fail" data-action="grade" data-grade="fail"${ankiAttrs}${disabledAttrs}>Fail</button>
                <button class="jpdb-reader-btn pass" data-action="grade" data-grade="pass"${ankiAttrs}${disabledAttrs}>Pass</button>
            </div>
        `;
    }
    return `
        <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: 5">
            <button class="jpdb-reader-btn nothing" data-action="grade" data-grade="nothing"${ankiAttrs}${disabledAttrs}>Nothing</button>
            <button class="jpdb-reader-btn something" data-action="grade" data-grade="something"${ankiAttrs}${disabledAttrs}>Something</button>
            <button class="jpdb-reader-btn hard" data-action="grade" data-grade="hard"${ankiAttrs}${disabledAttrs}>Hard</button>
            <button class="jpdb-reader-btn okay" data-action="grade" data-grade="okay"${ankiAttrs}${disabledAttrs}>Okay</button>
            <button class="jpdb-reader-btn easy" data-action="grade" data-grade="easy"${ankiAttrs}${disabledAttrs}>Easy</button>
        </div>
    `;
}
