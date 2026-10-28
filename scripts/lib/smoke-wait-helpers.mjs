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

/**
 * The popover must be showing the word that was actually looked up.
 *
 * Every hover/click smoke asserted only that "a popover opened", which passes
 * just as happily when the popover shows the previous word, a neighbouring
 * token, or a stale cached card. This turns those checks into wrong-card
 * detectors: the headword must equal the hovered element's `data-expression`.
 *
 * Both sides are the same field — `card.spelling` (src/reader/dom/index.ts sets
 * `dataset.expression` from it; src/reader/cards/reading-display.ts renders the
 * headword from it), and src/reader/main/rendered-word-lookup.ts actively forces
 * them to agree. So this is a real contract, not a coincidence.
 *
 * Two traps it has to work around:
 *  - `.jpdb-reader-spelling` textContent is NOT the headword when furigana is
 *    rendered: renderRuby interleaves `<rp>(</rp>…<rp>)</rp>` fallback parens,
 *    so 大変 reads as `大(たい)変(へん)`. `rt`/`rp` are stripped before comparing.
 *  - the kanji-detail view replaces the title row, so `.jpdb-reader-spelling`
 *    does not exist there. Call this at first open, before any kanji click.
 *  - `popoverSelector` executes in the page and must be standard CSS. Use
 *    `visibleOnly` instead of Playwright's `:visible` pseudo-class.
 */
export async function assertPopoverHeadwordMatchesLookup(page, wordLocator, options = {}) {
    const {
        popoverSelector = '.jpdb-reader-popover',
        visibleOnly = false,
        timeout = 12_000,
        label = 'popover',
    } = options;
    const expected = normalizeHeadword(await wordLocator.getAttribute('data-expression'));
    if (!expected) {
        // Unannotated text and pointer lookups have no dictionary form to
        // compare against; asserting nothing is better than asserting wrongly.
        return { skipped: true, reason: 'hovered element carries no data-expression' };
    }
    await page.waitForFunction(
        ({ selector, want, visible }) => {
            const roots = [...document.querySelectorAll(selector)]
                .filter(root => !visible || (root.getClientRects().length > 0 && getComputedStyle(root).visibility !== 'hidden'));
            return roots.some(root => {
                const spelling = root.querySelector('.jpdb-reader-spelling');
                if (!spelling) return false;
                const clone = spelling.cloneNode(true);
                clone.querySelectorAll('rt, rp').forEach(node => node.remove());
                return (clone.textContent ?? '').replace(/\s+/gu, '') === want;
            });
        },
        { selector: popoverSelector, want: expected, visible: visibleOnly },
        { timeout },
    ).catch(async error => {
        const actual = await page.evaluate(({ selector, visible }) => [...document.querySelectorAll(selector)]
            .filter(root => !visible || (root.getClientRects().length > 0 && getComputedStyle(root).visibility !== 'hidden'))
            .map(root => {
                const spelling = root.querySelector('.jpdb-reader-spelling');
                if (!spelling) return '(no .jpdb-reader-spelling)';
                const clone = spelling.cloneNode(true);
                clone.querySelectorAll('rt, rp').forEach(node => node.remove());
                return (clone.textContent ?? '').replace(/\s+/gu, '');
            }), { selector: popoverSelector, visible: visibleOnly });
        throw new Error(`${label} headword mismatch: expected ${JSON.stringify(expected)}, popovers showed ${JSON.stringify(actual)} (${String(error).split('\n')[0]})`);
    });
    return { skipped: false, headword: expected };
}

function normalizeHeadword(value) {
    return (value ?? '').replace(/\s+/gu, '').trim();
}
