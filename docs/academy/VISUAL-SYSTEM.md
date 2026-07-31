# Academy living-paper system

Academy is a painterly Japanese-class world, not a dashboard. Full-bleed places remain visible; learning and dialogue arrive as tactile classroom objects: invitations, posted notices, folded letters, notebook slips, stamps, tabs, manuscript paper, and kanji practice grids. One paper grammar replaces donor cards and generic app chrome.

The approved entrance reference is `artifacts/yomu-academy/ui-reimagine/entrance-donation-concept-v2.png`. It is a design reference only; the runtime is semantic HTML and CSS over the approved campus ensemble.

## Tokens

- **World ink:** warm charcoal `#181b18`, never cold navy or pure black.
- **Paper:** `#f1ead9`; folded paper `#ddd0b7`; paper ink `#29271f`; pencil copy `#655f51`.
- **Accent:** `--academy-accent` inherits `--jpdb-reader-accent`, with a safe `#5ea780` fallback. Focus, selected edges, underlines, stamps, routes, and primary actions derive from it.
- **Accent budget (owner rule, 2026-07-30 — "never go to the green sludge approach again"):** the accent is spent on the **primary action** and on the semantic underline/stamp colours. It does **not** go on headlines, guidance labels, arrows, dividers, or card edges. Accenting five things at once, on a ground that had itself drifted green, is what produced the sludge. Two independent reasons this is a rule and not a preference: the accent is **learner-configurable**, so anything drawn in it disappears for whoever picks a similar hue; and a page where everything is emphasised has no emphasis.
- **The ground is warm, never green.** World ink is `#181b18`. Dark surfaces step up in **warmth** (`#24221d`, `#2b2822`), never toward olive — `#24281f` measures R36 G40 B31 and reads as sludge next to a green accent. A dark surface set must show a real material change between ground and paper, not four near-identical greys.
- **Pencil guidance has its own warm hand colour**, `--guide` (amber: `#9a6512` on paper, `#e0a94a` on ink). Written guidance like a try-me label and its arrow is one gesture in that colour, and is deliberately not the accent.
- **Geometry:** 3–15px asymmetric corners, slightly offset shadows, one folded corner or tape strip, and no wall of rounded cards.
- **Type:** system/Yomu sans plus the Japanese font stack. Entrance and scene titles remain literal and below `3.6rem` on wide screens.
- **The sans is a decision, not a default (A39, settled 2026-07-31).** Anti-slop research names an *unchosen* system stack as the clearest sign a page was never designed, which is why this line kept getting reopened. It is chosen here, and the evidence is a session where the owner reviewed four homepage treatments in one sitting: the faults he named were colours, spacing, layout and copy — **typography was not among them** — and three serif display proposals (Fraunces, Instrument Serif, Newsreader on cream) were rejected as "making it worse". The recognisable Yomu voice is the heavy geometric sans set large with tight tracking, black on a warm near-white ground, and a serif display face reads as a different product. Do not reopen this without the owner asking.
  The honest cost, recorded so nobody rediscovers it as a bug: `system-ui` resolves to SF Pro on macOS and Segoe UI on Windows, so the headline is not glyph-identical across platforms. That is accepted. If it is ever revisited, the remedy is one self-hosted subset face for **headings only**, served from `docs/public/fonts` — never a CDN, because the artifact CSP blocks external hosts and a silent fallback is worse than the system stack. The Japanese stack (`--ja-font`) is separate and already deliberate.
- **Bold run-in labels are the house list pattern, not a template tell (A39.2).** The same research flags `**Label.** sentence` list items. Yomu uses them deliberately in `.yomu-fits-list` across the homepage, so a list that drops them reads as a stranger on the page. Consistency with the page's own grammar wins over the generic heuristic here.
- **Spacing:** 10–18px inside controls; 22–38px inside a paper surface. Touch targets are at least 44px.
- **Motion:** 150ms response, 320–360ms route movement, 420–520ms scene/letter transition. Reduced motion collapses travel immediately while keeping selection and destination state.

## Component grammar

| Primitive | Meaning | Interaction |
| --- | --- | --- |
| Invitation | identity, literal course descriptor, class-code entry | one `Open the doors` primary action; `Get a class code` opens support letter |
| Support letter/envelope | one-time donation and code fulfilment | amount recognition, progressive `Other`, secure-checkout handoff, close/cancel/focus return |
| Posted notice | lesson framing or concise orientation | no action unless the whole notice is a named destination |
| Dialogue slip | speaker line over world/character art | speaker tab, annotation-safe text root, explicit advance action |
| Choice slips | two to four meaningful alternatives | immediate hover/focus/pressed reaction; selected state remains visible |
| Route map | fixed place geography | focus/touch previews route; short camera move explains scene change |
| Journal page | bonds, replay, chronological memories | page tabs and replay action; no duplicate dashboard route |
| Genkō/kanji grid | actual Japanese writing | one character per square; stroke input and feedback use the grid semantically |
| Shared Study mount | canonical よむ Study inside the Library | Academy supplies living-paper tokens and a 15:00 countdown; Study owns cards, grading, queues, and settings |
| Stamp/rough mark | completion, correction, or authored emphasis | never decoration-only and never used as the sole status cue |

## Interaction inventory

Every visible element must do at least one job:

- **Orient:** place name, minimap, speaker tab, page heading.
- **Invite:** one primary action or a deliberately limited choice set.
- **Respond:** hover, keyboard focus, pressed, selected, busy, disabled, and error state with touch parity.
- **Teach:** Japanese content, example, feedback, provenance disclosure, or writing grid.

Anything doing none of these is removed. Recognition beats recall (visible amounts, places, and route state); secondary detail uses progressive disclosure; navigation is reversible; motion explains causality rather than filling idle time.

The only persistent Academy control is the top-left ellipsis menu. Campus, Review, Journal, Achievements, the Class board, Settings, sound, and language live there. The floating よむ puck and separate bottom navigation are absent. Settings dispatches the canonical Reader settings event rather than opening an Academy copy. The Class board exposes `account-required` or `available` state through the shell; it does not contain a second account or class-data implementation. Local study remains usable when no account callback is installed.

Library study mounts through `AcademyStudyModule`. The host identifies the `academy` / `living-paper` surface and maps canonical Reader colour variables to paper tokens; it never reimplements an SRS card. Sessions receive a configurable countdown contract, defaulting to `15:00` and clamping at `00:00`. Elapsed/count-up time is not part of the Academy contract.

## World and time

Warm rainy nights—amber windows, tea, wet pavements, late trains—remain a signature. Authored morning, overcast, clear-evening, and warm-night treatments make those nights special rather than universal. Location plates own their light. The future Velvet Hour is one discrete named place/event, never a generic placement/review/mystery theme.

## Japanese stability

Japanese copy is an explicit `data-yomu-runtime-surface` with `data-yomu-furigana-mode="all"`. Language changes reset these markers on persistent controls. Annotation roots reserve ruby line height. Decoration lives on the control or a pseudo-element, never a broad descendant `span` selector.

## Research and licensing

These references inform Academy-owned CSS/SVG primitives; no runtime dependency or copied component is shipped:

- [PaperCSS](https://github.com/papercss/papercss), ISC: imperfect borders, offset shadows, semantic paper surfaces.
- [Rough Notation](https://github.com/rough-stuff/rough-notation), MIT: small authored underline/box/highlight patterns and a disabled-animation contract.
- [Rough.js](https://github.com/rough-stuff/rough), MIT: hand-drawn SVG/canvas line principles.
- [400-square genkō yōshi](https://commons.wikimedia.org/wiki/File:Squared_manuscript_paper.pdf), public domain: manuscript grid proportions.
- [JITCO manuscript rules](https://hiroba.jitco.or.jp/info/wp-content/uploads/2013/03/genkoyoshi-E.pdf): one character per square and punctuation/paragraph placement. Use these rules only where learners actually write.
- [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): inert background, focus enters and remains in the modal, Escape/visible close, and focus returns to the trigger.
- [WCAG 2.2: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions): nonessential interaction motion, including parallax, must be disableable.
- [MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion): CSS and scripted travel share the same no-motion state.
