import type { ReaderSettings } from '../app/types';
import { escapeHtml } from '../dom/index';
import {
    learningTargetRosterIdForTag,
    type LearningTargetRosterId,
} from '../languages';
import { SETTINGS_LABEL_TEXT_CLASS, select } from './form-controls';
import { renderReadingHiddenStateGroupControls } from './hide-state-groups';
import { effectiveFuriganaMode, furiganaModeNeedsDifficultyExplanation } from './index';
import { settingsText, type SettingsText } from './settings-text';

type SettingsTextKey = Parameters<SettingsText>[0];
type FuriganaMode = ReaderSettings['furiganaMode'];

const READING_MODE_OPTIONS = [
    ['known-status', 'furiganaHideKnown'],
    ['difficult-kanji', 'furiganaDifficultKanji'],
    ['hover', 'furiganaHoverOnly'],
    ['all', 'furiganaAllParsed'],
    ['off', 'off'],
] as const satisfies readonly (readonly [FuriganaMode, SettingsTextKey])[];

const CLAMPED_ROW_OPTIONS = [
    ['show', 'clampedRowReadingsShow'],
    ['hover', 'clampedRowReadingsHover'],
] as const satisfies readonly (readonly [ReaderSettings['clampedRowReadings'], SettingsTextKey])[];

/**
 * One target-aware Module for the legacy `furigana*` settings seam.
 *
 * The stored names remain compatible, but the Interface is honest: Japanese
 * gets furigana plus the fixed-kanji difficulty policy; every other target gets
 * generic reading annotations and never sees or persists that Japanese policy.
 */
export function renderReadingAnnotationControls(
    settings: ReaderSettings,
    targetLanguage: LearningTargetRosterId,
): string {
    const text = settingsText(settings.interfaceLanguage);
    const mode = modeForTarget(effectiveFuriganaMode(settings), targetLanguage);
    return `<div data-language-family="reading-annotation" data-reading-annotation-controls data-reading-annotation-target="${escapeHtml(targetLanguage)}">
        ${select('furiganaMode', text(modeLabelKey(targetLanguage)), mode, modeOptions(text, targetLanguage))}
        ${difficultyNoteHtml(settings, text, targetLanguage)}
        ${select('clampedRowReadings', text('clampedRowReadings'), settings.clampedRowReadings, localizedOptions(text, CLAMPED_ROW_OPTIONS))}
        ${renderReadingHiddenStateGroupControls(settings, targetLanguage)}
    </div>`;
}

/** Rebuilds only the option children, so listeners on the live selects survive. */
export function syncReadingAnnotationControls(form: HTMLFormElement, text: SettingsText): void {
    const targetLanguage = selectedTarget(form);
    const modeSelect = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]');
    if (!modeSelect) return;

    const currentMode = selectedReadingMode(modeSelect);
    const selectedMode = modeForTarget(currentMode, targetLanguage);
    replaceOptions(modeSelect, modeOptions(text, targetLanguage), selectedMode);
    setSelectLabel(modeSelect, text(modeLabelKey(targetLanguage)));
    syncClampedRowControl(form, text);
    syncControlTarget(modeSelect, targetLanguage);
    syncHiddenStateLegend(form, text, targetLanguage);
    syncDifficultyNote(form, text, targetLanguage, selectedMode);
}

function difficultyNoteHtml(
    settings: ReaderSettings,
    text: SettingsText,
    targetLanguage: LearningTargetRosterId,
): string {
    if (targetLanguage !== 'ja') {
        return '<div class="jpdb-reader-help" data-furigana-difficulty-note hidden></div>';
    }
    const hidden = furiganaModeNeedsDifficultyExplanation(settings) ? '' : ' hidden';
    return `<div class="jpdb-reader-help" data-furigana-difficulty-note data-help-key="furiganaDifficultKanjiHelp"${hidden}>${escapeHtml(text('furiganaDifficultKanjiHelp'))}</div>`;
}

function selectedReadingMode(selectElement: HTMLSelectElement): FuriganaMode {
    return READING_MODE_OPTIONS.find(([mode]) => mode === selectElement.value)?.[0] ?? 'all';
}

function syncClampedRowControl(form: HTMLFormElement, text: SettingsText): void {
    const selectElement = form.querySelector<HTMLSelectElement>('select[name="clampedRowReadings"]');
    if (!selectElement) return;
    replaceOptions(selectElement, localizedOptions(text, CLAMPED_ROW_OPTIONS), selectElement.value);
    setSelectLabel(selectElement, text('clampedRowReadings'));
}

function syncControlTarget(selectElement: HTMLSelectElement, targetLanguage: LearningTargetRosterId): void {
    const controls = selectElement.closest<HTMLElement>('[data-reading-annotation-controls]');
    if (controls) controls.dataset.readingAnnotationTarget = targetLanguage;
}

function syncHiddenStateLegend(
    form: HTMLFormElement,
    text: SettingsText,
    targetLanguage: LearningTargetRosterId,
): void {
    const key = targetLanguage === 'ja' ? 'hideFuriganaFor' : 'hideReadingsFor';
    form.querySelector<HTMLElement>('[data-furigana-hide-groups] > legend')?.replaceChildren(text(key));
}

function modeOptions(text: SettingsText, targetLanguage: LearningTargetRosterId): [FuriganaMode, string][] {
    return READING_MODE_OPTIONS
        .filter(([mode]) => targetLanguage === 'ja' || mode !== 'difficult-kanji')
        .map(([mode, key]) => [mode, text(key)]);
}

function modeForTarget(mode: FuriganaMode, targetLanguage: LearningTargetRosterId): FuriganaMode {
    return targetLanguage !== 'ja' && mode === 'difficult-kanji' ? 'all' : mode;
}

function modeLabelKey(targetLanguage: LearningTargetRosterId): SettingsTextKey {
    return targetLanguage === 'ja' ? 'furiganaMode' : 'readingAnnotations';
}

function selectedTarget(form: HTMLFormElement): LearningTargetRosterId {
    return learningTargetRosterIdForTag(form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value)
        ?? learningTargetRosterIdForTag(form.dataset.language)
        ?? 'ja';
}

function localizedOptions<V extends string>(
    text: SettingsText,
    options: readonly (readonly [V, SettingsTextKey])[],
): [V, string][] {
    return options.map(([value, key]) => [value, text(key)]);
}

function replaceOptions(selectElement: HTMLSelectElement, options: [string, string][], selected: string): void {
    selectElement.replaceChildren(...options.map(([value, label]) => {
        const option = selectElement.ownerDocument.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = value === selected;
        return option;
    }));
}

function setSelectLabel(selectElement: HTMLSelectElement, copy: string): void {
    const label = selectElement.closest('label');
    if (!label) return;
    const container = Array.from(label.children).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains(SETTINGS_LABEL_TEXT_CLASS),
    );
    if (container) {
        container.replaceChildren(copy);
        return;
    }
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = copy;
    else label.insertBefore(label.ownerDocument.createTextNode(copy), label.firstChild);
}

function syncDifficultyNote(
    form: HTMLFormElement,
    text: SettingsText,
    targetLanguage: LearningTargetRosterId,
    selectedMode: FuriganaMode,
): void {
    const note = form.querySelector<HTMLElement>('[data-furigana-difficulty-note]');
    if (!note) return;
    if (targetLanguage === 'ja') {
        note.dataset.helpKey = 'furiganaDifficultKanjiHelp';
        note.replaceChildren(text('furiganaDifficultKanjiHelp'));
    } else {
        delete note.dataset.helpKey;
        note.replaceChildren();
    }
    note.hidden = targetLanguage !== 'ja' || selectedMode !== 'difficult-kanji';
}
