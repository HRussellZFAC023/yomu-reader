import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/reader/companions/settings-surface';
import { ReaderApp } from '../../src/reader/app/main';
import { applyTokensToScanTarget, collectTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const TEXT = '日本語';
const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'にほんご', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
};

function token(): JPDBToken {
    return {
        card: { ...CARD },
        start: 0, end: TEXT.length, length: TEXT.length,
        rubies: [{ text: 'にほんご', start: 0, end: TEXT.length, length: TEXT.length }],
        pitchClass: '', sentence: TEXT,
    };
}

interface AppInternals {
    settings: ReaderSettings;
    ocr: { refreshForModeChange: () => void };
    subtitles: { refresh: () => void };
    getSettingsDialog(): { } | undefined;
    settingsDialog?: { };
    scheduleAutoScan: (delay: number, options?: { force?: boolean }) => void;
    pageScanner: { cancelVisiblePageScan: () => void };
    autoScanTimer?: number;
    toast: (message: string) => void;
}

interface DialogInternals {
    dependencies: { setSettings: (settings: ReaderSettings, options?: { transient?: boolean }) => void };
}

function annotate(): void {
    document.body.innerHTML = `
        <p id="prose">${TEXT}</p>
        <span id="mirror-host" class="ytAttributedStringHost">${TEXT}</span>
        <div id="grown" data-yomu-ruby-room="true" style="min-height: 80px;">${TEXT}</div>
    `;
    const settings = { ...DEFAULT_SETTINGS, furiganaMode: 'all' as const };
    const prose = document.getElementById('prose')!;
    const proseTarget = collectTextTargetsIn(prose, 10, false).find(t => t.text.trim() === TEXT)!;
    applyTokensToScanTarget(proseTarget, [token()], settings);
    const host = document.getElementById('mirror-host')!;
    const hostTarget = collectTextTargetsIn(host, 10, false).find(t => t.text.trim() === TEXT)!;
    applyTokensToScanTarget({ ...hostTarget, nonDestructive: true }, [token()], settings);
    expect(document.querySelectorAll('.jpdb-reader-word').length).toBeGreaterThan(0);
    expect(document.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// Class G: the settings-dialog OFF radio (pageScanMode='off') persisted
// annotationsPaused but stripped NOTHING until reload — the dialog path
// lacked the clear the puck/remote-tab paths already had. The dialog's
// setSettings dependency must route a pause transition through the full
// instant path: clearAllAnnotations (words, mirrors, ruby-room growth) on
// pause, rescan on resume — without any page refresh.
describe('annotations-off via the settings dialog is instant (class G)', () => {
    it('strips every yomu artifact when the dialog writes annotationsPaused=true, and rescans on resume', () => {
        const app = new ReaderApp() as unknown as AppInternals;
        app.settings = { ...DEFAULT_SETTINGS };
        app.ocr = { refreshForModeChange: vi.fn() } as AppInternals['ocr'];
        app.subtitles = { refresh: vi.fn() } as AppInternals['subtitles'];
        app.toast = vi.fn();
        const scheduleAutoScan = vi.fn();
        app.scheduleAutoScan = scheduleAutoScan;

        const dialog = app.getSettingsDialog() as unknown as DialogInternals | undefined;
        expect(dialog, 'settings companion must resolve in tests').toBeTruthy();

        annotate();

        // The dialog submit path hands the parsed form settings to main's
        // setSettings dependency — exactly what we invoke here.
        dialog!.dependencies.setSettings({ ...app.settings, annotationsPaused: true });

        expect(app.settings.annotationsPaused).toBe(true);
        // Zero yomu artifacts, no reload: no words, no mirrors, no growth
        // stamps, and the host text restored.
        expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(0);
        expect(document.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(0);
        expect(document.querySelectorAll('[data-yomu-ruby-room]')).toHaveLength(0);
        expect(document.getElementById('prose')?.textContent).toBe(TEXT);
        expect(document.getElementById('mirror-host')?.textContent).toBe(TEXT);
        expect(document.getElementById('mirror-host')?.style.getPropertyValue('visibility')).toBe('');
        expect(app.subtitles.refresh).toHaveBeenCalledTimes(1);

        // Toggling back ON through the dialog rescans immediately.
        dialog!.dependencies.setSettings({ ...app.settings, annotationsPaused: false });
        expect(app.settings.annotationsPaused).toBe(false);
        expect(scheduleAutoScan).toHaveBeenCalledWith(0, { force: true });
    });

    it('cancels pending and in-flight scan work when pausing (no re-annotation after the clear)', () => {
        const app = new ReaderApp() as unknown as AppInternals;
        app.settings = { ...DEFAULT_SETTINGS };
        app.ocr = { refreshForModeChange: vi.fn() } as AppInternals['ocr'];
        app.toast = vi.fn();
        app.scheduleAutoScan = vi.fn();
        const cancel = vi.fn();
        app.pageScanner = { cancelVisiblePageScan: cancel };
        app.autoScanTimer = window.setTimeout(() => undefined, 60_000);
        const dialog = app.getSettingsDialog() as unknown as DialogInternals;

        dialog.dependencies.setSettings({ ...app.settings, annotationsPaused: true });

        // A previously armed auto-scan timer and any in-flight scan must be
        // dropped, or they would re-annotate right after the clear.
        expect(app.autoScanTimer).toBeUndefined();
        expect(cancel).toHaveBeenCalled();
    });

    it('never treats a TRANSIENT probe swap as a pause transition (unsaved OFF + Anki test)', () => {
        const app = new ReaderApp() as unknown as AppInternals;
        app.settings = { ...DEFAULT_SETTINGS };
        app.ocr = { refreshForModeChange: vi.fn() } as AppInternals['ocr'];
        app.toast = vi.fn();
        app.scheduleAutoScan = vi.fn();
        const dialog = app.getSettingsDialog() as unknown as DialogInternals;

        annotate();
        // The dialog's Anki probes / audio previews swap form-derived settings
        // in temporarily; with OFF selected but unsaved this must not clear.
        dialog.dependencies.setSettings({ ...app.settings, annotationsPaused: true }, { transient: true });
        expect(document.querySelectorAll('.jpdb-reader-word').length).toBeGreaterThan(0);
        expect(document.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        dialog.dependencies.setSettings({ ...app.settings, annotationsPaused: false }, { transient: true });
        expect(app.scheduleAutoScan).not.toHaveBeenCalled();
    });

    it('does not clear or rescan when a dialog write leaves the pause flag unchanged', () => {
        const app = new ReaderApp() as unknown as AppInternals;
        app.settings = { ...DEFAULT_SETTINGS };
        app.ocr = { refreshForModeChange: vi.fn() } as AppInternals['ocr'];
        app.toast = vi.fn();
        const scheduleAutoScan = vi.fn();
        app.scheduleAutoScan = scheduleAutoScan;
        const dialog = app.getSettingsDialog() as unknown as DialogInternals;

        annotate();
        dialog.dependencies.setSettings({ ...app.settings, showPitchAccent: false });
        // Unrelated settings writes never nuke the page's annotations.
        expect(document.querySelectorAll('.jpdb-reader-word').length).toBeGreaterThan(0);
        expect(document.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        expect(scheduleAutoScan).not.toHaveBeenCalled();
    });
});
