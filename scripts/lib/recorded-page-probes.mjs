// Measurements gates take on a Recorded Page with the product running. Each
// in-page function reads only what a learner would see; the pure helpers turn
// the readings into numbers a gate can compare.

/**
 * How much of the visible Japanese carries a painted reading. The
 * denominator is the page's own text, not the product's words: every run of
 * kanji in the text nodes under root (readings excluded), so a build that
 * wraps fewer words cannot score higher. A run is covered when the product's
 * word around it paints a reading (rt or a detached reading). The product's
 * own word counts, and words that only know a reading (data-reading, nothing
 * painted), are reported beside it. visibleOnly limits it to the viewport.
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
        const textNodes = [];
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node);
        const runs = textNodes.filter(isPageText).map(node => ({
            count: node.nodeValue.match(/\p{Script=Han}+/gu)?.length ?? 0,
            word: node.parentElement.closest('.jpdb-reader-word'),
        }));
        const kanjiRuns = runs.reduce((total, run) => total + run.count, 0);
        const covered = runs.filter(run => run.word && paintsReading(run.word)).reduce((total, run) => total + run.count, 0);
        const baseText = word => {
            const copy = word.cloneNode(true);
            copy.querySelectorAll(READINGS).forEach(element => element.remove());
            return copy.textContent;
        };
        const words = [...scope.querySelectorAll('.jpdb-reader-word')].filter(word => !visible || inView(word.getBoundingClientRect()));
        const kanjiWords = words.filter(word => /\p{Script=Han}/u.test(baseText(word)));
        const dataReadingOnly = word => !paintsReading(word) && Boolean(word.dataset.reading?.trim());
        return {
            kanjiRuns,
            covered,
            ratio: kanjiRuns ? covered / kanjiRuns : 0,
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
