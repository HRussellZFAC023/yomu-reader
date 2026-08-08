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

    it('ships 日本語 in the SSR headline whatever the client rotator shows', () => {
        // The owner restored the headline rotator (2026-08-04), but the SSR
        // sentence must stay 日本語 verbatim: crawlers, social unfurls and the
        // no-JS page all read the static markup, and a first line naming a
        // language chosen by a timer is the failure mode that got the previous
        // rotator removed. Rotation happens only in the booted client.
        expect(homepage).toContain('>A complete system for learning 日本語.</h1>');
        expect(homepage).not.toContain('YomuLanguageRotator');
        expect(homepageStyles).not.toContain('.yomu-language-cycle');
    });

    it('keeps the multilingual headline rotator at reading strength', () => {
        // The demoted "same loop works in N other languages" line is gone
        // (owner decision 2026-08-04); the claim now lives in the rotator,
        // which reads the same asserted roster (__YOMU_HERO_LANGUAGES__), so a
        // roster change still cannot leave a stale language in the copy.
        expect(homepage).not.toContain('<YomuStudyTargetCount />');
        expect(homepage).not.toContain('yomu-fold-also');
        const theme = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        expect(theme).toContain('installHostedHeroLanguageRotator');
        expect(theme).toContain('__YOMU_HERO_LANGUAGES__');
        expect(theme).toContain("en: ['Read ', ' with Yomu.']");
        expect(theme).toContain("ja: ['よむで', 'を読む。']");
        expect(theme).not.toContain("en: ['A complete system for learning ', '.']");
    });

    it('drops the "nothing installed" duplicate CTA section', () => {
        // Its four links each live in their own proof section already; the
        // owner removed the second copy (2026-08-04).
        expect(homepage).not.toContain('yomu-no-install');
        expect(homepageStyles).not.toContain('.yomu-no-install');
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
