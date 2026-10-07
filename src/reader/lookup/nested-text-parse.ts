import { applyTokensToScanTarget, collectFormControlTextTargetsIn, collectFragmentTextTargetsIn, isCurrentScanTarget, readerWordSurfaceText, unwrapReaderWords, type ScanTextTarget } from '../dom/index';
import { isTargetLanguageText } from './target-text';
import type { JPDBToken, ReaderSettings } from '../app/types';

const PARSEABLE_SELECTOR = '.jpdb-reader-parseable';
const NESTED_PARSE_ROOT_SELECTOR = [
    PARSEABLE_SELECTOR,
].join(',');
const READER_WORD_SELECTOR = '.jpdb-reader-word';
const EXAMPLE_TARGET_SELECTOR = '.jpdb-reader-example-target';
const NESTED_PARSE_EXCLUDE_SELECTOR = '.gloss-image-link';

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

export function nestedTextParsePlan(
    root: HTMLElement,
    limit: number,
    options: { excludeProviderExamples?: boolean } = {},
): NestedParsePlan | null {
    const discoveredRoots = (root.matches(NESTED_PARSE_ROOT_SELECTOR)
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>(NESTED_PARSE_ROOT_SELECTOR)))
        .filter(parseRoot => !parseRoot.closest('.jpdb-reader-settings'));
    const parseRoots = options.excludeProviderExamples
        ? discoveredRoots.filter(parseRoot => !parseRoot.matches('[data-provider-example-sentence]'))
        : discoveredRoots;
    const renderedParseKey = renderedNestedParseKey(parseRoots);
    if (renderedParseKey && nestedParseAlreadyScheduled(root, renderedParseKey)) return null;
    normalizePartiallyParsedRoots(root, parseRoots);
    const targets = [...parseRoots]
        .sort((left, right) => providerExamplePriority(left) - providerExamplePriority(right))
        .flatMap(parseRoot => nestedParseTargetsIn(parseRoot, limit, false, NESTED_PARSE_EXCLUDE_SELECTOR, {
            includeReaderRoot: true,
            allowUiText: true,
            includePassiveInteractions: true,
            heading: true,
            minLength: 1,
            readerRootPassiveInteractions: true,
            parseSurfaceIgnoredRoot: true,
        }))
        .slice(0, limit);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
}

function providerExamplePriority(parseRoot: HTMLElement): number {
    return parseRoot.matches('[data-provider-example-sentence]') ? 0 : 1;
}

export function providerExampleTextParsePlan(root: HTMLElement, limit: number): NestedParsePlan | null {
    const parseRoots = root.matches('[data-provider-example-sentence]')
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>('[data-provider-example-sentence]'));
    if (!parseRoots.length) return null;
    // Provider sentences contain a pre-rendered target word. A provider-only
    // pass must normalize that partial render before checking for work, or the
    // target alone makes the sentence look fully parsed and strands the rest
    // of the row without readings.
    normalizePartiallyParsedRoots(root, parseRoots);
    const targets = parseRoots
        .flatMap(parseRoot => nestedParseTargetsIn(parseRoot, limit, false, NESTED_PARSE_EXCLUDE_SELECTOR, {
            includeReaderRoot: true,
            allowUiText: true,
            includePassiveInteractions: true,
            heading: true,
            minLength: 1,
            readerRootPassiveInteractions: true,
            parseSurfaceIgnoredRoot: true,
        }))
        .slice(0, limit);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
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

export function nestedParseAlreadyScheduled(root: HTMLElement, parseKey: string): boolean {
    return root.dataset.jpdbReaderParseLoadingKey === parseKey
        || root.dataset.jpdbReaderParseKey === parseKey;
}

export function applyNestedParsePlan(plan: NestedParsePlan, parsed: JPDBToken[][], settings: ReaderSettings): void {
    plan.targets.forEach((target, index) => {
        if (isCurrentScanTarget(target)) applyTokensToScanTarget(target, parsed[index] ?? [], settings);
    });
}

interface NestedParseTicket {
    parseKey: string;
    id: string;
    abandon: () => void;
}

const inFlightNestedParseTickets = new WeakMap<HTMLElement, NestedParseTicket>();

/**
 * Loads one plan under the root's loading ticket and paints it only while that
 * ticket is still the root's. Resolves false when the ticket was cleared first:
 * whatever cleared it re-rendered the root and asks for its own parse.
 */
export async function parseUnderNestedTicket<T>(
    root: HTMLElement,
    parseKey: string,
    load: () => Promise<T>,
    paint: (result: T) => void,
): Promise<boolean> {
    let abandon!: () => void;
    const abandoned = new Promise<void>(resolve => { abandon = resolve; });
    const ticket = { parseKey, id: `${Date.now()}:${Math.random()}`, abandon };
    root.dataset.jpdbReaderParseLoadingKey = parseKey;
    root.dataset.jpdbReaderParseLoadingId = ticket.id;
    inFlightNestedParseTickets.set(root, ticket);
    try {
        const result = await Promise.race([load(), abandoned]);
        if (!ownsNestedParseTicket(root, ticket)) return false;
        paint(result as T);
    } catch {
    } finally {
        if (inFlightNestedParseTickets.get(root) === ticket) inFlightNestedParseTickets.delete(root);
        clearNestedParseLoadingKey(root, parseKey, ticket.id);
    }
    return true;
}

/**
 * A re-render clears the root's ticket and then asks for a new parse. Stop the
 * old pass waiting on a result it can no longer paint, so the new request runs
 * at once. Its load keeps going and fills the parse cache for the new pass.
 */
export function abandonStaleNestedParse(root: HTMLElement): void {
    const ticket = inFlightNestedParseTickets.get(root);
    if (ticket && !ownsNestedParseTicket(root, ticket)) ticket.abandon();
}

function ownsNestedParseTicket(root: HTMLElement, ticket: NestedParseTicket): boolean {
    return root.dataset.jpdbReaderParseLoadingKey === ticket.parseKey
        && root.dataset.jpdbReaderParseLoadingId === ticket.id;
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
            return isTargetLanguageText(node.textContent || '')
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
