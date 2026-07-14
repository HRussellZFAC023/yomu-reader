import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readableTextOn } from '../../docs/.vitepress/theme/color-contrast';
import { contrastRatio } from '../../src/reader/theme/color-utils';

const ROOT = process.cwd();

function readProjectFile(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

// The hosted docs theme must never tear down reader-word annotations on a
// layout-inert settings save (the runtime persists its full settings object
// e.g. when the demo video's subtitle module saves state; stripping ruby on
// each save collapsed page height and yanked the scroll position on iOS
// Safari). Teardown is allowed only for an actual interface-language change
// or a change to a defined set of annotation-affecting settings.
describe('hosted docs annotation reset gating', () => {
    const theme = readProjectFile('docs/.vitepress/theme/index.ts');

    it('compares the settings-event language against the last APPLIED language, not effective state', () => {
        // The runtime mirrors new settings to storage BEFORE dispatching the
        // change event, so "effective before the event" already reads the new
        // language; the comparison must use the language localization last
        // applied to the document.
        expect(theme).toContain('let hostedAppliedDocsLanguage: InterfaceLanguage | undefined;');
        expect(theme).toContain('hostedAppliedDocsLanguage = language;');
        expect(theme).toMatch(/languageChanged = language !== undefined && effectiveInterfaceLanguage\(\) !== hostedAppliedDocsLanguage/);
    });

    it('tears down annotations only when language or an annotation-affecting setting changed', () => {
        expect(theme).toContain('if (!languageChanged && !annotationSettingsChanged) return;');
        // The reset call in the settings-event handler must be behind that gate.
        const handler = theme.slice(theme.indexOf('function syncHostedLanguageFromSettingsEvent'));
        const handlerBody = handler.slice(0, handler.indexOf('\n}'));
        expect(handlerBody).toContain('if (!languageChanged && !annotationSettingsChanged) return;');
        expect(handlerBody.indexOf('if (!languageChanged && !annotationSettingsChanged) return;'))
            .toBeLessThan(handlerBody.indexOf('scheduleHostedDocsLocalization({ resetReaderWords: true })'));
    });

    it('fingerprints the annotation-affecting settings that are baked into reader-word DOM', () => {
        for (const key of ['furiganaMode', 'showFurigana', 'hideKnownFurigana', 'showPitchAccent', 'parserProvider', 'dictionaryPreferences']) {
            expect(theme).toContain(`'${key}',`);
        }
        // Baseline must be seeded from storage before the first change event
        // (whose payload already carries the new values).
        expect(theme).toContain('hostedAppliedAnnotationSettings ??= hostedAnnotationSettingsFingerprint(readStoredSettings());');
    });

    it('keeps explicit language toggles on the reset path', () => {
        expect(theme).toContain("window.addEventListener(LANGUAGE_EVENT, () => {");
        expect(theme).toContain('scheduleHostedDocsLocalization({ resetReaderWords: true });');
    });
});

describe('hosted docs reader scan boundary', () => {
    const theme = readProjectFile('docs/.vitepress/theme/index.ts');

    it('stamps homepage chrome at initial mount and after VitePress swaps route content', () => {
        for (const selector of [
            "'.VPNav'",
            "'.VPHero'",
            "'.VPHomeHero'",
            "'.yomu-install-panel'",
            "'.yomu-next-grid'",
            "'.yomu-hosted-overflow-group'",
        ]) {
            expect(theme).toContain(selector);
        }
        expect(theme).toContain("element.setAttribute('data-jpdb-reader-surface-ignore', 'true');");

        const initialInstall = theme.slice(theme.indexOf('function installHostedDocsEnhancements'));
        expect(initialInstall.indexOf('stampHostedSurfaceIgnoreChrome();'))
            .toBeLessThan(initialInstall.indexOf('syncLandmarks();'));

        const routeSync = theme.slice(theme.indexOf('function scheduleHostedDocsShellSync'));
        const routeSyncBody = routeSync.slice(0, routeSync.indexOf('\n}'));
        expect(routeSyncBody).toContain('stampHostedSurfaceIgnoreChrome();');
    });

    it('scopes the fixed card-title band to the homepage next-step grid, em-sized for text enlargement', () => {
        expect(css).toContain('html[lang="ja"] .yomu-next-grid .yomu-link-card strong');
        expect(css).not.toMatch(/html\[lang="ja"\] \.yomu-link-card strong \{/);
        expect(css).toMatch(/\.yomu-next-grid \.yomu-link-card strong \{[^}]*height: [\d.]+em/);
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
        expect(theme).toContain("root.style.setProperty('--yomu-brand-ink', brandText);");
        expect(theme).toContain("root.style.setProperty('--yomu-brand-hover-ink', brandHoverText);");
    });

    it('falls back to pure black when near-black and white both miss AA on a mid-tone hover', () => {
        const hover = '#4d8969';
        const ink = readableTextOn(hover);
        expect(ink).toBe('#000000');
        expect(contrastRatio(ink, hover)).toBeGreaterThanOrEqual(4.5);
    });
});
