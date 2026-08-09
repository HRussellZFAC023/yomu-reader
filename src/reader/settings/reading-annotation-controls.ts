import type { ReaderSettings } from '../app/types';
import { escapeHtml } from '../dom/index';
import {
    learningTargetRosterIdForTag,
    type LearningTargetRosterId,
} from '../languages';
import { SETTINGS_LABEL_TEXT_CLASS, select } from './form-controls';
import { renderReadingHiddenStateGroupControls } from './hide-state-groups';
import { effectiveFuriganaMode, furiganaModeNeedsDifficultyExplanation } from './index';
import { readingAnnotationModeForTarget } from './reading-annotation-mode';
import { settingsText, type SettingsText } from './settings-text';

type SettingsTextKey = Parameters<SettingsText>[0];
type ReadingMode = Exclude<ReaderSettings['furiganaMode'], 'auto'>;

const READING_MODE_OPTIONS = [
    ['known-status', 'furiganaHideKnown'],
    ['difficult-kanji', 'furiganaDifficultKanji'],
    ['hover', 'furiganaHoverOnly'],
    ['all', 'furiganaAllParsed'],
    ['off', 'off'],
] as const satisfies readonly (readonly [ReadingMode, SettingsTextKey])[];

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
    const japaneseMode = effectiveFuriganaMode(settings);
    const mode = readingAnnotationModeForTarget(japaneseMode, targetLanguage);
    return `<div data-language-family="reading-annotation" data-reading-annotation-controls data-reading-annotation-target="${escapeHtml(targetLanguage)}" data-reading-annotation-last-mode="${escapeHtml(mode)}" data-reading-annotation-japanese-mode="${escapeHtml(japaneseMode)}">
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
    const state = targetSwitchState(modeSelect, currentMode, targetLanguage);
    trackExplicitModeChanges(modeSelect);
    const selectedMode = state.selectedMode;
    replaceOptions(modeSelect, modeOptions(text, targetLanguage), selectedMode);
    setSelectLabel(modeSelect, text(modeLabelKey(targetLanguage)));
    syncClampedRowControl(form, text);
    syncControlState(modeSelect, targetLanguage, selectedMode, state.japaneseMode);
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

function selectedReadingMode(selectElement: HTMLSelectElement): ReadingMode {
    return readingModeValue(selectElement.value) ?? 'all';
}

function syncClampedRowControl(form: HTMLFormElement, text: SettingsText): void {
    const selectElement = form.querySelector<HTMLSelectElement>('select[name="clampedRowReadings"]');
    if (!selectElement) return;
    replaceOptions(selectElement, localizedOptions(text, CLAMPED_ROW_OPTIONS), selectElement.value);
    setSelectLabel(selectElement, text('clampedRowReadings'));
}

function syncControlState(
    selectElement: HTMLSelectElement,
    targetLanguage: LearningTargetRosterId,
    selectedMode: ReadingMode,
    japaneseMode: ReadingMode,
): void {
    const controls = selectElement.closest<HTMLElement>('[data-reading-annotation-controls]');
    if (!controls) return;
    controls.dataset.readingAnnotationTarget = targetLanguage;
    controls.dataset.readingAnnotationLastMode = selectedMode;
    controls.dataset.readingAnnotationJapaneseMode = japaneseMode;
    delete controls.dataset.readingAnnotationModeChanged;
}

function syncHiddenStateLegend(
    form: HTMLFormElement,
    text: SettingsText,
    targetLanguage: LearningTargetRosterId,
): void {
    const key = targetLanguage === 'ja' ? 'hideFuriganaFor' : 'hideReadingsFor';
    form.querySelector<HTMLElement>('[data-furigana-hide-groups] > legend')?.replaceChildren(text(key));
}

function modeOptions(text: SettingsText, targetLanguage: LearningTargetRosterId): [ReadingMode, string][] {
    return READING_MODE_OPTIONS
        .filter(([mode]) => targetLanguage === 'ja' || mode !== 'difficult-kanji')
        .map(([mode, key]) => [mode, text(key)]);
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
    selectedMode: ReadingMode,
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

interface TargetSwitchState {
    selectedMode: ReadingMode;
    japaneseMode: ReadingMode;
}

function targetSwitchState(
    selectElement: HTMLSelectElement,
    currentMode: ReadingMode,
    targetLanguage: LearningTargetRosterId,
): TargetSwitchState {
    const controls = selectElement.closest<HTMLElement>('[data-reading-annotation-controls]');
    const previousTarget = previousReadingTarget(controls, targetLanguage);
    const lastMode = readingModeValue(controls?.dataset.readingAnnotationLastMode);
    const learnerChangedMode = learnerChangedReadingMode(controls, lastMode, currentMode);
    const storedJapaneseMode = storedJapaneseReadingMode(controls, currentMode);
    const japaneseMode = updatedJapaneseMode(previousTarget, currentMode, storedJapaneseMode, learnerChangedMode);
    return {
        selectedMode: selectedModeAfterTargetSwitch(
            targetLanguage,
            previousTarget,
            currentMode,
            japaneseMode,
            learnerChangedMode,
        ),
        japaneseMode,
    };
}

function previousReadingTarget(
    controls: HTMLElement | null,
    fallback: LearningTargetRosterId,
): LearningTargetRosterId {
    return learningTargetRosterIdForTag(controls?.dataset.readingAnnotationTarget) ?? fallback;
}

function learnerChangedReadingMode(
    controls: HTMLElement | null,
    lastMode: ReadingMode | null,
    currentMode: ReadingMode,
): boolean {
    if (controls?.dataset.readingAnnotationModeChanged === 'true') return true;
    return lastMode !== null && lastMode !== currentMode;
}

function storedJapaneseReadingMode(
    controls: HTMLElement | null,
    fallback: ReadingMode,
): ReadingMode {
    return readingModeValue(controls?.dataset.readingAnnotationJapaneseMode) ?? fallback;
}

function updatedJapaneseMode(
    previousTarget: LearningTargetRosterId,
    currentMode: ReadingMode,
    storedMode: ReadingMode,
    learnerChangedMode: boolean,
): ReadingMode {
    if (previousTarget === 'ja') return currentMode;
    return learnerChangedMode ? currentMode : storedMode;
}

function shouldRestoreJapaneseMode(
    targetLanguage: LearningTargetRosterId,
    previousTarget: LearningTargetRosterId,
    learnerChangedMode: boolean,
): boolean {
    return targetLanguage === 'ja' && previousTarget !== 'ja' && !learnerChangedMode;
}

function selectedModeAfterTargetSwitch(
    targetLanguage: LearningTargetRosterId,
    previousTarget: LearningTargetRosterId,
    currentMode: ReadingMode,
    japaneseMode: ReadingMode,
    learnerChangedMode: boolean,
): ReadingMode {
    if (shouldRestoreJapaneseMode(targetLanguage, previousTarget, learnerChangedMode)) return japaneseMode;
    return readingAnnotationModeForTarget(currentMode, targetLanguage);
}

function readingModeValue(value: string | undefined): ReadingMode | null {
    return READING_MODE_OPTIONS.find(([mode]) => mode === value)?.[0] ?? null;
}

function trackExplicitModeChanges(selectElement: HTMLSelectElement): void {
    if (selectElement.dataset.readingAnnotationTracking === 'true') return;
    selectElement.dataset.readingAnnotationTracking = 'true';
    selectElement.addEventListener('change', () => {
        const controls = selectElement.closest<HTMLElement>('[data-reading-annotation-controls]');
        if (controls) controls.dataset.readingAnnotationModeChanged = 'true';
    });
}
