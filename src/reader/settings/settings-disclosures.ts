import { formatUiText, uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { escapeHtml } from '../dom/index';

const searchOpenStates = new WeakMap<HTMLDetailsElement, boolean>();

export function renderAppearanceTuning(language: InterfaceLanguage, controls: string): string {
    return `<details class="jpdb-reader-settings-subsection jpdb-reader-help-disclosure" data-settings-tuning>
        <summary class="jpdb-reader-local-title">${escapeHtml(tuningTitle(language))}</summary>${controls}
    </details>`;
}

export function localizeSettingsDisclosures(form: HTMLFormElement, language: InterfaceLanguage): void {
    form.querySelector('[data-settings-tuning] > summary')?.replaceChildren(tuningTitle(language));
}

/** Search temporarily reveals controls without changing the learner's preference. */
export function syncSettingsDisclosureSearch(form: HTMLFormElement, searching: boolean): void {
    form.querySelectorAll<HTMLDetailsElement>('[data-settings-tuning]').forEach(details => {
        if (searching) {
            if (!searchOpenStates.has(details)) searchOpenStates.set(details, details.open);
            details.open = true;
        } else if (searchOpenStates.has(details)) {
            details.open = searchOpenStates.get(details)!;
            searchOpenStates.delete(details);
        }
    });
}

function tuningTitle(language: InterfaceLanguage): string {
    return formatUiText(language, 'customAdvanced', { label: uiText(language, 'appearance') });
}
