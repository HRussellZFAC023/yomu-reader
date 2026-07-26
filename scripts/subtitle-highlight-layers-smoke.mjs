#!/usr/bin/env node
// Real-engine regression: a subtitle word must carry exactly ONE painted layer,
// and that layer must sit on the word itself.
//
// A furigana word wraps its kanji run in .jpdb-reader-ruby-base. When both the
// word and that child painted the translucent highlight gradient, the two
// composited over the kanji only, so the kanji rendered visibly darker than the
// okurigana in the same word — reported as "double highlight". The word box and
// the ruby base are vertically coincident, which is exactly what makes a second
// layer double the opacity instead of sitting somewhere harmless, so the word is
// the correct single carrier.
//
// The matrix below is the whole product surface, because a rule family that
// misses one entry reintroduces the bug only there:
//   * markup — the subtitle renderer emits in-flow <ruby>/<rt> (renderRuby) and
//     the detached-reading channel (renderDetachedReadings). An earlier version
//     of this smoke asserted against a bare .jpdb-reader-ruby-base with no
//     <ruby> and no reading at all, a shape nothing in the product renders, so
//     it could not see what either real channel does.
//   * surface — every container class the subtitle channel rules select.
//   * family — highlight AND underline, since the ::after underline lane is a
//     second way for a descendant to paint its own decoration.
// Only a real engine resolves this cascade, and only geometry proves the two
// boxes coincide.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const css = readFileSync(path.join(ROOT, 'dist', 'yomu.css'), 'utf8');

// Every container class the subtitle channel rules select: the on-video cue,
// the transcript drawer rows, the immersion example surface, and the injected
// asbplayer-style container over YouTube.
const SURFACES = [
    'jpdb-subtitle-primary',
    'jpdb-subtitle-row-text',
    'jpdb-reader-subtitle-surface',
    'asbplayer-subtitles-container-bottom',
];

// Each channel mode paints through its own rule set, so all of them are checked.
const MODES = ['highlight', 'underline'].flatMap(family =>
    ['status', 'jpdb', 'anki', 'pitch'].map(source => `jpdb-reader-subtitle-${family}-${source}`));

const WORD_CLASSES = 'jpdb-reader-word jpdb-reader-has-furi jpdb-reader-known jpdb-pitch-heiban';
const WORD_ATTRIBUTES = 'data-pitch-class="heiban" data-card-state="known" data-expression="連続" tabindex="-1"';

// Both furigana channels, exactly as renderRuby/renderDetachedReadings emit
// them: a kanji run carrying the reading, then okurigana in the same word.
const CHANNELS = {
    'in-flow ruby': `<span class="${WORD_CLASSES}" ${WORD_ATTRIBUTES}><ruby><span class="jpdb-reader-ruby-base">連続</span><rp>(</rp><rt class="jpdb-reader-furi">れんぞく</rt><rp>)</rp></ruby>する</span>`,
    'detached reading': `<span class="${WORD_CLASSES} jpdb-reader-detached-reading-word" ${WORD_ATTRIBUTES}><span class="jpdb-reader-detached-ruby" data-yomu-source-start="0" data-yomu-source-end="2"><span class="jpdb-reader-ruby-base">連続</span><span class="jpdb-reader-furi jpdb-reader-detached-furi" aria-hidden="true">れんぞく</span></span>する</span>`,
};

const PLAIN_WORD = '<span class="jpdb-reader-word jpdb-reader-known jpdb-pitch-heiban" data-pitch-class="heiban" data-card-state="known" data-expression="今日">今日</span>';

const fixture = (mode, surface, word) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; background: #101010; }
  .jpdb-subtitle-text { position: absolute; top: 90px; left: 30px; font-size: 44px; }
</style></head>
<body class="${mode}">
  <div class="jpdb-subtitle-player">
    <div class="jpdb-subtitle-text">
      <div class="${surface}">${word} ${PLAIN_WORD}</div>
    </div>
  </div>
</body></html>`;

function fail(context, message, detail) {
    throw new Error(`${context}: ${message}\n${JSON.stringify(detail, null, 2)}`);
}

// Runs inside the page: report every box in the word's subtree that paints a
// layer of its own, plus the geometry the single-carrier rule depends on.
function inspectWord() {
    const transparent = /^(none|rgba\(0, 0, 0, 0\)|transparent|color\(srgb 0 0 0 \/ 0\))$/;
    const opaque = value => Boolean(value) && !transparent.test(value);
    const rect = element => {
        const box = element.getBoundingClientRect();
        return { top: box.top, height: box.height, left: box.left, width: box.width };
    };
    const layersOf = element => {
        const style = getComputedStyle(element);
        const layers = [];
        if (opaque(style.backgroundImage)) layers.push('background-image');
        if (opaque(style.backgroundColor)) layers.push('background-color');
        if (opaque(style.boxShadow)) layers.push('box-shadow');
        if (style.textDecorationLine !== 'none' && opaque(style.textDecorationColor)) layers.push('text-decoration');
        for (const pseudo of ['::before', '::after']) {
            const generated = getComputedStyle(element, pseudo);
            if (generated.content === 'none') continue;
            if (opaque(generated.backgroundImage)) layers.push(`${pseudo} background-image`);
            if (opaque(generated.backgroundColor)) layers.push(`${pseudo} background-color`);
            const underlined = generated.borderBlockEndStyle !== 'none' && generated.borderBlockEndWidth !== '0px';
            if (underlined && opaque(generated.borderBlockEndColor)) layers.push(`${pseudo} underline`);
        }
        return layers;
    };

    const word = document.querySelector('.jpdb-reader-word.jpdb-reader-has-furi');
    const base = word.querySelector('.jpdb-reader-ruby-base');
    const reading = word.querySelector('.jpdb-reader-furi');
    const plain = document.querySelector('.jpdb-reader-word:not(.jpdb-reader-has-furi)');

    const descendants = [];
    const visit = element => {
        for (const child of element.children) {
            const layers = layersOf(child);
            if (layers.length) {
                const name = String(child.className).trim();
                descendants.push({
                    selector: child.tagName.toLowerCase() + (name ? `.${name.split(/\s+/).join('.')}` : ''),
                    layers,
                    rect: rect(child),
                });
            }
            visit(child);
        }
    };
    visit(word);

    return {
        wordLayers: layersOf(word),
        plainLayers: layersOf(plain),
        descendants,
        wordRect: rect(word),
        baseRect: rect(base),
        readingRect: rect(reading),
    };
}

async function verifyEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
        for (const [channel, word] of Object.entries(CHANNELS)) {
            for (const surface of SURFACES) {
                for (const mode of MODES) {
                    const context = `${name} ${channel} .${surface} ${mode}`;
                    await page.setContent(fixture(mode, surface, word), { waitUntil: 'domcontentloaded' });
                    const result = await page.evaluate(inspectWord);

                    // The kanji run sits inside the word's painted band, so a
                    // layer on that child composites over the word's own layer
                    // and darkens the kanji alone. This is the premise the
                    // single-carrier rule rests on, so assert it rather than
                    // assume it. (How much taller the word box is varies by
                    // surface: the on-video cue keeps the reading in its own
                    // row above the band, the transcript row does not.)
                    const contained = result.baseRect.top >= result.wordRect.top - 1
                        && result.baseRect.top + result.baseRect.height <= result.wordRect.top + result.wordRect.height + 1;
                    if (!contained) {
                        fail(context, 'the kanji run left the word\'s painted band, so the single-carrier choice needs rechecking', result);
                    }

                    if (result.descendants.length) {
                        fail(context, 'a box inside the word paints its own layer, doubling it over the kanji run', result);
                    }

                    // A word must still be annotated at rest; the cure for the
                    // doubling must never be "stop painting".
                    if (mode.includes('highlight') && (!result.wordLayers.length || !result.plainLayers.length)) {
                        fail(context, 'the subtitle word lost its highlight entirely', result);
                    }
                }
            }
            console.log(`${name} ${channel}: one layer per word across ${SURFACES.length} surfaces × ${MODES.length} modes`);
        }
    } finally {
        await browser.close();
    }
}

await verifyEngine('chromium', chromium);
await verifyEngine('webkit', webkit);
console.log('subtitle highlight layers smoke passed');
