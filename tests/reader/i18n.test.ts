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

    it('keeps study setup callouts covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const calloutCopy = [
            'the hosted',
            'reviews Anki when it is reachable, then Jiten, then JPDB, then your local dictionary words in turn — a single daily-review surface for whatever you have connected.',
        ];

        expect(calloutCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps Study setup and offline guidance covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const studySource = readFileSync('docs/tools/study-page.md', 'utf8');
        const studySection = between(studySource, '## Set it up', '## Questions');
        const studyCopy = [
            ...markdownHeadings(studySection),
            ...markdownParagraphs(studySection),
            ...markdownListTextNodes(studySection),
        ];
        const inlineTextNodeCopy = [
            'When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an ',
            'Offline cache',
            ' status, and review grades that cannot reach Jiten, JPDB, or Anki are saved locally and retried when the provider reconnects.',
            'Open ',
            'Settings → Study',
            ' to choose a review source and switch the rating scale between the normal five buttons and a thumb-friendly ',
            'Fail / Pass',
            ' mode. On phones, the two-button row uses the full available width so the actions stay centered and easy to hit.',
        ];

        expect(studyCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
        expect(inlineTextNodeCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps hosted tools overview covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const toolsSource = readFileSync('docs/tools/index.md', 'utf8');
        const toolsCopy = [
            ...markdownHeadings(toolsSource),
            ...markdownParagraphs(toolsSource),
            ...htmlCardCopy(toolsSource),
            ...htmlLinkCopy(toolsSource),
        ];

        expect(toolsCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
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

    it('keeps latest changelog entries covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const changelogSource = readFileSync('CHANGELOG.md', 'utf8');
        const latestRelease = latestChangelogRelease(changelogSource);
        const latestCopy = [
            ...markdownHeadings(latestRelease).filter(heading => !isChangelogVersionHeading(heading)),
            ...markdownListTextNodes(latestRelease),
        ];

        expect(latestCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
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
    const singleQuoted = `'${copy.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}':`;
    const doubleQuoted = `"${copy.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}":`;
    return source.includes(singleQuoted) || source.includes(doubleQuoted);
}

function decodeMarkdownHtml(value: string): string {
    return value.replaceAll('&amp;', '&');
}

function markdownHeadings(source: string): string[] {
    return [...source.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].trim());
}

function markdownParagraphs(source: string): string[] {
    return source
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(block => block && !block.startsWith('---') && !block.startsWith('#') && !block.startsWith('<') && !block.startsWith('- ') && !/^\d+\.\s+/.test(block))
        .map(block => decodeMarkdownLinks(block).replace(/\*\*(.*?)\*\*/g, '$1'))
        .filter(Boolean);
}

function markdownListTextNodes(source: string): string[] {
    return [...source.matchAll(/^(?:-|\d+\.)\s+(.+)$/gm)]
        .flatMap(match => markdownTextNodeSegments(match[1]))
        .filter(Boolean);
}

function markdownTextNodeSegments(value: string): string[] {
    return value
        .split(/(`[^`]*`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
        .map(segment => {
            if (!segment || /^`[^`]*`$/.test(segment)) return '';
            const strong = segment.match(/^\*\*(.*?)\*\*$/);
            if (strong) return decodeMarkdownLinks(strong[1] ?? '').trim();
            const link = segment.match(/^\[([^\]]+)\]\([^)]+\)$/);
            if (link) return decodeMarkdownHtml(link[1]?.trim() ?? '');
            return decodeMarkdownLinks(segment).replace(/\*\*(.*?)\*\*/g, '$1').trim();
        })
        .filter(segment => /[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/u.test(segment))
        .filter(Boolean);
}

function latestChangelogRelease(source: string): string {
    const firstRelease = source.search(/^##\s+/m);
    expect(firstRelease).toBeGreaterThanOrEqual(0);
    const nextRelease = source.slice(firstRelease + 1).search(/^##\s+/m);
    return nextRelease < 0
        ? source.slice(firstRelease)
        : source.slice(firstRelease, firstRelease + 1 + nextRelease);
}

function isChangelogVersionHeading(heading: string): boolean {
    return /^\[[0-9.]+\]\s+-\s+\d{4}-\d{2}-\d{2}$/.test(heading);
}

function htmlCardCopy(source: string): string[] {
    return [...source.matchAll(/<(?:strong|span)>(.*?)<\/(?:strong|span)>/g)]
        .map(match => decodeMarkdownHtml(match[1].trim()))
        .filter(Boolean);
}

function htmlLinkCopy(source: string): string[] {
    return [...source.matchAll(/<a\b[^>]*>(.*?)<\/a>/g)]
        .map(match => decodeMarkdownHtml(match[1].trim()))
        .filter(Boolean);
}

function decodeMarkdownLinks(value: string): string {
    return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
