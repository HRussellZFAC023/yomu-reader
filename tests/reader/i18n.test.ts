import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextExplicitUiLanguage, resolveUiLanguage } from '../../src/reader/i18n';

describe('interface language resolution', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('resolves automatic language from Japanese browser locales', () => {
        vi.stubGlobal('navigator', { languages: ['ja-JP', 'en-US'], language: 'ja-JP' });

        expect(resolveUiLanguage('auto')).toBe('ja');
    });

    it('falls back to English for non-Japanese automatic locales', () => {
        vi.stubGlobal('navigator', { languages: ['en-GB'], language: 'en-GB' });

        expect(resolveUiLanguage('auto')).toBe('en');
    });

    it('toggles automatic language to the opposite explicit HUD language', () => {
        vi.stubGlobal('navigator', { languages: ['ja'], language: 'ja' });

        expect(nextExplicitUiLanguage('auto')).toBe('en');
        expect(nextExplicitUiLanguage('en')).toBe('ja');
    });

    it('keeps Japanese copy keys in sync with English copy keys', () => {
        const source = readFileSync('src/reader/i18n.ts', 'utf8');
        const englishKeys = copyKeys(between(source, '    en: {', '    },\n} as const'));
        const japaneseCopySource = [
            between(source, 'const JA_COPY', 'const JA_SETTINGS_COPY'),
            between(source, 'const JA_SETTINGS_COPY', 'export interface GrammarRuleCopy'),
        ].join('\n');
        const japaneseKeys = new Set([
            ...copyKeys(japaneseCopySource),
        ]);

        expect(englishKeys.filter(key => !japaneseKeys.has(key))).toEqual([]);
        expect([...japaneseKeys].filter(key => !englishKeys.includes(key))).toEqual([]);
        expect(japaneseCopySource).not.toContain("'未翻訳'");
    });
});

function between(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start + startMarker.length, end);
}

function copyKeys(source: string): string[] {
    return [...source.matchAll(/^\s{4,8}([A-Za-z0-9_]+):/gm)].map(match => match[1]);
}
