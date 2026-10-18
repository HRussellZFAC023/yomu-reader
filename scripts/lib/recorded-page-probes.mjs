// Measurements gates take on a Recorded Page with the product running. Each
// in-page function reads only what a learner would see; the pure helpers turn
// the readings into numbers a gate can compare.

/**
 * In-page: whether any text inside element is painted where a learner could
 * see it. A text node counts when it has a box at least a pixel each way (in
 * the viewport, when inViewport), its element passes checkVisibility (display,
 * visibility, opacity and content-visibility, ancestors included) and its
 * fill colour is not transparent. A reading kept in the DOM but hidden by the
 * page or the product (display: none, visibility: hidden, opacity: 0,
 * font-size: 0, a transparent colour) therefore does not count.
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
    const shownByStyle = node => {
        if (node.checkVisibility) return node.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
        if (getComputedStyle(node).visibility !== 'visible') return false;
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (style.display === 'none' || Number(style.opacity) === 0) return false;
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

/**
 * How much of the visible Japanese carries a painted reading. The
 * denominator is the page's own text, not the product's words: the runs of
 * kanji in each block's text with the readings taken out, so it is the same
 * whichever way a build splits or wraps the words (a run the product cut into
 * two words is still one run). A run is covered when every kanji in it sits
 * in a product word that paints a reading (rt or a detached reading). The
 * product's own word counts, and words that only know a reading (data-reading,
 * nothing painted), are reported beside it. visibleOnly limits it to text in
 * the viewport. A reading counts as painted only when a learner could see it
 * (paintsText): an rt the product or the page hides is not a reading.
 */
export async function kanjiReadingCoverage(page, { root = 'body', visibleOnly = true } = {}) {
    return evaluateWithPaintsText(page, (paintsText, { rootSelector, visible }) => {
        const scope = document.querySelector(rootSelector) ?? document.body;
        const READINGS = 'rt, rp, .jpdb-reader-detached-furi';
        const range = document.createRange();
        const inView = rect => rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
        const textInView = node => {
            range.selectNodeContents(node);
            return [...range.getClientRects()].some(inView);
        };
        const paintsReading = word => [...word.querySelectorAll('rt, .jpdb-reader-detached-furi')].some(element => paintsText(element, visible));
        const isPageText = node => Boolean(node.parentElement) && !node.parentElement.closest(`${READINGS}, script, style, noscript`) && (!visible || textInView(node));
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
            copy.querySelectorAll(READINGS).forEach(element => element.remove());
            return copy.textContent;
        };
        const wordInView = word => !visible || inView(word.getBoundingClientRect());
        const words = [...scope.querySelectorAll('.jpdb-reader-word')].filter(wordInView);
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
    }, { rootSelector: root, visible: visibleOnly });
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
