export interface DonationCheckoutService {
    start(amountGbp: number): Promise<void>;
}

export function createDonationCheckoutService(
    request: typeof fetch = fetch,
    navigate: (url: string) => void = url => window.location.assign(url),
): DonationCheckoutService {
    return {
        async start(amountGbp) {
            const response = await request('/academy/api/checkout', {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ amountGbp }),
            });
            if (!response.ok) throw new Error('Checkout could not be started.');
            const payload = await response.json() as { url?: unknown };
            if (typeof payload.url !== 'string' || !safeStripeCheckoutUrl(payload.url)) {
                throw new Error('Checkout returned an unexpected address.');
            }
            navigate(payload.url);
        },
    };
}

function safeStripeCheckoutUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com';
    } catch {
        return false;
    }
}
