import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settingsCss = readFileSync('src/reader/styles/settings.css', 'utf8').replace(/\s+/gu, ' ');

describe('recommended dictionaries in Sources', () => {
    // On a phone a full-width Install under every name made eight suggestions
    // about a thousand pixels tall.
    it('keeps each one on one row, Install beside its name, at every width', () => {
        const itemRules = [...settingsCss.matchAll(/([^{}]*)\{([^{}]*)\}/gu)]
            .filter(([, selectors]) => selectors!.split(',').some(selector => selector.trim() === '.jpdb-reader-recommended-item'))
            .map(([, , body]) => body!);

        expect(itemRules.length).toBeGreaterThan(1);
        for (const body of itemRules) expect(body).not.toMatch(/grid-template-columns: 1fr;/u);
    });
});
