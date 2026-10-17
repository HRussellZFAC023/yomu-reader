// Measurements gates take on a Recorded Page with the product running. Each
// in-page function reads only what a learner would see; the pure helpers turn
// the readings into numbers a gate can compare.

/**
 * How much of the visible Japanese carries a painted reading. The
 * denominator is the page's own text, not the product's words: the runs of
 * kanji in each block's text with the readings taken out, so it is the same
 * whichever way a build splits or wraps the words (a run the product cut into
 * two words is still one run). A run is covered when every kanji in it sits
 * in a product word that paints a reading (rt or a detached reading). The
 * product's own word counts, and words that only know a reading (data-reading,
 * nothing painted), are reported beside it. visibleOnly limits it to text in
 * the viewport.
 */
export async function kanjiReadingCoverage(page, { root = 'body', visibleOnly = true } = {}) {
    return page.evaluate(({ rootSelector, visible }) => {
        const scope = document.querySelector(rootSelector) ?? document.body;
        const READINGS = 'rt, rp, .jpdb-reader-detached-furi';
        const range = document.createRange();
        const inView = rect => rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
        const textInView = node => {
            range.selectNodeContents(node);
            return [...range.getClientRects()].some(inView);
        };
        const paintsReading = word => [...word.querySelectorAll('rt, .jpdb-reader-detached-furi')].some(element => element.textContent.trim());
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
    await page.evaluate(() => {
        const frames = [];
        window.__yomuCaptionFrames = frames;
        const lineText = selector => {
            const element = document.querySelector(selector);
            const copy = element ? element.cloneNode(true) : document.createElement('span');
            copy.querySelectorAll('rt, rp, .jpdb-reader-detached-furi').forEach(node => node.remove());
            return copy.textContent.replace(/\s+/gu, ' ').trim();
        };
        const shown = element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
        };
        const segmentPainted = segment => {
            const rect = segment.getBoundingClientRect();
            return rect.width > 0 && segment.textContent.trim() !== '' && shown(segment) && getComputedStyle(segment).color !== 'rgba(0, 0, 0, 0)';
        };
        const nativePainted = () => {
            const container = document.querySelector('.ytp-caption-window-container');
            return Boolean(container) && shown(container) && [...container.querySelectorAll('.ytp-caption-segment')].some(segmentPainted);
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
    });
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
