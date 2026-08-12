import type { InterfaceLanguage } from '../app/types';
import { userFacingErrorText } from '../app/user-facing-errors';

export interface CardActionFailure {
    logger: { warn(message: string, ...args: unknown[]): void };
    warning: string;
    action: string;
    term: string;
    language: InterfaceLanguage;
    toast(message: string): void;
}

/** Owns the disabled/error/finalization lifecycle shared by card-action surfaces. */
export async function runCardActionOperation(
    button: HTMLButtonElement,
    run: () => Promise<void>,
    fail: (error: unknown) => void,
    finish: () => void,
): Promise<void> {
    button.disabled = true;
    try {
        await run();
    } catch (error) {
        fail(error);
    } finally {
        finish();
        button.disabled = false;
    }
}

export function reportCardActionFailure(failure: CardActionFailure, error: unknown): void {
    failure.logger.warn(failure.warning, { action: failure.action, term: failure.term }, error);
    failure.toast(userFacingErrorText(failure.language, 'actionFailed', error));
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
