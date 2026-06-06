#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { assert, launchSmokeBrowser } from './smoke-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');

mkdirSync(ARTIFACTS, { recursive: true });

const css = readFileSync(CSS_PATH, 'utf8');
const ankiFixture = String.raw`
<details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing" open>
  <summary class="jpdb-reader-local-title">
    <span><span class="jpdb-reader-state-dot anki-due"></span>Anki (3)</span>
    <small class="jpdb-reader-source-status">Due · RRTK Recognition Remembering The Kanji v2 · 2 reviews</small>
  </summary>
  <div class="jpdb-reader-anki-match-summary">
    <div class="jpdb-reader-anki-match-summary-row">
      <span><span class="jpdb-reader-state-dot anki-new"></span>RRTK Recognition Remembering The Kanji v2 · Kanji</span>
      <small>New · #1300</small>
    </div>
    <div class="jpdb-reader-anki-match-summary-row">
      <span><span class="jpdb-reader-state-dot anki-due"></span>Vocab 2k · Word</span>
      <small>Due · #2050</small>
    </div>
  </div>
  <details class="jpdb-reader-local-entry jpdb-reader-anki-card-preview jpdb-reader-anki-existing-note" open>
    <summary class="jpdb-reader-anki-existing-note-title">
      <span><span class="jpdb-reader-state-dot anki-new"></span><strong>RRTK Recognition Remembering The Kanji v2 · Kanji</strong></span>
      <small>New · RRTK</small>
    </summary>
    <div class="jpdb-reader-anki-existing-note-body">
      <div class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="1300">
        <section class="jpdb-reader-anki-rendered-side">
          <div class="jpdb-reader-anki-rendered-side-body jpdb-reader-parseable">
            <div class="rtk-kanji" style="font-size: 30px">読 読</div>
            <div class="rtk-kanji" style="font-size: 30px">読 読</div>
            <hr>
            <strong>read</strong>
            <p>People will say almost anything to <em>sell</em> you something; do not believe everything you <strong>read</strong>.</p>
          </div>
        </section>
      </div>
    </div>
  </details>
  <details class="jpdb-reader-local-entry jpdb-reader-anki-card-preview jpdb-reader-anki-existing-note">
    <summary class="jpdb-reader-anki-existing-note-title">
      <span><span class="jpdb-reader-state-dot anki-due"></span><strong>Vocab 2k · Core 2k/6k Optimized Japanese Vocabulary</strong></span>
      <small>Due · 2 reviews</small>
    </summary>
    <div class="jpdb-reader-anki-existing-note-body">
      <div class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="2050">
        <section class="jpdb-reader-anki-rendered-side">
          <div class="jpdb-reader-anki-rendered-side-body jpdb-reader-parseable">
            <ruby>始<rt>はじ</rt></ruby>める
            <button class="jpdb-reader-anki-sound" type="button" data-action="anki-media-audio" data-anki-media-name="core-start.mp3">Card audio</button>
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
            <p>Please start the test.</p>
          </div>
        </section>
      </div>
    </div>
  </details>
  <details class="jpdb-reader-local-entry jpdb-reader-anki-card-preview jpdb-reader-anki-existing-note">
    <summary class="jpdb-reader-anki-existing-note-title">
      <span><span class="jpdb-reader-state-dot anki-new"></span><strong>Kaishi 1.5k · Kaishi 1.5k · Word</strong></span>
      <small>New · #8601</small>
    </summary>
    <div class="jpdb-reader-anki-existing-note-body">
      <div class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="8601">
        <section class="jpdb-reader-anki-rendered-side">
          <div class="jpdb-reader-anki-rendered-side-body jpdb-reader-parseable">
            <div class="kaishi-card" style="font-size: 30px; text-align: center;">
              <ruby><rb>始</rb><rt>はじ</rt></ruby>める
              <div style="font-size: 25px;">テストを<b><ruby><rb>始</rb><rt>はじ</rt></ruby>めて</b>ください。</div>
              <div style="font-size: 25px;">Please start the test.</div>
              <button class="jpdb-reader-anki-sound" type="button" data-action="anki-media-audio" data-anki-media-name="0e5a0bcb94d981c08ea2552a0716e02b-c8aca572ab508c03a1942de4757f535945a90c5a.mp3">Card audio</button>
              <button class="jpdb-reader-anki-sound" type="button" data-action="anki-media-audio" data-anki-media-name="e79a8072345e2d2560af1e7ca2540eee-1bd2024a27767f03ad514d91142e19a4e6e77ac6.mp3">Card audio</button>
              <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
            </div>
          </div>
        </section>
      </div>
    </div>
  </details>
  <details class="jpdb-reader-local-entry jpdb-reader-anki-card-preview jpdb-reader-anki-existing-note">
    <summary class="jpdb-reader-anki-existing-note-title">
      <span><span class="jpdb-reader-state-dot anki-known"></span><strong>Yomu · よむ Japanese · Word</strong></span>
      <small>Known · 7 reviews</small>
    </summary>
    <div class="jpdb-reader-anki-existing-note-body">
      <div class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="3001">
        <section class="jpdb-reader-anki-rendered-side">
          <div class="jpdb-reader-anki-rendered-side-body jpdb-reader-parseable">
            <div class="yomu-word">日本語</div>
            <div class="yomu-reading">にほんご</div>
            <p>Japanese language</p>
          </div>
        </section>
      </div>
    </div>
  </details>
</details>`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>${css}</style>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--jpdb-reader-backdrop, #0f1318);
      font-family: var(--jpdb-reader-font, system-ui, sans-serif);
    }
    .fixture-light {
      color-scheme: light;
      background: #f7f8fb;
    }
    .fixture-light .jpdb-reader-popover {
      color-scheme: light;
    }
  </style>
</head>
<body>
  <div class="jpdb-reader-popover" role="dialog" style="position: static; width: min(680px, calc(100vw - 32px)); max-height: none;">
    <div class="jpdb-reader-popover-body">${ankiFixture}</div>
  </div>
</body>
</html>`;

async function measure(page) {
    return page.evaluate(() => {
        const bodies = [...document.querySelectorAll('.jpdb-reader-anki-rendered-side-body')];
        const fontSizes = bodies.flatMap(body =>
            [...body.querySelectorAll('*')].map(element => Number.parseFloat(getComputedStyle(element).fontSize) || 0),
        );
        const scrollBodies = bodies.filter(body => {
            const style = getComputedStyle(body);
            return style.overflowY !== 'visible' && body.scrollHeight > body.clientHeight + 2;
        }).length;
        return {
            maxFontSize: Math.max(...fontSizes),
            renderedCards: document.querySelectorAll('.jpdb-reader-anki-rendered-card').length,
            openNotes: document.querySelectorAll('.jpdb-reader-anki-existing-note[open]').length,
            audioButtons: document.querySelectorAll('[data-action="anki-media-audio"][data-anki-media-name]').length,
            images: document.querySelectorAll('.jpdb-reader-anki-rendered-side-body img').length,
            scrollBodies,
            text: document.body.textContent ?? '',
            summaryColor: getComputedStyle(document.querySelector('.jpdb-reader-anki-existing > summary')).color,
            bodyBackground: getComputedStyle(document.body).backgroundColor,
        };
    });
}

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    await page.setContent(html);
    const dark = await measure(page);
    assert(dark.maxFontSize <= 30.5, 'Anki template font size exceeded popover cap in dark mode.', dark);
    assert(dark.renderedCards === 4, 'Expected RRTK, Core, Kaishi, and Yomu rendered card fixtures.', dark);
    assert(dark.openNotes === 1, 'Only the primary Anki note should be expanded by default.', dark);
    assert(dark.audioButtons === 3, 'Anki card audio should render as its own controls.', dark);
    assert(dark.images === 2, 'Core and Kaishi card images should remain visible.', dark);
    assert(dark.scrollBodies === 0, 'Rendered Anki sides should not create nested scroll regions.', dark);
    assert(dark.text.includes('RRTK Recognition Remembering The Kanji v2'), 'RRTK deck label should remain visible.', dark);
    assert(dark.text.includes('Please start the test.'), 'Core example sentence should remain visible.', dark);
    assert(!dark.text.includes('0e5a0bcb94d981c08ea2552a0716e02b'), 'Kaishi audio filename should stay out of visible text.', dark);
    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-template-popover-dark.png'), fullPage: true });

    await page.evaluate(() => document.body.classList.add('fixture-light'));
    const light = await measure(page);
    assert(light.maxFontSize <= 30.5, 'Anki template font size exceeded popover cap in light mode.', light);
    assert(light.bodyBackground !== dark.bodyBackground, 'Light mode fixture did not apply a distinct page background.', { dark, light });
    await page.screenshot({ path: path.join(ARTIFACTS, 'anki-template-popover-light.png'), fullPage: true });
    console.log('Anki template render smoke passed.');
} finally {
    await browser.close();
}
