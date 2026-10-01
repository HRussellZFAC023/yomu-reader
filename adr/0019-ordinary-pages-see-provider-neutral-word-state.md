# Ordinary pages see provider-neutral word state

Status: implemented locally; verification in progress.

## Context

Since 1.9.1, account-backed detail is rendered only on Study and other trusted Yomu surfaces (`currentAccountDataSurfaceIsTrusted`). An ordinary page owns the DOM Yomu decorates and can read or rewrite it, so a word's Anki state there was projected into the `jpdb-*` state family plus `yomu-deck-member`.

That projection left the "Anki" colour source, the default "Text colour: Anki", painting nothing on ordinary pages: its stylesheet rules keyed on `anki-<state>` classes that only Study words carry. Meanwhile the `<html>` channel class (`jpdb-reader-word-text-anki`) still named the provider.

## Decision

1. Word decoration on an ordinary page never names a review provider, deck, card, note or account. That covers word classes, attributes and titles, the colour-channel classes on `<html>`, and the custom properties Yomu writes inline.
2. A colour source the learner chose must paint there. The "Anki" source is the review lane. Its root classes are `jpdb-reader-<scope>-<channel>-review` and its stylesheet variables are `--jpdb-reader-review-*`. Study words join the lane through `anki-<state>`; ordinary-page words join it through `yomu-review-<state>` (`src/reader/theme/color-source-classes.ts`).
3. Only Anki state joins the review lane. A word that only JPDB or Jiten knows stays off it, and a word Anki holds no card for gets no lane class. The projected `jpdb-*` state keeps feeding the status and JPDB channels.
4. Study and the other trusted surfaces keep their provider-named classes, titles and data attributes.

## Consequences

Paint is page-readable. A page that has studied Yomu's stylesheet can see which lane colours a word, and so infer that the learner has a second review source enabled. It cannot read the provider's name, deck names, or card and note identifiers. Hiding the paint itself would mean not painting the colour the learner chose.

The `jpdb` root token and the `jpdb-*` state family keep their historical names. They are Yomu's projection namespace for every provider, not a statement that the learner uses JPDB.

Do not reintroduce `anki-*` classes on ordinary pages to simplify the stylesheet; feed the review lane instead.

## Verification

`tests/reader/offhost-account-data-privacy.test.ts` loads the real reader and subtitle stylesheets into jsdom and resolves the colour chain: an Anki-due word paints due, a JPDB-only due word stays unpainted, subtitles follow the same lane, and Study keeps its colours. The same tests assert that the word markup, the `<html>` classes and inline style, and the custom properties declared on the word carry no provider identity. `tests/reader/additive-mirror-source-projection.test.ts` covers the mirror's inline paint. `npm run smoke:anki` checks the painted colour in Chrome with "Text colour: Anki".
