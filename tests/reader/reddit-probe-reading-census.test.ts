import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The census this probe prints is read as evidence in bug investigations, so a
 * wrong denominator costs real time — it did, twice. The probe once counted
 * "words with a source reading" as `('.jpdb-reader-detached-furi, rt')`, which
 * unions two populations: native <ruby><rt> the page ships and the engine
 * paints, and detached readings Yomu projects. Only the detached ones can ever
 * appear in the projection overlay, so the union made engine-painted ruby look
 * like furigana Yomu had lost ("81 parsed -> 33 cloned -> 20 painted").
 *
 * The probe needs a live browser and a live site, so this guards the shape of
 * its measurement rather than its output: the union selector must not come
 * back, and both populations must stay reported as separate figures.
 */
const PROBE = readFileSync('scripts/manual/reddit-firefox-annotation-probe.mjs', 'utf8');
// The comment above the census quotes the retired selector on purpose, so the
// guard reads executable lines only.
const CODE = PROBE.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

describe('reddit firefox probe reading census', () => {
    it('never unions native ruby with detached readings into one selector', () => {
        expect(CODE).not.toMatch(/['"][^'"]*\.jpdb-reader-detached-furi\s*,\s*rt[^'"]*['"]/);
        expect(CODE).not.toMatch(/wordsWithSourceReading/);
    });

    it('reports each reading source, and their overlap, as separate figures', () => {
        for (const field of ['detachedReadingWords', 'inFlowRubyWords', 'pageRubyWords', 'bothReadingSourceWords']) {
            expect(PROBE, field).toMatch(new RegExp(`${field}:`));
        }
    });

    it('splits ruby by owner, so a break in Yomu\'s own in-flow channel stays visible', () => {
        // Counting every `rt` as the page's would be wrong here twice over:
        // reddit ships no ruby at all, so all of them are Yomu's; and a figure
        // labelled "not Yomu's work" falling to zero would read as the site
        // changing rather than as the in-flow channel breaking.
        expect(CODE).toMatch(/rt\.jpdb-reader-furi/);
        expect(CODE).toMatch(/rt:not\(\.jpdb-reader-furi\)/);
        expect(CODE).not.toMatch(/querySelector\('rt'\)/);
    });

    it('takes both censuses across shadow roots so the projection figures share a tree', () => {
        // reddit puts post bodies inside custom elements; a light-DOM-only
        // querySelectorAll undercounts words while the overlay still holds
        // clones for the shadow ones, which is the same manufactured gap.
        expect(PROBE).toMatch(/collectDeep\(document, '\[data-yomu-projected-reading="true"\]'\)/);
        expect(PROBE).toMatch(/collectDeep\(document, '\.jpdb-reader-word'\)/);
        expect(PROBE).toMatch(/host\.shadowRoot/);
    });
});
