# Yomu Academy — GitHub & Reference Research

> Prioritized clone-and-borrow list for building **Yomu Academy**, a Persona/Ghibli-style
> Japanese-learning visual novel (static web app, TypeScript, hand-authored SVG + generated art).
>
> Compiled 2026-07-11. Star counts are approximate (GitHub API, US region).

## License compatibility gate (read first)

The host project (`LICENSE` = **MIT**) is a distributable static web app. That constrains what we can
*vendor* (copy code into the bundle) versus merely *study*:

| License | Verdict for a shipped MIT app | Repos in this bucket |
|---|---|---|
| **MIT / ISC / BSD / Apache-2.0** | Vendor freely; keep the copyright + attribution. | canvas-confetti (ISC), tsParticles, Howler.js, NES.css, 98.css, Monogatari, sakura, ts-fsrs, asbplayer, ChatGptAutomator, UchiDb, JPDB-IK, anki_cloze_anything |
| **GPL-3.0 (copyleft)** | Do **not** copy source verbatim into our bundle — it would force GPL on the whole app. Reimplement the *idea* from scratch, or isolate behind a boundary. | TypeIt (also needs a paid **commercial** license), yomitan, mokuro |
| **AGPL-3.0 (network copyleft)** | Study only. Never vendor. | kanji-koohii |
| **CC-BY-SA (data)** | OK to ship the *data* with attribution + share-alike on that data. | KanjiVG |
| **RPGUI (NOASSERTION)** | README says MIT but GitHub can't confirm SPDX — check the actual `LICENSE` before vendoring. | RPGUI |
| **No LICENSE file** | Maker's *own* repos (`shinday`, `care-a-lot`) — reuse is fine because we own them, but there is no public grant. `rtk` reproduces copyrighted Heisig/Koohii text → data is legally grey, keep it private/study-only. | shinday, care-a-lot, rtk |

**Rule of thumb:** for the GPL/AGPL reader tools below, borrow the *UX convention and DOM approach*,
not the literal code.

---

## PART 1 — External open-source repos (prioritized)

### Tier A — clone first, highest leverage

#### 1. canvas-confetti — `catdad/canvas-confetti` · ★12.6k · **ISC** ✅vendor
Single-file, dependency-free, worker-offloadable confetti. Configurable `particleCount`, `angle`,
`spread`, `startVelocity`, `gravity`, `scalar`, `origin`, plus custom shapes.
- **Borrow:** the whole library for celebration bursts (lesson-clear, streak, level-up). Its
  `confetti.shapeFromText()` lets us throw 🌸 / ✨ / kanji glyphs as particles — perfect for the
  Persona "all-out attack" flourish without writing a physics loop.
- **Why over rolling our own:** offscreen-canvas path keeps the main thread free during a reveal.

#### 2. Howler.js — `goldfire/howler.js` · ★25.3k · **MIT** ✅vendor
7KB audio library; Web Audio with HTML5 fallback, sprite support, spatial/stereo pan, fades, pooling.
- **Borrow:** BGM crossfade between scenes, one-shot SFX sprites (menu blips, page turns, "correct"
  chimes), per-sound volume + global mute. Sprite sheets mean one file → many cues.
- **Note:** shinday already hand-rolled a smaller Web-Audio engine (see Part 2) — decide between
  vendoring Howler vs. lifting shinday's `sfx.js`. Howler wins if we need fades/spatial; shinday's
  is lighter and already CSP-hardened.

#### 3. Monogatari — `Monogatari/Monogatari` · ★864 · **MIT** ✅vendor/study
The reference web VN engine: label/jump script format, characters, scenes, choices, save/load,
typewriter dialogue, particle backgrounds, i18n, settings screen.
- **Borrow:** the **script/state model** (scene graph, `jump`, choices, flags, autosave to
  localStorage) and its dialogue-advance/skip/auto conventions. Even if we don't adopt the engine
  wholesale, its data shapes are the canonical VN vocabulary to mirror in our TS types.
- **Alt (lighter):** `yhdgms1/novely` (★33, ISC) — modern TS-first VN engine, good if we want types
  and a smaller surface; `Cqsi`-style RenJS/Tuesday.js are older but readable.

#### 4. NES.css — `nostalgic-css/NES.css` · ★21.8k · **MIT** ✅vendor
8-bit component CSS: bordered dialogue balloons, pixel buttons, progress bars, badges, icons.
- **Borrow:** the **`.nes-balloon` dialogue box** and `.nes-progress` for HP/XP-style bars; pixel
  button states. Great starting skin for a retro-cozy mode.
- **Companions:** `jdan/98.css` (★11.1k, MIT) for a "study OS window" chrome; `RonenNess/RPGUI`
  (★947, check LICENSE) for RPG frames/sliders/cursors if we lean Persona-menu.

#### 5. TypeIt — `alexmacarthur/typeit` · ★3.2k · **GPL-3.0 + commercial** ⚠️study-only
The most capable typewriter lib (per-char control, HTML-safe strings, speed changes, pause, delete,
start-on-visible, looping).
- **Borrow the *design*, not the code:** variable-speed typing, mid-string pauses, "instant-finish
  on click/skip", and HTML-preserving character walking. Reimplement in TS (it's ~150 lines of real
  logic) to stay MIT. shinday's splash already does a minimal version (Part 2).
- **Permissive alt to vendor directly:** `tameemsafi/typewriterjs` (MIT) if we want ready code.

### Tier B — clone for a specific effect

#### 6. sakura — `jhammann/sakura` · ★171 · **MIT** ✅vendor
Vanilla-JS falling cherry-blossom petals via CSS animations + `requestAnimationFrame`, influenced by
wind + gravity; configurable color, size, delay, fall-speed; `start()/stop()`.
- **Borrow:** ambient petal layer behind menus / Ghibli outdoor scenes. Small enough to read fully.
- **Canvas alt:** `599316527/sakura-canvas` (★24, MIT) if we'd rather draw to one canvas than spawn
  DOM nodes (better for hundreds of petals / low-end devices).

#### 7. tsParticles — `tsparticles/tsparticles` · ★8.9k · **MIT** ✅vendor
Heavier, plugin-driven particle system (snow, fireflies, links, confetti preset, emitters).
- **Borrow:** only if we want *ambient* generative backgrounds (drifting spirit-dust, fireflies for
  a night scene) with a config object instead of hand-code. For one-shot celebration, canvas-confetti
  is lighter; prefer tsParticles when the effect must run continuously and be authored by data.

#### 8. ts-fsrs — `open-spaced-repetition/ts-fsrs` · ★709 · **MIT** ✅vendor
TypeScript FSRS (Free Spaced Repetition Scheduler) — the modern successor to SM-2/Anki. Pure
functions: `card`, `rating`, `scheduling_cards`, next-due computation.
- **Borrow:** the scheduling core for Academy's review lane, so "when does this kanji/word/grammar
  come back" is principled, not ad-hoc. Yomu already talks to JPDB/Anki; ts-fsrs is the right choice
  for *local* Academy-owned SRS state. `open-spaced-repetition/awesome-fsrs` lists ports/examples.

#### 9. KanjiVG — `KanjiVG/kanjivg` · ★1.3k · **CC-BY-SA 3.0** ✅data (attribute)
Per-kanji SVG with per-stroke paths + stroke-order + radical metadata. (Already vendored in the
maker's `rtk` clone under `references-academy/rtk/kanjivg/`.)
- **Borrow:** stroke-order draw-in animations and radical decomposition. Pair with
  `parsimonhi/animCJK` (★437) — it splits each glyph into one path-per-stroke and animates a dashed
  stroke over it via CSS, the cleanest stroke-draw technique to copy. Yomu's existing kanji-doodle
  grader already consumes KanjiVG, so shapes are familiar.

#### 10. Cloze / sentence-reveal — `matthayes/anki_cloze_anything` · ★66 · **Apache-2.0** ✅study
Template-only (JS) cloze that reveals occlusions one-by-one with configurable "how many others to
show", no plugin.
- **Borrow:** the **sequential-reveal state machine** for i+1 sentence practice (blank the target
  word, tap to reveal, optionally dim vs. hide the rest). `rjgoif/anki-cloze-seq-reveal-js` (★0) is
  a tiny reference for the same idea. This maps directly onto Yomu's Batch-Mining i+1 flow.

### Reader-UX references (Part 3 targets — see note)

> The task's `references/` directory is **empty** (nothing was cloned there). Findings below are from
> web research + upstream repos, not local source. Clone these if we want them on disk.

| Repo | Stars | License | Reader-UX convention to mirror |
|---|---|---|---|
| `asbplayer/asbplayer` | ★1.3k | **MIT** ✅ | Subtitle-synced mining: hover-to-pause on a subtitle line, click a word → card with sentence + screenshot + audio clip. Our Subtitle Cue / Mining Context already align; copy its keyboard-driven review loop. |
| `kha-white/mokuro` | ★1.7k | **GPL-3.0** ⚠️ | Manga OCR overlay: invisible selectable text boxes positioned over art. Study the box-anchoring math for our SVG scene text; don't vendor. |
| `yomidevs/yomitan` | ★2.7k | **GPL-3.0** ⚠️ | Popup dictionary conventions: hover/tap glossary card, pitch-accent rendering, audio source ordering, structured-content glossary. Yomu already parallels this; borrow *conventions*, not code. |
| nihongotube | n/a | unresolved | Could not resolve a canonical repo (no public match). Treat as web reference only. |

---

## PART 2 — Maker's cloned repos (`references-academy/`)

These are the highest-value borrows because they're the maker's own aesthetic and already battle-tested
in the browser. Paths are relative to
`references-academy/`.

### `shinday/` — Miku "Language Dojo" birthday site  ⭐ richest source
No LICENSE file, but maker-owned. A full kawaii game-site: rhythm game, quests, jukebox, shimeji
companions, study hub. Concrete patterns to lift:

- **Web-Audio SFX engine** — `js/modules/sfx.js`
  - Named cue → array-of-variants map (`ui.move`, `hearts.add`, ...), random variant pick per play.
  - **CSP-hardened dual mode:** try `fetch()+decodeAudioData()` into a buffer pool; on CSP failure
    auto-fall-back to `new Audio()` element mode (and force element mode on strict hosts). This is
    exactly Yomu's cross-origin reality — reuse verbatim.
  - Per-cue **rate-limit** (`minInterval`) so rapid events don't machine-gun; AudioContext unlock on
    first `pointerdown`; master GainNode; volume persisted to localStorage; `preloadFirst()` warmer.
  - **Borrow wholesale** for Academy SFX (this is lighter + more CSP-aware than vendoring Howler).

- **Particle/juice EffectsManager** — `dojo.js` (~L856)
  - `ring(x,y,color)` expanding ring + `burst(x,y,color)` 8-particle pop using **CSS custom props
    `--tx/--ty`** set per particle, animated by a keyframe, auto-removed via `setTimeout`.
  - Pattern to copy: DOM-node-per-particle with CSS-var-driven trajectory = zero per-frame JS.
    Great for tap feedback and "correct!" pops.

- **Shimeji companion physics** — `js/shimeji.js`
  - `makeShimejiConfig()` = 46-frame sprite state table (`stand/walk/run/climb/ceiling/fall/jump/
    sit_*/divide/multiply/scared/happy/...`) each with `frames[]`, `interval`, `loops`.
  - Real physics: `gravity`, `velocity{x,y}`, `climbSpeed`, `jumpForce`; a shuffled
    `ORIGINAL_ACTIONS` sequence drives an autonomous behavior loop; alias table normalizes action
    names; mouse-reaction distance triggers happy/scared.
  - **Borrow:** the state-machine shape for an on-screen **desk-mate / mascot** that reacts to study
    events (idle, celebrate on correct, sulk on miss). This is our Persona "companion" hook.

- **Typewriter splash** — `js/content.js` (~L4343): `.typing-text` subtitle + `.glitch` title with
  `data-text` for CSS glitch. Minimal, MIT-safe pattern to base Academy's dialogue typing on (vs.
  GPL TypeIt).

- **Daily quests** — `js/modules/quests.js`: localStorage day-keyed missions
  (`{id,progress,done}`), `inc(id,delta)` progress with reward `{xp,hearts}` on completion,
  auto-reset per `toDateString()`. Drop-in for Academy daily goals.

- **Study-hub orchestrator** — `js/modules/study-hub.js`: difficulty slider, lives, song/question
  timers, vocab/kanji/typing pools prefetched from a `SITE_CONTENT` object, stats
  `{cool,great,fine,miss}`, reward accrual. Good template for a timed-session lesson loop.

- **i18n content model** — `js/content.js`: one big `SITE_CONTENT` object per language, applied by
  swapping `textContent`/`data-text` on load. Simple, no framework. (See also ChatGptAutomator's
  30-language bundle for a scaled-up version.)

- **CSS juice keyframes** — `dojo.css` / `css/styles.css`: `floatMiku`, `sparkleFloat`,
  `judgmentPop` (bounce ease), `ringExpand`, `particleBurst`, `shake`, `correctPulse`, `modalBounce`.
  Named easing vars `--ease-bounce/--ease-out`. Copy the easing palette + these named animations as
  our motion vocabulary.

### `care-a-lot-celebration/` — Care-Bears birthday invite (Vite + Firebase)
No LICENSE, maker-owned. Cozy pastel canvas art:
- **`public/canvasBg.js`** — draws a flat background + evenly-spaced "frill" dots around the border
  via `ctx.arc`. Cheap decorative frame technique for scene panels.
- **`public/cloud.js`** — `createCloud()` builds a cloud from N random "puff" divs with a random
  color from a big named-pastel list and a **randomized `animationDuration`**; `createAndPositionClouds`
  distributes clouds along edges by aspect ratio. Borrow: procedural, data-cheap ambient clouds for
  a Ghibli sky, with per-instance timing so they don't sync up.
- Also `sticker.js`, `getRandom.js` (tiny inclusive RNG helper worth copying), `care-o-meter`.

### `ChatGptAutomator/` — chatgpt.com automation userscript · **MIT** ✅
313KB single file, but two patterns are gold:
- **On-page panel UX:** draggable, resizable, theme-aware (dark/light), **position + state persisted**
  across reloads, tabbed. This is a ready blueprint for an Academy floating HUD/settings panel.
- **Bundled-local i18n for 30 languages:** auto-detects `<html lang>`, applies built-in translation
  tables to every label/tooltip/log — **no external service**. Exactly the offline-first i18n model
  Academy should use. Study the string-table structure and the `lang`-detection bootstrap.
- Secondary: chain-step orchestration (`prompt→js→http→prompt`) and a GM HTTP proxy — not core to
  Academy but a clean pattern if we add scripted tutorials.

### `UchiDb/` — JPDB mnemonic-image inserter userscript · **MIT** ✅
Two scripts (`jpdb-uchisen-userscript.js`, `jpdb-rtk-userscript.js`). Patterns:
- **CSP-friendly image fetch:** `fetchImageObjectURL()` pulls an image via `GM_xmlhttpRequest` as a
  blob → object URL (bypasses page CSP). Reuse for loading external mnemonic art into Academy cards.
- **Fetch-remote-HTML → DOMParser → extract** (`fetchUchisenPage` → `parseAllImages`): scrape a
  kanji page's images + story text into a clean data array. Same technique the RTK script uses to
  pull Heisig story/elements/Koohii from the maker's own `rtk` site.
- **Mnemonic carousel:** Prev/Next through all images for a kanji, **per-kanji Star favorite** and
  **remembered index** persisted via storage keys (`uchisen_star_<k>`, `uchisen_index_<k>`). This is
  the interaction model for an Academy "mnemonic gallery" per kanji.

### `JPDB-Immersion-Kit-Examples/` (AwooDesu, vendored) · **MIT** ✅
101KB userscript embedding anime example sentences into JPDB. Patterns:
- **`IndexedDBManager`** (open/get/put/delete with versioned store) for caching fetched examples —
  the right primitive for Academy to cache example sentences/audio offline.
- **Dual storage helper:** localStorage primary + `GM_setValue` backing (survives cache clears), with
  a one-time key-prefix migration guard. Good resilient-settings pattern.
- **Preload window:** `preloadedIndices: Set` + "number of preloads" config — prefetch the next N
  examples so carousel nav is instant. Directly applicable to Academy sentence/audio prefetch.
- **Example carousel** with ◀▶ nav, ⭐ favorites (remember chosen example per word), 「」exact-search
  toggle, blacklist, autoplay + manual audio, and a big ☰ config menu (image width, wide mode, font
  sizes, colored vocab, volume, hotkeys). A full menu of tunables to model Academy settings on.

### `rtk/` — Remembering the Kanji web app (fork of hochanh) ⚠️copyright-grey data
Jekyll site; **reproduces Heisig keywords/stories + Koohii community stories → keep private/study-only,
do not redistribute the text.** But the *structure* is reusable:
- **Kanji-as-front-matter data model** — `rtk1-v6/NNNN.md`: `kanji, keyword, elements, strokes,
  on-yomi, kun-yomi, heisig (story), commen(t), prev, next`, body = numbered Koohii stories. A clean
  schema for Academy's per-kanji content records (regenerate our *own* keyword/story text to stay legal).
- **Kanji viewer layout** — `_layouts/kanji.html`: a `#draw` KanjiVG canvas with playback controls
  `‹ ■ ▶ › ✕` (prev-stroke / stop / play / next-stroke / reset) + prev/next kanji pagination. This is
  the exact stroke-order study widget Academy wants; reuse the control set and KanjiVG binding.
- Ships the full **`kanjivg/`** dataset (11k+ SVGs) already on disk — a local KanjiVG source.

### `japlan/` — (bonus, present but not in brief)
Japan trip planner: `google_places_cache.json` + `styles.css` (27KB) + notion export. Not directly
relevant to Academy; the styles.css has cozy card/list patterns if we ever need travel-log UI. Skip
for now.

---

## PART 3 — Prioritized clone-and-borrow shortlist

1. **shinday** (already cloned) — lift `sfx.js` (CSP-safe audio), EffectsManager particles, shimeji
   companion state-machine, quests + study-hub loops, CSS juice keyframes. *Maker-owned, no license
   friction.* **Do this first.**
2. **canvas-confetti** (ISC) — vendor for all celebration bursts. Trivial integration.
3. **ts-fsrs** (MIT) — vendor as Academy's local SRS scheduler.
4. **KanjiVG data** (already in `rtk/kanjivg/`, CC-BY-SA) + **animCJK** technique — stroke-order
   draw-in; wrap in the `rtk/_layouts/kanji.html` control set.
5. **UchiDb** + **JPDB-IK** (both MIT, cloned) — mnemonic carousel + IndexedDB caching + preload-window
   + dual storage patterns for Academy cards.
6. **NES.css / 98.css** (MIT) — retro dialogue balloon + window chrome skin option.
7. **sakura** (MIT) or **tsParticles** (MIT) — ambient petals / fireflies backdrop.
8. **Howler.js** (MIT) — only if we need crossfade/spatial beyond shinday's engine.
9. **Monogatari / Novely** (MIT/ISC) — study for VN script/state model; adopt data shapes.
10. **anki_cloze_anything** (Apache-2.0) — sequential-reveal cloze state machine for i+1 practice.

### Do-not-vendor (study only, license or copyright)
- **TypeIt** (GPL-3.0 + commercial) → reimplement typewriter in TS (shinday splash is a starting point).
- **yomitan / mokuro** (GPL-3.0), **kanji-koohii** (AGPL-3.0) → mirror UX conventions only.
- **rtk** Heisig/Koohii *text* → regenerate our own keyword/story copy; the layout + KanjiVG are fine.
- **RPGUI** → confirm the real LICENSE file (GitHub SPDX = NOASSERTION) before shipping.

### Sources
GitHub (canvas-confetti, howler.js, tsparticles, typeit, NES.css, 98.css, RPGUI, Monogatari, novely,
ts-fsrs, KanjiVG, animCJK, sakura, sakura-canvas, asbplayer, mokuro, yomitan, anki_cloze_anything,
kanji-koohii); local repos under `references-academy/`.
