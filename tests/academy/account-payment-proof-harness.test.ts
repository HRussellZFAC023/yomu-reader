// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error The executable proof harness is intentionally plain ESM.
import { parseRetryAfterMs, PROOF_VIEWPORTS, sanitizeEvidenceDetail, summarizeProof } from '../../scripts/academy-account-payment-proof.mjs';

describe('Academy account/payment live proof harness', () => {
    it('honors Retry-After seconds and HTTP dates with bounded delays', () => {
        const now = Date.parse('2026-07-19T12:00:00Z');
        expect(parseRetryAfterMs('17', now)).toBe(17_000);
        expect(parseRetryAfterMs('Sun, 19 Jul 2026 12:00:09 GMT', now)).toBe(9_000);
        expect(parseRetryAfterMs('invalid', now, 23_000)).toBe(23_000);
        expect(parseRetryAfterMs('99999', now)).toBe(10 * 60_000);
        expect(parseRetryAfterMs('0', now)).toBe(1_000);
    });

    it('redacts known secrets, cookies, Stripe ids, query ids, and UUIDs', () => {
        const code = 'YOMU-SUPER-SECRET';
        const cookie = 'cookie-secret-value';
        const detail = [
            code,
            `__Host-academy_claim=${cookie};`,
            'cs_test_abc123456789',
            'session_id=cs_test_other123456',
            '019f79e8-e39d-79b3-8c6c-a44adb87fb65',
        ].join(' ');
        const safe = sanitizeEvidenceDetail(detail, [code, cookie]);
        expect(safe).not.toContain(code);
        expect(safe).not.toContain(cookie);
        expect(safe).not.toContain('abc123456789');
        expect(safe).not.toContain('other123456');
        expect(safe).not.toContain('019f79e8');
        expect(safe).toContain('cs_test_<redacted>');
    });

    it('treats blocked provider gates as incomplete without calling them passes', () => {
        expect(summarizeProof([
            { outcome: 'pass' },
            { outcome: 'info' },
            { outcome: 'blocked' },
        ])).toEqual({ pass: 1, fail: 0, blocked: 1, info: 1, complete: false });
        expect(summarizeProof([{ outcome: 'pass' }]).complete).toBe(true);
    });

    it('locks the required desktop and mobile proof viewports', () => {
        expect(PROOF_VIEWPORTS.desktop).toEqual({ width: 1440, height: 900 });
        expect(PROOF_VIEWPORTS.mobile).toEqual({ width: 390, height: 844 });
    });
});
