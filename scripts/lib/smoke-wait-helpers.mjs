export async function waitForSelectorText(page, selector, expectations, timeout = 12_000) {
    await page.waitForFunction(selectorTextMatches, { selector, ...expectations }, { timeout });
}

export async function waitForYoutubeTranscriptRows(page) {
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 12_000 });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length >= 3, null, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-row-text .jpdb-reader-word').length > 0, null, { timeout: 30_000 });
}

function selectorTextMatches({ selector, includes = [], excludes = [] }) {
    const text = document.querySelector(selector)?.textContent ?? '';
    return includes.every(term => text.includes(term)) && excludes.every(term => !text.includes(term));
}
