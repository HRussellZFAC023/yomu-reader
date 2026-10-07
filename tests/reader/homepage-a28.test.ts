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
        expect([...page.querySelectorAll('.yomu-home-more > section')].map(section => section.id)).toEqual(['desktop']);
    });

    it('passes the real VitePress Markdown and Vue SSR parser for both locales', () => {
        // VitePress/esbuild must run in Node, not jsdom's mixed typed-array realm.
        const output = execFileSync(path.resolve('node_modules/.bin/vite-node'), [
            'scripts/check-homepage-ssr.mts',
        ], { encoding: 'utf8', timeout: 30_000 });
        expect(output).toContain('Homepage SSR passed: EN and JA.');
    }, 35_000);

    it('says Japanese without client heading replacement or hidden content', () => {
        // Yomu is for learning Japanese (owner decision, 2026-10-07): the fold
        // no longer carries a count of other learning languages.
        expect(homepage).not.toMatch(/learning languages?/iu);
        expect(homepage).not.toContain('yomu-fold-scope');
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

    it('says each section in one line and keeps the existing captures', () => {
        // Owner, 2026-10-07: less is more, and no labels that state the
        // obvious. One line of what よむ is, one install button, then one
        // heading and one line per place it works. The method lives on /learn/,
        // linked from the letter; the old essays, the kicker labels above each
        // heading and the competitor comparison do not come back.
        const page = new DOMParser().parseFromString(homepage.replace(/^---[\s\S]*?---/, ''), 'text/html');
        for (const band of page.querySelectorAll('.yomu-band')) {
            expect(band.querySelectorAll('.yomu-band-lead'), band.id).toHaveLength(1);
            expect(band.querySelector('.yomu-band-lead')!.textContent!.split(/\s+/u).length, band.id).toBeLessThanOrEqual(25);
        }
        expect(homepage).not.toContain('yomu-band-kicker');
        expect(homepage).not.toContain('yomu-fits');
        expect(homepage).not.toContain('#how-yomu-compares-with-migaku-and-duolingo');
        expect(page.querySelector('.yomu-letter a[href="/learn/"]')).not.toBeNull();
        for (const image of ['popover', 'wikipedia', 'youtube', 'keep-press', 'study', 'phone', 'ipad']) {
            expect(homepage).toContain(`/home/${image}.webp`);
        }
    });

    it('gives the promoted install button at most one short line of help', () => {
        const page = new DOMParser().parseFromString(homepage.replace(/^---[\s\S]*?---/, ''), 'text/html');
        for (const routes of page.querySelectorAll('.yomu-install-routes')) {
            const hints = [...routes.querySelectorAll<HTMLElement>('.yomu-install-hint')];
            expect(hints.map(hint => hint.dataset.yomuHint)).toEqual(['chrome', 'firefox', 'userscript']);
            for (const hint of hints) expect(hint.textContent!.split(/\s+/u).length).toBeLessThanOrEqual(8);
            expect(routes.querySelector('[data-yomu-route="userscript"]')?.getAttribute('href')).toBe('/install#safari');
            expect(routes.querySelector('a[href="/desktop"]')).not.toBeNull();
        }
        expect(homepageStyles).toContain(":root[data-yomu-install='chrome'] [data-yomu-hint='chrome']");
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
        expect(homepage).toContain('<a class="yomu-band-action" href="/pdf-reader/">Open a PDF</a>');
        expect(homepage).toContain('<a class="yomu-band-action" href="/video-player/">Play your own video</a>');
        expect(homepage).toContain('<a class="yomu-band-action" href="/study/">Open Study</a>');
    });

    it('uses one shared Apps category label', () => {
        // The v2 primary nav is task-focused (Read, Watch, Study; asserted in
        // hosted-overflow-menu.test.ts). The Apps overview page was folded into
        // Start here on 2026-10-07, so Apps names only the sidebar group now,
        // while the desktop app — the one app that needs a download — has its
        // own entry under More. The retired 'Tools' label stays gone.
        expect(APPS_NAV_LABEL).toBe('Apps');
        const routes = siteNavRoutes();
        expect(routes.some(route => route.text === APPS_NAV_LABEL)).toBe(false);
        expect(routes.some(route => route.text === 'Tools')).toBe(false);
        const more = (docsNav() as Array<{ items?: Array<{ text: string; link: string }> }>).find(entry => entry.items);
        expect(more?.items).toContainEqual({ text: 'Desktop app', link: '/desktop' });
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
