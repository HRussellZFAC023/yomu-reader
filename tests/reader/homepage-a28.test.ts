import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APPS_NAV_LABEL, PRIMARY_NAV } from '../../docs/.vitepress/shared/nav';

const homepage = readFileSync('docs/index.md', 'utf8');
const publicDocsCheck = readFileSync('scripts/check-public-docs.mjs', 'utf8');
const homepageStyles = readFileSync('docs/.vitepress/theme/custom.css', 'utf8');

describe('A28 homepage contract', () => {
    it('removes every owner-rejected phrase and stale caption', () => {
        for (const rejected of [
            'Any page becomes a Japanese lesson.',
            'Press a word for its reading, meaning, sound — and keep it.',
            'Read the Japanese web at full speed.',
            'The same reading, in your hand.',
            'Colours are pitch accent',
        ]) {
            expect(homepage).not.toContain(rejected);
        }
        expect(homepage).not.toContain('<figcaption');
    });

    it('names Japanese in the headline and never a language chosen by a timer', () => {
        // The owner asked for this sentence verbatim. A rotator that cycled all 33
        // study targets through the H1 meant the product's own first line read "A
        // complete system for learning Shqip." to whoever arrived on that tick, and
        // every screenshot and social unfurl inherited whichever word was showing.
        expect(homepage).toContain('>A complete system for learning 日本語.</h1>');
        expect(homepage).not.toContain('YomuLanguageRotator');
        expect(homepageStyles).not.toContain('.yomu-language-cycle');
    });

    it('keeps the multilingual claim on the page, demoted and still measured', () => {
        // Demoting it must not delete it: 32 other targets really are supported, and
        // the count is rendered from the same asserted roster the rotator read, so a
        // roster change still cannot leave a stale number in the copy.
        expect(homepage).toContain('<YomuStudyTargetCount />');
        expect(homepage).toContain('yomu-fold-also');
    });

    it('keeps one live OCR image and all other images opted out', () => {
        const figures = [...homepage.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map(match => match[0]);
        const imageFigures = figures.filter(figure => figure.includes('<img '));
        const readable = imageFigures.filter(figure => !figure.includes('data-yomu-ocr="ignore"'));

        expect(readable).toHaveLength(1);
        expect(readable[0]).toContain('/media/manga-ocr-sample.png');
        expect(readable[0]).toContain('data-yomu-runtime-surface');
    });

    it('links the three retained proof bands to their hosted apps', () => {
        expect(homepage).toContain('<a class="yomu-band-action" href="/pdf-reader/">Read</a>');
        expect(homepage).toContain('<a class="yomu-band-action" href="/video-player/">Watch</a>');
        expect(homepage).toContain('<a class="yomu-band-action" href="/study/">Study</a>');
    });

    it('uses one shared Apps category label', () => {
        expect(APPS_NAV_LABEL).toBe('Apps');
        expect(PRIMARY_NAV).toContainEqual(expect.objectContaining({ text: APPS_NAV_LABEL, link: '/learn/reference#apps' }));
        expect(PRIMARY_NAV.some(route => route.text === 'Tools')).toBe(false);
    });

    it('allows the owner-requested factual comparison without reviving the deleted SEO page', () => {
        expect(publicDocsCheck).toContain('pattern: /migaku-alternative/i');
        expect(publicDocsCheck).not.toContain('pattern: /migaku-alternative|Migaku/i');
    });
});
