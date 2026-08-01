import { describe, expect, it, vi } from 'vitest';
import {
    registerSubtitleControllerCleanup,
    BASE_DEFAULT_SETTINGS,
    SubtitlePlayerController,
} from './fixtures';
import { ensureManagedWebStorageCurrent } from '../../../src/reader/app/storage';

describe('subtitle parse session persistence (UT-48)', () => {
    registerSubtitleControllerCleanup();

    it('restores parsed cue html after a reload without re-parsing', async () => {
        sessionStorage.clear();
        await ensureManagedWebStorageCurrent();
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
        const storedKey = Object.keys(sessionStorage).find(key => key.startsWith('yomu:subtitle-parse:v4:'));
        expect(storedKey).toBeDefined();

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

        // v3 could contain HTML cached before provisional parse quality became
        // monotonic. Moving the same payload under that legacy prefix must not
        // restore it and mask the fixed parser for the remainder of the TTL.
        const storedValue = sessionStorage.getItem(storedKey!);
        sessionStorage.removeItem(storedKey!);
        sessionStorage.setItem(storedKey!.replace('subtitle-parse:v4:', 'subtitle-parse:v3:'), storedValue!);
        const thirdParse = vi.fn(async () => [token]);
        const third = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: thirdParse,
            onSettingsChange: () => undefined,
        });
        const thirdInternals = third as unknown as {
            parseCueHtml(text: string, settings?: unknown, options?: { allowProvisional?: boolean }): Promise<string>;
        };
        await expect(thirdInternals.parseCueHtml('読む', settings, { allowProvisional: false })).resolves.toBe(html);
        expect(thirdParse).toHaveBeenCalledTimes(1);
        sessionStorage.clear();
    });
});
