// Measurements gates take on a Recorded Page with the product running. Each
// in-page function reads only what a learner would see; the pure helpers turn
// the readings into numbers a gate can compare.

/**
 * Of the product's words with kanji in their base text (readings excluded),
 * how many carry a reading — painted furigana (rt or a detached reading) or a
 * reading the word knows (data-reading). visibleOnly limits it to the viewport.
 */
export async function kanjiReadingCoverage(page, { root = 'body', visibleOnly = true } = {}) {
    return page.evaluate(({ rootSelector, visible }) => {
        const scope = document.querySelector(rootSelector) ?? document.body;
        const READINGS = 'rt, rp, .jpdb-reader-detached-furi';
        const inView = word => {
            const rect = word.getBoundingClientRect();
            return rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
        };
        const baseText = word => {
            const copy = word.cloneNode(true);
            copy.querySelectorAll(READINGS).forEach(element => element.remove());
            return copy.textContent;
        };
        const paintsReading = word => [...word.querySelectorAll('rt, .jpdb-reader-detached-furi')].some(element => element.textContent.trim());
        const hasReading = word => Boolean(word.dataset.reading?.trim()) || paintsReading(word);
        const words = [...scope.querySelectorAll('.jpdb-reader-word')].filter(word => !visible || inView(word));
        const kanji = words.filter(word => /\p{Script=Han}/u.test(baseText(word)));
        const withReading = kanji.filter(hasReading).length;
        return { words: words.length, kanjiWords: kanji.length, withReading, ratio: kanji.length ? withReading / kanji.length : 0 };
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
