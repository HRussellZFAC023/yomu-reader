import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import { currentPageEnhancementLayoutContext } from '../../src/reader/app/page-enhancement-targets';

const immersionCss = readFileSync('src/reader/styles/immersion-study.css', 'utf8').replace(/\s+/gu, ' ');
const newTabCss = readFileSync('src/reader/styles/new-tab.css', 'utf8').replace(/\s+/gu, ' ');

interface ReaderAppInternals {
    createJpdbPageAddonRoot(kind: 'word' | 'kanji', key: string, anchor: HTMLElement, generation: number): HTMLElement | null;
}

function stubLocation(hostname: string, pathname: string): void {
    vi.stubGlobal('location', {
        href: `https://${hostname}${pathname}`,
        origin: `https://${hostname}`,
        hostname,
        pathname,
        search: '',
    });
}

describe('review Immersion Kit layout context', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it.each([
        ['jpdb review', 'jpdb.io', '/review', ''],
        ['Jiten study', 'jiten.moe', '/srs/study', ''],
        ['Bunpro review', 'bunpro.jp', '/reviews', ''],
        ['localized Bunpro review', 'bunpro.jp', '/ja/reviews', ''],
        ['Bunpro lesson quiz', 'bunpro.jp', '/learn/grammar', '<main id="js-quiz"></main>'],
    ])('marks %s as review context', (_label, hostname, pathname, html) => {
        stubLocation(hostname, pathname);
        document.body.innerHTML = html;

        expect(currentPageEnhancementLayoutContext()).toBe('review');
    });

    it.each([
        ['jpdb vocabulary', 'jpdb.io', '/vocabulary/1/a/あ'],
        ['Jiten vocabulary', 'jiten.moe', '/vocabulary/食べる'],
        ['Bunpro vocabulary', 'bunpro.jp', '/vocabs/食べる'],
    ])('keeps %s in the regular entry layout', (_label, hostname, pathname) => {
        stubLocation(hostname, pathname);

        expect(currentPageEnhancementLayoutContext()).toBe('entry');
    });

    it('publishes the context on the enhanced-page addon root', () => {
        stubLocation('jiten.moe', '/srs/study');
        document.body.innerHTML = '<main><div data-anchor></div></main>';
        const app = new ReaderApp();
        try {
            const anchor = document.querySelector<HTMLElement>('[data-anchor]')!;
            const root = (app as unknown as ReaderAppInternals)
                .createJpdbPageAddonRoot('word', 'word:読む:よむ', anchor, 1);

            expect(root?.dataset.yomuPageContext).toBe('review');
            expect(root?.previousElementSibling).toBe(anchor);
        } finally {
            app.destroy();
        }
    });

    it('refreshes context metadata when a host reuses the same addon root', () => {
        stubLocation('jiten.moe', '/srs/study');
        document.body.innerHTML = '<main><div data-anchor></div></main>';
        const app = new ReaderApp();
        try {
            const anchor = document.querySelector<HTMLElement>('[data-anchor]')!;
            const internals = app as unknown as ReaderAppInternals;
            const reviewRoot = internals.createJpdbPageAddonRoot('word', 'word:読む:よむ', anchor, 1);

            stubLocation('jiten.moe', '/vocabulary/読む');
            const reusedRoot = internals.createJpdbPageAddonRoot('word', 'word:読む:よむ', anchor, 2);

            expect(reusedRoot).toBe(reviewRoot);
            expect(reusedRoot?.dataset.yomuPageContext).toBe('entry');
        } finally {
            app.destroy();
        }
    });
});

describe('review Immersion Kit responsive contract', () => {
    it('scopes the compact rail to enhanced-page review context only', () => {
        expect(immersionCss).toContain('.yomu-jpdb-page-addon[data-yomu-page-context="review"] .jpdb-reader-immersion { --jpdb-reader-example-media-max-height: min(34dvh, 340px); box-sizing: border-box; width: min(100%, 34rem);');
        expect(immersionCss).toContain('width: min(100%, 60.444dvh, 604px); min-width: 0;');
        expect(immersionCss).toContain('min-height: 0 !important; max-height: var(--jpdb-reader-example-media-max-height); aspect-ratio: 16 / 9;');
        expect(immersionCss).toContain('@media (max-width: 900px) { .yomu-jpdb-page-addon[data-yomu-page-context="review"] .jpdb-reader-immersion { --jpdb-reader-example-media-max-height: min(30dvh, 280px); width: min(100%, 30rem); }');
        expect(immersionCss).toContain('@media (max-width: 520px) { .yomu-jpdb-page-addon[data-yomu-page-context="review"] .jpdb-reader-immersion { --jpdb-reader-example-media-max-height: min(26dvh, 220px); width: 100%;');
        expect(immersionCss).toContain('.yomu-jpdb-page-addon[data-yomu-page-context="review"] .jpdb-reader-example-actions .jpdb-reader-icon-mini { width: 44px !important; min-width: 44px !important; max-width: 44px !important; height: 44px !important; min-height: 44px !important; max-height: 44px !important; }');
        expect(immersionCss).toContain('.yomu-jpdb-page-addon[data-yomu-page-context="review"] .jpdb-reader-example-translation[data-immersion-translation-blurred="true"]');
        expect(immersionCss).toContain('.yomu-jpdb-page-addon[data-yomu-page-context="review"] :is(.jpdb-reader-example-source, .jpdb-reader-example-count, .jpdb-reader-example-translation) { color: var(--jpdb-reader-text); }');
        expect(immersionCss).not.toContain('.yomu-jpdb-page-addon[data-yomu-page-context="entry"] .jpdb-reader-immersion');
    });

    it('uses the same bounded media stage on Yomu Study without changing dictionaries', () => {
        expect(newTabCss).toContain('.jpdb-reader-newtab-immersion { margin-top: clamp(6px, 1.6vh, 14px); width: min(34rem, 100%);');
        expect(newTabCss).toContain('width: min(100%, 60.444dvh, 604px); min-width: 0; min-height: 0; aspect-ratio: 16 / 9;');
        expect(newTabCss).toContain('max-height: min(340px, 34dvh);');
        expect(newTabCss).toContain('.jpdb-reader-newtab-immersion:not(.jpdb-reader-newtab-kanji-immersion) { width: min(30rem, 100%); }');
        expect(newTabCss).toContain('.jpdb-reader-newtab-immersion .jpdb-reader-icon-mini { width: 44px !important; min-width: 44px !important; height: 44px !important; min-height: 44px !important; }');
        expect(newTabCss).not.toContain('.jpdb-reader-newtab-reveal-dictionaries { width: min(34rem');
    });

    it('uses only an opacity fade and disables it for reduced motion', () => {
        expect(immersionCss).toContain('@keyframes yomu-review-immersion-fade-in { from { opacity: 0.82; } to { opacity: 1; } }');
        expect(immersionCss).toContain('@media (prefers-reduced-motion: reduce) { .yomu-jpdb-page-addon[data-yomu-page-context="review"] .jpdb-reader-immersion .jpdb-reader-example-card { animation: none; } }');
        expect(newTabCss).toContain('@media (prefers-reduced-motion: reduce) { .jpdb-reader-newtab-immersion .jpdb-reader-example-card { animation: none; } }');
    });
});
