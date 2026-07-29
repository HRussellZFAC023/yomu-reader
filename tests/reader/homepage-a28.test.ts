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

    it('keeps the no-JS Japanese headline and enables only a progressive fade', () => {
        expect(homepage).toContain('A complete system for learning <span class="yomu-language-rotator"');
        expect(homepage).toContain('<span class="yomu-language-static" lang="ja" data-yomu-localize="off">日本語.</span>');
        expect(homepage).toContain('data-yomu-language-rotator');
        expect(homepageStyles).toContain("[data-yomu-language-rotator-ready] .yomu-language-cycle > span:nth-child(2) { animation-delay: 2s; }");
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
        expect(homepage).toContain('<a class="yomu-band-action" href="/pdf-reader/index.html">Read</a>');
        expect(homepage).toContain('<a class="yomu-band-action" href="/video-player/index.html">Watch</a>');
        expect(homepage).toContain('<a class="yomu-band-action" href="/study/">Study</a>');
    });

    it('uses one shared Apps category label', () => {
        expect(APPS_NAV_LABEL).toBe('Apps');
        expect(PRIMARY_NAV).toContainEqual(expect.objectContaining({ text: APPS_NAV_LABEL, link: '/tools/' }));
        expect(PRIMARY_NAV.some(route => route.text === 'Tools')).toBe(false);
    });

    it('allows the owner-requested factual comparison without reviving the deleted SEO page', () => {
        expect(publicDocsCheck).toContain('pattern: /migaku-alternative/i');
        expect(publicDocsCheck).not.toContain('pattern: /migaku-alternative|Migaku/i');
    });
});
