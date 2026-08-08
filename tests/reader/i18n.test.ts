import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextExplicitUiLanguage, resolveUiLanguage } from '../../src/reader/app/i18n';
import { publishedWebsiteRouteDefinitions } from '../../docs/.vitepress/locales/route-catalog';

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

    // The homepage's last link-card grid (.yomu-no-install-links) was removed
    // 2026-08-04 — each of its four links lives in its own proof section — so
    // the link-card ja-coverage check went with it; the hero/media chrome
    // check below still walks the whole homepage.

    it('keeps hosted homepage hero and media chrome covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const homeSource = readFileSync('docs/index.md', 'utf8');
        const homepageCopy = uniqueEnglishCopy([
            ...frontmatterTextCopy(homeSource),
            ...htmlCardCopy(homeSource),
            ...htmlAttributeCopy(homeSource),
        ]);

        expect(homepageCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps hosted support actions covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const supportSource = readFileSync('docs/support.md', 'utf8');
        const supportCopy = uniqueEnglishCopy([
            ...frontmatterTextCopy(supportSource),
            ...markdownHeadings(supportSource),
            ...htmlCardCopy(supportSource),
            ...htmlLinkCopy(supportSource),
        ]);

        expect(supportCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps Study source guidance covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const calloutCopy = ['Study reviews Anki when it is reachable, connected Japanese services when selected, and local dictionary words without an account. Library searches the words. Stats shows the work over time.'];

        expect(calloutCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps Study setup and offline guidance covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const studySource = readFileSync('docs/learn/keeping-words.md', 'utf8');
        const studySection = between(studySource, '## Open Study', '## Review by doing');
        const studyCopy = [
            ...markdownHeadings(studySection),
            ...markdownParagraphs(studySection),
            ...markdownListTextNodes(studySection),
        ];

        expect(studyCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps the hosted apps overview covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const referenceSource = readFileSync('docs/learn/reference.md', 'utf8');
        const appsSection = between(referenceSource, '## Apps', '## Feature map');
        const appsCopy = [
            ...markdownHeadings(appsSection),
            ...markdownParagraphs(appsSection),
            ...markdownListTextNodes(appsSection),
        ];

        expect(appsCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });

    it('keeps dynamic hosted docs attributes in the build-time locale pipeline', () => {
        const catalogue = readFileSync('docs/.vitepress/locales/site-locales.ts', 'utf8');
        const markdown = readFileSync('docs/.vitepress/locales/markdown-localization.ts', 'utf8');
        const theme = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');

        expect(catalogue).toContain("'docs.theme.darkTheme': { en: 'Switch to dark theme'");
        expect(catalogue).toContain("'docs.theme.lightMode': { en: 'Switch to light theme'");
        expect(markdown).toContain("const TRANSLATED_ATTRIBUTES = new Set(['aria-label', 'title', 'alt', 'placeholder'])");
        expect(markdown).toContain("md.core.ruler.after('inline', 'yomu-reviewed-docs-locales'");
        expect(theme).not.toContain('MutationObserver(mutations =>');
        expect(theme).not.toContain('localizeHostedDocsCopy');
        expect([catalogue, markdown].join('\n')).not.toContain('未翻訳');
        expect([catalogue, markdown].join('\n')).not.toContain('母国語의');
    });

    it('keeps localized copy free of foreign-script anomalies', () => {
        // Hangul, Cyrillic, or a replacement character in these files is always
        // a translation defect (the historical '母国語의' bug was a Korean
        // particle pasted into a Japanese string).
        const anomaly = /[가-힯ᄀ-ᇿ㄰-㆏Ѐ-ӿ�]/u;
        const sources = [
            'src/reader/app/i18n.ts',
            'src/reader/newtab/i18n.ts',
            'docs/.vitepress/locales/site-locales.ts',
        ];
        for (const path of sources) {
            const offending = readFileSync(path, 'utf8')
                .split('\n')
                .map((line, index) => `${path}:${index + 1}: ${line}`)
                .filter(line => anomaly.test(line));

            expect(offending).toEqual([]);
        }
        // The docs catalogue's English keys can quote target-language source
        // constructions. Inspect its Japanese values so Korean source text does
        // not masquerade as a Japanese-translation defect.
        const { entries, unparsed } = hostedDocsJaCopyEntries(
            readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8'),
        );
        expect(unparsed).toEqual([]);
        expect(entries
            .filter(([, japanese]) => anomaly.test(japanese))
            .map(([english, japanese]) => `${english}: ${japanese}`))
            .toEqual([]);
    });

    // Split every line into the text-node segments the theme's
    // translateTextNodes sees after rendering (inline code, bold, links, and
    // HTML tags each become separate elements), so copy rewrites cannot drift
    // from the hosted ja map again. The 2026-07 rewrite shipped ~110
    // untranslated segments on getting-started, and then a second pass took
    // features.md from 88 covered segments to 9 and guides/index.md from 17 to
    // 6 while every other gate stayed green — hasHostedDocsTranslation returns
    // false for an absent key and leaves the English text node in place, so an
    // uncovered segment is a visible English hole on the ja site. Every page
    // rendered in Japanese belongs in this list.
    const JAPANESE_DOCS_PAGES = publishedWebsiteRouteDefinitions('ja')
        .filter(definition => definition.source !== 'changelog.md')
        .map(definition => `docs/${definition.source}`);

    it.each(JAPANESE_DOCS_PAGES)('keeps %s covered by Japanese docs copy', page => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const copy = markdownPageTextCopy(readFileSync(page, 'utf8'));

        expect(copy.length).toBeGreaterThan(20);
        expect(copy.filter(value => !hasHostedDocsJaCopy(themeSource, value))).toEqual([]);
    });

    it('keeps the fold runtime marker id in step with the reader', () => {
        // The theme copies this id instead of importing it, because its home
        // module drags the companion registry into the docs bundle. The fold's
        // "press a word" prompt depends on finding the marker: if the id drifts,
        // the prompt silently claims the runtime is missing for every visitor
        // whose Yomu is an extension or userscript (their realm never sets the
        // window flag), and tells them to go look at a section further down.
        const health = readFileSync('src/reader/app/runtime-health.ts', 'utf8');
        const owner = health.match(/READER_RUNTIME_MARKER_ID\s*=\s*'([^']+)'/);
        const theme = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        const copy = theme.match(/const READER_RUNTIME_MARKER_ID = '([^']+)'/);

        expect(owner?.[1]).toBeTruthy();
        expect(copy?.[1]).toBe(owner?.[1]);
    });

    it('keeps hosted docs Japanese copy keys unique', () => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const { entries, unparsed } = hostedDocsJaCopyEntries(themeSource);

        expect(unparsed).toEqual([]);
        const keys = entries.map(([english]) => english);
        const duplicateKeys = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];

        expect(duplicateKeys).toEqual([]);
    });

    it('keeps the homepage fold answering a press', () => {
        // The fold's sample is pre-annotated markup, so it looks correct even
        // when no lookup can happen. data-jpdb-reader-surface-ignore is in the
        // reader's own READER_DOCUMENT_CLICK_IGNORE_SELECTOR: marking the
        // sample with it leaves the page looking live while every press does
        // nothing, which is worse than shipping a static picture. The runtime
        // only finds the fold at all through [data-yomu-runtime-surface] /
        // .yomu-try-me-text, so both hooks are pinned here too.
        const homeSource = readFileSync('docs/index.md', 'utf8');
        const sample = between(homeSource, '<p class="yomu-try-me-sample"', '</p>');

        expect(sample).not.toContain('data-jpdb-reader-surface-ignore');
        expect(homeSource).toContain('class="yomu-try-me-text');
        expect(homeSource).toContain('data-yomu-runtime-surface');
        expect(sample).toContain('data-yomu-localize="off"');
    });

    it('keeps every hosted docs Japanese value written in Japanese', () => {
        // hasHostedDocsJaCopy only proves a key exists, so an English-for-English
        // entry ('Offline cache': 'Offline cache') satisfies every page guard
        // above while showing English to a Japanese reader. Values are required
        // to carry kana or kanji unless the key is a proper noun, a URL, a
        // verbatim UI label, or an English function word the Japanese sentence
        // folds into a neighbouring segment.
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const { entries, unparsed } = hostedDocsJaCopyEntries(themeSource);

        expect(unparsed).toEqual([]);
        expect(entries.length).toBeGreaterThan(3000);

        const untranslated = entries
            .filter(([english]) => !HOSTED_DOCS_JA_COPY_VERBATIM.has(english))
            .filter(([, japanese]) => !JAPANESE_CHARACTER.test(japanese))
            .map(([english]) => english);

        expect(untranslated).toEqual([]);

        // Keep the exemption list honest: a stale entry would silently cover a
        // future English value re-added under the same key.
        const keys = new Set(entries.map(([english]) => english));
        expect([...HOSTED_DOCS_JA_COPY_VERBATIM].filter(key => !keys.has(key))).toEqual([]);
    });

    it('keeps latest changelog entries covered by Japanese docs copy', () => {
        const themeSource = readFileSync('docs/.vitepress/locales/docs-prose-catalog.ts', 'utf8');
        const changelogSource = readFileSync('CHANGELOG.md', 'utf8');
        const latestRelease = latestChangelogRelease(changelogSource);
        const latestCopy = [
            ...markdownHeadings(latestRelease).filter(heading => !isChangelogVersionHeading(heading)),
            ...markdownListTextNodes(latestRelease),
        ];

        expect(latestCopy.filter(copy => !hasHostedDocsJaCopy(themeSource, copy))).toEqual([]);
    });
});

// Kana, kanji, halfwidth katakana, and the CJK/fullwidth punctuation blocks.
// A value made only of Japanese punctuation is a real translation of an
// English fragment: the ja rendering of ', ' between two brand links is a
// single ideographic comma. Fullwidth Latin letters and digits are outside the
// ranges so they cannot pass as translated copy.
const JAPANESE_CHARACTER = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff20\uff3b-\uff40\uff5b-\uff9f]/u;

// Keys whose Japanese value is deliberately not Japanese text: brand and
// product names, hosts and URLs, literal menu paths and button labels the
// Japanese interface also shows verbatim, and a few English function words
// ('A', 'Open ') that the Japanese sentence carries in a neighbouring segment.
const HOSTED_DOCS_JA_COPY_VERBATIM = new Set([
    // FAQ: brand names, and the 'Okay' grade whose Japanese button label is
    // literally 'OK' in the product (gradeOkayLabel in src/reader/app/i18n.ts).
    'Discord',
    'GitHub',
    'Ko-fi',
    'Patreon',
    'Okay',
    'https://yomureader.com/yomu.user.js',
    'yomureader.com',
    'tampermonkey.net',
    'tadoku.org',
    'nyaa.si/view/1957972',
    'localhost:',
    'Utilities → Install from URL',
    '+ → Install from URL',
    'Script list → Create → Install from URL',
    'Reader -> Show Yomu lookup popup',
    'Hard / Good',
    'Again / Hard / Good / Easy',
    'Fail / Pass',
    'Kanji 1',
    'wideScreen',
    'AA',
    '/',
    'OCR',
    'OCR:',
    'PDF',
    'PDFs',
    'API',
    'Anki',
    'Anki / AnkiConnect:',
    'AnkiConnect',
    'AnkiMobile',
    'AnkiDroid',
    'Bunpro',
    'Jiten',
    'Jiten:',
    'Jiten/JPDB',
    'JPDB',
    'JPDB:',
    'Kotu',
    'Tailscale',
    'oEmbed',
    'MangaOCR',
    'PaddleOCR',
    'Apple Vision',
    'Ultimate Yomitan Audio',
    'Ultimate Yomitan Audio Source',
    'Yomu Gaming',
    'Gaming Text Bridge',
    'Chrome',
    'Firefox',
    'Safari',
    'Windows',
    'Linux',
    'Intel Mac',
    'Apple Silicon Mac',
    'Tampermonkey',
    'Userscripts',
    'YouTube',
    'NHK News Web Easy',
    'Satori Reader',
    'Watanoc',
    'MATCHA Easy Japanese',
    'Ttsu Reader',
    'Learn Natively',
    'A',
    'Open ',
    '— install',
    '— with',
    '— open the',
]);

function hostedDocsJaCopyEntries(themeSource: string): {
    entries: [string, string][];
    unparsed: string[];
} {
    const opening = 'const HOSTED_DOCS_JA_COPY: Record<string, string> = {';
    const start = themeSource.indexOf(opening);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = themeSource.indexOf('\n};', start);
    expect(end).toBeGreaterThan(start);

    const entries: [string, string][] = [];
    const unparsed: string[] = [];
    for (const line of themeSource.slice(start + opening.length, end).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        const entry = trimmed.match(/^(['"])((?:\\.|(?!\1)[^\\])*)\1\s*:\s*(['"])((?:\\.|(?!\3)[^\\])*)\3,$/);
        if (!entry) { unparsed.push(trimmed.slice(0, 80)); continue; }
        entries.push([unescapeCopyLiteral(entry[2]), unescapeCopyLiteral(entry[4])]);
    }
    return { entries, unparsed };
}

function unescapeCopyLiteral(literal: string): string {
    return literal
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\(['"\\nt])/g, (_, char: string) => ({ n: '\n', t: '\t' }[char] ?? char));
}

function markdownPageTextCopy(pageSource: string): string[] {
    const copy = new Set<string>();
    const add = (value: string | null | undefined) => {
        const core = value?.trim();
        if (core && /[A-Za-z]{2,}/.test(core)) copy.add(core);
    };
    const frontmatter = pageSource.match(/^---\n([\s\S]*?)\n---\n/);
    for (const match of (frontmatter?.[1] ?? '').matchAll(/^(?:title|description):\s*(.+)$/gm)) add(match[1]);

    let inCodeFence = false;
    let inHtmlComment = false;
    const body = untranslatedMarkupRemoved(pageSource.slice(frontmatter ? frontmatter[0].length : 0));
    for (const line of body.split('\n')) {
        if (/^\s*```/.test(line)) { inCodeFence = !inCodeFence; continue; }
        if (inCodeFence) continue;
        // Authoring notes are not rendered, so they are not copy.
        if (inHtmlComment) { inHtmlComment = !line.includes('-->'); continue; }
        if (line.includes('<!--') && !line.includes('-->')) { inHtmlComment = true; continue; }
        const heading = line.match(/^#{1,6}\s+(.+)$/);
        if (heading) {
            const title = decodeMarkdownLinks(heading[1].replace(/\*\*/g, '')).trim();
            add(title);
            add(`Permalink to "${title}"`);
            continue;
        }
        // A markdown table renders as one <td> leaf per CELL, so the runtime
        // looks up each cell's text, never the whole `| a | b |` row — demand
        // ja copy for what the localizer can actually ask for.
        const tableRow = line.match(/^\s*\|(.+)\|\s*$/);
        if (tableRow) {
            if (/^[\s|:\-]+$/.test(line)) continue; // alignment separator row
            for (const cell of tableRow[1].split('|')) {
                for (const segment of markdownPageSegments(cell.replace(/\*\*/g, '').trim())) add(segment);
            }
            continue;
        }
        for (const match of line.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]+)"/g)) add(decodeMarkdownHtml(match[1]));
        // Attribute values on HTML lines are handled above; drop the tags and
        // inline code so only rendered text-node segments remain.
        const text = line
            .replace(/^\s*(?:-|\d+\.)\s+/, '')
            .replace(/<code>.*?<\/code>/g, '`x`')
            .replace(/:src="[^"]*"/g, '');
        if (/^\s*<(?:div|figure|img|source|video|a\b)[^>]*>\s*$/.test(text) || /^\s*<\/\w+>\s*$/.test(text)) continue;
        for (const segment of markdownPageSegments(text)) add(segment);
    }
    return [...copy];
}

// Mirror what the theme's isUntranslatableElement refuses to touch, so the
// guard only ever demands ja copy for strings a Japanese reader is shown.
// A subtree under [data-yomu-localize="off"] (the wordmark, the annotated
// sample, the install URL) is left in English on purpose; demanding a ja key
// for it would put an entry in the map that the runtime can never ask for.
// The subtree becomes an inline-code placeholder rather than nothing, because
// it still splits the text nodes either side of it: deleting it outright would
// glue "…use its Install from URL option with" onto ". In Tampermonkey that is"
// and demand a ja key for a sentence the page never renders.
function untranslatedMarkupRemoved(source: string): string {
    return source.replace(/<(\w+)\b[^>]*\bdata-yomu-localize="off"[^>]*>[\s\S]*?<\/\1>/g, '`x`');
}

function markdownPageSegments(value: string): string[] {
    return value
        .split(/(`[^`]*`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|<[^>]+>)/g)
        .flatMap(segment => {
            if (!segment || /^`[^`]*`$/.test(segment) || /^<[^>]+>$/.test(segment)) return '';
            const strong = segment.match(/^\*\*(.*?)\*\*$/);
            if (strong) return emphasisSegments(decodeMarkdownLinks(strong[1] ?? ''));
            const link = segment.match(/^\[([^\]]+)\]\([^)]+\)$/);
            if (link) return decodeMarkdownHtml(link[1]?.trim() ?? '');
            return decodeMarkdownHtml(decodeMarkdownLinks(segment));
        })
        .filter(Boolean);
}

// `**Connected as _your name_**` renders as <strong>Connected as <em>your
// name</em></strong>: two text nodes, so the runtime looks up two keys. Model
// the nested emphasis rather than the markdown, or the guard passes on a key
// the page can never ask for.
function emphasisSegments(value: string): string[] {
    return value
        .split(/(_[^_]+_|\*[^*]+\*)/g)
        .map(part => part.replace(/^[_*]|[_*]$/g, '').trim())
        .filter(Boolean);
}

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

function frontmatterTextCopy(source: string): string[] {
    const frontmatter = source.startsWith('---\n') ? between(source, '---\n', '\n---') : '';
    return [...frontmatter.matchAll(/^\s{0,8}(?:title|description|name|text|tagline|alt):\s*(.+)$/gm)]
        .flatMap(match => htmlTextSegments(match[1].trim()))
        .filter(Boolean);
}

function htmlAttributeCopy(source: string): string[] {
    return [...source.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]+)"/g)]
        .flatMap(match => htmlTextSegments(decodeMarkdownHtml(match[1].trim())))
        .filter(Boolean);
}

function htmlTextSegments(value: string): string[] {
    return value
        .replace(/^['"]|['"]$/g, '')
        .split(/<br\s*\/?>/gi)
        .map(segment => segment.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
}

function uniqueEnglishCopy(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(value => /[A-Za-z]/.test(value)))];
}

function decodeMarkdownLinks(value: string): string {
    return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
