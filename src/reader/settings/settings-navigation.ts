import { catalogBrowseMatchesQuery, normalizeSearchQuery } from './catalog-browse-filter';
import { syncSettingsDisclosureSearch } from './settings-disclosures';

/** Panel selection and cross-panel search share one visibility owner. */
export function activateSettingsPanel(form: HTMLFormElement, panel: string): void {
    const search = form.querySelector<HTMLInputElement>('[data-settings-search]');
    if (search?.value.trim()) applySettingsSearch(form, '');
    applyPanel(form, panel);
}

export function applySettingsSearch(form: HTMLFormElement, query: string): void {
    const normalized = normalizeSearchQuery(query);
    const input = form.querySelector<HTMLInputElement>('[data-settings-search]');
    if (input && input.value !== query) input.value = query;
    form.dataset.settingsSearching = String(Boolean(normalized));
    syncSettingsDisclosureSearch(form, Boolean(normalized));
    let hasMatches = !normalized;
    if (normalized) {
        form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-settings-panel]').forEach(fieldset => {
            fieldset.hidden = !matchesQuery(fieldset, normalized);
            hasMatches ||= !fieldset.hidden;
        });
    } else {
        const active = form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][aria-selected="true"]');
        applyPanel(form, active?.dataset.panel ?? 'appearance');
    }
    const empty = form.querySelector<HTMLElement>('[data-settings-search-empty]');
    if (empty) empty.hidden = hasMatches;
}

function matchesQuery(fieldset: HTMLFieldSetElement, query: string): boolean {
    const indexed = Array.from(fieldset.querySelectorAll<HTMLElement>('[data-settings-search-index]'),
        element => element.dataset.settingsSearchIndex ?? '').join(' ');
    if (normalizeSearchQuery(`${fieldset.textContent ?? ''} ${indexed}`).includes(query)) return true;
    const catalogue = fieldset.querySelector<HTMLElement>('[data-catalog-browse]');
    return catalogue !== null && catalogBrowseMatchesQuery(catalogue, query);
}

function applyPanel(form: HTMLFormElement, panel: string): void {
    const aliases: Readonly<Record<string, string>> = {
        basics: 'api', jpdb: 'api', reading: 'appearance', reader: 'appearance', kanji: 'dictionaries',
    };
    const selected = aliases[panel] ?? panel;
    form.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(section => {
        section.hidden = section.dataset.settingsPanel !== selected;
    });
    form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]').forEach(button => {
        const active = button.dataset.panel === selected;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
}
