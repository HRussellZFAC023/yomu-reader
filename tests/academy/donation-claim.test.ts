import { createDonationClaimService, type DonationClaimService } from '../../src/academy/access/donation-claim';
import { renderAccessScreen } from '../../src/academy/ui/access-screen';

afterEach(() => {
    document.body.replaceChildren();
});

describe('Academy donation return claim', () => {
    it('consumes the Stripe return proof and preserves unrelated route state', () => {
        const replaceHistory = vi.fn();
        const service = createDonationClaimService({
            currentUrl: () => 'https://yomureader.com/academy/?qa-run=paid&checkout=success&session_id=cs_test_12345678#door',
            replaceHistory,
        });

        expect(service.consumeReturn()).toEqual({ sessionId: 'cs_test_12345678' });
        expect(service.consumeReturn()).toEqual({ sessionId: 'cs_test_12345678' });
        expect(replaceHistory).toHaveBeenCalledWith('/academy/?qa-run=paid#door');
        expect(replaceHistory).toHaveBeenCalledTimes(1);
        expect(replaceHistory.mock.calls[0][0]).not.toContain('session_id');
    });

    it('scrubs malformed or cancelled return parameters without making a claim', () => {
        const replaceHistory = vi.fn();
        const service = createDonationClaimService({
            currentUrl: () => 'https://yomureader.com/academy/?checkout=cancelled&session_id=not-stripe&theme=warm',
            replaceHistory,
        });

        expect(service.consumeReturn()).toBeNull();
        expect(replaceHistory).toHaveBeenCalledWith('/academy/?theme=warm');
    });

    it('polls pending fulfilment within a fixed bound and accepts only a valid paid code', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 202 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'paid', code: 'ABCD-EFGH-JKMP-QRST' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));
        const service = createDonationClaimService({ request, delaysMs: [0, 0] });

        await expect(service.claim('cs_test_12345678', new AbortController().signal)).resolves.toEqual({
            status: 'paid',
            code: 'ABCD-EFGH-JKMP-QRST',
        });
        expect(request).toHaveBeenCalledTimes(2);
        expect(request).toHaveBeenLastCalledWith('/academy/api/claim?session_id=cs_test_12345678', expect.objectContaining({
            credentials: 'include',
            cache: 'no-store',
            method: 'GET',
        }));
    });

    it('stops after the configured attempts and rejects malformed claim data', async () => {
        const pending = vi.fn(async () => new Response('{}', { status: 202 }));
        const bounded = createDonationClaimService({ request: pending, delaysMs: [0, 0, 0] });
        await expect(bounded.claim('cs_test_12345678', new AbortController().signal)).resolves.toEqual({ status: 'pending' });
        expect(pending).toHaveBeenCalledTimes(3);

        const malformed = createDonationClaimService({
            request: vi.fn(async () => new Response(JSON.stringify({ status: 'paid', code: '<script>' }), { status: 200 })),
            delaysMs: [0],
        });
        await expect(malformed.claim('cs_test_12345678', new AbortController().signal)).resolves.toEqual({ status: 'unavailable' });
    });
});

describe('Academy donation claim access UI', () => {
    it('prefills the generated code and copies it without putting it in a URL', async () => {
        const claim: DonationClaimService = {
            consumeReturn: () => ({ sessionId: 'cs_test_12345678' }),
            claim: vi.fn(async () => ({ status: 'paid' as const, code: 'ABCD-EFGH-JKMP-QRST' })),
        };
        const copyText = vi.fn(async () => {});
        const screen = renderAccessScreen({ language: 'en', onSubmit: vi.fn(), claim, copyText });
        document.body.append(screen);

        await vi.waitFor(() => expect(screen.querySelector<HTMLInputElement>('input[name="code"]')?.value)
            .toBe('ABCD-EFGH-JKMP-QRST'));
        expect(screen.querySelector('.academy-donation-claim-status')?.textContent).toBe('Your class code is ready.');
        screen.querySelector<HTMLButtonElement>('.academy-donation-claim-copy')?.click();
        await vi.waitFor(() => expect(copyText).toHaveBeenCalledWith('ABCD-EFGH-JKMP-QRST'));
        await vi.waitFor(() => expect(screen.querySelector('.academy-donation-claim-copy')?.textContent).toBe('Copied'));
        expect(screen.innerHTML).not.toContain('cs_test_12345678');
    });

    it('offers an explicit retry after a still-pending claim', async () => {
        const claim = {
            consumeReturn: () => ({ sessionId: 'cs_test_12345678' }),
            claim: vi.fn()
                .mockResolvedValueOnce({ status: 'pending' as const })
                .mockResolvedValueOnce({ status: 'paid' as const, code: 'ABCD-EFGH-JKMP-QRST' }),
        } satisfies DonationClaimService;
        const screen = renderAccessScreen({ language: 'ja', onSubmit: vi.fn(), claim });
        document.body.append(screen);

        const retry = screen.querySelector<HTMLButtonElement>('.academy-donation-claim-retry')!;
        await vi.waitFor(() => expect(retry.hidden).toBe(false));
        expect(screen.querySelector('.academy-donation-claim-status')?.textContent).toBe('決済を確認しています。');
        retry.click();
        await vi.waitFor(() => expect(screen.querySelector<HTMLInputElement>('input[name="code"]')?.value)
            .toBe('ABCD-EFGH-JKMP-QRST'));
        expect(claim.claim).toHaveBeenCalledTimes(2);
    });

    it('aborts an in-flight claim when the access scene is disposed', async () => {
        let observedSignal: AbortSignal | undefined;
        const claim: DonationClaimService = {
            consumeReturn: () => ({ sessionId: 'cs_test_12345678' }),
            claim: vi.fn((_sessionId, signal) => {
                observedSignal = signal;
                return new Promise(() => {});
            }),
        };
        const screen = renderAccessScreen({ language: 'en', onSubmit: vi.fn(), claim });
        document.body.append(screen);
        await vi.waitFor(() => expect(observedSignal).toBeDefined());

        screen.dispatchEvent(new CustomEvent('academy:dispose'));

        expect(observedSignal?.aborted).toBe(true);
    });
});
