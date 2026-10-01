import { NEW_TAB_STUDY_INTERACTIVE_SELECTOR } from './controller-config';

/** Which keys reveal a Study card, and which targets keep the keyboard for themselves. */
export function isNewTabRevealKey(key: string): boolean {
    return key === ' ' || isNewTabEnterRevealKey(key);
}

export function isNewTabEnterRevealKey(key: string): boolean {
    return key === 'Enter';
}

export function isNewTabStudyInteractiveTarget(target: HTMLElement): boolean {
    return Boolean(target.closest(NEW_TAB_STUDY_INTERACTIVE_SELECTOR));
}

export function isNewTabKeyboardCaptureBlockedTarget(target: HTMLElement): boolean {
    return Boolean(target.closest([
        'input',
        'select',
        'textarea',
        '[contenteditable]:not([contenteditable="false"])',
        '[data-newtab-search]',
        '[role="search"]',
        '[data-settings-panel]',
        '.jpdb-reader-settings',
    ].join(',')));
}
