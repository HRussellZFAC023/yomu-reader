import { escapeHtml } from '../dom';

export const SETTINGS_LABEL_TEXT_CLASS = 'jpdb-reader-settings-label-text';

type InputAttributes = Record<string, string | number>;
type BooleanAttributes = Record<string, boolean>;

// Settings labels should use sentence case, action-first verbs for toggles,
// and explicit unit suffixes such as (px), (ms), (%), or (s) where relevant.
export function input(name: string, label: string, value: string, type = 'text', attributes: InputAttributes = {}): string {
    const fieldClass = ['jpdb-reader-settings-field'];
    if (type === 'number' || type === 'color') fieldClass.push(`jpdb-reader-settings-field-${type}`);
    return `<label class="${fieldClass.join(' ')}">${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off"${attributeHtml(attributes)}></label>`;
}

export function shortcutInput(name: string, label: string, value: string, placeholder = 'Press keys'): string {
    return `<label>${label}<input data-shortcut-input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" inputmode="none" aria-label="${escapeHtml(label)}"></label>`;
}

export function checkbox(name: string, label: string, checked: boolean, attributes: BooleanAttributes = {}): string {
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}${booleanAttributeHtml(attributes)}>${label}</label>`;
}

export function select(name: string, label: string, value: string, options: [string, string][]): string {
    return `<label>${label}<select name="${name}">${options.map(([optionValue, text]) =>
        `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`,
    ).join('')}</select></label>`;
}

export function radioGroup(name: string, label: string, value: string, options: [string, string][]): string {
    return `<fieldset class="jpdb-reader-radio-group"><legend>${label}</legend>${options.map(([optionValue, text]) =>
        `<label class="inline"><input name="${name}" type="radio" value="${escapeHtml(optionValue)}" ${optionValue === value ? 'checked' : ''}>${escapeHtml(text)}</label>`,
    ).join('')}</fieldset>`;
}

export function settingsTabButton(panel: string, label: string, active = false): string {
    return `<button class="jpdb-reader-settings-tab" type="button" role="tab" data-action="settings-panel" data-panel="${escapeHtml(panel)}" aria-controls="${settingsTabControls(panel)}" aria-selected="${active ? 'true' : 'false'}" tabindex="${active ? '0' : '-1'}">${escapeHtml(label)}</button>`;
}

export function miniIcon(name: 'drag' | 'up' | 'down' | 'remove'): string {
    const paths = {
        drag: '<path d="M9 5h.01"></path><path d="M15 5h.01"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M9 19h.01"></path><path d="M15 19h.01"></path>',
        up: '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>',
        down: '<path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>',
        remove: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    } satisfies Record<typeof name, string>;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

function settingsTabControls(panel: string): string {
    return {
        api: 'jpdb-reader-settings-panel-api',
        newTab: 'jpdb-reader-settings-panel-newtab',
        appearance: 'jpdb-reader-settings-panel-appearance',
        reading: 'jpdb-reader-settings-panel-reader jpdb-reader-settings-panel-kanji',
        dictionaries: 'jpdb-reader-settings-panel-dictionaries',
        media: 'jpdb-reader-settings-panel-audio jpdb-reader-settings-panel-immersion-kit jpdb-reader-settings-panel-ocr jpdb-reader-settings-panel-video jpdb-reader-settings-panel-youtube',
        mining: 'jpdb-reader-settings-panel-mining',
        shortcuts: 'jpdb-reader-settings-panel-shortcuts',
        help: 'jpdb-reader-settings-panel-help',
    }[panel] ?? 'jpdb-reader-settings-panel-api';
}

function attributeHtml(attributes: InputAttributes): string {
    return Object.entries(attributes)
        .map(([key, attributeValue]) => ` ${key}="${escapeHtml(String(attributeValue))}"`)
        .join('');
}

function booleanAttributeHtml(attributes: BooleanAttributes): string {
    return Object.entries(attributes)
        .filter(([, value]) => value)
        .map(([key]) => ` ${key}`)
        .join('');
}
