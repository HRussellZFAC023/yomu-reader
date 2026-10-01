import type { InterfaceLanguage } from '../app/types';
import { userFacingErrorText } from '../app/user-facing-errors';
import { withSaveWaitStatus } from '../ui/save-wait-status';

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
    button: HTMLButtonElement,
    run: () => Promise<void>,
    feedback: CardActionFeedback,
    finish: () => void,
): Promise<void> {
    button.disabled = true;
    try {
        await withSaveWaitStatus(feedback.language, run);
    } catch (error) {
        reportCardActionFailure(feedback, error);
    } finally {
        finish();
        button.disabled = false;
    }
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
