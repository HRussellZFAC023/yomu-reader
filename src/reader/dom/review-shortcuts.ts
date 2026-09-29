import type { ReaderSettings } from '../app/types';
import { matchesShortcut } from '../settings/shortcuts';
import { readCardCommandCapability, privateReviewGradeAllowed } from './private-command-capabilities';
import { reviewGradeScale } from '../cards/grade-scale';
import { isEditableEventContext } from '../ui/browser';
import { trustedReaderEventHandler } from '../ui/trusted-interaction';

/** DOM selects a control; only its private binding supplies the grade/key. */
export function reviewShortcutButton(root: ParentNode | null | undefined, event: KeyboardEvent, settings: ReaderSettings): HTMLButtonElement | undefined {
    if (!settings.enableReviews) return undefined;
    return [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => {
        if (button.disabled || button.closest('[hidden]')) return false;
        const command = readCardCommandCapability(button);
        if (command?.action !== 'grade' || !command.gradeShortcut) return false;
        if (!privateReviewGradeAllowed(button, command)) return false;
        return matchesShortcut(event, settings.shortcuts[command.gradeShortcut]);
    });
}

/** Own the overlay's grade keys, including unused positions, until it closes. */
export function installLookupGradeShortcuts(
    popover: HTMLElement,
    signal: AbortSignal,
    isActive: () => boolean,
    getSettings: () => ReaderSettings,
    submit: (button: HTMLButtonElement) => void,
): void {
    document.addEventListener('keydown', trustedReaderEventHandler((event: KeyboardEvent) => {
        if (!popover.isConnected || !isActive() || event.defaultPrevented || isEditableEventContext(event)) return;
        const settings = getSettings();
        const button = reviewShortcutButton(popover, event, settings);
        const gradeKey = [false, true].some(twoButtonReviews => reviewGradeScale({ ...settings, twoButtonReviews }).shortcuts
            .some(([key]) => matchesShortcut(event, settings.shortcuts[key])));
        if (!button && !gradeKey) return;
        // An unused fifth key must not grade the Study card underneath.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (button) submit(button);
    }), { capture: true, signal });
}
