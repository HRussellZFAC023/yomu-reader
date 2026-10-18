import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareGeometrySignatures, type GeometrySignature } from '../../scripts/lib/geometry-signature.mjs';
import { cdpPerSecond, spinSummary } from '../../scripts/lib/main-thread-sampler.mjs';
import { assertLedgerCount, assertNoRequestsBeforeInteraction, createNetworkLedger, LEDGER_ID_HEADER } from '../../scripts/lib/network-ledger.mjs';
import { createHarWriter, readHarIndex } from '../../scripts/lib/recorded-har.mjs';
import { json3ToSrv3, json3ToVtt } from '../../scripts/lib/recorded-hosts.mjs';
import { answerGmRequest } from '../../scripts/lib/recorded-network.mjs';
import { blankPng, imageSize } from '../../scripts/lib/recorded-media.mjs';
import { captionFlashFrames } from '../../scripts/lib/recorded-page-probes.mjs';
import { productTrafficVerdict } from '../../scripts/lib/recorded-product-traffic.mjs';
import { attributeSelectorIndex, findGeneratedCopy, findRedactionLeaks, generatedCopyInCss, hashTextRun, isHiddenCopy, normalizeTextRun, redactionHashList, siteCodeInHtml, textRunsFromCss, textRunsFromHtml } from '../../scripts/lib/recorded-redaction.mjs';
import { aozoraLetterStreams, characterClass, createTextRedactor } from '../../scripts/lib/text-redactor.mjs';
import { asrCaptionTracksMechanismFixture } from '../../scripts/lib/youtube-caption-mechanism-fixture.mjs';

const temporaryDirectories: string[] = [];
const temporaryDirectory = () => {
    const dir = mkdtempSync(join(tmpdir(), 'yomu-recorded-test-'));
    temporaryDirectories.push(dir);
    return dir;
};

afterEach(() => {
    for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('network ledger', () => {
    it('tells requests before a trusted interaction from those after it', () => {
        const ledger = createNetworkLedger({ startedAt: 1000 });
        ledger.recordRequest({ channel: 'gm', method: 'post', url: 'https://lensfrontend-pa.googleapis.com/v1/crupload', bodyBytes: 900, at: 1200, trustedInteractionBefore: false, served: 'pending' });
        ledger.recordRequest({ channel: 'page', url: 'https://ja.wikipedia.org/style.css', at: 1100, served: 'recording' });
        ledger.recordRequest({ channel: 'page', url: 'https://audio.yomureader.com/a.mp3', at: 3000, served: 'offline' });
        ledger.recordInteraction({ type: 'pointerdown', at: 2500 });
        ledger.markServed({ channel: 'gm', method: 'POST', url: 'https://lensfrontend-pa.googleapis.com/v1/crupload' }, 'offline');

        expect(ledger.requests({ host: 'googleapis.com', beforeInteraction: true })).toHaveLength(1);
        expect(ledger.requests({ host: 'yomureader.com', beforeInteraction: false })).toHaveLength(1);
        expect(ledger.requests()).toHaveLength(2);
        expect(ledger.requests({ includeRecording: true })).toHaveLength(3);
        expect(ledger.entries()[0]).toMatchObject({ method: 'POST', host: 'lensfrontend-pa.googleapis.com', bodyBytes: 900, sinceStartMs: 200, served: 'offline' });
        expect(ledger.summary().hosts['lensfrontend-pa.googleapis.com']).toMatchObject({ requests: 1, beforeInteraction: 1, bodyBytes: 900 });
        expect(() => assertNoRequestsBeforeInteraction(ledger, 'googleapis.com')).toThrow(/crupload/);
        expect(() => assertLedgerCount(ledger, { host: 'yomureader.com' }, { min: 1, max: 1 })).not.toThrow();
    });

    it('counts the product\'s GM requests however the recording answered them', () => {
        const ledger = createNetworkLedger({ startedAt: 0 });
        for (const served of ['recorded-product', 'recording']) {
            ledger.recordRequest({ channel: 'gm', url: `https://api.jiten.moe/api/${served}`, at: 10, trustedInteractionBefore: false, served: 'pending' });
            ledger.markServed({ channel: 'gm', url: `https://api.jiten.moe/api/${served}` }, served);
        }
        ledger.recordRequest({ channel: 'gm', url: 'https://upload.wikimedia.org/a.jpg', at: 20, trustedInteractionBefore: false, served: 'recording' });
        ledger.recordRequest({ channel: 'page', url: 'https://upload.wikimedia.org/a.jpg', at: 5, served: 'recording' });

        expect(ledger.requests({ host: 'jiten.moe' })).toHaveLength(2);
        expect(ledger.requests({ host: 'wikimedia.org' })).toEqual([expect.objectContaining({ channel: 'gm' })]);
        expect(ledger.requests({ host: 'wikimedia.org', includeRecording: true })).toHaveLength(2);
    });

    it('judges a page request by when the page sent it, not when it was routed', () => {
        const ledger = createNetworkLedger({ startedAt: 0 });
        ledger.recordPageStamp({ url: 'https://ocr.example/upload#x', at: 90, trustedInteractionBefore: false });
        ledger.recordInteraction({ type: 'pointerdown', at: 100 });
        ledger.recordRequest({ channel: 'page', method: 'POST', url: 'https://ocr.example/upload', at: 110, served: 'offline' });
        ledger.recordRequest({ channel: 'page', url: 'https://audio.example/a.mp3', at: 120, served: 'offline' });

        expect(ledger.requests({ host: 'ocr.example', beforeInteraction: true })).toEqual([expect.objectContaining({ at: 90 })]);
        expect(ledger.requests({ host: 'audio.example', beforeInteraction: false })).toHaveLength(1);
    });

    it('names the latest interaction before each request, so a later background upload is not read as caused by a tap', () => {
        const ledger = createNetworkLedger({ startedAt: 0 });
        ledger.recordInteraction({ type: 'keydown', at: 100, target: 'document' });
        ledger.recordInteraction({ type: 'pointerdown', at: 5000, target: 'img.thumbimage' });
        ledger.recordRequest({ channel: 'gm', method: 'POST', url: 'https://lens.example/upload', at: 3000, trustedInteractionBefore: true, served: 'offline' });
        ledger.recordRequest({ channel: 'gm', method: 'POST', url: 'https://lens.example/upload', at: 5200, trustedInteractionBefore: true, served: 'offline' });
        ledger.recordRequest({ channel: 'gm', method: 'POST', url: 'https://lens.example/upload', at: 50, trustedInteractionBefore: false, served: 'offline' });

        expect(ledger.entries().map(entry => entry.lastInteraction?.target ?? null)).toEqual(['document', 'img.thumbimage', null]);
        expect(ledger.requests({ host: 'lens.example', beforeInteraction: false })).toHaveLength(2);
        expect(ledger.requests({ host: 'lens.example', noInteractionWithinMs: 1000 }).map(entry => entry.at)).toEqual([3000, 50]);
    });

    it('never reads a tap delivered after the request as one shortly before it', () => {
        const ledger = createNetworkLedger({ startedAt: 0 });
        ledger.recordInteraction({ type: 'pointerdown', at: 400, target: 'img.thumbimage' });
        ledger.recordRequest({ channel: 'gm', method: 'POST', url: 'https://lens.example/upload', at: 300, trustedInteractionBefore: true, served: 'offline' });

        expect(ledger.entries()[0].lastInteraction).toEqual(expect.objectContaining({ at: 400 }));
        expect(ledger.requests({ host: 'lens.example', noInteractionWithinMs: 3000 })).toHaveLength(1);
    });

    it('pairs a GM answer with its request by ledger id, not by URL order', () => {
        const ledger = createNetworkLedger({ startedAt: 0 });
        const url = 'https://lens.example/upload';
        ledger.recordRequest({ ledgerId: '1', channel: 'gm', method: 'POST', url, at: 10, trustedInteractionBefore: false, served: 'pending' });
        ledger.recordRequest({ ledgerId: '2', channel: 'gm', method: 'POST', url, at: 11, trustedInteractionBefore: false, served: 'pending' });
        ledger.markServed({ method: 'POST', url, ledgerId: '2' }, 'override');
        ledger.markServed({ method: 'POST', url, ledgerId: '1' }, 'offline');

        expect(ledger.entries().map(entry => entry.served)).toEqual(['offline', 'override']);
    });

    it('always counts a fetch the page stamped, even when the page HAR answered it', () => {
        const ledger = createNetworkLedger({ startedAt: 0 });
        ledger.recordPageStamp({ url: 'https://upload.wikimedia.org/a.jpg', at: 40, trustedInteractionBefore: false });
        ledger.recordRequest({ channel: 'page', url: 'https://upload.wikimedia.org/a.jpg', at: 45, served: 'recording' });
        ledger.recordRequest({ channel: 'page', url: 'https://upload.wikimedia.org/b.jpg', at: 46, served: 'recording' });

        expect(ledger.requests({ host: 'wikimedia.org' })).toEqual([expect.objectContaining({ url: 'https://upload.wikimedia.org/a.jpg', sentByScript: true, sinceStartMs: 40 })]);
    });

    it('does not count a host that only shares a suffix', () => {
        const ledger = createNetworkLedger();
        ledger.recordRequest({ url: 'https://notgoogleapis.com/x', at: Date.now() });
        expect(ledger.requests({ host: 'googleapis.com' })).toHaveLength(0);
    });
});

describe('geometry signatures', () => {
    const signature = (overrides: Partial<GeometrySignature> = {}): GeometrySignature => ({
        viewport: { width: 1280, height: 900 },
        document: { scrollWidth: 1280, scrollHeight: 5000, clientWidth: 1280, clientHeight: 900 },
        blocks: [{ key: 'p1', box: [10, 20, 600, 48] }],
        paragraphs: [{ key: 'p1', lineCount: 2, lines: [[10, 20, 600, 44], [10, 44, 300, 68]] }],
        paged: [],
        ...overrides,
    });

    it('accepts movement within the tolerance and reports anything beyond it', () => {
        expect(compareGeometrySignatures(signature(), signature({ blocks: [{ key: 'p1', box: [11, 21, 600, 48] }] })).ok).toBe(true);
        const moved = compareGeometrySignatures(signature(), signature({ blocks: [{ key: 'p1', box: [10, 25, 600, 48] }] }));
        expect(moved.ok).toBe(false);
        expect(moved.maxDelta).toBe(5);
    });

    it('treats a changed line count or a missing block as unbounded, and can ignore lines', () => {
        const rewrapped = signature({ paragraphs: [{ key: 'p1', lineCount: 3, lines: [[10, 20, 600, 44]] }] });
        expect(compareGeometrySignatures(signature(), rewrapped).diffs[0]).toMatchObject({ kind: 'paragraph', delta: Infinity });
        expect(compareGeometrySignatures(signature(), rewrapped, { ignore: ['paragraphs'] }).ok).toBe(true);
        expect(compareGeometrySignatures(signature(), signature({ blocks: [{ key: 'p1', missing: true }] })).diffs[0].detail).toBe('missing');
    });

    it('counts pages in paged containers', () => {
        const paged = (pages: number) => signature({ paged: [{ key: 'paged#0:div', columnCount: '2', columnWidth: 'auto', scrollWidth: 2400, scrollHeight: 800, clientWidth: 1200, clientHeight: 800, pages }] });
        expect(compareGeometrySignatures(paged(2), paged(3)).diffs[0]).toMatchObject({ kind: 'paged', delta: Infinity });
    });
});

describe('main-thread sampler arithmetic', () => {
    it('turns spin totals into busy milliseconds per second and long gaps', () => {
        expect(spinSummary({ wallMs: 2000, spunMs: 1500, gaps: [10, 60, 120] })).toEqual({ wallMs: 2000, otherMsPerSec: 250, longGaps: 2, longGapMs: 180, longestGapMs: 120 });
    });

    it('turns CDP metric deltas into per-second rates', () => {
        const rates = cdpPerSecond({ TaskDuration: 1, RecalcStyleCount: 10 }, { TaskDuration: 1.5, RecalcStyleCount: 30, Nodes: 900 }, 2);
        expect(rates).toMatchObject({ taskMsPerSec: 250, recalcStylesPerSec: 10, nodes: 900 });
    });
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

describe('recorded page plumbing', () => {
    it('serves YouTube json3 events as the srv3 and WebVTT the product may ask for first', () => {
        const json3 = { events: [{ tStartMs: 0, dDurationMs: 1500, wWinId: 1, segs: [{ utf8: '今日は' }, { utf8: '<晴れ>', tOffsetMs: 600, acAsrConf: 0 }] }, { tStartMs: 1500, aAppend: 1, segs: [{ utf8: '\n' }] }] };
        expect(json3ToSrv3(json3)).toContain('<p t="0" d="1500" w="1"><s>今日は</s><s t="600" ac="0">&lt;晴れ&gt;</s></p>');
        expect(json3ToSrv3(json3)).toContain('<p t="1500" a="1">');
        expect(json3ToVtt(json3)).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:01.500\n今日は<晴れ>\n');
    });

    it('hand-makes caption timings in the shape of a YouTube auto-generated track, the same every time', () => {
        const { ja, jaEn } = asrCaptionTracksMechanismFixture({ seconds: 60 });
        expect(asrCaptionTracksMechanismFixture({ seconds: 60 })).toEqual({ ja, jaEn, mechanismFixture: true });
        const [windowEvent, ...events] = ja.events;
        expect(windowEvent).toMatchObject({ tStartMs: 0, dDurationMs: 60_000, wpWinPosId: 1, wsWinStyleId: 1 });
        const lines = events.filter(event => !event.aAppend);
        expect(lines.every(line => line.wWinId === 1 && (line.segs?.slice(1).every(seg => (seg.tOffsetMs ?? 0) > 0) ?? false))).toBe(true);
        expect(events.filter(event => event.aAppend).every(event => event.segs?.[0]?.utf8 === '\n')).toBe(true);
        const shownAt = (ms: number) => lines.filter(line => ms >= line.tStartMs && ms < line.tStartMs + line.dDurationMs).length;
        const instants = Array.from({ length: 600 }, (_, index) => index * 100);
        // A two-row roll-up: two lines up at once, and pauses where none is.
        expect(Math.max(...instants.map(shownAt))).toBe(2);
        expect(instants.filter(ms => ms > lines[0].tStartMs && shownAt(ms) === 0).length).toBeGreaterThan(10);
        expect(jaEn.events.map(event => event.tStartMs)).toEqual(lines.map(line => line.tStartMs));
    });

    it('answers GM requests from the recording on replay, and from nothing but the test offline', async () => {
        const wordmark = 'https://ja.wikipedia.org/static/images/mobile/copyright/wikipedia-wordmark-ja.svg';
        const scopeFor = (gmNetwork: string, onGmRequest?: () => unknown) => ({
            gmNetwork, onGmRequest, hosted: true, product: { hostedRoot: resolve('docs/public') }, productTraffic: null, recorder: null, recordHosts: [],
            har: readHarIndex(resolve('scripts/fixtures/recorded/ja-wikipedia-nihongo/network.har')),
            ledger: createNetworkLedger(),
        });
        const replay = scopeFor('replay');
        expect(await answerGmRequest({ method: 'GET', url: wordmark }, replay)).toMatchObject({ status: 200 });
        expect(await answerGmRequest({ method: 'GET', url: 'https://yomureader.com/favicon.ico' }, replay)).toMatchObject({ status: 200 });
        const offline = scopeFor('offline');
        await expect(answerGmRequest({ method: 'GET', url: wordmark }, offline)).rejects.toThrow('no recorded answer');
        await expect(answerGmRequest({ method: 'GET', url: 'https://yomureader.com/favicon.ico' }, offline)).rejects.toThrow('no recorded answer');
        const failing = await answerGmRequest({ method: 'GET', url: wordmark }, scopeFor('offline', () => ({ status: 503, body: 'down' })));
        expect(failing).toMatchObject({ status: 503, responseText: 'down' });
        for (const gmNetwork of ['offline', 'replay']) {
            const throwing = scopeFor(gmNetwork, () => Promise.reject(new Error('answerer broke')));
            throwing.ledger.recordRequest({ channel: 'gm', url: wordmark, ledgerId: '7', served: 'pending' });
            await expect(answerGmRequest({ method: 'GET', url: wordmark, headers: { [LEDGER_ID_HEADER]: '7' } }, throwing)).rejects.toThrow('answerer broke');
            expect(throwing.ledger.entries().map(entry => entry.served), gmNetwork).toEqual(['failed']);
        }
    });

    it('makes blank pictures of the size it was asked for', () => {
        expect(imageSize(blankPng(321, 123))).toEqual([321, 123]);
        expect(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16">'))).toEqual([24, 16]);
    });

    it('round-trips a HAR and answers repeated requests in order, then with the last answer', () => {
        const dir = temporaryDirectory();
        const writer = createHarWriter();
        writer.add({ url: 'https://api.example/parse?text=a', contentType: 'application/json', body: '{"n":1}' });
        writer.add({ url: 'https://api.example/parse?text=a', contentType: 'application/json', body: '{"n":2}' });
        writer.add({ method: 'POST', url: 'https://api.example/info', contentType: 'application/json', body: '{"post":true}', requestBody: '{"id":1}' });
        expect(writer.write(dir, 'traffic.har')).toBe(3);
        const index = readHarIndex(join(dir, 'traffic.har'));
        const answer = () => index.lookup('GET', 'https://api.example/parse?text=a', null)?.body.toString();
        expect([answer(), answer(), answer()]).toEqual(['{"n":1}', '{"n":2}', '{"n":2}']);
        expect(index.lookup('POST', 'https://api.example/info', '{"id":1}')?.body.toString()).toBe('{"post":true}');
        expect(index.lookup('POST', 'https://api.example/info', '{"id":2}')).toBeNull();
    });

    it('merges runs into one HAR, keeping and answering the first answer for each request', () => {
        const dir = temporaryDirectory();
        const writer = createHarWriter({ unique: true });
        expect(writer.add({ url: 'https://api.example/parse?text=a', body: '1' })).toBe(true);
        expect(writer.add({ url: 'https://api.example/parse?text=a', body: '2' })).toBe(false);
        expect(writer.add({ url: 'https://api.example/parse?text=b', body: '3' })).toBe(true);
        expect(writer.lookup('GET', 'https://api.example/parse?text=a')?.body.toString()).toBe('1');
        expect(writer.lookup('GET', 'https://api.example/parse?text=c')).toBeNull();
        expect(writer.write(dir, 'traffic.har')).toBe(2);
        expect(readHarIndex(join(dir, 'traffic.har')).lookup('GET', 'https://api.example/parse?text=a', null)?.body.toString()).toBe('1');
    });

    it('tells a scan-order gap in the recorded build from another build asking for answers the recording lacks', () => {
        const recorded = { product: 'v2.1.6' };
        const replay = (productLabel: string) => ({ recorded, gmNetwork: 'replay', productLabel });
        const mostlyDropped = { served: { 'recorded-product': 10, offline: 40 }, dropped: 40 };
        const fewDropped = { served: { 'recorded-product': 48, offline: 2 }, dropped: 2 };
        const someDropped = { served: { 'recorded-product': 40, offline: 10 }, dropped: 10 };

        expect(productTrafficVerdict(replay('v2.1.6'), mostlyDropped)).toBe('scan-order-gap');
        expect(productTrafficVerdict(replay('v2.1.6'), fewDropped)).toBe('answered');
        expect(productTrafficVerdict(replay('worktree'), mostlyDropped)).toBe('other-build-outage');
        expect(productTrafficVerdict(replay('worktree'), someDropped)).toBe('answered');
        expect(productTrafficVerdict({ recorded, gmNetwork: 'offline', productLabel: 'worktree' }, mostlyDropped)).toBe('answered');
        expect(productTrafficVerdict({ recorded: null, gmNetwork: 'replay', productLabel: 'worktree' }, mostlyDropped)).toBe('answered');
    });

    it('finds the frames where YouTube\'s caption shows in a gap after the first commit', () => {
        const frames = [
            { at: 0, time: 0.1, primary: '', secondary: '', native: true },
            { at: 16, time: 0.2, primary: '今日は', secondary: '', native: false },
            { at: 32, time: 2.1, primary: '', secondary: '', native: true },
            { at: 48, time: 2.2, primary: '', secondary: '', native: false },
        ];
        const flash = captionFlashFrames(frames);
        expect(flash).toMatchObject({ firstCommitAt: 0.2, gapFrames: 2 });
        expect(flash.flashFrames.map(frame => frame.time)).toEqual([2.1]);
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
