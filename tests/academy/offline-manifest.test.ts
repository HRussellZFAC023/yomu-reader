import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS } from '../../src/academy/assets';

describe('Academy offline shell', () => {
    it('pre-caches the hosted Reader and every enrollment-slice dependency', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const revision = source.match(/const VERSION = 'yomu-academy-shell-([^']+)'/)?.[1];
        expect(revision).toMatch(/^s1-[a-f0-9]{12}$/);
        for (const required of [
            '/yomu.user.js',
            '/yomu.css',
            '/greasyfork/yomu-settings-surface.user.js',
            `/academy/app.js?v=${revision}`,
            '/academy/art/characters/rie/rie__neutral__halfbody__v001.png',
            '/academy/art/locations/wide/writing-studio__rain-night--wide.webp',
            '/academy/art/events/rainy-directions__rie-aakash__v001.png',
            '/academy/content/vertical-slice/source-library.v1.json',
            '/academy/content/lessons/lesson-zero.v1.json',
            '/academy/vendor/kanjivg/04e00.svg',
            '/academy/vendor/kanjivg/ATTRIBUTION.md',
        ]) expect(source).toContain(`'${required}'`);
        expect(source).toContain("url.pathname === '/yomu.user.js'");
        expect(source).toContain("url.pathname.startsWith('/academy/media/')");
    });

    it('keeps every typed runtime asset in the offline core', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        for (const asset of collectAssetPaths(ACADEMY_ASSETS)) {
            expect(source, `missing offline asset ${asset}`).toContain(`'${asset}'`);
        }
    });

    it('uses one matching shell revision and never caches failed navigation', () => {
        const index = fs.readFileSync(path.resolve('docs/public/academy/index.html'), 'utf8');
        const worker = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const sourceIndex = fs.readFileSync(path.resolve('public/academy/index.html'), 'utf8');
        const sourceWorker = fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        const appRevision = index.match(/\/academy\/app\.js\?v=([^"']+)/)?.[1];
        const styleRevision = index.match(/\/academy\/style\.css\?v=([^"']+)/)?.[1];
        const workerRevision = worker.match(/const VERSION = 'yomu-academy-shell-([^']+)'/)?.[1];

        expect(appRevision).toBeTruthy();
        expect(styleRevision).toBe(appRevision);
        expect(workerRevision).toBe(appRevision);
        expect(worker).toContain(`'/academy/app.js?v=${appRevision}'`);
        expect(worker).toContain(`'/academy/style.css?v=${appRevision}'`);
        expect(worker).toContain('if (!response.ok) return response;');
        expect(sourceIndex).toContain('__ACADEMY_REVISION__');
        expect(sourceWorker).toContain('__ACADEMY_REVISION__');
        expect(index).not.toContain('__ACADEMY_REVISION__');
        expect(worker).not.toContain('__ACADEMY_REVISION__');
    });
});

function collectAssetPaths(value: unknown): string[] {
    if (typeof value === 'string') return value.startsWith('/academy/') ? [value] : [];
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(collectAssetPaths).sort();
}
