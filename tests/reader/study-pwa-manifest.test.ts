import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface StudyManifest {
    id?: string;
    name?: string;
    short_name?: string;
    description?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    shortcuts?: Array<{ name?: string; url?: string }>;
}

const manifest = JSON.parse(readFileSync('public/newtab/manifest.webmanifest', 'utf8')) as StudyManifest;
const serviceWorker = readFileSync('public/newtab/sw.js', 'utf8');
const appHtml = readFileSync('public/newtab/index.html', 'utf8').replace(/\s+/gu, ' ');

describe('Study offline app contract', () => {
    it('has a stable standalone identity for iOS and Android installation', () => {
        expect(manifest).toMatchObject({
            id: './',
            name: 'よむ — Japanese Reader & Study',
            short_name: 'よむ',
            start_url: './index.html',
            scope: './',
            display: 'standalone',
        });
        expect(manifest.description).toContain('offline-first');
    });

    it('offers direct app shortcuts to the core client sections', () => {
        expect(manifest.shortcuts).toEqual([
            expect.objectContaining({ name: 'Study', url: './?mode=word' }),
            expect.objectContaining({ name: 'Library', url: './?mode=search' }),
            expect.objectContaining({ name: 'Stats', url: './?mode=stats' }),
        ]);
    });

    it('pre-caches the complete Study shell for a cold offline launch', () => {
        for (const asset of ['./index.html', './manifest.webmanifest', './app.js', './styles.css']) {
            expect(serviceWorker).toContain(`'${asset}'`);
        }
        expect(serviceWorker).toContain("event.request.mode === 'navigate'");
        expect(serviceWorker).toContain("caches.match('./index.html')");
    });

    it('keeps the Type answer field visible in the late critical CSS layer', () => {
        expect(appHtml).toContain('.jpdb-reader-newtab-study[data-newtab-study-step="type-word"] .jpdb-reader-newtab-answer { min-height: clamp(68px, 11vh, 124px); opacity: 1;');
    });
});
