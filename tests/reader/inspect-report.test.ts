import { describe, expect, it } from 'vitest';
import { inspectReportHtml, requestKey } from '../../scripts/lib/inspect-report.mjs';

describe('page inspection evidence', () => {
    it('does not replay another method, body or language response', () => {
        const request = { method: 'GET', url: 'https://example.test/lookup', headers: { Accept: 'application/json', Language: 'ja' } };
        const original = requestKey(request);
        expect(requestKey({ ...request, headers: { Language: 'ja', Accept: 'application/json' } })).toBe(original);
        expect(requestKey({ ...request, method: 'POST' })).not.toBe(original);
        expect(requestKey({ ...request, data: 'another word' })).not.toBe(original);
        expect(requestKey({ ...request, headers: { ...request.headers, Language: 'en' } })).not.toBe(original);
    });

    it('escapes observed page/provider text and keeps failed hovers visible', () => {
        const html = inspectReportHtml({
            url: 'https://example.test/<script>', mode: 'recorded-page replay', runtime: 'simulated GM',
            words: [{ text: '<img src=x onerror=alert(1)>', reading: 'よむ', opened: false, popupText: '<script>alert(1)</script>' }],
            errors: ['<iframe src=x>'], missingRequests: [],
        });
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('<iframe');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain('No popup');
        expect(html).toContain('recorded-page replay');
        expect(html).not.toContain('Passed');
    });
});
