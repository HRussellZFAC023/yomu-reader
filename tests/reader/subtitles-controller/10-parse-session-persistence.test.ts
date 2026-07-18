import { describe, expect, it, vi } from 'vitest';
import {
    registerSubtitleControllerCleanup,
    BASE_DEFAULT_SETTINGS,
    SubtitlePlayerController,
} from './fixtures';

describe('subtitle parse session persistence (UT-48)', () => {
    registerSubtitleControllerCleanup();

    it('restores parsed cue html after a reload without re-parsing', async () => {
        sessionStorage.clear();
        const settings = { ...BASE_DEFAULT_SETTINGS, apiKey: 'test-key', furiganaMode: 'all' as const };
        const token = {
            card: {
                vid: 9, sid: 1, rid: 0, spelling: '読む', reading: 'よむ', frequencyRank: null,
                partOfSpeech: [], meanings: [], cardState: ['known' as const], pitchAccent: [],
                wordWithReading: null, source: 'jpdb' as const,
            },
            start: 0, end: 2, length: 2,
            rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
            pitchClass: 'heiban', sentence: '読む',
        };
        const firstParse = vi.fn(async () => [token]);
        const first = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: firstParse,
            onSettingsChange: () => undefined,
        });
        const firstInternals = first as unknown as {
            parseCueHtml(text: string, settings?: unknown, options?: { allowProvisional?: boolean }): Promise<string>;
        };
        const html = await firstInternals.parseCueHtml('読む', settings, { allowProvisional: false });
        expect(html).toContain('jpdb-reader-word');
        expect(Object.keys(sessionStorage).some(key => key.startsWith('yomu:subtitle-parse:'))).toBe(true);

        const secondParse = vi.fn(async () => [token]);
        const second = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: secondParse,
            onSettingsChange: () => undefined,
        });
        const secondInternals = second as unknown as {
            parseCueHtml(text: string, settings?: unknown, options?: { allowProvisional?: boolean }): Promise<string>;
        };
        const restored = await secondInternals.parseCueHtml('読む', settings, { allowProvisional: false });
        expect(restored).toBe(html);
        expect(secondParse).not.toHaveBeenCalled();
        sessionStorage.clear();
    });
});
