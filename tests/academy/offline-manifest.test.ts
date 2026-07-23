import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_CAST_SPRITE_COVERAGE, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';

describe('Academy offline shell', () => {
    it('keeps deployable Academy text inputs free of private workstation paths', () => {
        const runtimeRoot = path.resolve('public/academy');
        const privatePath = /(?:\/Users\/[^/\s]+(?:\/|$)|\/home\/[^/\s]+(?:\/|$)|[A-Za-z]:\\+Users\\+[^\\\s]+(?:\\+|$))/u;
        const leaks = runtimeTextFiles(runtimeRoot).flatMap(file => {
            const source = fs.readFileSync(file, 'utf8');
            return privatePath.test(source) ? [path.relative(runtimeRoot, file)] : [];
        });

        expect(leaks).toEqual([]);
    });

    it('uses a unique precache manifest whose hosted targets all exist', () => {
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const source = fs.readFileSync(path.resolve(workerPath), 'utf8');
            const urls = precacheUrls(source);
            const missing = urls.filter(url => !fs.existsSync(hostedPathFor(url)));

            expect(urls, `${workerPath} contains duplicate precache requests`).toEqual([...new Set(urls)]);
            expect(missing, `${workerPath} references missing hosted files`).toEqual([]);
        }
    });

    it('pre-caches the hosted Reader and every enrollment-slice dependency', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const revision = source.match(/const VERSION = 'yomu-academy-shell-([^']+)'/)?.[1];
        expect(revision).toMatch(/^s1-[a-f0-9]{12}$/);
        for (const required of [
            '/yomu.user.js',
            '/yomu.css',
            '/greasyfork/yomu-settings-surface.user.js',
            '/greasyfork/yomu-bunpro.user.js',
            `/academy/app.js?v=${revision}`,
            '/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.png',
            '/academy/art/characters/rie/rie__happy-glasses__front-near-front__halfbody__v001.png',
            '/academy/art/characters/rie/rie__sad-vulnerable-glasses__left-three-quarter__halfbody__v001.png',
            '/academy/art/characters/rie/rie__comedic-glasses__right-three-quarter__halfbody__v001.png',
            '/academy/art/ACADEMY-ASSET-REGISTRY.json',
            '/academy/art/ASSET-USAGE.json',
            '/academy/art/SPRITE-BATCH-MANIFEST.json',
            '/academy/art/locations/wide/writing-studio__rain-night--wide.webp',
            '/academy/art/locations/wide/tube-platform__blue-hour-rain--wide.webp',
            '/academy/art/events/rainy-directions__rie-aakash__v001.png',
            '/academy/art/items/street-direction-map__v001.jpg',
            '/academy/art/items/cafe-order-scene__v001.jpg',
            '/academy/content/vertical-slice/source-library.v1.json',
            '/academy/content/listening/listening-task-bindings.v1.json',
            '/academy/content/listening/media/academy-listening-75194e1fda2886b7.mp3',
            '/academy/content/listening/media/academy-listening-52ba9cd972e544ef.mp3',
            '/academy/content/listening/media/academy-listening-75b031947b395f44.mp3',
            '/academy/content/listening/media/academy-listening-b076fb0e90d9e1b2.mp3',
            '/academy/content/listening/media/academy-listening-7a7f9cf7c9d0a109.mp3',
            '/academy/content/listening/media/academy-listening-4f292de0dd3a5791.mp3',
            '/academy/content/listening/media/academy-listening-1039d11bef7a0575.mp3',
            '/academy/content/lessons/lesson-zero.v1.json',
            '/academy/audio/story-voice-playback.json',
            '/academy/content/lessons/l1-l19/moodle-chapter-11-2-ordering-food-page-2.png',
            '/academy/content/lessons/l1-l19/moodle-43-a-43.mp3',
            '/academy/content/lessons/l1-l19/moodle-44-a-44.mp3',
            '/academy/content/lessons/l1-l21/moodle-chapter-11-4-duration-page-1.png',
            '/academy/content/lessons/l1-l21/moodle-chapter-11-4-duration-page-3.png',
            '/academy/content/lessons/l1-l21/moodle-46-a-46.mp3',
            '/academy/content/lessons/l1-l22/moodle-katakana-writing-basic-page-1.png',
            '/academy/content/lessons/l1-l22/moodle-katakana-list-page-1.png',
            '/academy/content/lessons/l2-l02/moodle-chapter-19-1-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l02/moodle-chapter-19-listening-page-1.png',
            '/academy/content/lessons/l2-l02/moodle-b-21.mp3',
            '/academy/content/lessons/l2-l03/moodle-chapter-19-2-3-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l03/moodle-chapter-19-2-tari-grammar-page-3.png',
            '/academy/content/listening/media/academy-listening-6dccd9517dc4e10f.mp3',
            '/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3',
            '/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3',
            '/academy/content/lessons/l2-l04/moodle-chapter-20-1-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l04/moodle-chapter-20-1-plain-style-verb-page-3.png',
            '/academy/content/lessons/l2-l05/moodle-chapter-20-2-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png',
            '/academy/content/lessons/l2-l05/moodle-chapter-20-conversation-page-1.png',
            '/academy/content/lessons/l2-l05/moodle-b-24.mp3',
            '/academy/content/lessons/l2-l12/moodle-track-78-bank-listening-page-1.png',
            '/academy/vendor/kanjivg/04e00.svg',
            '/academy/vendor/kanjivg/ATTRIBUTION.md',
        ]) expect(source).toContain(`'${required}'`);
        expect(source).toContain("url.pathname === '/yomu.user.js'");
        expect(source).toContain("url.pathname === '/greasyfork/yomu-bunpro.user.js'");
        expect(source).toContain("url.pathname.startsWith('/academy/media/')");
    });

    it('pre-caches every locked story voice through the playback catalog', () => {
        for (const root of ['public', 'docs/public']) {
            const worker = fs.readFileSync(path.resolve(root, 'academy/sw.js'), 'utf8');
            const catalogPath = path.resolve(root, 'academy/audio/story-voice-playback.json');
            const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
                schema?: string;
                entries?: Array<{ reviewStatus?: string; url?: string }>;
            };
            expect(catalog.schema).toBe('yomu-academy.story-voice-playback.v1');
            expect(catalog.entries?.length).toBeGreaterThan(0);
            const urls = catalog.entries?.map(entry => entry.url) ?? [];
            expect(urls).toEqual([...new Set(urls)]);
            for (const entry of catalog.entries ?? []) {
                expect(entry.reviewStatus).toBe('locked');
                expect(entry.url).toMatch(/^\/academy\/audio\/story-(?:pilot|lines)\/[a-z0-9][a-z0-9._-]*\.opus$/u);
                expect(fs.existsSync(hostedPathForRoot(root, entry.url ?? ''))).toBe(true);
            }
            expect(worker).toContain('event.waitUntil(installOfflineShell());');
            expect(worker).toContain('await cache.addAll(storyVoicePaths);');
        }
    });

    it('keeps every typed runtime asset in the offline core', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const runtimeAssets = registryAssetPaths();
        for (const asset of runtimeAssets) {
            expect(source, `missing offline asset ${asset}`).toContain(`'${asset}'`);
        }
        const precachedArt = [...source.matchAll(/^\s+'(\/academy\/art\/[^']+)',$/gmu)].map(match => match[1]);
        expect(new Set(precachedArt)).toEqual(new Set([
            ...runtimeAssets,
            '/academy/art/ACADEMY-ASSET-REGISTRY.json',
            '/academy/art/ASSET-USAGE.json',
            '/academy/art/SPRITE-BATCH-MANIFEST.json',
        ]));
    });

    it('precaches every cast sprite covered by the presentation registry', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const castSpritePaths = Object.keys(ACADEMY_CAST_SPRITE_COVERAGE).flatMap(id =>
            Object.values(ACADEMY_RUNTIME_ASSET_REGISTRY[id as keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY].files),
        );
        for (const asset of castSpritePaths) expect(source).toContain(`'${asset}'`);
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

function registryAssetPaths(): string[] {
    return Object.values(ACADEMY_RUNTIME_ASSET_REGISTRY)
        .flatMap(asset => Object.values(asset.files))
        .sort();
}

function precacheUrls(source: string): string[] {
    const readArray = (name: string): string[] => {
        const body = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`, 'u'))?.[1];
        if (!body) throw new Error(`Missing ${name} service-worker manifest`);
        return [...body.matchAll(/^\s*'([^']+)',?$/gmu)].map(match => match[1]);
    };

    return [...readArray('CAST_SPRITE_PRECACHE'), ...readArray('CORE')];
}

function hostedPathFor(rawUrl: string): string {
    return hostedPathForRoot('docs/public', rawUrl);
}

function hostedPathForRoot(root: string, rawUrl: string): string {
    const pathname = new URL(rawUrl, 'https://yomureader.com').pathname;
    const relativePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    return path.resolve(root, `.${relativePath}`);
}

function runtimeTextFiles(directory: string): string[] {
    const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.txt', '.webmanifest']);
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return runtimeTextFiles(file);
        return textExtensions.has(path.extname(entry.name)) ? [file] : [];
    });
}
