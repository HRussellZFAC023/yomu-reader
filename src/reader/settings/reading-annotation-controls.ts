import type { ReaderSettings } from '../app/types';
import { escapeHtml } from '../dom/index';
import { SETTINGS_LABEL_TEXT_CLASS, select } from './form-controls';
import { renderReadingHiddenStateGroupControls } from './hide-state-groups';
import { effectiveFuriganaMode, furiganaModeNeedsDifficultyExplanation } from './index';
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

/** The furigana controls: mode, the fixed-kanji difficulty note, clamped rows and hidden states. */
export function renderReadingAnnotationControls(settings: ReaderSettings): string {
    const text = settingsText(settings.interfaceLanguage);
    return `<div data-reading-annotation-controls>
        ${select('furiganaMode', text('furiganaMode'), effectiveFuriganaMode(settings), localizedOptions(text, READING_MODE_OPTIONS))}
        ${difficultyNoteHtml(settings, text)}
        ${select('clampedRowReadings', text('clampedRowReadings'), settings.clampedRowReadings, localizedOptions(text, CLAMPED_ROW_OPTIONS))}
        ${renderReadingHiddenStateGroupControls(settings)}
    </div>`;
}

/** Relabels the controls on a live interface-language switch; listeners survive. */
export function syncReadingAnnotationControls(form: HTMLFormElement, text: SettingsText): void {
    const modeSelect = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]');
    if (!modeSelect) return;
    replaceOptions(modeSelect, localizedOptions(text, READING_MODE_OPTIONS), modeSelect.value);
    setSelectLabel(modeSelect, text('furiganaMode'));
    const clamped = form.querySelector<HTMLSelectElement>('select[name="clampedRowReadings"]');
    if (clamped) {
        replaceOptions(clamped, localizedOptions(text, CLAMPED_ROW_OPTIONS), clamped.value);
        setSelectLabel(clamped, text('clampedRowReadings'));
    }
    form.querySelector<HTMLElement>('[data-furigana-hide-groups] > legend')?.replaceChildren(text('hideFuriganaFor'));
    form.querySelector<HTMLElement>('[data-furigana-difficulty-note]')?.replaceChildren(text('furiganaDifficultKanjiHelp'));
}

function difficultyNoteHtml(settings: ReaderSettings, text: SettingsText): string {
    const hidden = furiganaModeNeedsDifficultyExplanation(settings) ? '' : ' hidden';
    return `<div class="jpdb-reader-help" data-furigana-difficulty-note data-help-key="furiganaDifficultKanjiHelp"${hidden}>${escapeHtml(text('furiganaDifficultKanjiHelp'))}</div>`;
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
