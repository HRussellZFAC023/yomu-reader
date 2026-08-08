import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readableTextOn } from '../../docs/.vitepress/theme/color-contrast';
import { hostedAccentCssVariables } from '../../src/reader/core/hosted-accent-css';
import { contrastRatio } from '../../src/reader/theme/color-utils';

const ROOT = process.cwd();

function readProjectFile(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

// The hosted docs theme must never tear down reader-word annotations on a
// layout-inert settings save (the runtime persists its full settings object
// e.g. when the demo video's subtitle module saves state; stripping ruby on
// each save collapsed page height and yanked the scroll position on iOS
// Safari). Website locale is route-owned, so teardown is allowed only for a
// change to the defined set of annotation-affecting reader settings.
describe('hosted docs annotation reset gating', () => {
    const theme = readProjectFile('docs/.vitepress/theme/index.ts');

    it('keeps website locale independent from reader interface-language saves', () => {
        expect(theme).toContain('function activeWebsiteLocale()');
        expect(theme).toContain('websiteLocaleForPathname(window.location.pathname)');
        expect(theme).not.toContain('localizeHostedDocsCopy');
        expect(theme).not.toContain('hostedAppliedDocsLanguage');
        expect(theme).not.toContain('yomu-interface-language-change');
    });

    it('tears down annotations only when annotation-affecting settings changed', () => {
        const handler = theme.slice(theme.indexOf('function syncHostedAnnotationSettingsFromEvent'));
        const handlerBody = handler.slice(0, handler.indexOf('\n}'));
        expect(handlerBody).toContain('if (!changed) return;');
        expect(handlerBody.indexOf('if (!changed) return;'))
            .toBeLessThan(handlerBody.indexOf('cleanupHostedDocsAnnotations(document.body);'));
    });

    it('fingerprints settings whose values are baked into reader-word DOM', () => {
        for (const key of ['furiganaMode', 'showFurigana', 'hideKnownFurigana', 'showPitchAccent', 'parserProvider', 'dictionaryPreferences']) {
            expect(theme).toContain(`'${key}',`);
        }
        expect(theme).toContain('hostedAppliedAnnotationSettings ??= hostedAnnotationSettingsFingerprint(readStoredSettings());');
    });

    it('re-applies annotation scope after VitePress SPA route changes', () => {
        expect(theme).toContain('ctx.router.onAfterRouteChange = async to => {');
        expect(theme).toContain('window.requestAnimationFrame(syncHostedRouteEnhancements);');
        expect(theme).toContain("const japanese = activeWebsiteLocale() === 'ja';");
    });
});

describe('hosted docs reader scan boundary', () => {
    const theme = readProjectFile('docs/.vitepress/theme/index.ts');

    it('uses the page-owned scope instead of stamping individual chrome nodes ignored', () => {
        // The document-level scope and explicit Reader Surfaces keep translated
        // site UI out of scans without mutating every VitePress chrome node.
        expect(theme).toContain("document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface')");
        expect(theme).not.toContain('stampHostedSurfaceIgnoreChrome');
        expect(theme).not.toContain("element.setAttribute('data-jpdb-reader-surface-ignore', 'true');");
    });

});

describe('hosted docs synchronous accent contrast', () => {
    const css = readProjectFile('docs/.vitepress/theme/custom.css');
    const theme = readProjectFile('docs/.vitepress/theme/index.ts');
    const token = (block: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1] ?? '';

    it('ships the default accent ink at AA contrast before hosted settings hydrate', () => {
        const lightRoot = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        const darkRoot = /\.dark\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        const accent = token(lightRoot, '--vp-c-brand-3');
        const lightInk = token(lightRoot, '--yomu-doc-accent-ink');
        const darkInk = token(darkRoot, '--yomu-doc-accent-ink');

        expect(accent).toBe('#5ea780');
        expect(contrastRatio(lightInk, accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(darkInk, accent)).toBeGreaterThanOrEqual(4.5);
        expect(css).toMatch(/\.yomu-cta-button\.primary:hover\s*\{[^}]*color:\s*var\(--yomu-brand-hover-ink, var\(--yomu-doc-brand-hover-ink\)\) !important;/);
        expect(css).toContain('.yomu-cta-button.primary:hover > .jpdb-reader-text-mirror,');
    });

    it('keeps readable-brand buttons accessible before and after accent hydration', () => {
        const lightRoot = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        const darkRoot = /\.dark\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        for (const block of [lightRoot, darkRoot]) {
            expect(contrastRatio(token(block, '--yomu-doc-brand-ink'), token(block, '--vp-c-brand-1'))).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(token(block, '--yomu-doc-brand-hover-ink'), token(block, '--vp-c-brand-2'))).toBeGreaterThanOrEqual(4.5);
        }
        // The hydrated theme stamps the shared variable map (the same one the
        // pre-paint bootstrap uses), so the guard is on the map's own values.
        for (const dark of [false, true]) {
            const variables = hostedAccentCssVariables(token(dark ? darkRoot : lightRoot, '--vp-c-brand-3'), dark);
            expect(contrastRatio(variables['--yomu-brand-ink'], variables['--vp-c-brand-1'])).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(variables['--yomu-brand-hover-ink'], variables['--vp-c-brand-2'])).toBeGreaterThanOrEqual(4.5);
        }
        expect(theme).toContain('const variables = hostedAccentCssVariables(accent, dark);');
    });

    it('falls back to pure black when near-black and white both miss AA on a mid-tone hover', () => {
        const hover = '#4d8969';
        const ink = readableTextOn(hover);
        expect(ink).toBe('#000000');
        expect(contrastRatio(ink, hover)).toBeGreaterThanOrEqual(4.5);
    });
});
