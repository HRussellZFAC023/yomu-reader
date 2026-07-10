import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

// The homepage chrome groups (hero pills, install steps, nav tabs, next-step
// card titles) reserve the furigana band with fixed-height flex-end label
// boxes so annotated and plain labels share identical geometry and baselines.
describe('hosted docs furigana chrome geometry', () => {
    const css = readProjectFile('docs/.vitepress/theme/custom.css');

    it('reserves a uniform ruby band on every hero pill (not only annotated ones)', () => {
        expect(css).toContain('html[lang="ja"] .VPHomeHero .actions .VPButton');
        expect(css).not.toContain(':has(.jpdb-reader-word.jpdb-reader-has-furi)');
    });

    it('keeps the nav row inside the 64px navbar and covers the More flyout trigger', () => {
        expect(css).toContain('html[lang="ja"] .VPNavBarMenu .VPNavBarMenuLink,');
        expect(css).toContain('html[lang="ja"] .VPNavBarMenu .VPNavBarMenuGroup .button');
        expect(css).toContain('height: var(--vp-nav-height);');
    });

    it('scopes the fixed card-title band to the homepage next-step grid, em-sized for text enlargement', () => {
        expect(css).toContain('html[lang="ja"] .yomu-next-grid .yomu-link-card strong');
        expect(css).not.toMatch(/html\[lang="ja"\] \.yomu-link-card strong \{/);
        expect(css).toMatch(/\.yomu-next-grid \.yomu-link-card strong \{[^}]*height: [\d.]+em/);
    });
});
