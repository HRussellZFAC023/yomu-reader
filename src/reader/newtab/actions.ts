/**
 * The Study surface's `data-newtab-action` vocabulary, as one closed union.
 *
 * Every newtab control carries a `data-newtab-action` name; the root click
 * router reads it back and dispatches. Both halves used to be bare `string`,
 * so a renamed control (or a handler keyed to a name nothing renders) was a
 * silent no-op button — the settings/auto-select regression class, but for
 * clicks. Routing the produced name through {@link newTabAction} and the
 * consumed name through {@link isNewTabAction} makes both halves typecheck
 * against this list: a typo at a render site fails the build, and a handler
 * table entry for a name no render site emits fails the build too.
 *
 * Add a name here in the same commit that renders it.
 */
export const NEW_TAB_ACTIONS = [
    // Shell: overflow menu, app nav, site nav, support banner.
    'settings',
    'theme',
    'language',
    'install-app',
    'dismiss-support-banner',
    'site-nav',
    'external-link',
    'mode',
    // Study: navigation, reveal, grading, step chrome.
    'previous',
    'next',
    'reveal',
    'grade',
    'empty-fallback',
    'continue-batch',
    'study-step',
    'study-hint',
    'dismiss-study-tour',
    'recall-submit',
    'type-word-submit',
    'type-word-handwriting-check',
    'type-word-handwriting-match',
    'type-word-handwriting-retry',
    'type-word-skip',
    'type-word-mode',
    'jpdb-kanji-action',
    // Listen / pitch-perception step.
    'listen-pick',
    'listen-play',
    'listen-play-recording',
    'listen-record',
    // Library search.
    'search-submit',
    'search-clear',
    'search-focus',
    'search-suggestion',
    'search-handwriting-toggle',
    'handwriting-candidate',
    'search-result-word',
    'search-result-kanji',
    // Library browse (My Cards).
    'browse-filter',
    'browse-source-filter',
    'browse-sort',
    'browse-sort-direction',
    'browse-select-mode',
    'browse-page',
    'browse-bulk',
    'browse-card',
    // Stats dashboard.
    'stats-source',
    'stats-activity-metric',
    'stats-select-day',
    'stats-study-trouble',
    'stats-refresh',
    'stats-toggle-anki-deck',
    'stats-connect-anki',
    'stats-open-jpdb-settings',
    'stats-open-anki-settings',
    'stats-import-jpdb',
] as const;

export type NewTabAction = (typeof NEW_TAB_ACTIONS)[number];

const NEW_TAB_ACTION_NAMES: ReadonlySet<string> = new Set<string>(NEW_TAB_ACTIONS);

/** Narrows a value read back out of the DOM to the known action vocabulary. */
export function isNewTabAction(value: string | null | undefined): value is NewTabAction {
    return typeof value === 'string' && NEW_TAB_ACTION_NAMES.has(value);
}

/**
 * Identity at runtime; at compile time it pins a render site's action name to
 * the union. Use it wherever the name is written into the DOM.
 */
export function newTabAction(action: NewTabAction): NewTabAction {
    return action;
}

/** Attribute text for template-literal markup. */
export function newTabActionAttr(action: NewTabAction): string {
    return `data-newtab-action="${action}"`;
}

/** `[data-newtab-action="…"]` selector for query sites. */
export function newTabActionSelector(action: NewTabAction, suffix = ''): string {
    return `[data-newtab-action="${action}"]${suffix}`;
}

/** Reads the nearest action name from an element, narrowed to the union. */
export function nearestNewTabAction(target: Element | null | undefined): NewTabAction | undefined {
    const owner = target?.closest<HTMLElement>('[data-newtab-action]');
    const action = owner?.dataset.newtabAction;
    return isNewTabAction(action) ? action : undefined;
}
