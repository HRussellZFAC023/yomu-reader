import { isJpdbHost } from '../jpdb/jpdb-page-targets';

const READER_DOCUMENT_CLICK_IGNORE_SELECTOR = [
    '[data-jpdb-reader-surface-ignore]',
    '[data-jpdb-reader-interaction-ignore]',
    '[data-jpdb-reader-root] [data-action="kanji"][data-kanji]',
    '[data-yomu-jpdb-addon] [data-action]',
    '[data-settings-preview-lookup]',
    '.jpdb-reader-settings .jpdb-reader-word',
    // Immersion translations own their tap. In particular, touch/pen control
    // activation dispatches a click on pointerup; letting the document lookup
    // path intercept that click made the text reveal only for the pressed
    // moment (or require repeated taps) on JPDB/Jiten page addons.
    '[data-jpdb-reader-root] .jpdb-reader-example-translation',
    // The welcome panel owns all of its lookups (OnboardingController's click
    // handler); the document path's point-text candidate lookup would otherwise
    // stopPropagation on clicks over annotated words inside the panel's action
    // buttons and swallow the buttons' own handlers.
    '.jpdb-reader-onboarding',
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

// Native controls own a normal tap even when the page implements them with
// ARIA roles instead of <button>. Keeping the complete interactive role family
// here prevents passive annotations inside player menus, tabs, and listboxes
// from opening Yomu instead of activating the host control.
const NATIVE_CLICKABLE_SELECTOR = [
    'a[href]',
    'button',
    'summary',
    '[onclick]',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="tab"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
].join(',');
const READER_SURFACE_SELECTOR = '[data-jpdb-reader-root], .jpdb-reader-popover';

export function nativeClickableAncestor(target: EventTarget | null): HTMLElement | null {
    const link = navigableLinkAncestor(target);
    if (link) return link;
    if (target && isJpdbHost() && isActiveNativePageReaderWord(target)) return null;
    const clickable = closestTarget<HTMLElement>(target, NATIVE_CLICKABLE_SELECTOR);
    if (!clickable || clickable.closest(READER_SURFACE_SELECTOR)) return null;
    if (clickable instanceof HTMLAnchorElement && !hasNavigableHref(clickable)) return null;
    return clickable;
}

function navigableLinkAncestor(target: EventTarget | null): HTMLAnchorElement | null {
    const anchor = closestTarget<HTMLAnchorElement>(target, 'a[href]');
    if (!anchor || anchor.closest(READER_SURFACE_SELECTOR) || !hasNavigableHref(anchor)) return null;
    return anchor;
}

function hasNavigableHref(anchor: HTMLAnchorElement): boolean {
    const href = anchor.getAttribute('href')?.trim() ?? '';
    return Boolean(href) && href !== '#' && !href.toLowerCase().startsWith('javascript:');
}

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
