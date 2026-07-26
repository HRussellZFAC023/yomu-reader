/**
 * Filtering for the mirrored-catalogue panel.
 *
 * The panel lists every archive Yomu hosts — over a hundred cards in nine
 * category groups. Grouping alone is not "searchable": finding 大辞林 or a pitch
 * dictionary by name means scrolling past everything else. This narrows the
 * rendered cards in place, entirely from text already in the DOM, so typing in
 * Settings never touches the network.
 */

const CARD_SELECTOR = '.jpdb-reader-recommended-item';

export function normalizeSearchQuery(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Returns how many cards remain visible. */
export function applyCatalogBrowseFilter(section: HTMLElement, query: string): number {
    const normalized = normalizeSearchQuery(query);
    let visible = 0;
    section.querySelectorAll<HTMLElement>('[data-catalog-browse-group]').forEach(group => {
        const heading = normalizeSearchQuery(group.querySelector('[data-catalog-browse-category]')?.textContent ?? '');
        let matched = 0;
        group.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(card => {
            const matches = !normalized || cardMatches(card, heading, normalized);
            card.hidden = !matches;
            if (matches) matched += 1;
        });
        group.hidden = matched === 0;
        visible += matched;
    });
    const empty = section.querySelector<HTMLElement>('[data-catalog-browse-empty]');
    if (empty) empty.hidden = visible > 0;
    section.dataset.catalogBrowseFiltering = normalized ? 'true' : 'false';
    return visible;
}

export function catalogBrowseSection(root: ParentNode): HTMLElement | null {
    return root.querySelector<HTMLElement>('[data-catalog-browse]');
}

/**
 * Wires the panel's own input. Kept separate from rendering so a re-rendered
 * Sources panel can rebind without the dialog knowing the panel's internals.
 */
export function installCatalogBrowseFilter(root: ParentNode): void {
    const section = catalogBrowseSection(root);
    const input = section?.querySelector<HTMLInputElement>('[data-catalog-browse-filter]');
    if (!section || !input || input.dataset.catalogBrowseFilterBound === 'true') return;
    input.dataset.catalogBrowseFilterBound = 'true';
    input.addEventListener('input', () => applyCatalogBrowseFilter(section, input.value));
    // A search input's native clear button fires `search`, not `input`, in
    // WebKit, and Enter must never submit the settings dialog from here.
    input.addEventListener('search', () => applyCatalogBrowseFilter(section, input.value));
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        applyCatalogBrowseFilter(section, input.value);
    });
}

/**
 * The card's own text carries the title, the definition language and the
 * download size; the group heading carries the localized category, so
 * "pitch"/"ピッチ" finds pitch dictionaries. The catalogue id is matched too so a
 * shared link or a bug report id resolves to a row.
 */
function cardMatches(card: HTMLElement, heading: string, query: string): boolean {
    const haystack = normalizeSearchQuery([
        card.textContent ?? '',
        card.dataset.catalogRecommendation ?? '',
        card.dataset.definitionLanguage ?? '',
    ].join(' '));
    return haystack.includes(query) || heading.includes(query);
}
