import { applyTokensToScanTarget, collectFragmentTextTargetsIn, type ScanTextTarget } from './dom';
import type { JPDBToken, ReaderSettings } from './types';

const PARSEABLE_SELECTOR = '.jpdb-reader-parseable';

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
    const targets = collectFragmentTextTargetsIn(root, limit, false, '', {
        includeReaderRoot: true,
        includeUiChrome: true,
        includeFormChrome: true,
        allowUiText: true,
        heading: true,
        minLength: 1,
    }).slice(0, limit);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
}

export function nestedParseAlreadyScheduled(root: HTMLElement, parseKey: string): boolean {
    return root.dataset.jpdbReaderParseKey === parseKey
        && Boolean(root.querySelector(`${PARSEABLE_SELECTOR} .jpdb-reader-word`));
}

export function applyNestedParsePlan(plan: NestedParsePlan, parsed: JPDBToken[][], settings: ReaderSettings): void {
    plan.targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], settings));
}

export function clearNestedParseLoadingKey(root: HTMLElement, parseKey: string): void {
    if (root.dataset.jpdbReaderParseLoadingKey === parseKey) delete root.dataset.jpdbReaderParseLoadingKey;
}

export function clearNestedParseState(root: HTMLElement): void {
    delete root.dataset.jpdbReaderParseKey;
    delete root.dataset.jpdbReaderParseLoadingKey;
}

function nestedParseKey(targets: ScanTextTarget[]): string {
    return targets.map(target => target.text).join('\n\n');
}
