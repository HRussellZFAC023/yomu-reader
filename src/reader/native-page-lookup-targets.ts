import { isJpdbHost } from './jpdb-page-targets';

const READER_DOCUMENT_CLICK_IGNORE_SELECTOR = [
    '[data-jpdb-reader-root] [data-action="kanji"][data-kanji]',
    '[data-yomu-jpdb-addon] [data-action]',
    '[data-settings-preview-lookup]',
    '.jpdb-reader-settings .jpdb-reader-word',
].join(',');

const NATIVE_PAGE_LOOKUP_BLOCK_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    '[role="button"]',
    '[contenteditable="true"]',
    '[data-audio]',
    '[onclick]',
    '.subsection-immersion-kit',
    '[class*="immersion" i]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class~="play" i]',
    '[class*="-play" i]',
    '[class*="play-" i]',
    '[class~="control" i]',
    '[class*="-control" i]',
    '[class*="control-" i]',
    '[class~="button" i]',
    '[class*="-button" i]',
    '[class*="button-" i]',
    '[class~="icon" i]',
    '[class*="-icon" i]',
    '[class*="icon-" i]',
].join(',');

export function shouldIgnoreDocumentClickTarget(target: EventTarget | null): boolean {
    return Boolean(closestTarget(target, READER_DOCUMENT_CLICK_IGNORE_SELECTOR))
        || isNativePageLookupBlocked(target);
}

export function isNativePageLookupBlocked(target: EventTarget | null): boolean {
    if (!isJpdbHost() || !target || closestTarget(target, '[data-jpdb-reader-root]')) return false;
    if (isActiveNativePageReaderWord(target)) return false;
    return Boolean(closestTarget(target, NATIVE_PAGE_LOOKUP_BLOCK_SELECTOR));
}

function isActiveNativePageReaderWord(target: EventTarget): boolean {
    const word = closestTarget<HTMLElement>(target, '.jpdb-reader-word');
    return Boolean(word
        && word.dataset.jpdbReaderPassive !== 'true'
        && !closestTarget(word, '[data-jpdb-reader-root]'));
}

function closestTarget<T extends Element = Element>(target: EventTarget | null, selector: string): T | null {
    const closest = (target as { closest?: (selector: string) => T | null } | null)?.closest;
    return typeof closest === 'function' ? closest.call(target, selector) : null;
}
