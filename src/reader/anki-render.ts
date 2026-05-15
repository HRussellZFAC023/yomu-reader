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
    const preview = ankiExistingPreview(note, storedContext);
    return `
        <details class="jpdb-reader-anki-existing">
            <summary>
                <span><span class="jpdb-reader-state-dot jpdb-${note.state}"></span>Already in Anki</span>
                <small>${escapeHtml(preview.decks)} · ${escapeHtml(note.modelName)}</small>
            </summary>
            <div class="jpdb-reader-anki-card-preview">
                ${previewField('Sentence', preview.sentence)}
                ${previewField('Meaning', preview.meaning.slice(0, 420))}
                ${previewField('Source', preview.source)}
                ${preview.context}
            </div>
        </details>
    `;
}

function ankiExistingPreview(note: AnkiExistingNote, storedContext: StoredMiningContext | null): { decks: string; sentence: string; meaning: string; source: string; context: string } {
    return {
        decks: note.deckNames.length ? note.deckNames.join(', ') : 'Anki',
        sentence: firstAnkiPreviewField(note, ['Sentence', 'Example', 'SentenceExpression']),
        meaning: firstAnkiPreviewField(note, ['Meaning', 'Definition', 'Glossary']),
        source: firstAnkiPreviewField(note, ['Source', 'Url']),
        context: storedContext ? renderLastMiningContext(storedContext) : '',
    };
}

function firstAnkiPreviewField(note: AnkiExistingNote, fields: string[]): string {
    return fields.map(field => note.fields[field]).find(Boolean) ?? '';
}

function previewField(label: string, value: string): string {
    return value ? `<div><strong>${label}</strong><span>${escapeHtml(value)}</span></div>` : '';
}

function renderLastMiningContext(context: StoredMiningContext): string {
    return `<div class="jpdb-reader-anki-context"><strong>Last seen</strong><span>${escapeHtml(contextLabel(context))}</span><small>${escapeHtml(context.sentence)}</small></div>`;
}

export function renderReviewButtons(
    settings: ReaderSettings,
    ankiNote: AnkiExistingNote | null = null,
    options: { disabled?: boolean; title?: string } = {},
): string {
    const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
    const disabledAttrs = reviewButtonDisabledAttrs(options);
    const grades = reviewButtonGrades(settings);
    return `
        <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}">
            ${grades.map(([grade, label]) => `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${ankiAttrs}${disabledAttrs}>${label}</button>`).join('')}
        </div>
    `;
}

function reviewButtonDisabledAttrs(options: { disabled?: boolean; title?: string }): string {
    if (options.disabled) return ` disabled title="${escapeHtml(options.title || 'Unavailable')}"`;
    return options.title ? ` title="${escapeHtml(options.title)}"` : '';
}

function reviewButtonGrades(settings: ReaderSettings): Array<[string, string]> {
    return settings.twoButtonReviews
        ? [['fail', 'Fail'], ['pass', 'Pass']]
        : [['nothing', 'Nothing'], ['something', 'Something'], ['hard', 'Hard'], ['okay', 'Okay'], ['easy', 'Easy']];
}
