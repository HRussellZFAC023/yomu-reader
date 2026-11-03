import sharp from 'sharp';

import { assert } from './smoke-harness.mjs';

// Behavioral fixture checks against the real hosted viewer and built runtime.
// The PDF/OCR content is synthetic; these are not visual-design acceptance shots.
export async function verifyPdfScanVisibility(page, pageNumber, expectedText) {
    await page.mouse.move(8, 150);
    const registrationHandle = await page.waitForFunction(({ pageNumber, expectedText }) => {
        const canvas = document.querySelector(`.pdf-page[data-page-number="${pageNumber}"] canvas`);
        const canvasRect = canvas?.getBoundingClientRect();
        if (!canvasRect) return false;
        const lines = [...document.querySelectorAll('.jpdb-ocr-line')].filter(line => {
            const rect = line.getBoundingClientRect();
            return rect.top >= canvasRect.top && rect.bottom <= canvasRect.bottom
                && rect.left >= canvasRect.left && rect.right <= canvasRect.right
                && rect.top >= 0 && rect.bottom <= innerHeight && !line.closest('[hidden]');
        });
        const line = lines.find(line => line.getAttribute('data-ocr-text') === expectedText);
        const word = line?.querySelector('.jpdb-reader-word');
        if (!line || !word) return false;
        const rect = line.getBoundingClientRect();
        const wordRect = word.getBoundingClientRect();
        const hit = document.elementFromPoint(wordRect.left + wordRect.width / 2, wordRect.top + wordRect.height / 2);
        return {
            pageNumber,
            text: line.getAttribute('data-ocr-text'),
            lineCount: lines.length,
            nativeLayersHidden: [...document.querySelectorAll('.textLayer')].every(layer =>
                layer.hidden && layer.getAttribute('aria-hidden') === 'true' && getComputedStyle(layer).display === 'none'),
            nativeEnhancedWords: document.querySelectorAll('.textLayer .jpdb-reader-word, .textLayer ruby').length,
            canvasOpacity: getComputedStyle(canvas).opacity,
            canvasVisibility: getComputedStyle(canvas).visibility,
            background: getComputedStyle(line).backgroundColor,
            normalizedBox: [
                (rect.left - canvasRect.left) / canvasRect.width,
                (rect.top - canvasRect.top) / canvasRect.height,
                rect.width / canvasRect.width,
                rect.height / canvasRect.height,
            ],
            box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
            canvasBox: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
            wordHit: hit?.closest('.jpdb-reader-word') === word,
            wordSpelling: word.getAttribute('data-surface') || '',
        };
    }, { pageNumber, expectedText }, { timeout: 15_000 });
    const registration = await registrationHandle.jsonValue();
    await registrationHandle.dispose();
    assert(registration.lineCount === 1, 'scanned PDF should have one registered OCR target per fixture line', registration);
    assert(registration.nativeLayersHidden && registration.nativeEnhancedWords === 0,
        'scanned PDF native OCR must remain hidden and unannotated after rendering/navigation/zoom', registration);
    assert(registration.canvasOpacity === '1' && registration.canvasVisibility === 'visible',
        'scanned PDF source raster must remain visible', registration);
    assert(registration.wordHit, 'scanned PDF painted word should receive the pointer hit', registration);

    const withOverlay = await page.screenshot({ animations: 'disabled' });
    const hiddenStyle = await page.addStyleTag({ content: '.jpdb-ocr-layer { visibility: hidden !important; }' });
    let withoutOverlay;
    try {
        withoutOverlay = await page.screenshot({ animations: 'disabled' });
    } finally {
        await hiddenStyle.evaluate(element => element.remove());
    }
    const painted = await sharp(withOverlay).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const source = await sharp(withoutOverlay).ensureAlpha().raw().toBuffer();
    let changedPixels = 0;
    for (let y = Math.ceil(registration.box.top); y < Math.floor(registration.box.bottom); y += 1) {
        for (let x = Math.ceil(registration.box.left); x < Math.floor(registration.box.right); x += 1) {
            const offset = (y * painted.info.width + x) * 4;
            if (Math.max(...[0, 1, 2].map(channel => Math.abs(painted.data[offset + channel] - source[offset + channel]))) > 12) changedPixels += 1;
        }
    }
    assert(changedPixels > 100, 'scanned PDF OCR target must actually paint over the source raster', { ...registration, changedPixels });
    const canvasBox = registration.canvasBox;
    let sourceRasterPixels = 0;
    for (let y = Math.max(0, Math.ceil(canvasBox.top + canvasBox.height * 0.3)); y < Math.min(painted.info.height, canvasBox.top + canvasBox.height * 0.6); y += 1) {
        for (let x = Math.max(0, Math.ceil(canvasBox.left + canvasBox.width * 0.25)); x < Math.min(painted.info.width, canvasBox.left + canvasBox.width * 0.75); x += 1) {
            const offset = (y * painted.info.width + x) * 4;
            if (Math.min(...source.subarray(offset, offset + 3)) < 220) sourceRasterPixels += 1;
        }
    }
    assert(sourceRasterPixels > 1000, 'scanned PDF source raster must actually paint on the visible page', { ...registration, sourceRasterPixels });

    const word = page.locator(`.jpdb-ocr-line[data-ocr-text="${expectedText}"] .jpdb-reader-word`).first();
    await word.click();
    await page.locator('.jpdb-reader-popover').first().waitFor({ state: 'visible', timeout: 10_000 });
    const lookupText = (await page.locator('.jpdb-reader-popover').first().innerText()).replace(/\s+/g, '');
    assert(registration.wordSpelling && lookupText.includes(registration.wordSpelling.replace(/\s+/g, '')),
        'scanned PDF word hit should look up the word that was painted', { registration, lookupText });
    await page.keyboard.press('Escape');
    await page.mouse.move(8, 150);
    return { ...registration, changedPixels, sourceRasterPixels, lookupText: lookupText.slice(0, 100) };
}
