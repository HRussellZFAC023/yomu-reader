import type { InterfaceLanguage } from '../app/types';
import { userFacingErrorText } from '../app/user-facing-errors';
import { withSaveWaitStatus } from '../ui/save-wait-status';

/** What a learner operated to start a card action: a button, or the "Add to deck…" dropdown. */
export type CardActionControl = HTMLButtonElement | HTMLSelectElement;

/** How a card-action surface tells the learner what happened. */
export interface CardActionFeedback {
    logger: { warn(message: string, ...args: unknown[]): void };
    warning: string;
    action: string;
    term: string;
    language: InterfaceLanguage;
    toast(message: string): void;
}

/**
 * Owns the disabled/error/finalization lifecycle shared by card-action surfaces,
 * including the status shown while a save waits for another Yomu tab.
 */
export async function runCardActionOperation(
    button: CardActionControl,
    run: () => Promise<void>,
    feedback: CardActionFeedback,
    finish: () => void,
): Promise<void> {
    const restoreFocus = keepKeyboardFocus(button);
    button.disabled = true;
    try {
        await withSaveWaitStatus(feedback.language, run);
    } catch (error) {
        reportCardActionFailure(feedback, error);
    } finally {
        finish();
        button.disabled = false;
        restoreFocus();
    }
}

// Disabling the focused button drops focus, and an action that refreshes the
// popup replaces the button and focuses the new popup itself. Either way a
// keyboard learner would lose their place, so focus returns to the same action
// unless the learner has moved on to another control meanwhile.
function keepKeyboardFocus(button: CardActionControl): () => void {
    const document = button.ownerDocument;
    const action = button.dataset.action;
    if (!action || document.activeElement !== button) return () => undefined;
    return () => {
        const active = document.activeElement;
        if (active && active !== document.body && !active.matches('.jpdb-reader-popover')) return;
        const replacement = button.isConnected
            ? button
            : [...document.querySelectorAll<HTMLButtonElement>('.jpdb-reader-popover button[data-action]')].reverse().find(candidate => candidate.dataset.action === action);
        replacement?.focus({ preventScroll: true });
    };
}

function reportCardActionFailure(feedback: CardActionFeedback, error: unknown): void {
    feedback.logger.warn(feedback.warning, { action: feedback.action, term: feedback.term }, error);
    feedback.toast(userFacingErrorText(feedback.language, 'actionFailed', error));
}

export async function refreshAfterCardAction(
    action: string,
    perform: () => Promise<boolean>,
    dismissGrade: () => void,
    refresh: () => Promise<void>,
): Promise<void> {
    if (!await perform()) return;
    if (action === 'grade') {
        dismissGrade();
        return;
    }
    await refresh();
}
