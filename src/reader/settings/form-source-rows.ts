import { escapeHtml } from '../dom/index';
import { miniIcon } from './form-controls';
import type { SettingsSourceRow } from '../sources/sections';

type SourceRowsListOptions = { sourceLabel: string; countName?: string; countValue?: number; showAlias: boolean };
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
        layoutClass: sourceRowsLayoutClass(options.showAlias, showRemove),
        showRemove,
    };
    return `
        <div class="jpdb-reader-dictionary-head jpdb-reader-order-head ${context.layoutClass}">
            <span>On</span>
            <span>${escapeHtml(options.sourceLabel)}</span>
            ${options.showAlias ? '<span>Display name</span>' : ''}
            <span>Order</span>
            ${showRemove ? '<span>Remove</span>' : ''}
        </div>
        ${renderSourceRowsCountInput(options, removableCount)}
        ${rows.map((row, index) => renderSourceRow(row, index, context)).join('')}
    `;
}

function sourceRowsLayoutClass(showAlias: boolean, showRemove: boolean): string {
    return [
        showAlias ? '' : 'compact',
        showRemove ? 'has-remove' : 'no-remove',
    ].filter(Boolean).join(' ');
}

function renderSourceRowsCountInput(options: SourceRowsListOptions, removableCount: number): string {
    if (!options.countName) return '';
    return `<input type="hidden" name="${escapeHtml(options.countName)}" value="${options.countValue ?? removableCount}">`;
}

function renderSourceRow(row: SettingsSourceRow, index: number, context: SourceRowRenderContext): string {
    const keys = sourceRowCopyKeys(row);
    return `
            <div class="jpdb-reader-dictionary-row jpdb-reader-order-row ${context.layoutClass}" data-source-row data-dictionary-source-row data-source-id="${escapeHtml(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                    <input name="${row.prefix}.enabled" type="checkbox" data-source-enable-toggle ${row.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                ${sourceField(sourceRowDisplayName(row, context.showAlias), row.name, row.prefix, 'name', context.sourceLabel, keys?.nameKey)}
                ${renderSourceAliasControl(row, context.showAlias, keys)}
                ${renderRowOrderTools({
                    upAction: 'dictionary-source-up',
                    downAction: 'dictionary-source-down',
                    labels: SOURCE_ROW_ORDER_LABELS,
                    leading: `<input name="${row.prefix}.priority" type="hidden" value="${index}">`,
                })}
                ${renderSourceRemoveCell(row, context.showRemove)}
                ${renderSourceTypeInput(row)}
                ${renderSourceRowHelp(row, keys)}
            </div>
        `;
}

function renderSourceAliasControl(row: SettingsSourceRow, showAlias: boolean, keys: SourceRowCopyKeys | undefined): string {
    if (!showAlias) return '';
    const keyAttribute = keys?.nameKey ? ` data-source-placeholder-key="${escapeHtml(keys.nameKey)}"` : '';
    return `<input name="${row.prefix}.alias" type="text" value="${escapeHtml(row.alias)}" aria-label="Source display name" placeholder="${escapeHtml(row.name)}"${keyAttribute}>`;
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

function renderSourceRowHelp(row: SettingsSourceRow, keys: SourceRowCopyKeys | undefined): string {
    if (!row.help) return '';
    const keyAttribute = keys?.helpKey ? `data-source-help-key="${escapeHtml(keys.helpKey)}"` : '';
    return `<div class="jpdb-reader-dictionary-row-help" ${keyAttribute}>${escapeHtml(row.help)}</div>`;
}

function sourceRowDisplayName(row: SettingsSourceRow, showAlias: boolean): string {
    return !showAlias && row.alias ? row.alias : row.name;
}

function sourceField(displayValue: string, formValue: string, prefix: string, field: 'name' | 'alias', label: string, nameKey?: string): string {
    return `
        <span class="jpdb-reader-field-display" aria-label="${escapeHtml(label)}" ${nameKey ? `data-source-name-key="${escapeHtml(nameKey)}"` : ''}>${escapeHtml(displayValue)}</span>
        <input name="${prefix}.${field}" type="hidden" value="${escapeHtml(formValue)}">
    `;
}

function sourceRowCopyKeys(row: SettingsSourceRow): SourceRowCopyKeys | undefined {
    return SOURCE_ROW_COPY_KEYS_BY_ID[row.id] ?? importedKanjiDictionaryCopyKeys(row.id);
}

function importedKanjiDictionaryCopyKeys(rowId: string): SourceRowCopyKeys | undefined {
    return rowId.startsWith('__kanji_dictionary__:') ? { helpKey: 'sourceHelpImportedKanjiDictionary' } : undefined;
}
