import type { ReaderSettings } from '../app/types';

/**
 * The furigana mode stamp: data-yomu-furigana-mode on an ancestor of the text.
 * VisiblePageScanner stamps the page with the mode that shows readings at rest
 * ('all' or 'known-status'); Yomu-owned example rows stamp 'all' on themselves.
 */
const FORCES_ALL_SELECTOR = '[data-yomu-furigana-mode="all"]';
const KEEPS_IN_FLOW_SELECTOR = `${FORCES_ALL_SELECTOR},[data-yomu-furigana-mode="known-status"]`;

/** 'all' overrides which words get a reading. */
export function targetForcesAllFurigana(target: Element): boolean {
    return Boolean(target.closest(FORCES_ALL_SELECTOR));
}

/**
 * Either mode that shows readings at rest puts them back in flow on content
 * whose collector suppressed them (prose with links), so the reading lane does
 * not change with which words are hidden.
 */
export function targetKeepsInFlowReadings(target: Element): boolean {
    return Boolean(target.closest(KEEPS_IN_FLOW_SELECTOR));
}

/** The settings a word under the stamp renders with: 'all' shows every reading. */
export function furiganaSettingsForTarget(settings: ReaderSettings, target: Element): ReaderSettings {
    if (!targetForcesAllFurigana(target)) return settings;
    if (settings.showFurigana && settings.furiganaMode === 'all') return settings;
    return { ...settings, showFurigana: true, furiganaMode: 'all' };
}
