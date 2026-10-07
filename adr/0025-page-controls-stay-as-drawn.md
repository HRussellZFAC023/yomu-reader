# A page's controls stay as the page drew them

Status: implemented locally, 7 October 2026 (QA polish lane, YQ-07). Narrows ADR-0006: detached reading lanes now serve links in menus and toolbars and compact metadata, not buttons.

## Context

Until 2.1 Yomu annotated a page's buttons, tabs, menu items, options, switches, summaries and form labels "at rest" through the interactive-passive tier: word spans or a mirror, a detached reading lane and the pitch underline, kept layout-neutral by geometry guards. That tier answered the 2026-07-11 "furigana is missing" report on YouTube chrome (作成, もっと見る, feed chips) and the iPad Reddit chrome report.

The 2.0.12 QA run (YQ-07) found NHK Easy's two article controls broken by it. Both are links with `href="#"` that act as buttons: Yomu put word spans inside them, NHK's own `span::before` speaker icon repeated between the words, and the furigana toggle's label was overprinted. The design audit made the wider point that annotation on navigation and page chrome is noise that competes with the sentence being read.

## Decision

1. Text inside a page's button, `[role=button]`, tab, menu item, option, switch, checkbox, radio, combobox trigger, `summary` or form `label` is the page's interface. Yomu does not annotate it: no word spans, no mirror, no reading, no underline. `classifyDecoration` returns `skip` for it.
2. A link stays a link. Text in an `a[href]` keeps its annotations even when the link wears a menu, tab or toolbar role, and a real link inside a control row keeps its own.
3. A link that is a button in disguise is a control: `href="#"` or `href="javascript:…"`, and `a[role=button]`.
4. A page's `select` and `input` values are controls too, so the page-level scan no longer mirrors them. Yomu's own surfaces (Study, Academy) keep their own form-control parsing.
5. Hover lookup still reads control text, so a learner can look up an unfamiliar button label without Yomu painting it.
6. A page that declares a control itself a Reader Surface (`data-yomu-runtime-surface` or `.yomu-try-me-text` on the control or inside it) asked for its label to be read, so it is annotated as before. Academy does this for its Japanese choice buttons. A surface that only contains controls, such as a docs column, does not opt them in.

## Consequences

- YouTube chips, masthead and watch buttons, player menus, Reddit's Join/Award/Share/Sort buttons, Google's role=button chips and Wikipedia's pin buttons and appearance choices are left untouched. Their links (mini-guide, menus whose items are links, nav, breadcrumbs) stay annotated through the detached lane.
- A `href="#"` back-to-top link (Wikipedia's ページ先頭) is now treated as a control. That is accepted: it has no destination.
- The interactive-passive machinery stays for links in menus and toolbars, compact metadata rows, timestamps and labels that sit beside a control.
- Hover reads a control's raw label, joined to nothing beside it, while a click on the control stays the page's.
- Reversing this means reverting one commit: the policy, its unit tests and the six smokes that pinned the old contract moved together. `smoke:chip-mirror`, `smoke:reddit-chrome`, `smoke:google-search-reader` and `smoke:youtube-ruby-proof` (CI) now assert that the page's controls keep their markup; `smoke:furigana-tapband` presses the reading over a toolbar link and checks the page button beside it stays as drawn; `smoke:youtube-dom-safe` takes its home-feed words from the titles rather than the filter chips.
