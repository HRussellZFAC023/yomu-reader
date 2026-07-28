import { describe, expect, it } from 'vitest';

import { uiText } from '../../src/reader/app/i18n';
import {
    DEFAULT_SETTINGS,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveSubtitleColorSource,
    hasStatusColorSource,
    normalizeReaderSettings,
    statusColorSourceLabel,
} from '../../src/reader/settings/index';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { testEnSettings } from './helpers/settings-fixture';
import type { ReaderSettings } from '../../src/reader/app/types';

function keyless(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return { ...testEnSettings(), apiKey: '', jitenApiKey: '', ankiEnabled: false, ...overrides };
}

function formHtml(settings: ReaderSettings): string {
    return renderSettingsForm(settings, 'https://jpdb.io/settings');
}

// A11: the shipped default used to hide furigana on every kanji from a fixed
// beginner list, so a learner could not tell a "you know this" from a miss.
describe('A11 furigana default is explainable', () => {
    it('ships furigana on every parsed word', () => {
        expect(DEFAULT_SETTINGS.furiganaMode).toBe('all');
    });

    it('shows every reading for a learner with no deck at all', () => {
        const settings = keyless({ yomuLocalSrsEnabled: false, furiganaMode: 'auto' });
        expect(effectiveFuriganaMode(settings)).toBe('all');
    });

    it('keeps a stored difficulty choice through normalization', () => {
        const stored = normalizeReaderSettings({ ...keyless(), furiganaMode: 'difficult-kanji' });
        expect(stored.furiganaMode).toBe('difficult-kanji');
        expect(effectiveFuriganaMode(stored)).toBe('difficult-kanji');
    });

    it('explains difficulty hiding only once it is the chosen mode', () => {
        const off = formHtml(keyless({ furiganaMode: 'all' }));
        expect(off).toContain('data-furigana-difficulty-note');
        expect(off).toMatch(/data-furigana-difficulty-note[^>]* hidden/);

        const on = formHtml(keyless({ furiganaMode: 'difficult-kanji' }));
        expect(on).not.toMatch(/data-furigana-difficulty-note[^>]* hidden/);
        expect(on).toContain(uiText('en', 'furiganaDifficultKanjiHelp'));
    });
});

// A20: the state colour channel followed a jpdb/jiten key alone, so a learner
// reviewing in Yomu's own deck got flat text with nothing to explain it.
describe('A20 status colour has a source or an explanation', () => {
    it('drives the state channel from the local Yomu deck', () => {
        const settings = keyless({ yomuLocalSrsEnabled: true });
        expect(effectiveReaderColorSource(settings, 'jpdb')).toBe('jpdb');
        expect(effectiveReaderColorSource(settings, 'status')).toBe('jpdb');
        expect(effectiveSubtitleColorSource(settings, 'jpdb')).toBe('jpdb');
        expect(hasStatusColorSource(settings)).toBe(true);
    });

    it('names the local deck rather than JPDB when the local deck is the source', () => {
        expect(statusColorSourceLabel(keyless({ yomuLocalSrsEnabled: true }))).toBe('Academy');
        expect(statusColorSourceLabel(keyless({ apiKey: 'jpdb-key', yomuLocalSrsEnabled: true }))).toBe('JPDB');
    });

    it('reports no status source when every deck is off', () => {
        const settings = keyless({ yomuLocalSrsEnabled: false });
        expect(hasStatusColorSource(settings)).toBe(false);
        expect(effectiveReaderColorSource(settings, 'jpdb')).toBe('off');
    });

    it('says so in the form when no deck can supply a status', () => {
        const sourced = formHtml(keyless({ yomuLocalSrsEnabled: true }));
        expect(sourced).toMatch(/data-status-color-no-source[^>]* hidden/);

        const sourceless = formHtml(keyless({ yomuLocalSrsEnabled: false }));
        expect(sourceless).not.toMatch(/data-status-color-no-source[^>]* hidden/);
        expect(sourceless).toContain(uiText('en', 'statusColorNoSourceHelp'));
    });

    it('keeps Anki as a status source on its own', () => {
        const settings = keyless({ ankiEnabled: true, yomuLocalSrsEnabled: false });
        expect(hasStatusColorSource(settings)).toBe(true);
        expect(effectiveReaderColorSource(settings, 'status')).toBe('anki');
    });
});
