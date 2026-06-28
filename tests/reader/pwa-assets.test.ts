import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function readText(path: string): string {
    return readFileSync(path, 'utf8');
}

function readManifest(path: string): Record<string, unknown> {
    return JSON.parse(readText(path));
}

describe('hosted PWA assets', () => {
    it('makes the docs and homepage one installable Yomu PWA shell', () => {
        const config = readText('docs/.vitepress/config.mts');
        const theme = readText('docs/.vitepress/theme/index.ts');
        const serviceWorker = readText('docs/public/sw.js');
        const manifest = readManifest('docs/public/manifest.webmanifest');

        expect(config).toContain("rel: 'manifest', href: `${base}manifest.webmanifest`");
        expect(theme).toContain("navigator.serviceWorker.register('/sw.js', { scope: '/' })");
        expect(serviceWorker).toContain("const CACHE_NAME = 'yomu-docs-shell-v1';");
        expect(serviceWorker).toContain("'/manifest.webmanifest'");
        expect(serviceWorker).toContain('if (!response.ok) return await cachedNavigationFallback(request);');
        expect(serviceWorker).toContain("return Response.redirect('/', 302);");
        expect(serviceWorker).toContain("if (path === '/') return pathname === '/'");
        expect(manifest).toMatchObject({
            name: 'よむ Japanese Reader',
            short_name: 'よむ',
            display: 'standalone',
            start_url: '/',
            scope: '/',
        });
        expect(manifest.shortcuts).toEqual(expect.arrayContaining([
            expect.objectContaining({ url: '/newtab/index.html' }),
            expect.objectContaining({ url: '/video-player/index.html' }),
            expect.objectContaining({ url: '/pdf-reader/' }),
        ]));
    });

    it('makes the Study page installable and caches its manifest with the versioned shell', () => {
        const html = readText('public/newtab/index.html');
        const serviceWorker = readText('public/newtab/sw.js');
        const manifest = readManifest('public/newtab/manifest.webmanifest');

        expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest">');
        expect(html).toContain("navigator.serviceWorker.register('./sw.js')");
        expect(serviceWorker).toContain("const CACHE_NAME = `yomu-newtab-${APP_HASH}`;");
        expect(serviceWorker).toContain("'./manifest.webmanifest'");
        expect(serviceWorker).toContain("'/manifest.webmanifest'");
        expect(manifest).toMatchObject({
            name: 'Yomu Study',
            display: 'standalone',
            start_url: './index.html',
            scope: './',
        });
    });

    it('makes Yomu Video installable with an offline shell and local runtime fallback assets', () => {
        const html = readText('docs/public/video-player/index.html');
        const serviceWorker = readText('docs/public/video-player/sw.js');
        const manifest = readManifest('docs/public/video-player/manifest.webmanifest');

        expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest">');
        expect(html).toContain("navigator.serviceWorker.register('./sw.js')");
        expect(serviceWorker).toContain("const CACHE_NAME = 'yomu-video-player-v1';");
        expect(serviceWorker).toContain("'/greasyfork/yomu-video.user.js'");
        expect(serviceWorker).toContain("'/yomu.user.js'");
        expect(manifest).toMatchObject({
            name: 'Yomu Video Player',
            display: 'standalone',
            start_url: './index.html',
            scope: './',
        });
    });

    it('makes Yomu PDF installable and keeps PDF.js vendor assets cacheable', () => {
        const html = readText('docs/public/pdf-reader/index.html');
        const serviceWorker = readText('docs/public/pdf-reader/sw.js');
        const manifest = readManifest('docs/public/pdf-reader/manifest.webmanifest');

        expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest">');
        expect(html).toContain("navigator.serviceWorker.register('./sw.js')");
        expect(serviceWorker).toContain("const CACHE_NAME = 'yomu-pdf-reader-v1.4.196';");
        expect(serviceWorker).toContain("pathname.includes('/pdf-reader/vendor/')");
        expect(manifest).toMatchObject({
            name: 'Yomu PDF Reader',
            display: 'standalone',
            start_url: './index.html',
            scope: './',
        });
    });

    it('threads the new-tab web manifest through docs sync and extension packaging', () => {
        const syncScript = readText('scripts/sync-docs-userscript.cjs');
        const extensionBuild = readText('scripts/build-extension.mjs');
        const verifier = readText('scripts/verify-userscript.cjs');

        expect(syncScript).toContain("public', 'newtab', 'manifest.webmanifest'");
        expect(syncScript).toContain("dist', 'newtab', 'manifest.webmanifest'");
        expect(extensionBuild).toContain('stageNewTabWebManifest');
        expect(extensionBuild).toContain("'newtab/manifest.webmanifest'");
        expect(verifier).toContain("['dist/newtab/manifest.webmanifest', 'docs/public/newtab/manifest.webmanifest']");
    });
});
