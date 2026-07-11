// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
    archiveKeyFromEncodedPath,
    archiveObjectKeyFromEncodedPath,
    isVerifiedStripeCheckout,
} from '../../workers/yomu-academy/src/index';

describe('Academy Worker archive key resolution', () => {
    it('prefixes the R2 storage key with the uploader raw/ namespace', () => {
        // scripts/upload-academy-archive.mjs stores objects at `raw/<relpath>`, so a
        // request for the logical path must resolve to the prefixed storage key.
        expect(archiveObjectKeyFromEncodedPath('course-one/week%2001/lesson.pdf'))
            .toBe('raw/course-one/week 01/lesson.pdf');
        expect(archiveKeyFromEncodedPath('course-one/week%2001/lesson.pdf'))
            .toBe('course-one/week 01/lesson.pdf');
    });

    it('applies the same traversal guards as the logical key resolver', () => {
        for (const malicious of ['course-one/%2e%2e/private.pdf', 'course-one\\private.pdf', 'course-one//lesson.pdf', '/leading.pdf', '%E0%A4%A']) {
            expect(archiveObjectKeyFromEncodedPath(malicious)).toBeNull();
        }
    });

    it('never emits a storage key outside the raw/ prefix for accepted paths', () => {
        for (const accepted of ['a/b/c.pdf', 'genki-2024/lesson-03/worksheet.pdf', 'x.mp3']) {
            const key = archiveObjectKeyFromEncodedPath(accepted);
            expect(key).not.toBeNull();
            expect(key!.startsWith('raw/')).toBe(true);
        }
    });
});

describe('Academy Worker Stripe checkout verification', () => {
    const row = {
        claim_token_hash: 'hash',
        expires_at: Date.now() + 60_000,
        purchase_id: 'checkout_purchase',
        stripe_session_id: 'cs_test_session',
    };
    const paidSession = (priceId: string) => ({
        id: 'cs_test_session',
        client_reference_id: 'checkout_purchase',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        metadata: { academy_purchase_id: 'checkout_purchase' },
        line_items: { data: [{ price: { id: priceId } }] },
    });

    it('accepts a paid, complete session whose line item price matches config', () => {
        expect(isVerifiedStripeCheckout(paidSession('price_expected'), row, 'price_expected')).toBe(true);
    });

    it('rejects a session paying for a different price id', () => {
        expect(isVerifiedStripeCheckout(paidSession('price_cheaper'), row, 'price_expected')).toBe(false);
    });

    it('rejects a session with missing or malformed line items', () => {
        const base = paidSession('price_expected') as Record<string, unknown>;
        expect(isVerifiedStripeCheckout({ ...base, line_items: undefined }, row, 'price_expected')).toBe(false);
        expect(isVerifiedStripeCheckout({ ...base, line_items: { data: [] } }, row, 'price_expected')).toBe(false);
        expect(isVerifiedStripeCheckout({ ...base, line_items: { data: [{ price: { id: 'a' } }, { price: { id: 'b' } }] } }, row, 'price_expected')).toBe(false);
    });

    it('still enforces payment status and purchase identity alongside the price', () => {
        const unpaid = { ...paidSession('price_expected'), payment_status: 'unpaid' };
        expect(isVerifiedStripeCheckout(unpaid, row, 'price_expected')).toBe(false);
        const wrongPurchase = { ...paidSession('price_expected'), client_reference_id: 'someone_else' };
        expect(isVerifiedStripeCheckout(wrongPurchase, row, 'price_expected')).toBe(false);
    });
});
