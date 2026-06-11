# Study Hub Parity — gap analysis and tickets

Source of truth: live signed-in journeys captured 2026-06-11 via Playwright MCP on the
user's accounts (jpdb.io Learn/deck-browse/review, jiten.moe Study/Cards/History), plus
the user's screenshots of `jpdb.io/deck?id=global` and a review front/back.
The trust contract, in the user's words: *"if I press Learn in jpdb, it will show me
their SRS queue in a certain order, with certain informations on the front and back of
the cards… our tab in the study page should behave in the exact same ways, just with an
additional superset of features."*

## Reference anatomy (captured live)

### JPDB Learn page (`/learn`)
- Learning-progress table — columns `Learning | You know`, rows `Words (direct)`,
  `Kanji (direct)`, `Words (indirect)`, `Kanji (indirect)`, each `total | learning |
  known (pct)`; then **"Total known non-redundant vocabulary: N"**.
- Due summary sentence: *"You have 112 due items (20 vocabulary and 92 kanji) and 3181
  new items (2843 vocabulary and 338 kanji) available for review."*
- "Start reviewing" (`POST /review`, `new_session=1`).
- Deck list in **priority order** with per-deck vocab/kanji progress + coverage and
  reorder arrows (`POST /change_deck_priority`, `delta=±1`).
- Deck management: new empty deck / from text / from top vocabulary / from database /
  Anki import. Special decks: All vocabulary (`global`), Blacklisted, Never-forget.

### JPDB deck browse (`/deck?id=…`)
- Header stats (vocab/kanji progress + coverage bars).
- Sort: Chronologically · By frequency (within deck) · By frequency (whole corpus).
- **Show only** filters: New, Known, Due, Suspended, Locked, Learning, Never forget,
  Failed, Blacklisted, Redundant.
- "Search by spelling…", pagination ("Showing 1..50 from 34208 entries", Next page).
- Entry rows: furigana spelling, meanings, state badge ("Known (lvl 6)"), frequency
  ("Top 5900"), occurrence count, per-entry "…" menu.

### JPDB review (front/back, `/review`)
- Front: kind label ("Vocabulary"), the **source sentence** with the target word
  highlighted; `#show-answer`.
- Back: sentence with **furigana on non-target words** (per user settings), Meanings
  with part-of-speech tags, "Composed of" component glosses, **"Part of the Persona 5
  deck (3x)"** membership/occurrence line, optional image/audio; grade bar `✘ Nothing ✘
  Something / ✔ Hard ✔ Okay ✔ Easy` (`#grade-1..5`) plus collapsible `Blacklist` /
  `I'll never forget`.

### Jiten study hub (`/srs/decks`, `/settings/cards`, `/srs/history`)
- Tabs: **Decks · Cards · History · Settings** + persistent "Study (N)" button.
- Today panel: "N to do", done today (reviews/new), Due now (Reviews/New), next review
  countdown, day streak (longest, days studied), review activity forecast ("Next 7d: 2,
  Next 30d: 3"), upcoming-reviews list.
- Cards browser: state chips with counts (**All · Due · Learning · Review · Relearning ·
  Mastered · Suspended · Blacklisted**), "Search cards…", select-page checkbox with bulk
  actions, rows showing spelling + frequency rank (#46,155) + due-in ("Overdue 4d",
  "In 3w") + state.

## Where Yomu's study page stands (0.6.88)

Has: Word/Kanji/Search/Stats modes; queue from jpdb-live / jpdb-api / jiten / anki /
local with deterministic source toggle; JPDB-order live reviews via the review bridge;
grade bar with per-grade intervals (jpdb-api/anki/jiten); session progress + timer;
review fallback notice; offline cache; per-card source lights; cross-tab state bus;
stats heatmap/streak via Anki history, Jiten daily cache, JPDB export import.

Missing vs the references — the tickets below.

## Shipped log (verified; details in CHANGELOG)

- SH-1 stats table 0.6.89 + exact 'Total known non-redundant vocabulary' label 0.6.102
- SH-2 due summary 0.6.90 + words/kanji split
- SH-3 My Cards browser: v1 0.6.92, search-within-pool 0.6.95, Anki pool 0.6.100, bulk actions 0.6.102
- SH-4 card backs: membership line (live 0.6.93, jpdb-api 0.6.105, Anki/Jiten 0.6.106), composed-of 0.6.98
- SH-5 front fidelity 0.6.91 (JPDB sentence before Immersion Kit)
- SH-6 deck management: JPDB selector 0.6.97 (+progress 0.6.103), Anki scoping 0.6.111; Show-only filters 0.6.101
- SH-7 today metrics + Anki 7d/30d forecast 0.6.106
- SH-8 shortcuts: digit grading 0.6.94, visible hints 0.6.99
- Due-ins: Anki computed review previews 0.6.108, popover row 0.6.109, new-card learning steps 0.6.110
- UX bugs from user screenshots: Jiten in-card addon + spoiler fix 0.6.107 (live-verified)
- Mobile/iPad: Shorts reel fix 0.6.96, landscape two-column card 0.6.104 (screenshot-verified)
- ADR-0003 phase 1 scaffolding 0.6.112

## Simulated user research (2026-06-11)

Five personas walked the captured journeys; their asks, mapped to tickets:

1. **Mobile-first learner (iPhone, YouTube + study page)** — wants an at-a-glance
   "what's left today" before committing on a commute; big touch targets; one-handed
   deck switch (shipped 0.6.97); swipe grading (shipped). Ask → SH-7 Today panel.
2. **Anki power user (1k+ cards)** — wants a due forecast before starting ("is tonight
   heavy?"), trustworthy due counts, post-mining sync affordance. Ask → SH-7 forecast
   (only Anki exposes due timestamps — keep other providers honest), backlog
   `forgetCards`/`sync` adoption ticket.
3. **JPDB loyalist (trust-focused)** — wants the exact Learn anatomy: stats table
   (0.6.89), due split (0.6.90), JPDB-first card content (0.6.91), deck entry points
   (0.6.97), JPDB grade copy (existing). Remaining ask → SH-4 composed-of + queue-order
   exactness audit.
4. **Jiten user** — wants the Cards browser select-page bulk actions and the
   upcoming-reviews list; day streak labelled like Jiten ("Longest / Days studied").
   Ask → SH-3 v2 bulk actions, SH-7 streak labels.
5. **iPad split-view user** — keyboard digit grading (0.6.94), trackpad hover lookups
   (existing), two-column landscape cards. Ask → SHIPPED 0.6.104: coarse-pointer landscape tablets split the study card into prompt-left / answer-right columns (verified with a real 1180x820 screenshot, qa-artifacts/ipad-landscape-study.png).

Synthesis: the highest-leverage unshipped item is a **Today panel** (every persona
referenced "what's due / what did I do today" before trusting the page as their one
stop); second is SH-3 v2 bulk actions; third is composed-of on card backs.

## Tickets (ranked)

### SH-3 remainder: due-in column in the My Cards browser
Per-adapter timestamps needed: Anki has nextReviews/prop:due bucketing, Jiten exposes
interval labels only, JPDB none. Everything else of SH-3 shipped (see Shipped log).

### Journey re-run findings (0.6.114 pass)

- FIXED 0.6.114: the よむ puck overlapped Jiten's Blacklist/Master/More dock on mobile
  /srs/study — hosts with a bottom action dock now raise the puck (live-verified,
  150px clearance, iPhone 13 viewport, split build).
- Re-captured evidence: desktop+mobile signed-in Jiten study journeys with the SPLIT
  build — front spoiler-free (0 addons), addon in-card with Immersion Kit +
  dictionaries, Jiten interval buttons visible, no horizontal overflow; jpdb
  vocabulary page addon mounts with dictionaries + immersion.

## Undocumented-endpoint technique (user direction, 2026-06-11)

Jiten's full API surface is browsable at https://api.jiten.moe/index.html, and features
missing from the documented API can still be used from the authenticated context: run
the journey in Playwright, capture the network requests the site itself makes, and call
the same endpoints from the extension with the user's session. Use this to unblock the
remaining Jiten lanes (per-deck study scoping, richer due data) — capture
`jiten.moe/srs/*` traffic in the signed-in MCP browser when it's free.

## Non-goals / verified impossibilities
- JPDB next-review intervals for live-bridge reviews: jpdb.io renders no interval data
  (verified live 2026-06-11).
- JPDB deck priority reorder via API: no endpoint; page-side forms only.
- Jiten media attach: no API (toast note shipped 0.6.86).
