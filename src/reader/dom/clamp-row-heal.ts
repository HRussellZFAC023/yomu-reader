// Engine guard for the in-flow clamp reading channel. The apply path stamps a
// growable clamp row "content" OPTIMISTICALLY (owner rule: readings visible at
// rest wherever layout can absorb them), then this measured post-paint verdict
// is the AUTHORITY: some engine/font combinations (CI's Linux Chrome, iPad
// Safari on height-pinned rows) do NOT grow a -webkit-box line-clamp row when
// rt joins the line box — the base glyphs fall below the clip, the rt paints
// OVER the base, or the widened word truncates the row. A row that fails the
// measured checks flips back to the rest-hidden "true" stamp (removing rt from
// layout, restoring the plain line; the next re-apply then routes it through
// the width-neutral detached lane).
//
// The verdict is RECOVERABLE, not a permanent sentence, and demotion demands
// POSITIVE failure evidence. The earlier design demoted on any base drift and
// then wrote data-yomu-clamp-growth=failed forever, so a single transient
// mis-measure (a row caught mid-hydration, zero-height, or before its shell
// settled) retracted genuine at-rest furigana with no path back (A-cluster
// "furigana appears then disappears" iPad report, 2026-07-20). Two guards fix
// that: (a) "broken" now requires a clear failure — the base pushed essentially
// OUT of the row box, rt measurably painting DOWN over the base, or the line
// overflowing the row width — never a sub-pixel poke; (b) recovery is
// bidirectional and idempotent — a failed row whose in-flow rt is measurable
// and clearing the base again is promoted back to "content".
//
// Recovery is SOUND, not oscillating: promotion demands a measurable rt that
// clears the base. A demoted row's rt is removed from layout by CSS
// (display:none on the "true" stamp), so it reports no box and stays
// "unmeasurable" — a stably-ungrowable row is therefore never re-promoted only
// to re-fail. Reads complete before the attribute writes.
const CLAMP_GROWTH_ATTRIBUTE = 'data-yomu-clamp-growth';
const CONTENT_CLIP_ROW_SELECTOR = '[data-yomu-clip-constrained="content"]';
const FAILED_CLAMP_ROW_SELECTOR = `[${CLAMP_GROWTH_ATTRIBUTE}="failed"]`;
// A base has genuinely left the clip (the readings-only row) once its top sits
// at or below the row's bottom edge — a small poke over the edge keeps the base
// mostly visible and stays in-flow (owner rule).
const CLAMP_ROW_BASE_ESCAPE_PX = 2;
// rt sub-pixel overlap tolerance: a healthy reading clears above the base cap,
// so any measurable descent past this into the base is the non-growing engine.
const CLAMP_ROW_RT_OVERLAP_SLOP_PX = 2;
// Generous horizontal slop: a wrapping multi-line clamp keeps scrollWidth at
// clientWidth, so real overflow (an ellipsis label whose widened word cannot
// wrap) is the only thing that clears this — never narrow-column rounding.
const CLAMP_ROW_WIDTH_SLOP_PX = 4;

// The veto consulted at every in-flow decision site (apply-time clip stamp and
// detached-lane routing): only a measured "failed" keeps a row out of the
// in-flow channel. A confirmed ("ok") or not-yet-measured row stays eligible.
export function clampRowGrowthFailed(clipRow: HTMLElement): boolean {
    return clipRow.getAttribute(CLAMP_GROWTH_ATTRIBUTE) === 'failed';
}

type ClampRowVerdict = 'healthy' | 'broken' | 'unmeasurable';

// Measured post-paint verdict for one in-flow clamp row. "unmeasurable" (no
// Yomu reading yet, zero-height row/base, or rt without a box) leaves the
// row's current stamp untouched, so a row caught before its surface settles is
// never demoted on no evidence — only re-checked on a later pass.
//
// It measures the first word that CARRIES a reading, not the row's first word:
// a row that opens with kana (どこで, ふと) has no rt there, and stopping at it
// left WebKit's collapsed readings-only row (158 → 10 px) unhealed forever. A
// page's own ruby is not evidence either: its rt is the page's layout. The
// escape check reads the row's first base glyph, the line a reader starts on.
function measuredClampRowVerdict(row: HTMLElement): ClampRowVerdict {
    const rt = row.querySelector<HTMLElement>('.jpdb-reader-word.jpdb-reader-scan-word rt.jpdb-reader-furi');
    const word = rt?.closest<HTMLElement>('.jpdb-reader-word');
    if (!word || !rt) return 'unmeasurable';
    const rowRect = row.getBoundingClientRect();
    if (!rowRect.height) return 'unmeasurable';
    const base = rt.parentElement?.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? word;
    const baseRect = base.getBoundingClientRect();
    if (!baseRect.height) return 'unmeasurable';
    const firstGlyph = firstBaseGlyphRect(row) ?? baseRect;
    const rtRect = rt.getBoundingClientRect();
    // FAILURE evidence (any one demotes — none of these needs rt metrics except
    // the overlap check, which self-guards on rt having a box):
    // (i) the row's first line has dropped essentially out of the row box: a
    //     non-growing engine leaves a readings-only row with the base below the clip.
    const baseEscaped = firstGlyph.top >= rowRect.bottom - CLAMP_ROW_BASE_ESCAPE_PX
        || firstGlyph.bottom <= rowRect.top + CLAMP_ROW_BASE_ESCAPE_PX;
    // (ii) rt paints DOWN over the base because the line never grew its leading.
    const rtOverlapsBase = rtRect.height > 0
        && rtRect.bottom - baseRect.top > CLAMP_ROW_RT_OVERLAP_SLOP_PX;
    // (iii) the ruby-widened line overflows the row width and the clip truncates
    //     it (an ellipsis label whose base cannot rewrap: 共有 → 共…).
    const widthOverflows = row.clientWidth > 0
        && row.scrollWidth > row.clientWidth + CLAMP_ROW_WIDTH_SLOP_PX;
    if (baseEscaped || rtOverlapsBase || widthOverflows) return 'broken';
    // HEALTH is only CONFIRMED with a measurable rt clearing the base — the sole
    // positive proof the engine grew the line. Without it the row is
    // "unmeasurable": a demoted row (rt display:none) can never be re-promoted
    // just because hiding its reading left the base sitting in a plain line.
    if (rtRect.height > 0 && rtRect.bottom <= baseRect.top + CLAMP_ROW_RT_OVERLAP_SLOP_PX) return 'healthy';
    return 'unmeasurable';
}

// The box of the row's first visible base character: text outside any reading
// (rt, rp, a detached reading), whitespace skipped. Null when it has no box.
function firstBaseGlyphRect(row: HTMLElement): DOMRect | null {
    const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest('rt, rp, .jpdb-reader-furi') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const offset = node.data.search(/\S/u);
        if (offset < 0) continue;
        const range = row.ownerDocument.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + (node.data.codePointAt(offset)! > 0xffff ? 2 : 1));
        const rect = range.getBoundingClientRect?.();
        return rect?.height ? rect : null;
    }
    return null;
}

export function healUngrowableInFlowClampRows(root: ParentNode = document): number {
    // Candidates: every optimistic/confirmed in-flow row ("content"), plus rows
    // a prior pass demoted ("failed") so a genuinely recovered surface can be
    // promoted back. querySelectorAll never matches the root itself, and per-root
    // apply passes the annotated row AS the root — include it (and a stamped
    // ancestor) or the one row that matters is the one that is never checked.
    const rows = new Set<HTMLElement>();
    if (root instanceof HTMLElement) {
        const selfOrAncestor = root.closest<HTMLElement>(`${CONTENT_CLIP_ROW_SELECTOR},${FAILED_CLAMP_ROW_SELECTOR}`);
        if (selfOrAncestor) rows.add(selfOrAncestor);
    }
    for (const row of root.querySelectorAll<HTMLElement>(CONTENT_CLIP_ROW_SELECTOR)) rows.add(row);
    for (const row of root.querySelectorAll<HTMLElement>(FAILED_CLAMP_ROW_SELECTOR)) rows.add(row);
    if (!rows.size) return 0;
    // Read all geometry first, then write — the sweep must never interleave a
    // layout read with its own attribute write (forced synchronous reflow).
    const demote: HTMLElement[] = [];
    const promote: HTMLElement[] = [];
    for (const row of rows) {
        if (row.classList.contains('jpdb-reader-text-mirror')) continue;
        const verdict = measuredClampRowVerdict(row);
        if (verdict === 'broken') {
            if (!clampRowGrowthFailed(row)) demote.push(row);
        } else if (verdict === 'healthy' && clampRowGrowthFailed(row)) {
            promote.push(row);
        }
    }
    for (const row of demote) {
        row.setAttribute(CLAMP_GROWTH_ATTRIBUTE, 'failed');
        row.dataset.yomuClipConstrained = 'true';
    }
    for (const row of promote) {
        row.setAttribute(CLAMP_GROWTH_ATTRIBUTE, 'ok');
        row.dataset.yomuClipConstrained = 'content';
    }
    return demote.length;
}
