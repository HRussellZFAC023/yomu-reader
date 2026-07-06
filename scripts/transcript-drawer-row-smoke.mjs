#!/usr/bin/env node
// Transcript drawer row layout smoke: renders real parsed-cue HTML
// (renderTokensToHtml) inside the real drawer markup with the built reader
// CSS and verifies, in Chromium AND WebKit across a sweep of drawer widths:
//  - word atomicity: a multi-kanji word with per-kanji rubies (搭載 とう/さい)
//    never splits across line wraps in the drawer rows;
//  - compact rows: a two-line ruby cue and a single-line plain cue stay
//    within their vertical budgets (per-word ruby line-height inflation and
//    row chrome used to stack one short cue into many tall lines);
//  - the main subtitle overlay keeps visible furigana and atomic words too.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-transcript-drawer-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

// A two-line (at ~360px) cue with per-kanji split rubies plus plain words.
writeFileSync(entryPath, `
    import { renderTokensToHtml } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    function card(spelling: string, reading: string): JPDBCard {
        return { vid: spelling.charCodeAt(0), sid: 1, rid: 0, spelling, reading, frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb' };
    }
    interface Spec { surface: string; reading?: string; rubies?: Array<{ text: string; start: number; end: number }>; pitch?: string }
    function tokens(text: string, specs: Spec[]): JPDBToken[] {
        const out: JPDBToken[] = [];
        let offset = 0;
        for (const spec of specs) {
            const start = text.indexOf(spec.surface, offset);
            if (start < 0) throw new Error('surface not found: ' + spec.surface);
            const end = start + spec.surface.length;
            out.push({
                card: card(spec.surface, spec.reading ?? spec.surface),
                start, end, length: spec.surface.length,
                rubies: (spec.rubies ?? []).map(r => ({ text: r.text, start: start + r.start, end: start + r.end, length: r.end - r.start })),
                pitchClass: spec.pitch ?? 'heiban',
                sentence: text,
            });
            offset = end;
        }
        return out;
    }

    const CUE = '新しい技術を搭載した製品を発表しました、搭載された機能は本当に素晴らしいです';
    const SPECS: Spec[] = [
        { surface: '新しい', reading: 'あたらしい', rubies: [{ text: 'あたら', start: 0, end: 1 }], pitch: 'atamadaka' },
        { surface: '技術', reading: 'ぎじゅつ', rubies: [{ text: 'ぎじゅつ', start: 0, end: 2 }], pitch: 'atamadaka' },
        { surface: 'を', reading: 'を' },
        { surface: '搭載', reading: 'とうさい', rubies: [{ text: 'とう', start: 0, end: 1 }, { text: 'さい', start: 1, end: 2 }], pitch: 'heiban' },
        { surface: 'した', reading: 'した' },
        { surface: '製品', reading: 'せいひん', rubies: [{ text: 'せいひん', start: 0, end: 2 }], pitch: 'heiban' },
        { surface: 'を', reading: 'を' },
        { surface: '発表', reading: 'はっぴょう', rubies: [{ text: 'はっぴょう', start: 0, end: 2 }], pitch: 'heiban' },
        { surface: 'しました', reading: 'しました' },
        { surface: '搭載', reading: 'とうさい', rubies: [{ text: 'とう', start: 0, end: 1 }, { text: 'さい', start: 1, end: 2 }], pitch: 'heiban' },
        { surface: 'された', reading: 'された' },
        { surface: '機能', reading: 'きのう', rubies: [{ text: 'きのう', start: 0, end: 2 }], pitch: 'atamadaka' },
        { surface: 'は', reading: 'は' },
        { surface: '本当に', reading: 'ほんとうに', rubies: [{ text: 'ほんとう', start: 0, end: 2 }], pitch: 'unknown' },
        { surface: '素晴らしい', reading: 'すばらしい', rubies: [{ text: 'すば', start: 0, end: 2 }], pitch: 'atamadaka' },
        { surface: 'です', reading: 'です' },
    ];

    function splitWords(scope: Element): string[] {
        return Array.from(scope.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .filter(word => {
                const tops = new Set(Array.from(word.querySelectorAll<HTMLElement>('.jpdb-reader-ruby-base'))
                    .map(base => Math.round(base.getBoundingClientRect().top)));
                return tops.size > 1 || word.getClientRects().length > 1;
            })
            .map(word => word.dataset.surface ?? '?');
    }

    Object.assign(window, {
        runDrawerProbe(width: number) {
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            panel.style.width = width + 'px';
            const overlayHost = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            overlayHost.style.width = width + 'px';
            const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all', showPitchAccent: true };
            const html = renderTokensToHtml(CUE, tokens(CUE, SPECS), settings as any);
            for (const target of document.querySelectorAll<HTMLElement>('[data-transcript-text], .jpdb-subtitle-primary')) {
                target.innerHTML = html;
            }
            const rubyRow = document.querySelector<HTMLElement>('#ruby-row')!;
            const rubyText = rubyRow.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!;
            const lineTops = new Set(Array.from(rubyText.querySelectorAll<HTMLElement>('ruby')).map(el => Math.round(el.getBoundingClientRect().top)));
            const primary = document.querySelector<HTMLElement>('.jpdb-subtitle-primary')!;
            const primaryRt = primary.querySelector('rt');
            return {
                width,
                drawerSplitWords: splitWords(rubyRow),
                overlaySplitWords: splitWords(primary),
                rubyRowHeight: Math.round(rubyRow.getBoundingClientRect().height),
                rubyLineCount: lineTops.size,
                plainRowHeight: Math.round(document.querySelector('#plain-row')!.getBoundingClientRect().height),
                overlayRtVisible: Boolean(primaryRt) && getComputedStyle(primaryRt!).display !== 'none'
                    && primaryRt!.getBoundingClientRect().height > 4,
                pitchWords: rubyText.querySelectorAll('.jpdb-reader-word.jpdb-pitch-heiban, .jpdb-reader-word.jpdb-pitch-atamadaka').length,
            };
        },
    });
`);

await esbuild.build({ entryPoints: [entryPath], bundle: true, outfile: bundlePath, format: 'iife', platform: 'browser', logLevel: 'silent' });

const FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
<div class="jpdb-subtitle-player" data-jpdb-reader-root="true" style="position:fixed;left:0;top:0;width:360px;">
  <div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines"><div class="jpdb-subtitle-primary"></div></div></div>
</div>
<div class="jpdb-subtitle-list jpdb-subtitle-transcript-bottom" data-jpdb-reader-root="true" style="position:fixed;left:0;top:220px;width:360px;height:420px;">
  <div class="jpdb-subtitle-list-scroll">
    <div class="jpdb-subtitle-list-row" id="ruby-row" data-action="cue" data-row-index="0" data-cue-index="0" role="button" tabindex="0">
      <div class="jpdb-subtitle-row-body">
        <strong class="jpdb-subtitle-row-text" lang="ja" data-transcript-text data-row-index="0" data-parse-key="k0"></strong>
      </div>
      <div class="jpdb-subtitle-row-tools"><span class="jpdb-subtitle-row-time">0:01</span></div>
    </div>
    <div class="jpdb-subtitle-list-row" id="plain-row" data-action="cue" role="button" tabindex="0">
      <div class="jpdb-subtitle-row-body"><strong class="jpdb-subtitle-row-text" lang="ja">はい、そうです。</strong></div>
      <div class="jpdb-subtitle-row-tools"><span class="jpdb-subtitle-row-time">0:02</span></div>
    </div>
  </div>
</div>
</body></html>`;

// Budgets: at 360px the ruby cue wraps to at most 2 lines and its whole row
// (line boxes + row chrome) stays under 78px; a single-line plain cue row
// keeps the 44px touch target without padding past 48px. Before the compact
// rows landed these measured 90px (Chromium) / 81px (WebKit) and 54px.
const RUBY_ROW_MAX_PX = 78;
const RUBY_ROW_MAX_LINES = 2;
const PLAIN_ROW_MAX_PX = 48;
const WIDTHS = [300, 320, 340, 360, 390];

function fail(message, details) {
    console.error(message, JSON.stringify(details));
    process.exitCode = 1;
}

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
        await page.route('https://transcript-drawer.example/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE }));
        await page.goto('https://transcript-drawer.example/', { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(CSS_PATH, 'utf8') });
        await page.addScriptTag({ path: bundlePath });

        for (const width of WIDTHS) {
            const snap = await page.evaluate(w => window.runDrawerProbe(w), width);
            if (snap.drawerSplitWords.length) fail(`${name}@${width}: drawer word split across a line wrap`, snap);
            if (snap.overlaySplitWords.length) fail(`${name}@${width}: overlay word split across a line wrap`, snap);
            if (!snap.overlayRtVisible) fail(`${name}@${width}: overlay furigana not visible`, snap);
            if (snap.pitchWords < 6) fail(`${name}@${width}: pitch classes missing from drawer words`, snap);
            if (width >= 360) {
                if (snap.rubyLineCount > RUBY_ROW_MAX_LINES) fail(`${name}@${width}: ruby cue wrapped past ${RUBY_ROW_MAX_LINES} lines`, snap);
                if (snap.rubyRowHeight > RUBY_ROW_MAX_PX) fail(`${name}@${width}: ruby cue row taller than ${RUBY_ROW_MAX_PX}px`, snap);
            }
            if (snap.plainRowHeight > PLAIN_ROW_MAX_PX) fail(`${name}@${width}: plain cue row taller than ${PLAIN_ROW_MAX_PX}px`, snap);
        }
        const summary = await page.evaluate(w => window.runDrawerProbe(w), 360);
        console.log(`${name}: ruby row ${summary.rubyRowHeight}px/${summary.rubyLineCount} lines, plain row ${summary.plainRowHeight}px, splits drawer=${summary.drawerSplitWords.length} overlay=${summary.overlaySplitWords.length}`);
    } finally {
        await browser.close();
    }
}

try {
    await runEngine('chromium', chromium);
    await runEngine('webkit', webkit);
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
if (process.exitCode) {
    console.error('transcript drawer row smoke FAILED');
} else {
    console.log('transcript drawer row smoke passed');
}
