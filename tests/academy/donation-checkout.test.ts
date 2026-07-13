import { createDonationCheckoutService } from '../../src/academy/access/donation-checkout';

describe('Academy donation checkout client', () => {
    it('posts only the chosen amount and follows an allowlisted Stripe Checkout URL', async () => {
        const request = vi.fn(async () => new Response(JSON.stringify({
            url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
        const navigate = vi.fn();

        await createDonationCheckoutService(request, navigate).start(10);

        expect(request).toHaveBeenCalledWith('/academy/api/checkout', expect.objectContaining({
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({ amountGbp: 10 }),
        }));
        expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_123');
    });

    it('refuses a non-Stripe redirect even when the endpoint returns success', async () => {
        const request = vi.fn(async () => new Response(JSON.stringify({
            url: 'https://example.test/not-checkout',
        }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

        await expect(createDonationCheckoutService(request, vi.fn()).start(5))
            .rejects.toThrow('unexpected address');
    });
});
