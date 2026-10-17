import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareGeometrySignatures, type GeometrySignature } from '../../scripts/lib/geometry-signature.mjs';
import { cdpPerSecond, spinSummary } from '../../scripts/lib/main-thread-sampler.mjs';
import { assertLedgerCount, assertNoRequestsBeforeInteraction, createNetworkLedger } from '../../scripts/lib/network-ledger.mjs';
import { createHarWriter, readHarIndex } from '../../scripts/lib/recorded-har.mjs';
import { json3ToSrv3, json3ToVtt } from '../../scripts/lib/recorded-hosts.mjs';
import { blankPng, imageSize } from '../../scripts/lib/recorded-media.mjs';
import { captionFlashFrames } from '../../scripts/lib/recorded-page-probes.mjs';
import { findRedactionLeaks, hashTextRun, isHiddenCopy, normalizeTextRun, redactionHashList, textRunsFromHtml } from '../../scripts/lib/recorded-redaction.mjs';
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

    it('reads text runs from text, visible attributes and declarative shadow roots, not from scripts or styles', () => {
        const runs = textRunsFromHtml('<html><head><title>見出し</title><style>.a{content:"表示"}</style><script>var x = "秘密";</script></head><body><img alt="写真の説明"><p>本文です</p><div><template shadowrootmode="open"><span>影の中</span></template></div></body></html>');
        expect(runs).toEqual(['見出し', '写真の説明', '本文です', '影の中']);
    });

    it('reads copy kept in any attribute, and not one-word ASCII vocabulary', () => {
        const runs = textRunsFromHtml('<a class="headline" data-state="true" data-id="a1b2" data-realizer-title="弟を溺愛する母の見出し" data-gtm-label="Spring campaign banner" href="/articles/1"><time datetime="2026-10-10T12:00">10/10</time></a>');
        expect(runs).toEqual(['弟を溺愛する母の見出し', 'Spring campaign banner']);
        expect(isHiddenCopy('true')).toBe(false);
        expect(isHiddenCopy('ranking_top')).toBe(false);
        expect(isHiddenCopy('ランキング')).toBe(true);
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

    it('fails a credit for a recording that is not committed', () => {
        const root = temporaryDirectory();
        writeRecording(root, '私はその人を常に');
        writeFileSync(join(root, 'ATTRIBUTION.md'), '| `example-redacted` | structure only |\n| `youtube-watch` | not recorded |\n');
        const result = run(root);
        expect(result.code).toBe(1);
        expect(result.output).toContain('ATTRIBUTION.md credits youtube-watch, which is not committed');
    });
});
