# Ordinary pages see provider-neutral word state

Status: implemented locally; verification in progress.

## Context

Since 1.9.1, account-backed detail is rendered only on Study and other trusted Yomu surfaces (`currentAccountDataSurfaceIsTrusted`). An ordinary page owns the DOM Yomu decorates and can read or rewrite it, so a word's Anki state there was projected into the `jpdb-*` state family plus `yomu-deck-member`.

That projection left the "Anki" colour source, the default "Text colour: Anki", painting nothing on ordinary pages: its stylesheet rules keyed on `anki-<state>` classes that only Study words carry. Meanwhile the `<html>` channel class (`jpdb-reader-word-text-anki`) still named the provider.

## Decision

1. Word decoration on an ordinary page never names Anki, a deck, card, note or account. That covers word classes, attributes and titles, the colour-channel classes on `<html>`, and the custom properties Yomu writes inline. The `jpdb` root prefix, the `-jpdb` channel token and the `jpdb-*` state family stay, as the existing privacy tests allow.
2. A colour source the learner chose must paint there. The "Anki" source is the review lane. Its root classes are `jpdb-reader-<scope>-<channel>-review` and its stylesheet variables are `--jpdb-reader-review-*` (`src/reader/theme/color-source-classes.ts`). Study words join the lane through `anki-<state>`; ordinary-page words join it through `yomu-review-<state>` (`src/reader/dom/review-lane.ts`).
3. Only Anki state joins the review lane. A word that only JPDB or Jiten knows stays off it, and a word Anki holds no card for gets no lane class. The projected `jpdb-*` state keeps feeding the status and JPDB channels.
4. An ordinary-page word carries its lane class only while a word or subtitle colour channel resolves to the "Anki" source. Changing the colour settings repaints every word, including words in scanned shadow roots, from the private Anki state. No other page-readable marker records Anki state: the note that an empty lookup must keep a word's Anki contrast stays in Reader memory.
5. Study and the new tab keep their provider-named classes, titles and data attributes. Academy is not a trusted account-data surface, so it follows the ordinary-page rules and now paints the "Anki" source through the lane too.
6. Toasts are page-readable too. What "Add to deck +" reports on an ordinary page names no service, deck or Anki state, whichever destination it reached: "Added to deck.", "Already in one of your decks. Open Study to edit it.", "Opened your deck app. Finish saving there." or "This word was not saved. Try again, or open Study for details." The only failures it tells apart are that no deck can take the word and that the grading service lacks it (ADR-0021), and neither names a service. Study keeps the named confirmations and reasons.

## Consequences

Paint is page-readable. While a channel paints the "Anki" source, a page that knows Yomu's open-source class names can read, word by word, which words have an Anki card and in which state; because only Anki feeds the lane, it can infer that the learner uses Anki. It cannot read deck names, card or note identifiers, or note contents. Hiding the paint would mean not painting the colour the learner chose. With no "Anki" channel selected the lane classes are absent.

The `jpdb` root prefix, the `-jpdb` channel token and the `jpdb-*` state family keep their historical names. They are Yomu's projection namespace for every provider, not a statement that the learner uses JPDB.

On ordinary pages the status and JPDB channels still paint Anki state, because Anki state is projected into `jpdb-<state>`; on Study the JPDB channel paints JPDB state only. A follow-up can feed the status channel from the lane, as Study feeds it from `anki-<state>`, and stop projecting Anki state into `jpdb-*`.

Readers up to 2.0.4 set `-anki` root classes. Where such a Reader meets a stylesheet that only knows `-review`, its "Anki" channel paints nothing on ordinary pages, which is what it already did there. The docs theme keeps both class names for its baked sample.

Do not reintroduce `anki-*` classes on ordinary pages to simplify the stylesheet; feed the review lane instead.

## Verification

`tests/reader/offhost-account-data-privacy.test.ts` loads the real reader and subtitle stylesheets into jsdom and resolves the colour chain: an Anki-due word paints due, a JPDB-only due word stays unpainted, subtitles follow the same lane, no word carries a lane class or other marker while no channel paints the "Anki" source, switching to and from "Text colour: Anki" repaints existing words (shadow-root words too), and Study keeps its colours. The same tests assert that the word markup, the `<html>` classes and inline style, and the custom properties declared on the word carry no provider identity, and that every toast an ordinary-page save shows, through JPDB, Jiten, Bunpro, Academy and Anki, and each way they can fail, names none, in English and Japanese. `tests/reader/additive-mirror-source-projection.test.ts` covers the mirror's inline paint. `npm run smoke:anki` checks the painted colour in Chrome with "Text colour: Anki" and the absence of lane classes with no "Anki" channel, and `npm run smoke:subtitle-highlight` builds its channel classes from `color-source-classes.ts`.
