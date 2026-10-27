import assert from 'node:assert/strict';

// Parsing is deliberately held across three boundaries on the recorded page.
// The clock/latency inputs are mechanism fixtures; all caption code is built.
export async function assertPendingCaptionPair(page, engine, release, expected) {
    await page.evaluate(() => {
        window.captionCopies = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true,
            value: { writeText: async text => { window.captionCopies.push(text); } } });
    });
    const held = [];
    for (const time of [3.3, 5.3, 7.3]) {
        await page.evaluate(time => {
            const video = document.querySelector('video');
            video.currentTime = time;
            video.dispatchEvent(new Event('timeupdate'));
        }, time);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const pair = await page.locator('.jpdb-subtitle-lines').evaluate(element => {
            const primary = element.querySelector('.jpdb-subtitle-primary')?.cloneNode(true);
            primary?.querySelectorAll('rt,rp,.jpdb-reader-furi').forEach(element => element.remove());
            return { primary: primary?.textContent, secondary: element.querySelector('.jpdb-subtitle-secondary')?.textContent };
        });
        assert.deepEqual(pair, expected, `${engine}: pending cue at ${time} replaced the displayed pair`);
        // Exercise the caption Copy shortcut through the trusted event gate.
        await page.keyboard.press('Shift+C');
        assert.equal(await page.evaluate(() => window.captionCopies.at(-1)), `${expected.primary}\n${expected.secondary}`,
            `${engine}: Copy used a pending caption`);
        held.push({ time, ...pair });
    }
    release();
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-primary')?.textContent.includes('かなだけです。'));
    await page.evaluate(() => {
        document.querySelector('video').currentTime = 1.3;
        document.activeElement?.blur();
    });
    await page.waitForSelector('.jpdb-subtitle-primary .jpdb-reader-furi');
    return held;
}
