import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextExplicitUiLanguage, resolveUiLanguage } from '../../src/reader/app/i18n';

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
        const source = readFileSync('src/reader/app/i18n.ts', 'utf8');
        const englishKeys = copyKeys(between(source, '    en: {', '    },\n} as const'));
        const japaneseCopySource = [
            between(source, 'const JA_COPY', 'const JA_SETTINGS_COPY'),
            between(source, 'const JA_SETTINGS_COPY', 'export interface GrammarRuleCopy'),
        ].join('\n');
        const japaneseKeys = new Set([
            ...copyKeys(japaneseCopySource),
            ...copyTableKeys(japaneseCopySource),
        ]);

        expectCopyKeysSynced(englishKeys, japaneseKeys, japaneseCopySource);
    });

    it('keeps Japanese new-tab copy keys in sync with English copy keys', () => {
        const source = readFileSync('src/reader/newtab/i18n.ts', 'utf8');
        const englishKeys = copyKeys(between(source, '    en: {', '    },\n} as const'));
        const japaneseCopySource = between(source, 'const JA_NEW_TAB_COPY', 'const NEW_TAB_COPY_BY_LANGUAGE');
        const japaneseKeys = new Set(copyKeys(japaneseCopySource));

        expectCopyKeysSynced(englishKeys, japaneseKeys, japaneseCopySource);
    });

    it('keeps hosted homepage link cards covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const homeSource = readFileSync('docs/index.md', 'utf8');
        const nextSteps = between(homeSource, '<div class="yomu-link-grid yomu-next-grid">', '</div>');
        const cardCopy = [...nextSteps.matchAll(/<(?:strong|span)>(.*?)<\/(?:strong|span)>/g)]
            .map(match => decodeMarkdownHtml(match[1].trim()))
            .filter(Boolean);

        expect(cardCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps dynamic hosted docs attributes covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const dynamicCopy = [
            'Switch to dark theme',
            'Switch to light theme',
        ];

        expect(dynamicCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
        expect(themeSource).toContain('attributeFilter: [...HOSTED_DOCS_TRANSLATED_ATTRIBUTES]');
        expect(themeSource).toContain('canonicalHostedDocsSourceString(value, originals.get(attribute))');
        expect(themeSource).not.toContain('未翻訳');
        expect(themeSource).not.toContain('母国語의');
        expect(themeSource).not.toContain("Wait, let's fix");
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

function copyTableKeys(source: string): string[] {
    return [...source.matchAll(/^([A-Za-z0-9_]+)\t/gm)].map(match => match[1]);
}

function expectCopyKeysSynced(englishKeys: string[], japaneseKeys: Set<string>, japaneseCopySource: string): void {
    expect(englishKeys.filter(key => !japaneseKeys.has(key))).toEqual([]);
    expect([...japaneseKeys].filter(key => !englishKeys.includes(key))).toEqual([]);
    expect(japaneseCopySource).not.toContain("'未翻訳'");
}

function hasHostedDocsJaCopy(source: string, copy: string): boolean {
    return source.includes(`'${copy.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}':`);
}

function decodeMarkdownHtml(value: string): string {
    return value.replaceAll('&amp;', '&');
}
