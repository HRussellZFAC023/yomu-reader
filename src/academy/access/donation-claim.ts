const STRIPE_SESSION_ID = /^cs_[A-Za-z0-9_]{8,255}$/u;
const CLASS_CODE = /^[A-Z0-9-]{4,64}$/u;
const DEFAULT_DELAYS_MS = [0, 750, 1_250, 2_000, 3_000, 4_000, 5_000] as const;

export interface DonationReturn {
    readonly sessionId: string;
}

export type DonationClaimResult =
    | { readonly status: 'paid'; readonly code: string }
    | { readonly status: 'pending' }
    | { readonly status: 'unavailable' };

export interface DonationClaimService {
    consumeReturn(): DonationReturn | null;
    claim(sessionId: string, signal: AbortSignal): Promise<DonationClaimResult>;
}

interface DonationClaimDependencies {
    readonly request?: typeof fetch;
    readonly currentUrl?: () => string;
    readonly replaceHistory?: (url: string) => void;
    readonly delaysMs?: readonly number[];
    readonly wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Consumes the short-lived Stripe return proof without putting the generated
 * class code in history, storage, logs, or another URL.
 */
export function createDonationClaimService(dependencies: DonationClaimDependencies = {}): DonationClaimService {
    const request = dependencies.request ?? fetch;
    const currentUrl = dependencies.currentUrl ?? (() => window.location.href);
    const replaceHistory = dependencies.replaceHistory
        ?? (url => window.history.replaceState(window.history.state, '', url));
    const delays = dependencies.delaysMs ?? DEFAULT_DELAYS_MS;
    const wait = dependencies.wait ?? abortableWait;
    let consumedReturn: DonationReturn | null | undefined;

    return {
        consumeReturn() {
            if (consumedReturn !== undefined) return consumedReturn;
            const url = new URL(currentUrl());
            const checkout = url.searchParams.get('checkout');
            const sessionId = url.searchParams.get('session_id');
            const hasReturnParameters = url.searchParams.has('checkout') || url.searchParams.has('session_id');
            if (!hasReturnParameters) return (consumedReturn = null);

            url.searchParams.delete('checkout');
            url.searchParams.delete('session_id');
            replaceHistory(`${url.pathname}${url.search}${url.hash}`);

            if (checkout !== 'success' || !sessionId || !STRIPE_SESSION_ID.test(sessionId)) return (consumedReturn = null);
            return (consumedReturn = { sessionId });
        },

        async claim(sessionId, signal) {
            if (!STRIPE_SESSION_ID.test(sessionId)) return { status: 'unavailable' };
            let sawRetryableFailure = false;
            for (const delay of delays) {
                try {
                    await wait(delay, signal);
                    const response = await request(`/academy/api/claim?session_id=${encodeURIComponent(sessionId)}`, {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        signal,
                        headers: { accept: 'application/json' },
                    });
                    if (response.status === 202) continue;
                    if (!response.ok) {
                        if (response.status >= 500 || response.status === 429) {
                            sawRetryableFailure = true;
                            continue;
                        }
                        return { status: 'unavailable' };
                    }
                    const payload = await response.json() as { status?: unknown; code?: unknown };
                    if (payload.status !== 'paid' || typeof payload.code !== 'string' || !CLASS_CODE.test(payload.code)) {
                        return { status: 'unavailable' };
                    }
                    return { status: 'paid', code: payload.code };
                } catch (error) {
                    if (signal.aborted) throw error;
                    sawRetryableFailure = true;
                }
            }
            return { status: sawRetryableFailure ? 'unavailable' : 'pending' };
        },
    };
}

function abortableWait(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (delayMs <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const finish = () => {
            signal.removeEventListener('abort', abort);
            resolve();
        };
        const abort = () => {
            window.clearTimeout(timeout);
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        const timeout = window.setTimeout(finish, delayMs);
        signal.addEventListener('abort', abort, { once: true });
    });
}
