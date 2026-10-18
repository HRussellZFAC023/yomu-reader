// Measurements gates take on a Recorded Page with the product running. Each
// in-page function reads only what a learner would see; the pure helpers turn
// the readings into numbers a gate can compare.
import sharp from 'sharp';

const READINGS = 'rt, .jpdb-reader-detached-furi';

/**
 * In-page: whether any text inside element is painted where a learner could
 * see it, judged from styles alone (cheap enough for every animation frame).
 * A text node counts when it has a box at least a pixel each way (in the
 * viewport, when inViewport), its element passes checkVisibility (display,
 * visibility, opacity and content-visibility, ancestors included), its fill
 * colour is not transparent, and no ancestor clips or filters it away
 * (clip-path inset to nothing or a zero circle, clip: rect with no area,
 * filter: opacity(0)). Styles cannot rule out every way to hide text (a mask,
 * text the colour of what is behind it); kanjiReadingCoverage therefore also
 * checks the screen's pixels.
 */
function paintsText(element, inViewport) {
    // Computed colours are rgb(r, g, b), rgba(r, g, b, a) or color(space c c c / a).
    const alphaOf = color => {
        if (color === 'transparent') return 0;
        const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/u);
        if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
        const parts = color.match(/\((.*)\)$/u)?.[1].split(',') ?? [];
        return parts.length === 4 ? Number(parts[3]) : 1;
    };
    // inset(t r b l): what is left of the box once the insets are taken off.
    const insetLeavesNothing = (clipPath, box) => {
        const inset = clipPath.match(/^inset\(([^)]*?)(?:\s+round\b[^)]*)?\)$/u)?.[1].trim().split(/\s+/u);
        if (!inset) return false;
        const [top, right = top, bottom = top, left = right] = inset;
        const length = (value, size) => (value.endsWith('%') ? (Number.parseFloat(value) / 100) * size : Number.parseFloat(value));
        return length(top, box.height) + length(bottom, box.height) >= box.height || length(left, box.width) + length(right, box.width) >= box.width;
    };
    const clippedAway = node => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        if (/opacity\(\s*0*(?:\.0*)?%?\s*\)/u.test(style.filter)) return true;
        if (/^(?:circle|ellipse)\(\s*0(?:px|%)?[\s)]/u.test(style.clipPath) || insetLeavesNothing(style.clipPath, box)) return true;
        const rect = style.position === 'absolute' || style.position === 'fixed' ? style.clip.match(/^rect\(([^)]*)\)$/u)?.[1].split(/[\s,]+/u).map(Number.parseFloat) : null;
        return Boolean(rect) && (rect[1] <= rect[3] || rect[2] <= rect[0]);
    };
    const shownByStyle = node => {
        if (node.checkVisibility && !node.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
        if (!node.checkVisibility && getComputedStyle(node).visibility !== 'visible') return false;
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (style.display === 'none' || Number(style.opacity) === 0 || clippedAway(ancestor)) return false;
        }
        return true;
    };
    const filled = node => {
        const style = getComputedStyle(node);
        return alphaOf(style.webkitTextFillColor || style.color) > 0;
    };
    const range = document.createRange();
    const boxed = node => {
        range.selectNodeContents(node);
        return [...range.getClientRects()].some(rect => rect.width >= 1 && rect.height >= 1
            && (!inViewport || (rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth)));
    };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue.trim() && node.parentElement && boxed(node) && shownByStyle(node.parentElement) && filled(node.parentElement)) return true;
    }
    return false;
}

// Runs an in-page probe with paintsText as its first argument. The probe is
// sent as one expression, so the helper needs no global and no eval in the page.
function evaluateWithPaintsText(page, probe, argument) {
    return page.evaluate(`(${probe})(${paintsText}, ${JSON.stringify(argument)})`);
}

// A pixel differs when a colour channel moves by at least this much; a
// reading is seen when at least INK_PIXELS of its pixels do.
const INK_DIFFERENCE = 32;
const INK_PIXELS = 3;
// While the second screenshot is taken, every reading's glyphs (and those it
// generates) paint nothing and all else stays: layout, backgrounds, borders
// and decorations. -webkit-text-fill-color, not color, so a background drawn
// in currentColor keeps its colour; a reading painted over a box of its own
// colour then changes nothing and is not seen.
const READING_PARTS = [`:is(${READINGS})`, `:is(${READINGS}) *`].flatMap(selector => [selector, `${selector}::before`, `${selector}::after`]).join(', ');
const HIDE_READINGS = `${READING_PARTS} { -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-shadow: none !important; }`;

async function screenPixels(page) {
    const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

function inkDiffers(shown, hidden, rects, scale) {
    let differing = 0;
    for (const [left, top, right, bottom] of rects) {
        const [x0, y0] = [Math.max(0, Math.floor((left - 1) * scale)), Math.max(0, Math.floor((top - 1) * scale))];
        const [x1, y1] = [Math.min(shown.width, Math.ceil((right + 1) * scale)), Math.min(shown.height, Math.ceil((bottom + 1) * scale))];
        for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
                const at = (y * shown.width + x) * 4;
                const moved = Math.max(...[0, 1, 2].map(channel => Math.abs(shown.data[at + channel] - hidden.data[at + channel])));
                if (moved >= INK_DIFFERENCE && (differing += 1) >= INK_PIXELS) return true;
            }
        }
    }
    return false;
}

/**
 * The readings under root a learner sees on screen: those the style rule
 * (paintsText) passes whose pixels change when only their glyphs are taken
 * away. Two viewport screenshots, the second with an adopted stylesheet
 * making the readings' text transparent (no DOM change, so the product does
 * not react). Readings clipped, masked, filtered or drawn in the colour
 * behind them (the page, or their own background) change nothing and are not
 * seen. Leaves the probed elements in window.__yomuReadingProbe;
 * returns { styled, seen } as indices into it.
 */
async function readingsOnScreen(page, root) {
    const { candidates, viewportWidth } = await evaluateWithPaintsText(page, (paintsText, { rootSelector, readings }) => {
        const scope = document.querySelector(rootSelector) ?? document.body;
        const elements = [...scope.querySelectorAll(readings)];
        window.__yomuReadingProbe = elements;
        const range = document.createRange();
        const rectsOf = element => {
            range.selectNodeContents(element);
            return [...range.getClientRects()].filter(rect => rect.width >= 1 && rect.height >= 1).map(rect => [rect.left, rect.top, rect.right, rect.bottom]);
        };
        const candidates = elements.flatMap((element, index) => (paintsText(element, true) ? [{ index, rects: rectsOf(element) }] : []));
        return { candidates, viewportWidth: innerWidth };
    }, { rootSelector: root, readings: READINGS });
    if (!candidates.length) return { styled: [], seen: [] };
    const shown = await screenPixels(page);
    await page.evaluate(css => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        window.__yomuReadingProbeSheet = sheet;
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }, HIDE_READINGS);
    let hidden;
    try {
        hidden = await screenPixels(page);
    } finally {
        await page.evaluate(() => {
            document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== window.__yomuReadingProbeSheet);
            delete window.__yomuReadingProbeSheet;
        });
    }
    const scale = shown.width / viewportWidth;
    return { styled: candidates.map(({ index }) => index), seen: candidates.filter(({ rects }) => inkDiffers(shown, hidden, rects, scale)).map(({ index }) => index) };
}

/**
 * How much of the Japanese in the viewport carries a reading a learner sees.
 * The denominator is the page's own text, not the product's words: the runs
 * of kanji in each block's text with the readings taken out, so it is the
 * same whichever way a build splits or wraps the words (a run the product cut
 * into two words is still one run). A run is covered when every kanji in it
 * sits in a product word with a reading (rt or a detached reading) seen on
 * screen (readingsOnScreen: the style rule, then the screen's pixels). The
 * product's own word counts, and words that only know a reading (data-reading,
 * nothing seen), are reported beside it, as are the readings the style rule
 * alone passes (styledReadings) and those seen on screen (seenReadings).
 */
export async function kanjiReadingCoverage(page, { root = 'body' } = {}) {
    const { styled, seen } = await readingsOnScreen(page, root);
    const coverage = await page.evaluate(({ rootSelector, readings, seenIndices }) => {
        const scope = document.querySelector(rootSelector) ?? document.body;
        const seenReadings = new Set(seenIndices.map(index => window.__yomuReadingProbe[index]));
        delete window.__yomuReadingProbe;
        const range = document.createRange();
        const inView = rect => rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
        const textInView = node => {
            range.selectNodeContents(node);
            return [...range.getClientRects()].some(inView);
        };
        const paintsReading = word => [...word.querySelectorAll(readings)].some(element => seenReadings.has(element));
        const isPageText = node => Boolean(node.parentElement) && !node.parentElement.closest(`${readings}, rp, script, style, noscript`) && textInView(node);
        const flows = element => /^(inline|ruby|contents)/u.test(getComputedStyle(element).display);
        const blockOf = node => {
            let element = node.parentElement;
            while (element !== scope && flows(element)) element = element.parentElement;
            return element;
        };
        const pageTextNodes = () => {
            const nodes = [];
            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) if (isPageText(node)) nodes.push(node);
            return nodes;
        };
        // One text per block in document order; each character knows whether a painted word holds it.
        const addToBlock = (blocks, node) => {
            const block = blockOf(node);
            if (blocks.at(-1)?.block !== block) blocks.push({ block, text: '', covered: [] });
            const word = node.parentElement.closest('.jpdb-reader-word');
            const painted = Boolean(word) && paintsReading(word);
            blocks.at(-1).text += node.nodeValue;
            blocks.at(-1).covered.push(...[...node.nodeValue].map(() => painted));
            return blocks;
        };
        const runCoverage = ({ text, covered }) => [...text.matchAll(/\p{Script=Han}+/gu)].map(match => {
            const start = [...text.slice(0, match.index)].length;
            return covered.slice(start, start + [...match[0]].length).every(Boolean);
        });
        const runs = pageTextNodes().reduce(addToBlock, []).flatMap(runCoverage);
        const baseText = word => {
            const copy = word.cloneNode(true);
            copy.querySelectorAll(`${readings}, rp`).forEach(element => element.remove());
            return copy.textContent;
        };
        const words = [...scope.querySelectorAll('.jpdb-reader-word')].filter(word => inView(word.getBoundingClientRect()));
        const kanjiWords = words.filter(word => /\p{Script=Han}/u.test(baseText(word)));
        const dataReadingOnly = word => !paintsReading(word) && Boolean(word.dataset.reading?.trim());
        const covered = runs.filter(Boolean).length;
        return {
            kanjiRuns: runs.length,
            covered,
            ratio: runs.length ? covered / runs.length : 0,
            words: words.length,
            kanjiWords: kanjiWords.length,
            painted: kanjiWords.filter(paintsReading).length,
            dataReadingOnly: kanjiWords.filter(dataReadingOnly).length,
        };
    }, { rootSelector: root, readings: READINGS, seenIndices: seen });
    return { ...coverage, styledReadings: styled.length, seenReadings: seen.length };
}

/**
 * Starts a per-animation-frame log of the subtitle surfaces: the product's
 * primary and secondary lines and whether YouTube's own caption window is
 * painted. readCaptionFrames returns the log; captionFlashFrames reads it.
 */
export async function startCaptionFrameLog(page) {
    await evaluateWithPaintsText(page, paintsText => {
        const frames = [];
        window.__yomuCaptionFrames = frames;
        // A line the product keeps in the DOM but hides is a gap, not a line.
        const lineText = selector => {
            const element = document.querySelector(selector);
            if (!element || !paintsText(element, false)) return '';
            const copy = element.cloneNode(true);
            copy.querySelectorAll('rt, rp, .jpdb-reader-detached-furi').forEach(node => node.remove());
            return copy.textContent.replace(/\s+/gu, ' ').trim();
        };
        const nativePainted = () => {
            const container = document.querySelector('.ytp-caption-window-container');
            return Boolean(container) && [...container.querySelectorAll('.ytp-caption-segment')].some(segment => paintsText(segment, false));
        };
        const tick = () => {
            if (window.__yomuCaptionFrames !== frames) return;
            frames.push({
                at: performance.now(),
                time: document.querySelector('#movie_player video')?.currentTime ?? null,
                primary: lineText('.jpdb-subtitle-primary'),
                secondary: lineText('.jpdb-subtitle-secondary'),
                native: nativePainted(),
            });
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, null);
}

export async function readCaptionFrames(page) {
    return page.evaluate(() => {
        const frames = window.__yomuCaptionFrames ?? [];
        window.__yomuCaptionFrames = null;
        return frames;
    });
}

/**
 * Frames after the product's first committed line in which it shows no line
 * (an inter-cue gap) while YouTube's own caption is painted: the caption flash.
 */
export function captionFlashFrames(frames) {
    const firstCommit = frames.findIndex(frame => frame.primary);
    if (firstCommit < 0) return { firstCommitAt: null, gapFrames: 0, flashFrames: [] };
    const after = frames.slice(firstCommit);
    const gaps = after.filter(frame => !frame.primary);
    return {
        firstCommitAt: frames[firstCommit].time,
        gapFrames: gaps.length,
        flashFrames: gaps.filter(frame => frame.native),
    };
}
