import { applyTokensToScanTarget, collectFragmentTextTargetsIn, type ScanTextTarget } from './dom';
import type { JPDBToken, ReaderSettings } from './types';

const PARSEABLE_SELECTOR = '.jpdb-reader-parseable';
const SETTINGS_PARSE_EXCLUDE_SELECTOR = [
    '.jpdb-reader-settings-actions',
    '.jpdb-reader-settings-drag-handle',
    '[data-settings-preview-lookup]',
    '[hidden]',
    '[aria-hidden="true"]',
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
    '.jpdb-reader-help',
    '.jpdb-reader-help-card p',
    '.jpdb-reader-help-glossary dd',
    '.jpdb-reader-dictionary-row-help',
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
    const targets = parseRoots
        .flatMap(parseRoot => collectFragmentTextTargetsIn(parseRoot, limit, false, '', { includeReaderRoot: true, allowUiText: true, heading: true, minLength: 1 }))
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
    return root.dataset.jpdbReaderParseKey === parseKey
        && Boolean(root.querySelector(`${PARSEABLE_SELECTOR} .jpdb-reader-word`));
}

export function applyNestedParsePlan(plan: NestedParsePlan, parsed: JPDBToken[][], settings: ReaderSettings): void {
    plan.targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], settings));
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

function nestedParseKey(targets: ScanTextTarget[]): string {
    return targets.map(target => target.text).join('\n\n');
}
