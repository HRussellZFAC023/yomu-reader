import { execFileSync } from 'node:child_process';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';










import { attributeSelectorIndex, findGeneratedCopy, findRedactionLeaks, generatedCopyInCss, hashTextRun, isHiddenCopy, normalizeTextRun, redactionHashList, siteCodeInHtml, textRunsFromCss, textRunsFromHtml } from '../../scripts/lib/recorded-redaction.mjs';
import { aozoraLetterStreams, characterClass, createTextRedactor } from '../../scripts/lib/text-redactor.mjs';


const temporaryDirectories: string[] = [];
const temporaryDirectory = () => {
    const dir = mkdtempSync(join(tmpdir(), 'yomu-recorded-test-'));
    temporaryDirectories.push(dir);
    return dir;
};

afterEach(() => {
    for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('redaction', () => {
    it('hashes normalised runs that hold a letter, and only those', () => {
        expect(normalizeTextRun('  日本\n  語 ')).toBe('日本 語');
        expect(normalizeTextRun('12:34')).toBeNull();
        expect(normalizeTextRun('あ')).toBeNull();
        expect(redactionHashList(['ログイン', 'https://example.com/a', 'ログイン']).hashes).toEqual([hashTextRun('ログイン')]);
    });

    it('reads text runs from text, visible attributes, declarative shadow roots and painted CSS, not from scripts', () => {
        const runs = textRunsFromHtml('<html><head><title>見出し</title><style>.a{content:"表示";font-family:"游ゴシック"}</style><script>var x = "秘密";</script></head><body><img alt="写真の説明"><p style="--label:\'影付き\'">本文です</p><div><template shadowrootmode="open"><style>b::after{content:"影の注"}</style><span>影の中</span></template></div></body></html>');
        expect(runs).toEqual(['見出し', '表示', '写真の説明', '影付き', '本文です', '影の注', '影の中']);
    });

    it('reads the text a stylesheet paints: escapes decoded, concatenation joined, comments and font names skipped', () => {
        const css = '/* content:"注釈の中" */ body::before{content:"\\6771\\4EAC" "都の"}\n.q{quotes:"「" "」";font-family:"Hiragino Sans", "メイリオ"}.b:after{content:"4K"}.e{text-overflow:"続きは本文で"}';
        expect(textRunsFromCss(css)).toEqual(['東京', '都の', '東京都の', '続きは本文で']);
        expect(generatedCopyInCss(css)).toEqual(['東京都の', '続きは本文で']);
        expect(generatedCopyInCss('.dot:before{content:"•"}.badge:after{content:"NEW"}.x{--font:"YouTube Sans"}')).toEqual([]);
    });

    it('reads a property name written with CSS escapes as the browser does', () => {
        const css = 'body::before{\\63 ontent:"今日の注目記事"}p::after{c\\ontent:"見出しの文"}q{\\000043ONTENT:"大文字の名前"}li{list-style-\\74 ype:"二つの印"}.x{fon\\74-family:"游ゴシック"}';
        expect(textRunsFromCss(css)).toEqual(['今日の注目記事', '見出しの文', '大文字の名前', '二つの印']);
        expect(generatedCopyInCss(css)).toEqual(['今日の注目記事', '見出しの文', '大文字の名前', '二つの印']);
    });

    it('reads custom properties named with non-ASCII letters and the strings content paints through var()', () => {
        const css = ':root{--見出し:"今日の注目記事"}body::before{content:var(--見出し)}.a::after{content:var(--\\898B\\51FA\\3057, "代わりの文")}.b{font-family:var(--見出し)}';
        expect(generatedCopyInCss(css)).toEqual(['今日の注目記事', '今日の注目記事代わりの文']);
        expect(textRunsFromCss(css)).toContain('今日の注目記事');
        expect(generatedCopyInCss('.x{--font:"YouTube Sans"}.y{font-family:var(--font)}')).toEqual([]);
    });

    it('follows var() through other custom properties, @property initial values and an escaped function name', () => {
        expect(generatedCopyInCss(':root{--b:"今日の注目記事";--a:var(--b)}body::before{content:var(--a)}')).toEqual(['今日の注目記事']);
        expect(generatedCopyInCss('@property --題 { syntax: "*"; inherits: true; initial-value: "今日の注目記事"; } body::before{content:var(--題)}')).toEqual(['今日の注目記事']);
        expect(generatedCopyInCss(':root{--a:"今日の";--b:"注目記事"}body::before{content:v\\61r(--a) VAR(--b)}')).toEqual(['今日の注目記事']);
        expect(generatedCopyInCss(':root{--a:var(--b);--b:var(--a)}body::before{content:var(--a)}')).toEqual([]);
    });

    it('finds copy a stylesheet paints through a custom property another stylesheet sets', () => {
        const dir = temporaryDirectory();
        writeFileSync(join(dir, 'page.html'), '<p style="--題:\'別の記事の題名\'">私はその人を常に</p>');
        writeFileSync(join(dir, 'site.css'), 'p::before{content:var(--題)}');
        expect(findGeneratedCopy(dir)).toEqual([{ file: 'site.css', hash: hashTextRun('別の記事の題名'), length: 7 }]);
    });

    it('finds an original run restored through CSS generated content, in a style element, a style attribute or a stylesheet', () => {
        const hashList = redactionHashList(['元の記事の見出しです']);
        const cases = {
            'page.html': '<style>body::before{content:"元の記事の見出しです"}</style><p>私はその人を常に</p>',
            'inline.html': '<p style="--x:\'元の記事の\' \'見出しです\'">私はその人を常に</p>',
            'resources/sheet.css': 'body::before{content:"\\5143の記事の見出しです"}',
            'escaped.html': '<style>body::before{\\63 ontent:"元の記事の見出しです"}</style><p>私はその人を常に</p>',
            'unicode-var.html': '<style>:root{--見出し:"元の記事の見出しです"}body::before{content:var(--見出し)}</style><p>私はその人を常に</p>',
            'property-rule.html': '<style>@property --題 { syntax: "*"; inherits: true; initial-value: "元の記事の見出しです"; } body::before{content:var(--題)}</style><p>私はその人を常に</p>',
            'network.har': JSON.stringify({ log: { entries: [{ response: { content: { mimeType: 'text/css', encoding: 'base64', text: Buffer.from('p::after{content:"元の記事の見出しです"}').toString('base64') } } }] } }),
        };
        for (const [file, text] of Object.entries(cases)) {
            const dir = temporaryDirectory();
            mkdirSync(join(dir, 'resources'));
            writeFileSync(join(dir, file), text);
            expect(findRedactionLeaks(dir, hashList), file).toEqual([{ file: join(...file.split('/')), hash: hashTextRun('元の記事の見出しです'), length: 10 }]);
        }
    });

    it('finds copy a stylesheet paints through content, which the redactor does not replace', () => {
        const dir = temporaryDirectory();
        writeFileSync(join(dir, 'page.html'), '<style>.more::after{content:"続きを読む"}</style><p class="more">私はその人を常に</p>');
        writeFileSync(join(dir, 'site.css'), '.dot::before{content:"・"}');
        expect(findGeneratedCopy(dir)).toEqual([{ file: 'page.html', hash: hashTextRun('続きを読む'), length: 5 }]);
    });

    it('reads copy kept in any attribute, and not one-word ASCII vocabulary', () => {
        const runs = textRunsFromHtml('<a class="headline" data-state="true" data-id="a1b2" data-realizer-title="弟を溺愛する母の見出し" data-gtm-label="Spring campaign banner" href="/articles/1"><time datetime="2026-10-10T12:00">10/10</time></a>');
        expect(runs).toEqual(['弟を溺愛する母の見出し', 'Spring campaign banner']);
        expect(isHiddenCopy('true')).toBe(false);
        expect(isHiddenCopy('ranking_top')).toBe(false);
        expect(isHiddenCopy('ランキング')).toBe(true);
    });

    it('indexes the attribute values stylesheets select on', () => {
        expect(attributeSelectorIndex(['.a[data-state="open"]{}', "b[data-tab='a\\'b' i], [lang|=ja]{}"])).toEqual({
            'data-state': [{ op: '', value: 'open', insensitive: false }],
            'data-tab': [{ op: '', value: "a'b", insensitive: true }],
            lang: [{ op: '|', value: 'ja', insensitive: false }],
        });
    });

    it('finds site code a frozen document must not carry, templates included', () => {
        expect(siteCodeInHtml('<p onclick="x()">本文</p><template><script>1</script></template><noscript>案内</noscript>')).toEqual(['onclick=', '<script>', '<noscript>']);
        expect(siteCodeInHtml('<p data-on="1">本文</p>')).toEqual([]);
    });

    it('finds an original run left in a data-* attribute', () => {
        const dir = temporaryDirectory();
        const hashList = redactionHashList(['元の記事の見出しです']);
        writeFileSync(join(dir, 'page.html'), '<a data-realizer-title="元の記事の見出しです">私はその人を常に</a>');
        expect(findRedactionLeaks(dir, hashList)).toEqual([{ file: 'page.html', hash: hashTextRun('元の記事の見出しです'), length: 10 }]);
    });

    it('finds a committed original run and ignores the files the recorder writes itself', () => {
        const dir = temporaryDirectory();
        const hashList = redactionHashList(['元のページの文章です']);
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ attribution: '元のページの文章です' }));
        writeFileSync(join(dir, 'page.html'), '<p>私はその人を常に先生と</p>');
        expect(findRedactionLeaks(dir, hashList)).toEqual([]);
        mkdirSync(join(dir, 'host'));
        writeFileSync(join(dir, 'host', 'timedtext.json3'), JSON.stringify({ events: [{ segs: [{ utf8: '元のページ' }, { utf8: 'の文章です' }] }] }));
        expect(findRedactionLeaks(dir, hashList)).toEqual([{ file: join('host', 'timedtext.json3'), hash: hashTextRun('元のページの文章です'), length: 10 }]);
    });

    it('replaces each letter with one of its own class and keeps everything else', () => {
        expect(['漢', 'か', 'っ', 'カ', 'ッ', 'A', 'a', 'ー', '々', '1', '。'].map(characterClass)).toEqual(['han', 'hiragana', 'smallHiragana', 'katakana', 'smallKatakana', 'upper', 'lower', null, null, null, null]);
        const streams = aozoraLetterStreams('私《わたくし》はその人を常に先生と呼んでいた。ちょっと');
        expect(streams.han).toBe('私人常先生呼');
        const redact = createTextRedactor({ streams });
        const output = redact('東京タワー、Tokyo 2026年。');
        expect([...output].map(characterClass)).toEqual([...'東京タワー、Tokyo 2026年。'].map(characterClass));
        expect([...output].filter((_, index) => !characterClass([...'東京タワー、Tokyo 2026年。'][index])).join('')).toBe('ー、 2026。');
        expect(output).not.toContain('東京');
    });
});

describe('check-recorded-pages', () => {
    const script = resolve('scripts/check-recorded-pages.mjs');
    const writeRecording = (root: string, pageText: string) => {
        const dir = join(root, 'example-redacted');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(root, 'ATTRIBUTION.md'), '| `example-redacted` | structure only |\n');
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ slug: 'example-redacted', url: 'https://example.com/', content: 'redacted', licence: 'Redacted', attribution: 'Structure only', document: 'page.html', har: 'network.har', recorder: { platform: 'darwin' } }));
        writeFileSync(join(dir, 'page.html'), `<p>${pageText}</p>`);
        writeFileSync(join(dir, 'network.har'), JSON.stringify({ log: { entries: [] } }));
        writeFileSync(join(dir, 'redaction-hashes.json'), JSON.stringify(redactionHashList(['元の記事の見出し'])));
    };
    const run = (root: string) => {
        try {
            return { code: 0, output: execFileSync(process.execPath, [script, `--root=${root}`], { encoding: 'utf8', stdio: 'pipe' }) };
        } catch (error) {
            const failed = error as { status: number; stderr: string };
            return { code: failed.status, output: failed.stderr };
        }
    };

    it('passes a clean redaction and fails one that kept an original run', () => {
        const clean = temporaryDirectory();
        writeRecording(clean, '私はその人を常に');
        expect(run(clean).code).toBe(0);
        const leaking = temporaryDirectory();
        writeRecording(leaking, '元の記事の見出し');
        const result = run(leaking);
        expect(result.code).toBe(1);
        expect(result.output).toContain('page.html holds a 8-character text run from the original page');
    });

    it.each(['content', '\\63 ontent', '--見出し:"元の記事の見出し"}body::before{content:var(--見出し)}p{content', '--b:"元の記事の見出し"}:root{--a:var(--b)}body::before{content:var(--a)}p{content'])('fails a redaction whose stylesheet paints an original run back in through %s', property => {
        const root = temporaryDirectory();
        writeRecording(root, `私はその人を常に</p><style>body::before{${property}:"元の記事の見出し"}</style><p>`);
        const result = run(root);
        expect(result.code).toBe(1);
        expect(result.output).toContain('page.html holds a 8-character text run from the original page');
        expect(result.output).toContain('page.html paints 8 characters of copy through CSS content');
    });

    it('fails a recorded document that still carries site code', () => {
        const root = temporaryDirectory();
        writeRecording(root, '私はその人を常に</p><noscript>案内</noscript><p>');
        const result = run(root);
        expect(result.code).toBe(1);
        expect(result.output).toContain('page.html carries site code the freeze removes (<noscript>');
    });

    it('fails product traffic that did not settle over several runs or kept a rate limit', () => {
        const root = temporaryDirectory();
        writeRecording(root, '私はその人を常に');
        const dir = join(root, 'example-redacted');
        const manifestPath = join(dir, 'manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        writeFileSync(join(dir, 'product-traffic.har'), JSON.stringify({ log: { entries: [] } }));
        writeFileSync(manifestPath, JSON.stringify({ ...manifest, productTraffic: { har: 'product-traffic.har', product: 'v2.1.6', hosts: ['api.jiten.moe'] } }));
        const result = run(root);
        expect(result.code).toBe(1);
        expect(result.output).toContain('example-redacted: productTraffic did not settle (runs: 1)');
        writeFileSync(manifestPath, JSON.stringify({ ...manifest, productTraffic: { har: 'product-traffic.har', product: 'v2.1.6', hosts: ['api.jiten.moe'], runs: 9, settled: true } }));
        expect(run(root).code).toBe(0);
        writeFileSync(join(dir, 'product-traffic.har'), JSON.stringify({ log: { entries: [{ request: { method: 'GET', url: 'https://api.jiten.moe/x' }, response: { status: 429, content: { text: '' } } }] } }));
        const limited = run(root);
        expect(limited.code).toBe(1);
        expect(limited.output).toContain('example-redacted: product-traffic.har keeps 1 rate-limited or failed answer(s)');
    });

    it('fails a credit for a recording that is not committed', () => {
        const root = temporaryDirectory();
        writeRecording(root, '私はその人を常に');
        writeFileSync(join(root, 'ATTRIBUTION.md'), '| `example-redacted` | structure only |\n| `youtube-watch` | not recorded |\n');
        const result = run(root);
        expect(result.code).toBe(1);
        expect(result.output).toContain('ATTRIBUTION.md credits youtube-watch, which is not committed');
    });
});
