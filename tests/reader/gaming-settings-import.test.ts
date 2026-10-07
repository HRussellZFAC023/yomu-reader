import { describe, expect, it } from 'vitest';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { reviewGradeProfile, reviewGradeScale } from '../../src/reader/cards/grade-scale';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import { READER_SETTINGS_BACKUP_FORMAT, READER_SETTINGS_BACKUP_VERSION } from '../../src/reader/settings/file-io';
import { gamingSettingsFromBrowserExport } from '../../src/gaming/renderer/settings-import';

const JITEN_CARD = { vid: 1234, sid: 0, source: 'jiten', jitenWordId: 1234, jitenReadingIndex: 0 } as unknown as JPDBCard;

// Gaming's own copy, as a learner who set up a local OCR server and Jiten has it — but
// who chose Pass/Fail grading in the browser, where Gaming never saw it.
function gamingSettings(): ReaderSettings {
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        ocrEnabled: true,
        ocrProvider: 'local-service',
        ocrEndpointUrl: 'http://127.0.0.1:7331/ocr',
        apiGradingProvider: 'jiten',
        jitenApiKey: 'gaming-key',
        twoButtonReviews: false,
    });
}

function browserExport(settings: Partial<ReaderSettings>): string {
    return JSON.stringify({
        formatName: READER_SETTINGS_BACKUP_FORMAT,
        formatVersion: READER_SETTINGS_BACKUP_VERSION,
        exportedAt: '2026-10-06T12:00:00.000Z',
        settings: normalizeReaderSettings({ ...DEFAULT_SETTINGS, ...settings }),
        storage: {},
    });
}

function jitenGrades(settings: ReaderSettings): string[] {
    return reviewGradeScale(settings, reviewGradeProfile(JITEN_CARD, 'jiten')).grades.map(([, label]) => label);
}

describe('Yomu Gaming reads the browser settings export', () => {
    it('grades Jiten words Pass/Fail after the browser export says so', () => {
        const before = gamingSettings();
        // What the learner reported: Gaming's own copy still had the four-button scale.
        expect(jitenGrades(before)).toEqual(['Again', 'Hard', 'Good', 'Easy']);

        const imported = gamingSettingsFromBrowserExport(browserExport({
            twoButtonReviews: true,
            apiGradingProvider: 'jiten',
            jitenApiKey: 'browser-key',
        }), before);

        expect(imported?.twoButtonReviews).toBe(true);
        expect(jitenGrades(imported!)).toEqual(['Fail', 'Pass']);
        expect(imported?.jitenApiKey).toBe('browser-key');
    });

    it('keeps how Gaming reads the screen', () => {
        const imported = gamingSettingsFromBrowserExport(browserExport({
            ocrProvider: 'cloud-vision',
            ocrEndpointUrl: '',
            ocrEnabled: false,
        }), gamingSettings());

        expect(imported).toMatchObject({
            ocrEnabled: true,
            ocrProvider: 'local-service',
            ocrEndpointUrl: 'http://127.0.0.1:7331/ocr',
        });
    });

    it('keeps the shortcuts the browser export does not name', () => {
        const current = normalizeReaderSettings({
            ...gamingSettings(),
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: 'Shift' },
        });
        const exported = JSON.parse(browserExport({})) as { settings: Partial<ReaderSettings> };
        delete (exported.settings.shortcuts as Partial<ReaderSettings['shortcuts']> | undefined)?.hoverLookup;

        const imported = gamingSettingsFromBrowserExport(JSON.stringify({
            formatName: READER_SETTINGS_BACKUP_FORMAT,
            formatVersion: READER_SETTINGS_BACKUP_VERSION,
            settings: exported.settings,
        }), current);

        expect(imported?.shortcuts.hoverLookup).toBe('Shift');
    });

    it('refuses a file that is not a Yomu settings export', () => {
        expect(gamingSettingsFromBrowserExport('not json', gamingSettings())).toBeNull();
        expect(gamingSettingsFromBrowserExport(JSON.stringify({ twoButtonReviews: true }), gamingSettings())).toBeNull();
    });
});
