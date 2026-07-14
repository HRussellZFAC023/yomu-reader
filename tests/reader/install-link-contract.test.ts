import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CANONICAL_USERSCRIPT_URL = 'https://yomureader.com/yomu.user.js';
const RELEASE_ATTACHMENT_URL_RE = /https:\/\/github\.com\/[^\s"')]+\/releases\/download\/[^\s"')]+\/yomu\.user\.js/;

describe('hosted userscript install links', () => {
    it('keeps every homepage userscript CTA on the canonical install response', () => {
        const homepage = readFileSync('docs/index.md', 'utf8');
        const userscriptUrls = Array.from(homepage.matchAll(/https:\/\/[^\s"')]+\/yomu\.user\.js/g), match => match[0]);

        expect(userscriptUrls.length).toBeGreaterThanOrEqual(2);
        expect(new Set(userscriptUrls)).toEqual(new Set([CANONICAL_USERSCRIPT_URL]));
        expect(homepage).not.toMatch(RELEASE_ATTACHMENT_URL_RE);
    });
});
