import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localizeHtmlFragment } from '../../docs/.vitepress/locales/markdown-localization';
import { websiteNavigationLabel } from '../../docs/.vitepress/locales/site-locales';
import { APPS_NAV_LABEL, docsNav, siteNavRoutes } from '../../docs/.vitepress/shared/nav';

const homepage = readFileSync('docs/index.md', 'utf8');
const publicDocsCheck = readFileSync('scripts/check-public-docs.mjs', 'utf8');
const homepageStyles = readFileSync('docs/.vitepress/theme/custom.css', 'utf8');

describe('editorial homepage contract', () => {
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

    it.each([
        ['en', 'Read Japanese. Stay with the story.'],
        ['ja', '日本語を読む。物語の続きを楽しむ。'],
    ] as const)('server-localizes a single stable heading and preserves the live sample in %s', (locale, title) => {
        const html = localizeHtmlFragment(homepage.replace(/^---[\s\S]*?---/, ''), locale);
        const page = new DOMParser().parseFromString(html, 'text/html');
        const heading = page.querySelector('#yomu-home-title')!;
        expect(page.querySelectorAll('h1')).toHaveLength(1);
        expect(heading.textContent).toBe(title);
        expect(heading.childElementCount).toBe(0);
        expect(heading.hasAttribute('aria-label')).toBe(false);
        expect(heading.getAttribute('data-jpdb-reader-surface-ignore')).toBe('true');
        const sample = page.querySelector('.yomu-try-me-sample')!;
        expect(sample.getAttribute('lang')).toBe('ja');
        expect(sample.getAttribute('aria-label')).toBe('今日は静かな喫茶店で新しい本を読みました。');
        expect(sample.querySelectorAll('[data-token-start]')).toHaveLength(6);
        expect(page.querySelectorAll('.yomu-install-routes')).toHaveLength(2);
        for (const routes of page.querySelectorAll('.yomu-install-routes')) {
            expect([...routes.querySelectorAll('[data-yomu-route]')].map(link => link.getAttribute('data-yomu-route'))).toEqual(['chrome', 'firefox', 'userscript']);
        }
        expect(page.querySelectorAll('main')).toHaveLength(1);
        expect(page.querySelector('main > .yomu-fold')).not.toBeNull();
        expect(page.querySelector('main > .yomu-next')).not.toBeNull();
        expect([...page.querySelectorAll('.yomu-home-more > section')].map(section => section.id)).toEqual(['gaming', 'academy']);
    });

    it('passes the real VitePress Markdown and Vue SSR parser for both locales', () => {
        // VitePress/esbuild must run in Node, not jsdom's mixed typed-array realm.
        const output = execFileSync(path.resolve('node_modules/.bin/vite-node'), [
            'scripts/check-homepage-ssr.mts',
        ], { encoding: 'utf8', timeout: 30_000 });
        expect(output).toContain('Homepage SSR passed: EN and JA.');
    }, 35_000);

    it('keeps language support explicit without client heading replacement or hidden content', () => {
        expect(homepage).toContain('Reading and lookup in 33 learning languages.');
        const theme = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const config = readFileSync('docs/.vitepress/config.mts', 'utf8');
        expect(theme).not.toContain('installHostedHeroLanguageRotator');
        expect(theme).not.toContain('buildHostedHeroSizingLayer');
        expect(config).not.toContain('__YOMU_HERO_LANGUAGES__');
        expect(theme).not.toContain('armHostedRevealElements');
        expect(homepageStyles).not.toContain('.yomu-fold-h1-reserve');
        expect(homepage).not.toContain('yomu-reveal');
        expect(homepage).not.toContain('yomu-band-ground');
        const homeCss = homepageStyles.split('/* Homepage:')[1]!.split('/* --- Membership:')[0]!;
        expect(homeCss).not.toMatch(/rotate\(|clip-path|@keyframes/);
    });

    it('preserves the corrected learning advice and the existing captures', () => {
        expect(homepage).toContain('You decide what to add to your deck.');
        expect(homepage).toContain('Use definitions and grammar explanations when you need them.');
        expect(homepage).toContain('Connect a review service you already use, or keep a local Yomu deck.');
        for (const image of ['popover', 'wikipedia', 'youtube', 'keep-press', 'study', 'phone', 'ipad']) {
            expect(homepage).toContain(`/home/${image}.webp`);
        }
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
        // The v2 primary nav is task-focused (Read, Watch, Study; asserted in
        // hosted-overflow-menu.test.ts), so Apps now sits under More. The contract
        // is the label: one constant names the nav entry and the sidebar group on
        // every surface, in both locales, and the retired 'Tools' label is gone.
        expect(APPS_NAV_LABEL).toBe('Apps');
        const routes = siteNavRoutes();
        expect(routes.filter(route => route.text === APPS_NAV_LABEL)).toEqual([
            { text: APPS_NAV_LABEL, ja: 'アプリ', link: '/learn/reference#apps' },
        ]);
        expect(routes.some(route => route.text === 'Tools')).toBe(false);
        const more = (docsNav() as Array<{ items?: Array<{ text: string; link: string }> }>).find(entry => entry.items);
        expect(more?.items).toContainEqual({ text: APPS_NAV_LABEL, link: '/learn/reference#apps' });
        expect(websiteNavigationLabel(APPS_NAV_LABEL, 'ja')).toBe('アプリ');
        const config = readFileSync('docs/.vitepress/config.mts', 'utf8');
        expect(config).toContain('text: APPS_NAV_LABEL,');
        expect(config).not.toMatch(/text: ['"]Tools['"]/);
    });

    it('allows the owner-requested factual comparison without reviving the deleted SEO page', () => {
        expect(publicDocsCheck).toContain('pattern: /migaku-alternative/i');
        expect(publicDocsCheck).not.toContain('pattern: /migaku-alternative|Migaku/i');
    });
});
