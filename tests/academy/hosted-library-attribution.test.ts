import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// The hosted Read page (docs/library/) shares yomureader.com with Academy.
// Tadoku books are CC BY-NC-ND 4.0 works: the page links to them with credit
// and never reproduces or hotlinks their covers.
const LIBRARY = fs.readFileSync('docs/.vitepress/theme/TadokuLibrary.vue', 'utf8');
const TEMPLATE = LIBRARY.slice(LIBRARY.indexOf('<template>'), LIBRARY.indexOf('</template>'));

describe('hosted Tadoku library attribution', () => {
    it('renders text links only, with no Tadoku cover image or other third-party request', () => {
        expect(TEMPLATE).not.toMatch(/<img\b|<picture\b|<source\b|:src=|coverUrl/u);
        expect(LIBRARY).not.toContain('coverUrl');
        expect(TEMPLATE).toContain(':href="book.sourceUrl');
        expect(fs.readFileSync('docs/library/index.md', 'utf8')).toContain('<TadokuLibrary />');
    });

    it('credits NPO Tadoku Supporters and names the licence in English and Japanese', () => {
        expect(TEMPLATE).toContain('data-library-credit');
        expect(TEMPLATE).toContain(':href="text.licenseUrl"');
        const table = LIBRARY.slice(LIBRARY.indexOf('const copy = {'), LIBRARY.indexOf('const text = computed'));
        const en = table.slice(table.indexOf('en: {'), table.indexOf('ja: {'));
        const ja = table.slice(table.indexOf('ja: {'));
        for (const locale of [en, ja]) {
            for (const key of ['source:', 'credit:', 'license:', 'licenseUrl:', 'linksOnly:']) expect(locale).toContain(key);
            expect(locale).toContain('https://creativecommons.org/licenses/by-nc-nd/4.0/');
        }
        expect(en).toContain('NPO Tadoku Supporters');
        expect(en).toContain('Creative Commons BY-NC-ND 4.0');
        expect(ja).toContain('NPO多言語多読');
        expect(ja).toContain('表示-非営利-改変禁止 4.0');
    });

    it('discloses tadoku.org on the privacy page', () => {
        const privacy = fs.readFileSync('docs/privacy/index.md', 'utf8');
        expect(privacy).toMatch(/Read\*\* page \(`\/library\/`\)[^\n]*`tadoku\.org`[^\n]*only when you open a book/u);
    });
});
