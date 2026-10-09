import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { renderRecommendedDictionaries } from '../../src/reader/settings/dictionary-recommendations-view';

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

    // Eight bordered cards became a list of rows divided by hairlines.
    it('lists them as rows, not bordered cards', () => {
        expect(settingsCss).toContain('.jpdb-reader-recommended-item + .jpdb-reader-recommended-item { margin-top: -7px; border-top: 1px solid var(--jpdb-reader-border); }');
        const [, base] = settingsCss.match(/\.jpdb-reader-recommended-item \{([^}]*)\}/u)!;
        expect(base).not.toMatch(/border:|background:/u);
    });

    // "JMdict (en)" over "Original English" said the language twice; a line that
    // adds something (a Japanese original translated automatically) stays.
    it('drops a description that only repeats the language in the name', () => {
        const host = document.createElement('div');
        host.innerHTML = renderRecommendedDictionaries([], 'en', false);
        const seed = [...host.querySelectorAll<HTMLElement>('[data-catalog-recommendation-seed] .jpdb-reader-recommended-item')]
            .map(item => [item.querySelector('.jpdb-reader-recommended-name')?.textContent?.trim(), item.querySelector('.jpdb-reader-help')?.textContent?.trim() ?? '']);
        const jmdict = seed.find(([name]) => name === 'JMdict (en)');
        expect(jmdict?.[1]).toBe('');
        expect(seed.some(([name, help]) => /\[JA-JA\]/u.test(name ?? '') && /Translate automatically/u.test(help))).toBe(true);
    });
});
