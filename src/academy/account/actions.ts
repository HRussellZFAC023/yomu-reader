export const ACADEMY_ACCOUNT_ACTION_EVENT = 'academy:account-action';

export type AcademyAccountAction =
    | { readonly kind: 'redeem'; readonly code: string }
    | { readonly kind: 'recovery' }
    | { readonly kind: 'initialize-profile' };

interface AcademyAccountActionDetail {
    readonly action: AcademyAccountAction;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
}

/** Keep account mutations out of the screen without coupling them to world routing. */
export function requestAcademyAccountAction(target: EventTarget, action: AcademyAccountAction): Promise<void> {
    return new Promise((resolve, reject) => {
        const event = new CustomEvent<AcademyAccountActionDetail>(ACADEMY_ACCOUNT_ACTION_EVENT, {
            bubbles: true,
            cancelable: true,
            detail: { action, resolve, reject },
        });
        if (target.dispatchEvent(event)) reject(new Error('Account actions are unavailable in this Academy host.'));
    });
}

export function academyAccountActionDetail(event: Event): AcademyAccountActionDetail | null {
    if (!(event instanceof CustomEvent) || event.type !== ACADEMY_ACCOUNT_ACTION_EVENT) return null;
    const value = event.detail as Partial<AcademyAccountActionDetail> | null;
    if (!value || typeof value.resolve !== 'function' || typeof value.reject !== 'function') return null;
    if (value.action?.kind === 'recovery' || value.action?.kind === 'initialize-profile') return value as AcademyAccountActionDetail;
    if (value.action?.kind === 'redeem' && typeof value.action.code === 'string') return value as AcademyAccountActionDetail;
    return null;
}
