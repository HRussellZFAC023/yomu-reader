// The promise this file keeps: every stored setting stays documented.
//
// docs/reference/settings.md is generated from DEFAULT_SETTINGS and the settings
// dialog. Add, rename, or move a setting and the committed page stops matching what
// the generator produces, and this test fails until `npm run docs:settings-reference`
// runs. Without it the page would be a snapshot of one afternoon's source, and it
// would start lying at the next rename.
//
// The generator runs as a child process on purpose. It bundles the reader with
// esbuild and builds its own jsdom window, which would collide with the window this
// test file already owns.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GENERATE_COMMAND = 'npm run docs:settings-reference';
// Bundling the reader and reading the rendered form back takes several seconds.
const TIMEOUT_MS = 180_000;

interface SettingsReferenceReport {
    stale: boolean;
    settings: number;
    described: number;
    placed: number;
    sections: number;
    keys: string[];
}

// Bundling the reader is the expensive part, so both tests read one run.
let cached: { report: SettingsReferenceReport; stale: boolean } | null = null;

function settingsReferenceReport(): { report: SettingsReferenceReport; stale: boolean } {
    cached ??= runGenerator();
    return cached;
}

function runGenerator(): { report: SettingsReferenceReport; stale: boolean } {
    const script = path.join(ROOT, 'scripts', 'settings-reference.mjs');
    try {
        const stdout = execFileSync(process.execPath, [script, '--check', '--report'], { encoding: 'utf8' });
        return { report: JSON.parse(stdout) as SettingsReferenceReport, stale: false };
    } catch (error) {
        const stdout = String((error as { stdout?: string }).stdout ?? '');
        const report = stdout.trim() ? JSON.parse(stdout) as SettingsReferenceReport : null;
        if (!report) throw error;
        return { report, stale: true };
    }
}

describe('generated settings reference', () => {
    it('holds a page that matches the settings source', () => {
        const { report, stale } = settingsReferenceReport();

        expect(
            stale || report.stale,
            `docs/reference/settings.md is out of date with the settings source. Run: ${GENERATE_COMMAND}`,
        ).toBe(false);
    }, TIMEOUT_MS);

    it('lists every stored setting once, and places nearly all of them in a section', () => {
        const { report } = settingsReferenceReport();

        expect(report.settings).toBeGreaterThan(250);
        expect(new Set(report.keys).size).toBe(report.settings);
        // A structural change in the dialog could empty every section at once and
        // still leave a plausible-looking page, so hold a floor on placement.
        expect(report.placed / report.settings).toBeGreaterThan(0.85);
        expect(report.sections).toBeGreaterThan(10);
        // Most rows must carry wording from the dialog. The rest are honest gaps,
        // and a flood of them would mean label lookup broke, not that the wording
        // vanished overnight.
        expect(report.described / report.settings).toBeGreaterThan(0.8);
    }, TIMEOUT_MS);

    it('shows the effective language-neutral fresh-install state without rewriting compatibility defaults', () => {
        settingsReferenceReport();
        const page = readFileSync(path.join(ROOT, 'docs', 'reference', 'settings.md'), 'utf8');

        expect(page).toContain('Fresh setup is language-neutral. Target-specific reading and Japanese-only preferences stay inactive until you explicitly choose a learning target.');
        expect(page).toContain('| Selected learning-language text on webpages | — | inactive until a learning target is explicitly chosen | `annotationsPaused` |');
        expect(page).toContain('| Filter YouTube to the selected learning language | — | stored on; inactive before target choice, then automatic for Japanese or opt-in for any other target | `youtubeImmersionEnabled` |');
        expect(page).toContain('| Show Japanese channel suggestions | — | stored on; inactive until Japanese is explicitly chosen | `youtubeShowChannelRecommendations` |');
        expect(page).toContain('| Open Japanese versions of sites | — | off; explicit opt-in after choosing Japanese | `preferJapaneseSiteLanguage` |');
        expect(page).not.toContain('| Japanese YouTube only | — | on | `youtubeImmersionEnabled` |');
        expect(page).not.toContain('| Japanese text on webpages | — | off | `annotationsPaused` |');
    }, TIMEOUT_MS);
});
