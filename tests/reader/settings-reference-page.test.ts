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

    it('documents immediate Japanese reading and the actual stored defaults', () => {
        settingsReferenceReport();
        const page = readFileSync(path.join(ROOT, 'docs', 'reference', 'settings.md'), 'utf8');

        expect(page).toContain('Yomu reads Japanese immediately after installation.');
        expect(page).toContain('| よむ off | — | off | `annotationsPaused` |');
        // A radio group's default is the option the dialog shows chosen, not on/off.
        expect(page).toContain('| Japanese text on webpages | — | Scan Japanese automatically | `manualScanEnabled` |');
        expect(page).toContain('| Image OCR scanning | — | Auto | `ocrAutoScanImages` |');
        expect(page).not.toContain('Japanese-site navigation is optional');
        expect(page).toContain('| Japanese YouTube only | — | on | `youtubeImmersionEnabled` |');
        expect(page).toContain('| Show Japanese channel suggestions | — | on | `youtubeShowChannelRecommendations` |');
        expect(page).toContain('| Request Japanese sites | — | off | `preferJapaneseSiteLanguage` |');
        expect(page).not.toContain('learningTargetChosen');
        expect(page).not.toContain('inactive until');
    }, TIMEOUT_MS);
});
