import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface StudyManifestIcon {
    src?: string;
    sizes?: string;
    type?: string;
    purpose?: string;
}

interface StudyManifestScreenshot {
    src?: string;
    sizes?: string;
    type?: string;
    form_factor?: string;
    label?: string;
}

interface StudyManifest {
    id?: string;
    name?: string;
    short_name?: string;
    description?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    theme_color?: string;
    background_color?: string;
    shortcuts?: Array<{ name?: string; description?: string; url?: string }>;
    icons?: StudyManifestIcon[];
    screenshots?: StudyManifestScreenshot[];
}

const manifest = JSON.parse(readFileSync('public/newtab/manifest.webmanifest', 'utf8')) as StudyManifest;
const serviceWorker = readFileSync('public/newtab/sw.js', 'utf8');
const appHtml = readFileSync('public/newtab/index.html', 'utf8').replace(/\s+/gu, ' ');
const controllerLifecycleSource = readFileSync('src/reader/newtab/controller-lifecycle.ts', 'utf8');

// Manifest paths are relative to /study/, and every hosted asset the manifest
// can reach lives in docs/public (VitePress copies that directory to the site
// root verbatim).
function hostedPath(src: string): string {
    return `docs/public/${src.replace(/^\.\.\//u, '')}`;
}

// Reads width and height out of a PNG IHDR chunk, so a declared `sizes` cannot
// drift from the bytes that actually ship.
function pngSize(path: string): string {
    const header = readFileSync(path).subarray(0, 33);
    expect(header.subarray(1, 4).toString('ascii')).toBe('PNG');
    return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

function acceptedStudyRoutes(): string[] {
    const routeNames = controllerLifecycleSource.match(/NEW_TAB_ROUTE_NAMES = new Set<string>\(\[([^\]]+)\]\)/u);
    expect(routeNames).not.toBeNull();
    return [...routeNames![1].matchAll(/'([^']+)'/gu)].map(match => match[1]);
}

describe('Study offline app contract', () => {
    it('has a stable standalone identity for iOS and Android installation', () => {
        expect(manifest).toMatchObject({
            id: './',
            name: 'よむ — Language Reader & Study',
            short_name: 'よむ',
            start_url: './index.html',
            scope: './',
            display: 'standalone',
        });
        expect(manifest.description).toContain('offline-first');
        expect(`${manifest.name} ${manifest.description}`).not.toMatch(/Japanese Reader|Japanese study/iu);
        expect(appHtml).not.toMatch(/Offline Japanese Reader|Japanese study, dictionary/iu);
    });

    it('offers direct app shortcuts to the core client sections', () => {
        expect(manifest.shortcuts).toEqual([
            expect.objectContaining({ name: 'Study', url: './?mode=word' }),
            expect.objectContaining({ name: 'Library', url: './?mode=search' }),
            expect.objectContaining({ name: 'Stats', url: './?mode=stats' }),
        ]);
        expect(manifest.shortcuts?.find(shortcut => shortcut.name === 'Library')?.description)
            .toContain('selected learning target');
    });

    // A shortcut that lands on an unknown route drops the learner on the
    // default screen with no sign anything was ignored, so the `mode` values
    // are checked against the set the shipped route parser actually accepts
    // rather than against a second copy of the same list.
    it('points every shortcut at a route the client resolves', () => {
        const accepted = acceptedStudyRoutes();
        expect(accepted.length).toBeGreaterThan(2);
        const shortcutModes = manifest.shortcuts?.map(shortcut =>
            new URL(shortcut.url ?? '', 'https://yomureader.com/study/').searchParams.get('mode')) ?? [];
        expect(accepted).toEqual(expect.arrayContaining(shortcutModes));
    });

    // Android refuses to treat a web app as installable without a raster icon
    // of at least 192px, and crops a maskable icon to the inner 80% circle, so
    // the full-bleed square art needs a separate inset plate.
    it('ships raster icons large enough to install with', () => {
        const icons = manifest.icons ?? [];
        const pngIcons = icons.filter(icon => icon.type === 'image/png');
        const largest = Math.max(...pngIcons.map(icon => Number.parseInt(icon.sizes?.split('x')[0] ?? '0', 10)));
        expect(largest).toBeGreaterThanOrEqual(512);
        expect(pngIcons.map(icon => icon.sizes)).toContain('192x192');
        expect(icons.some(icon => icon.purpose === 'maskable' && icon.type === 'image/png')).toBe(true);
        for (const icon of pngIcons) {
            const path = hostedPath(icon.src ?? '');
            expect(existsSync(path), `missing icon ${path}`).toBe(true);
            expect(pngSize(path), `declared size of ${path}`).toBe(icon.sizes);
        }
    });

    // With no screenshots the install sheet is a bare title and icon. Chrome
    // picks the shots by form factor, so both a phone and a desktop shape have
    // to be present or one platform silently falls back to the bare sheet.
    it('describes the install prompt with real screenshots of both shapes', () => {
        const screenshots = manifest.screenshots ?? [];
        expect(screenshots.map(shot => shot.form_factor).sort()).toEqual(['narrow', 'wide']);
        for (const shot of screenshots) {
            const path = hostedPath(shot.src ?? '');
            expect(existsSync(path), `missing screenshot ${path}`).toBe(true);
            expect(pngSize(path), `declared size of ${path}`).toBe(shot.sizes);
            expect(shot.label?.length ?? 0).toBeGreaterThan(10);
        }
    });

    // The installed title bar and the browser chrome paint from two different
    // fields. Standalone surfaces keep the page-background colour on purpose
    // (see src/reader/core/hosted-appearance-boot.ts), so both must be it.
    it('paints the installed title bar the same colour as the page chrome', () => {
        const meta = appHtml.match(/<meta name="theme-color" content="([^"]+)"/u);
        expect(meta?.[1]).toBe(manifest.theme_color);
        expect(manifest.background_color).toBe(manifest.theme_color);
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
