import { applyTokensToScanTarget, collectFormControlTextTargetsIn, collectFragmentTextTargetsIn, HAS_JAPANESE, isCurrentScanTarget, readerWordSurfaceText, unwrapReaderWords, type ScanTextTarget } from '../dom/index';
import type { JPDBToken, ReaderSettings } from '../app/types';

const PARSEABLE_SELECTOR = '.jpdb-reader-parseable';
const POPOVER_SUMMARY_PARSE_SELECTOR = '.jpdb-reader-popover summary.jpdb-reader-example-summary';
const NESTED_PARSE_ROOT_SELECTOR = [
    PARSEABLE_SELECTOR,
    POPOVER_SUMMARY_PARSE_SELECTOR,
].join(',');
const READER_WORD_SELECTOR = '.jpdb-reader-word';
const EXAMPLE_TARGET_SELECTOR = '.jpdb-reader-example-target';
const NESTED_PARSE_EXCLUDE_SELECTOR = '.gloss-image-link';
// One pass should cover a whole settings panel: at 48 the larger panels
// (Appearance) needed several interaction-triggered refreshes before every
// label carried furigana, which read as "annotation only appears on click".
// The per-pass parse work is bounded by the settings surface itself.
export const SETTINGS_PARSE_TARGET_LIMIT = 120;
const SETTINGS_PARSE_EXCLUDE_SELECTOR = [
    '.jpdb-reader-settings-actions',
    '.jpdb-reader-settings-drag-handle',
    '.jpdb-reader-status-line',
    '[data-settings-preview-lookup]',
    '[hidden]:not([data-settings-panel])',
    '[aria-hidden="true"]',
    '[data-anki-setup-help]',
    '.jpdb-reader-audio-source-choice',
    '[data-settings-select-options-meta]',
    'a[href]',
    'button',
    'input',
    'option',
    'select',
    'svg',
    'textarea',
    'use',
    '.jpdb-reader-order-toggle',
    '.footer',
].join(',');
const SETTINGS_FORM_CONTROL_PARSE_EXCLUDE_SELECTOR = [
    '.jpdb-reader-settings-actions',
    '.jpdb-reader-settings-drag-handle',
    '.jpdb-reader-status-line',
    '[data-settings-preview-lookup]',
    '[hidden]:not([data-settings-panel])',
    '[aria-hidden="true"]',
    '[data-anki-setup-help]',
    '.jpdb-reader-audio-source-choice',
    'svg',
    'use',
    '.jpdb-reader-order-toggle',
    '.footer',
].join(',');
const SETTINGS_CHROME_PARSE_ROOT_SELECTOR = [
    '.jpdb-reader-theme-title',
    '[role="tab"]',
    '.jpdb-reader-settings-actions .jpdb-reader-btn',
    '.jpdb-reader-help-actions .jpdb-reader-btn',
    '.footer button',
].join(',');
const SETTINGS_CHROME_PARSE_CHILD_EXCLUDE_SELECTOR = [
    '[hidden]',
    '[aria-hidden="true"]',
    'input',
    'option',
    'select',
    'svg',
    'textarea',
    'use',
    '.jpdb-reader-word',
].join(',');
const SETTINGS_PARSE_CHILD_EXCLUDE_SELECTOR = SETTINGS_PARSE_EXCLUDE_SELECTOR;
const SETTINGS_PARSE_ROOT_SELECTOR = [
    'h2',
    '.jpdb-reader-settings-search>label',
    '[data-settings-search-empty]',
    '[data-settings-panel]',
    SETTINGS_CHROME_PARSE_ROOT_SELECTOR,
].join(',');

type FragmentParseOptions = Parameters<typeof collectFragmentTextTargetsIn>;
type NestedParseTargetOptions = (FragmentParseOptions[4]) & {
    includeFormControls?: boolean;
    formControlExcludeSelector?: string;
    formControlSelectTextMode?: 'options' | 'selected';
};

export interface NestedParsePlan {
    targets: ScanTextTarget[];
    parseKey: string;
}

export function nestedTextParsePlan(root: HTMLElement, limit: number): NestedParsePlan | null {
    const parseRoots = root.matches(NESTED_PARSE_ROOT_SELECTOR)
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>(NESTED_PARSE_ROOT_SELECTOR));
    const renderedParseKey = renderedNestedParseKey(parseRoots);
    if (renderedParseKey && nestedParseAlreadyScheduled(root, renderedParseKey)) return null;
    normalizePartiallyParsedRoots(root, parseRoots);
    const targets = parseRoots
        .flatMap(parseRoot => nestedParseTargetsIn(parseRoot, limit, false, NESTED_PARSE_EXCLUDE_SELECTOR, {
            includeReaderRoot: true,
            allowUiText: true,
            includePassiveInteractions: true,
            heading: true,
            minLength: 1,
            readerRootPassiveInteractions: true,
        }))
        .slice(0, limit);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
}

export function nestedSettingsTextParsePlan(root: HTMLElement, limit: number): NestedParsePlan | null {
    const parseRoots = root.matches(SETTINGS_PARSE_ROOT_SELECTOR)
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>(SETTINGS_PARSE_ROOT_SELECTOR));
    const targets = parseRoots
        .sort((left, right) => settingsParseRootPriority(left) - settingsParseRootPriority(right))
        .filter(parseRoot => !isExcludedSettingsParseRoot(parseRoot))
        .filter(parseRoot => !parseRoot.closest('[aria-hidden="true"]'))
        .flatMap(parseRoot => {
            const settingsChrome = isSettingsChromeParseRoot(parseRoot);
            return nestedParseTargetsIn(
                parseRoot,
                limit,
                false,
                settingsParseExcludeSelector(parseRoot),
                {
                    includeReaderRoot: true,
                    includeFormChrome: true,
                    allowUiText: true,
                    heading: true,
                    minLength: 2,
                    readerRootPassiveInteractions: true,
                    forceInlineRender: settingsChrome,
                    suppressRepaintLoopMirror: settingsChrome,
                    formControlExcludeSelector: settingsFormControlExcludeSelector(),
                    formControlSelectTextMode: 'selected',
                },
            );
        })
        .slice(0, limit);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
}

export function nestedSettingsParseAlreadyRendered(root: HTMLElement): boolean {
    if (!root.dataset.jpdbReaderParseKey) return false;
    const activePanels = Array.from(root.querySelectorAll<HTMLElement>('[data-settings-panel]:not([hidden])'));
    return activePanels.length > 0
        && activePanels.every(panel => !hasUnparsedJapaneseText(panel, SETTINGS_PARSE_EXCLUDE_SELECTOR));
}

function nestedParseTargetsIn(
    parseRoot: HTMLElement,
    limit: number,
    visibleOnly: boolean,
    excludeSelector: string,
    options: NestedParseTargetOptions,
): ScanTextTarget[] {
    const fragmentTargets = collectFragmentTextTargetsIn(parseRoot, limit, visibleOnly, excludeSelector, options);
    const remaining = Math.max(0, limit - fragmentTargets.length);
    if (options?.includeFormControls === false) return fragmentTargets;
    const controlTargets = collectFormControlTextTargetsIn(parseRoot, remaining, visibleOnly, {
        includeReaderRoot: options?.includeReaderRoot,
        excludeSelector: options?.formControlExcludeSelector ?? excludeSelector,
        selectTextMode: options?.formControlSelectTextMode,
    });
    return [...fragmentTargets, ...controlTargets];
}

function settingsParseRootPriority(parseRoot: HTMLElement): number {
    return isSettingsChromeParseRoot(parseRoot) || !parseRoot.closest('[data-settings-panel]') ? 0 : 1;
}

function isExcludedSettingsParseRoot(parseRoot: HTMLElement): boolean {
    if (parseRoot.closest('[data-jpdb-reader-surface-ignore]')) return true;
    if (parseRoot.matches('[data-settings-panel][hidden]')) return true;
    return !isSettingsChromeParseRoot(parseRoot)
        && Boolean(parseRoot.closest(SETTINGS_PARSE_EXCLUDE_SELECTOR));
}

function settingsParseExcludeSelector(parseRoot: HTMLElement): string {
    if (isSettingsChromeParseRoot(parseRoot)) return SETTINGS_CHROME_PARSE_CHILD_EXCLUDE_SELECTOR;
    return SETTINGS_PARSE_CHILD_EXCLUDE_SELECTOR;
}

function settingsFormControlExcludeSelector(): string {
    return SETTINGS_FORM_CONTROL_PARSE_EXCLUDE_SELECTOR;
}

function isSettingsChromeParseRoot(parseRoot: HTMLElement): boolean {
    return parseRoot.matches(SETTINGS_CHROME_PARSE_ROOT_SELECTOR);
}

export function nestedParseAlreadyScheduled(root: HTMLElement, parseKey: string): boolean {
    return root.dataset.jpdbReaderParseLoadingKey === parseKey
        || root.dataset.jpdbReaderParseKey === parseKey;
}

export function applyNestedParsePlan(plan: NestedParsePlan, parsed: JPDBToken[][], settings: ReaderSettings): void {
    plan.targets.forEach((target, index) => {
        if (isCurrentScanTarget(target)) applyTokensToScanTarget(target, parsed[index] ?? [], settings);
    });
}

export function clearNestedParseLoadingKey(root: HTMLElement, parseKey: string, parseLoadingId?: string): void {
    const matchesKey = root.dataset.jpdbReaderParseLoadingKey === parseKey;
    const matchesId = parseLoadingId === undefined || root.dataset.jpdbReaderParseLoadingId === parseLoadingId;
    if (!matchesKey || !matchesId) return;
    delete root.dataset.jpdbReaderParseLoadingKey;
    delete root.dataset.jpdbReaderParseLoadingId;
}

export function clearNestedParseState(root: HTMLElement): void {
    delete root.dataset.jpdbReaderParseKey;
    delete root.dataset.jpdbReaderParseLoadingKey;
    delete root.dataset.jpdbReaderParseLoadingId;
}

function normalizePartiallyParsedRoots(root: HTMLElement, parseRoots: HTMLElement[]): void {
    let changed = false;
    for (const parseRoot of parseRoots) {
        if (!shouldNormalizePartiallyParsedRoot(parseRoot)) continue;
        preserveExampleTargetMarks(parseRoot);
        changed = unwrapReaderWords(parseRoot, { includeReaderRoot: true }) > 0 || changed;
    }
    if (changed) clearNestedParseState(root);
}

function shouldNormalizePartiallyParsedRoot(parseRoot: HTMLElement): boolean {
    return Boolean(parseRoot.querySelector(READER_WORD_SELECTOR))
        && hasUnparsedJapaneseText(parseRoot);
}

function preserveExampleTargetMarks(parseRoot: HTMLElement): void {
    parseRoot.querySelectorAll<HTMLElement>(`${READER_WORD_SELECTOR}${EXAMPLE_TARGET_SELECTOR}`).forEach(word => {
        if (word.closest(`mark${EXAMPLE_TARGET_SELECTOR}`)) return;
        const mark = document.createElement('mark');
        mark.className = EXAMPLE_TARGET_SELECTOR.slice(1);
        word.replaceWith(mark);
        mark.append(word);
    });
}

function hasUnparsedJapaneseText(parseRoot: HTMLElement, excludeSelector = ''): boolean {
    const walker = document.createTreeWalker(parseRoot, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
            const parent = node.parentElement;
            if (!parent
                || parent.closest(READER_WORD_SELECTOR)
                || parent.closest('[data-jpdb-reader-surface-ignore]')
                || (excludeSelector && parent.closest(excludeSelector))) return NodeFilter.FILTER_REJECT;
            return HAS_JAPANESE.test(node.textContent || '')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });
    return Boolean(walker.nextNode());
}

function renderedNestedParseKey(parseRoots: HTMLElement[]): string {
    const renderedRoots = parseRoots
        .filter(parseRoot => parseRoot.querySelector(READER_WORD_SELECTOR))
        .map(parseRoot => readerWordSurfaceText(parseRoot).trim())
        .filter(Boolean);
    return renderedRoots.length === parseRoots.length ? renderedRoots.join('\n\n') : '';
}

function nestedParseKey(targets: ScanTextTarget[]): string {
    return targets.map(target => target.text).join('\n\n');
}
