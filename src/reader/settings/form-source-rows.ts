import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { miniIcon } from './form-controls';
import type { InterfaceLanguage } from '../app/types';
import type { SettingsSourceRow } from '../sources/sections';

type SourceRowsListOptions = { sourceLabelKey: 'definitionSource' | 'kanjiSection'; countName?: string; countValue?: number; language: InterfaceLanguage };
type SourceRowRenderContext = SourceRowsListOptions & { layoutClass: string; showRemove: boolean };
type SourceRowCopyKeys = { nameKey?: string; helpKey?: string };
type MiniIconName = Parameters<typeof miniIcon>[0];
type RowOrderLabels = { drag: string; up: string; down: string };

const SOURCE_ROW_COPY_KEYS_BY_ID: Record<string, SourceRowCopyKeys> = {
    __jpdb__: { helpKey: 'sourceHelpJpdb' },
    __jiten__: { helpKey: 'sourceHelpJiten' },
    __bunpro__: { helpKey: 'sourceHelpBunpro' },
    __wanikani__: { helpKey: 'sourceHelpWanikani' },
    __anki__: { nameKey: 'sourceNameAnki', helpKey: 'sourceHelpAnki' },
    __study_translation__: { nameKey: 'sourceNameTranslation', helpKey: 'sourceHelpTranslation' },
    __study_grammar__: { nameKey: 'sourceNameGrammar', helpKey: 'sourceHelpGrammar' },
    __immersion_kit__: { nameKey: 'sourceNameImmersionKit', helpKey: 'sourceHelpImmersionKit' },
    __kanji_stroke__: { nameKey: 'sourceNameStrokePractice', helpKey: 'sourceHelpStrokePractice' },
    __kanji_rtk__: { helpKey: 'sourceHelpRtk' },
    __kanji_wanikani__: { helpKey: 'sourceHelpWanikaniKanji' },
    __kanji_dictionaries__: { nameKey: 'sourceNameImportedKanjiDictionaries', helpKey: 'sourceHelpImportedKanjiDictionaries' },
    __kanji_similar_words__: { nameKey: 'sourceNameWordsUsingKanji', helpKey: 'sourceHelpWordsUsingKanji' },
    __kanji_origins__: { nameKey: 'originStructure', helpKey: 'sourceHelpComponentGraph' },
};
const SOURCE_ROW_ORDER_LABELS = { drag: 'Drag to reorder', up: 'Move up', down: 'Move down' };

/**
 * A Sources help line, keyed so a live interface-language switch relabels it,
 * and written in the learner's language because the shelf re-renders these
 * rows after an import or removal without relabelling the form.
 */
export function renderSourceRowsHelp(language: InterfaceLanguage, key: 'importLocalDefinitionsHelp' | 'metadataDictionariesHelp'): string {
    return `<div class="jpdb-reader-help" data-help-key="${key}">${escapeHtml(uiText(language, key))}</div>`;
}

export function miniIconButton(icon: MiniIconName, label: string, attributes: string): string {
    const dragClass = icon === 'drag' ? ' jpdb-reader-drag-handle' : '';
    return `<button type="button" class="jpdb-reader-icon-mini${dragClass}" ${attributes} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${miniIcon(icon)}</button>`;
}

export function renderRowOrderTools(options: { label?: string; upAction: string; downAction: string; labels: RowOrderLabels; leading?: string }): string {
    const ariaLabel = options.label ? ` aria-label="${escapeHtml(options.label)}"` : '';
    return `<div class="jpdb-reader-row-tools jpdb-reader-row-order-tools"${ariaLabel}>
                    ${options.leading ?? ''}
                    ${miniIconButton('drag', options.labels.drag, 'data-source-drag-handle tabindex="-1"')}
                    ${miniIconButton('up', options.labels.up, `data-action="${options.upAction}"`)}
                    ${miniIconButton('down', options.labels.down, `data-action="${options.downAction}"`)}
                </div>`;
}

export function renderRowRemoveTools(control: string): string {
    return `<div class="jpdb-reader-row-tools jpdb-reader-row-remove-tools">
                    ${control}
                </div>`;
}

export function renderSourceRowsList(rows: SettingsSourceRow[], options: SourceRowsListOptions): string {
    const removableCount = rows.filter(row => row.removable).length;
    const showRemove = removableCount > 0;
    const context: SourceRowRenderContext = {
        ...options,
        layoutClass: `compact ${showRemove ? 'has-remove' : 'no-remove'}`,
        showRemove,
    };
    return `
        <div class="jpdb-reader-dictionary-head jpdb-reader-order-head ${context.layoutClass}" data-source-label-key="${options.sourceLabelKey}">
            <span>On</span>
            <span>${escapeHtml(uiText(options.language, options.sourceLabelKey))}</span>
            <span>Order</span>
            ${showRemove ? '<span>Remove</span>' : ''}
        </div>
        ${renderSourceRowsCountInput(options, removableCount)}
        ${rows.map((row, index) => renderSourceRow(row, index, context)).join('')}
    `;
}

function renderSourceRowsCountInput(options: SourceRowsListOptions, removableCount: number): string {
    if (!options.countName) return '';
    return `<input type="hidden" name="${escapeHtml(options.countName)}" value="${options.countValue ?? removableCount}">`;
}

function renderSourceRow(row: SettingsSourceRow, index: number, context: SourceRowRenderContext): string {
    const keys = sourceRowCopyKeys(row, context.language);
    return `
            <div class="jpdb-reader-dictionary-row jpdb-reader-order-row ${context.layoutClass}" data-source-row data-dictionary-source-row data-source-id="${escapeHtml(row.id)}" title="${escapeHtml(row.help)}"${keys?.helpKey ? ` data-source-description-key="${keys.helpKey}"` : ''}>
                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                    <input name="${row.prefix}.enabled" type="checkbox" data-source-enable-toggle ${row.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                ${renderSourceName(row, context, keys)}
                ${renderRowOrderTools({
                    upAction: 'dictionary-source-up',
                    downAction: 'dictionary-source-down',
                    labels: SOURCE_ROW_ORDER_LABELS,
                    // The STORED priority, not the row's index: an untouched Save
                    // writes it back as it was. Moving any row renumbers the whole
                    // list by position (syncSourceRowOrder), which is the only
                    // time the order becomes the learner's.
                    leading: `<input name="${row.prefix}.priority" type="hidden" value="${row.priority}">`,
                })}
                ${renderSourceRemoveCell(row, context.showRemove)}
                ${renderSourceTypeInput(row)}
            </div>
        `;
}

function renderSourceName(row: SettingsSourceRow, context: SourceRowRenderContext, keys: SourceRowCopyKeys | undefined): string {
    if (!row.removable) return sourceField(row.name, row.name, row.prefix, 'name', uiText(context.language, context.sourceLabelKey), keys?.nameKey);
    return `<input name="${row.prefix}.alias" type="text" value="${escapeHtml(row.alias)}" aria-label="${escapeHtml(uiText(context.language, 'displayName'))}" placeholder="${escapeHtml(row.name)}" title="${escapeHtml(row.name)}">
        <input name="${row.prefix}.name" type="hidden" value="${escapeHtml(row.name)}">`;
}

function renderSourceRemoveCell(row: SettingsSourceRow, showRemove: boolean): string {
    if (!showRemove) return '';
    return renderRowRemoveTools(renderSourceRemoveButton(row));
}

function renderSourceRemoveButton(row: SettingsSourceRow): string {
    if (!row.removable) return '';
    return miniIconButton('remove', 'Remove imported dictionary', `data-action="delete-yomitan-dictionary" data-dictionary-name="${escapeHtml(row.name)}"`);
}

function renderSourceTypeInput(row: SettingsSourceRow): string {
    if (!row.removable) return '';
    return `<input name="${row.prefix}.type" type="hidden" value="${escapeHtml(row.dictionaryType ?? 'terms')}">`;
}

function sourceField(displayValue: string, formValue: string, prefix: string, field: 'name' | 'alias', label: string, nameKey?: string): string {
    return `
        <span class="jpdb-reader-field-display" aria-label="${escapeHtml(label)}" ${nameKey ? `data-source-name-key="${escapeHtml(nameKey)}"` : ''}>${escapeHtml(displayValue)}</span>
        <input name="${prefix}.${field}" type="hidden" value="${escapeHtml(formValue)}">
    `;
}

function sourceRowCopyKeys(row: SettingsSourceRow, language: InterfaceLanguage): SourceRowCopyKeys | undefined {
    if (row.id === '__kanji_jpdb__') {
        return row.name === uiText(language, 'sourceNameJitenKanjiFacts')
            ? { nameKey: 'sourceNameJitenKanjiFacts', helpKey: 'sourceHelpJitenKanjiFacts' }
            : { nameKey: 'readingsComponents', helpKey: 'sourceHelpReadingsComponents' };
    }
    return SOURCE_ROW_COPY_KEYS_BY_ID[row.id] ?? importedKanjiDictionaryCopyKeys(row.id);
}

function importedKanjiDictionaryCopyKeys(rowId: string): SourceRowCopyKeys | undefined {
    return rowId.startsWith('__kanji_dictionary__:') ? { helpKey: 'sourceHelpImportedKanjiDictionary' } : undefined;
}
