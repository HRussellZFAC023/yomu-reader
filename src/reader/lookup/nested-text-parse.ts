import { applyTokensToScanTarget, collectFragmentTextTargetsIn, HAS_JAPANESE, isCurrentScanTarget, readerWordSurfaceText, unwrapReaderWords, type ScanTextTarget } from '../dom/index';
import type { JPDBToken, ReaderSettings } from '../app/types';

const PARSEABLE_SELECTOR = '.jpdb-reader-parseable';
const READER_WORD_SELECTOR = '.jpdb-reader-word';
const EXAMPLE_TARGET_SELECTOR = '.jpdb-reader-example-target';
const SETTINGS_PARSE_EXCLUDE_SELECTOR = [
    '.jpdb-reader-settings-actions',
    '.jpdb-reader-settings-drag-handle',
    '[data-settings-preview-lookup]',
    '[hidden]',
    '[aria-hidden="true"]',
    '[data-anki-setup-help]',
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
const SETTINGS_SELECT_OPTIONS_META_SELECTOR = '[data-settings-select-options-meta]';
const SETTINGS_PARSE_CHILD_EXCLUDE_SELECTOR = [
    SETTINGS_PARSE_EXCLUDE_SELECTOR,
    SETTINGS_SELECT_OPTIONS_META_SELECTOR,
].join(',');
const SETTINGS_PARSE_ROOT_SELECTOR = [
    'h2',
    '[data-settings-panel]:not([hidden]) legend',
    '[data-settings-panel]:not([hidden]) label',
    '[data-settings-panel]:not([hidden]) .jpdb-reader-local-title',
    '[data-settings-panel]:not([hidden]) .jpdb-reader-help:not(.jpdb-reader-status-line)',
    `[data-settings-panel]:not([hidden]) ${SETTINGS_SELECT_OPTIONS_META_SELECTOR}`,
].join(',');

export interface NestedParsePlan {
    targets: ScanTextTarget[];
    parseKey: string;
}

export function nestedTextParsePlan(root: HTMLElement, limit: number): NestedParsePlan | null {
    const parseRoots = root.matches(PARSEABLE_SELECTOR)
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>(PARSEABLE_SELECTOR));
    const renderedParseKey = renderedNestedParseKey(parseRoots);
    if (renderedParseKey && nestedParseAlreadyScheduled(root, renderedParseKey)) return null;
    normalizePartiallyParsedRoots(root, parseRoots);
    const targets = parseRoots
        .flatMap(parseRoot => collectFragmentTextTargetsIn(parseRoot, limit, false, '', {
            includeReaderRoot: true,
            allowUiText: true,
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
        .filter(parseRoot => !parseRoot.closest(SETTINGS_PARSE_EXCLUDE_SELECTOR))
        .filter(parseRoot => !parseRoot.closest('[hidden], [aria-hidden="true"]'))
        .flatMap(parseRoot => collectFragmentTextTargetsIn(
            parseRoot,
            limit,
            false,
            parseRoot.matches(SETTINGS_SELECT_OPTIONS_META_SELECTOR) ? SETTINGS_PARSE_EXCLUDE_SELECTOR : SETTINGS_PARSE_CHILD_EXCLUDE_SELECTOR,
            {
                includeReaderRoot: true,
                includeFormChrome: true,
                allowUiText: true,
                heading: true,
                minLength: 2,
            },
        ))
        .slice(0, limit);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
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

function hasUnparsedJapaneseText(parseRoot: HTMLElement): boolean {
    const walker = document.createTreeWalker(parseRoot, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
            const parent = node.parentElement;
            if (!parent || parent.closest(READER_WORD_SELECTOR)) return NodeFilter.FILTER_REJECT;
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
