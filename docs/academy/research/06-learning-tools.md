# 06 — Learning-Tool Components for Yomu Academy

Imagery/narrative-driven study widgets, built on machinery that already ships in the Yomu
reader. Priority component: a **sentence-reveal** widget modelled on Yomu's YouTube subtitle
sidebar (Japanese line + eye toggle that hides/reveals furigana and/or the English gloss,
tap-to-reveal per word or per line).

All file paths are absolute-from-repo-root under
`/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/`.

---

## 0. TL;DR — what to reuse vs. build

| Need | Reuse (don't rebuild) | Path |
|---|---|---|
| Ruby/furigana HTML | `renderRuby`, `shouldRenderRuby`, `renderKanjiNavigationText` | `src/reader/dom/index.ts` |
| Headword furigana | `renderCardSpellingWithFurigana` | `src/reader/cards/reading-display.ts` |
| Furigana base style | `.jpdb-reader-furi`, `.jpdb-reader-ruby-base` | `src/reader/styles/reader-words-ocr.css:890` |
| Per-word furigana hide | `visibility:hidden` on `rt` gated by parent `revealed` class | `src/reader/styles/new-tab.css:2128` |
| Gloss/translation reveal | `renderExampleTranslation` + `toggleTranslationBlur` + blur CSS | `src/reader/immersion/popover-controller.ts:1273,900`; `src/reader/styles/immersion-study.css:323` |
| Native-line spoiler (the sidebar pattern) | `renderSubtitleSecondary`, `syncSubtitleSecondaryBlurState` + `.jpdb-subtitle-secondary-blurred` | `src/reader/subtitles/subtitle-rendering.ts:85`; `src/reader/styles/subtitles-youtube.css:210` |
| Pitch class/number/graph | whole `pitch-accent.ts` module + `renderPitchGraphSvg` | `src/reader/lookup/pitch-accent.ts`; `src/reader/popup/pitch.ts` |
| Shadowing (play + record + score) | `renderListenCard`/`renderRecordRow`, `toggleListenRecording`, `scoreSpeakingBlob` | `src/reader/newtab/listen-render.ts`; `controller.ts:5251`; `speaking-score.ts` |
| Anime example sentences | `ImmersionKitExample` search + `renderExampleCard` carousel | `src/reader/immersion/kit.ts`; `popover-controller.ts:720`; `player-view.ts` |
| Speaker icon | `speakerIcon()` | `src/reader/ui/icons.ts:23` |

**Build-new (gap):** there is **no eye / eye-off icon** in `src/reader/ui/icons.ts` (only
`externalLinkIcon`, `copyIcon`, `ankiIcon`, `speakerIcon`). Academy must add `eyeIcon()` /
`eyeOffIcon()` there. Everything else below is assembly of existing parts.

---

## 1. The two canonical reveal mechanics in Yomu

Yomu never uses a JS show/hide that reflows text. It uses two CSS-only patterns, both
toggled by a class/attribute and both keeping layout stable across reveal. Academy should
adopt them verbatim.

### 1a. `visibility:hidden` gated by a parent `revealed` class (furigana)
`src/reader/styles/new-tab.css:2128`
```css
.jpdb-reader-newtab:not(.jpdb-reader-newtab-revealed)
  .jpdb-reader-newtab-sentence
  .jpdb-reader-example-target
  :is(.jpdb-reader-furi, rt) {
  visibility: hidden;   /* NOT display:none — line height stays put across reveal */
}
```
The furigana is always in the DOM (rendered by `renderRuby`); a single ancestor class
(`.jpdb-reader-newtab-revealed`) flips every `rt` under it visible at once. This is the
reference for "hide the reading until I tap."

### 1b. `filter: blur()` / `color: transparent` spoiler on a click-to-reveal element (gloss / native line)
This is the **YouTube sidebar pattern** the priority component is based on. The secondary
(native-language) subtitle renders as a button that is blurred/transparent until hover,
focus, or click.

Render — `src/reader/subtitles/subtitle-rendering.ts:96`:
```ts
export function renderSubtitleSecondary(text, nativeBlurred, language = 'en'): string {
  const blurClass = nativeBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS;
  const label = uiText(language, 'toggleNativeSubtitleBlur');
  return `<button class="jpdb-subtitle-secondary ${blurClass}" type="button"
      data-action="toggle-native-blur" title="${label}" aria-label="${label}">${escapeWithBreaks(text)}</button>`;
}
```
CSS — `src/reader/styles/subtitles-youtube.css:210`:
```css
.jpdb-subtitle-secondary-blurred {
  color: transparent !important;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 6px var(--jpdb-subtitle-secondary-color), 0 0 9px var(--jpdb-reader-video-shadow-heavy);
  opacity: .82;                    /* readable "there's text here" glow */
}
.jpdb-subtitle-secondary-blurred:hover,
.jpdb-subtitle-secondary-blurred:focus-visible {
  color: var(--jpdb-subtitle-secondary-color) !important;   /* peek on hover/focus */
  -webkit-text-fill-color: var(--jpdb-subtitle-secondary-color);
  text-shadow: 0 2px 2px var(--jpdb-reader-black), 0 0 7px var(--jpdb-reader-video-shadow-heavy);
  opacity: 1;
}
```
State is class-synced (never re-rendered) via `syncSubtitleSecondaryBlurState`
(`subtitle-rendering.ts:88`) which toggles the two classes and updates `title`/`aria-label`.

The ImmersionKit gloss uses the same idea with a data-attribute + real Gaussian blur —
`src/reader/styles/immersion-study.css:323`:
```css
.jpdb-reader-example-translation[data-immersion-translation-blurred="true"] {
  filter: blur(4px); user-select: none; cursor: pointer;
}
```
Toggle handler `toggleTranslationBlur` (`popover-controller.ts:900`), render
`renderExampleTranslation` (`popover-controller.ts:1273`), a11y attrs set by
`setTranslationBlurAttributes` (`:1282` — adds `role=button`, `tabindex=0`, `aria-label`).
Keyboard: Enter/Space handled at `popover-controller.ts:347`.

**Design rule inherited from Yomu:** reveal targets are real `<button>`s (or
`role=button tabindex=0`), toggled by class/attribute, never by re-rendering text — so the
caret, selection, and line box never jump. Reuse this for every Academy reveal.

---

## 2. Component specs

### 2.1 SENTENCE-REVEAL (priority) — `academy-sentence`
A Japanese sentence with independent reveal state for **(a) furigana** and **(b) English
gloss**, plus **per-word tap-to-reveal**. Three reveal scopes, one widget:

- **Line furigana toggle** — eye button flips `data-furigana="hidden|shown"` on the root;
  CSS pattern 1a shows/hides every `rt` at once.
- **Line gloss toggle** — second eye button flips `data-gloss` → blur pattern 1b on the
  gloss row.
- **Per-word reveal** — each word is a `<button class="academy-word">` wrapping
  `renderRuby(...)` output; tapping one word adds `.is-revealed` to *that word only*
  (its `rt` becomes visible), independent of the line toggle. Long-press / hover still
  opens the existing Yomu lookup popover if wired in.

**Data contract** (maps 1:1 to what the reader already produces):
```ts
interface AcademySentenceView {
  tokens: JPDBToken[];         // from the reader parser; feeds renderRuby / shouldRenderRuby
  surface: string;            // raw JP line
  gloss?: string;             // English translation (optional)
  startFurigana: 'shown' | 'hidden';
  startGloss: 'shown' | 'hidden';
  pitch?: boolean;            // colour words by pitch class (data-pitch-class)
}
```

**Rendering:** iterate tokens; for each, `shouldRenderRuby(surface, token, settings)` →
`renderRuby(...)` (which already emits `<rt class="jpdb-reader-furi">` and applies
`data-pitch-class` / `jpdb-pitch-*` when `settings.showPitchAccent`). Wrap each in the
word button. The gloss row uses `renderSubtitleSecondary`-style markup. See §4 for the
self-contained sketch.

**Interaction summary**

| Control | Event | Effect | Layout-stable via |
|---|---|---|---|
| Furigana eye | click / Enter / Space | toggle `data-furigana` on root | `visibility` on `rt` |
| Gloss eye | click / Enter / Space | toggle `data-gloss` on root | `filter:blur` on gloss row |
| Word tap | click | toggle `.is-revealed` on that word | `visibility` on its `rt` |
| Reveal-all | click | set both to shown + all words revealed | class on root |

### 2.2 FURIGANA TOGGLE — `academy-furigana-toggle`
Standalone icon-button variant of the furigana scope above; the reader already gates
furigana globally via `settings.showFurigana` (`src/reader/app/i18n.ts:272`,
`showFurigana` key). For a per-widget toggle, do NOT touch global settings — flip the local
`data-furigana` attribute so one card's state is independent. Reuse `renderRuby` output
untouched.

### 2.3 PITCH-ACCENT HINT — `academy-pitch`
Everything needed is in `src/reader/lookup/pitch-accent.ts` (self-contained, no network):
- `pitchNumberForReading(patterns, reading)` → downstep mora number (0=heiban…N=odaka).
- `pitchClassNameForPattern(pattern, reading)` → `'atamadaka'|'odaka'|'heiban'|'nakadaka'|'kifuku'`.
- `pitchLevelsForDisplay`, `splitMorae`, `pitchPatternFromPosition`, `collectPitchVariants`,
  `validPitchPositions` (for a multi-answer position picker).
- Visual graph: `renderPitchGraphSvg` / `renderPitchVariantGraphs` in `src/reader/popup/pitch.ts`.
- Colour: words already carry `data-pitch-class` + `jpdb-pitch-{class}` from `renderRuby`;
  Academy just needs the palette (search `jpdb-pitch-` in `src/reader/styles/*.css`).
Spec: show the mora-contour SVG + class name as a *hint tier* (gated behind a tap, mirroring
`studyHint` tiers in `src/reader/newtab/study-hints.ts` — a hint never prints the full answer
before reveal).

### 2.4 SHADOWING — `academy-shadow`
Play a model audio, record the learner, score the pitch contour. All three exist:
- **Render** the record row: `renderRecordRow` / `renderListenCard` (submode `'shadow'`)
  in `src/reader/newtab/listen-render.ts:100,183`; buttons `listen-record`,
  `listen-play`, `listen-play-recording` via `iconButton()` (uses `speakerIcon()`).
- **Capture**: `toggleListenRecording` in `src/reader/newtab/controller.ts:5251` —
  `navigator.mediaDevices.getUserMedia({audio:true})` → `MediaRecorder`, auto-stops at
  3.2 s (`:5293`), collects chunks → `Blob`. Gracefully sets an "unavailable" flag when
  `MediaRecorder`/`getUserMedia` are missing (`:5257`).
- **Score**: `scoreSpeakingBlob(blob, item)` in `src/reader/newtab/speaking-score.ts:35` →
  decodes audio, extracts pitch frames, bins to the expected contour, returns
  `{score, verdict}` where verdict is `good ≥82 | close ≥62 | retry` (`:61`). Fully local.
Spec: reuse the machinery; Academy only supplies a `PitchSrsItem`-shaped `{reading, pitchNumber}`
and a model audio URL. Feed the verdict into the narrative reward loop.

### 2.5 IMMERSIONKIT EXAMPLES — `academy-examples`
Anime example sentences with image + audio, in a carousel — the flagship "imagery-driven"
tool.
- **Search**: `src/reader/immersion/kit.ts` — `ImmersionKitExample` shape (`:128`):
  `{ sentence, sentenceWithFurigana, translation, sourceTitle, category, imageUrl, audioUrls }`.
  Backends: `apiv2express.immersionkit.com` (+ legacy `apiv2.immersionkit.com`) and
  Nadeshiko `api.nadeshiko.co/v1`; media on the linode object store (`OBJECT_STORE_BASE`).
  Category order `anime > drama > games > literature > news`; default sort
  `sentence_length:asc`; `MIN_LEARNING_SENTENCE_LENGTH = 8`.
- **Render**: `renderExampleCard` (`popover-controller.ts:720`) → `summary` + toolbar
  (`renderImmersionExampleActionsHtml`, `player-view.ts:21`, prev/audio/next) + card body
  (image, sentence via `renderExampleSentenceContent`, gloss via `renderExampleTranslation`).
  The target word is highlighted with `highlightCardTargetWords`
  (`.jpdb-reader-example-target`); the sentence itself is fully parsed → tappable words with
  furigana.
- **Carousel + audio**: index logic `nextImmersionExampleIndex`/`validImmersionExampleIndex`
  (`player-view.ts:11,17`); hover-to-play + click-to-play audio (`popover-controller.ts:326`);
  lazy image loading with fallback candidates (`:755`).
- CSS: `src/reader/styles/immersion-study.css`.
- **Reference userscript** (`references-academy/JPDB-Immersion-Kit-Examples/`): patterns worth
  lifting for Academy — favorites (pin a preferred example per word), blacklist, exact-search
  toggle 「」/『』, per-example vocab colouring (`highlightVocab`, its JS:1310), audio autoplay,
  N-preload lookahead. Yomu's `kit.ts` already implements the search/caching far more robustly;
  borrow the *UX affordances*, not the fetch code.

---

## 3. Reference-project notes (asbplayer, nihongotube, ImmersionKit)

- **ImmersionKit userscript** (`references-academy/JPDB-Immersion-Kit-Examples/JPDB Immersion Kit Examples.js`, 2386 lines): the canonical "anime examples embedded next to a word" UX
  — carousel arrows, speaker, star-favorite, exact-search glyph toggle, settings menu.
  Yomu's `immersion/` module is a hardened re-implementation; use the userscript's README
  control table as the Academy affordance checklist.
- **asbplayer** (`/Users/heru/Documents/Projects/yomu/references/asbplayer/`): its subtitle
  settings model (`common/settings/settings.ts`) is the reference for *per-track* toggles
  (show/blur native, alignment). Confirms the "spoiler the L1 line" convention Academy is
  copying. No furigana renderer of its own worth lifting.
- **nihongotube** (`/Users/heru/Documents/Projects/yomu/references/nihongotube-5.5.0-extracted/`):
  bundled/minified React chunks; furigana + reveal live in
  `chunks/platform-*.js` / `content-scripts/react.js`. Concept parity (furigana over YT
  captions, hide-reading) but not readable source to lift — treat as prior-art validation
  only. Yomu's own subtitle sidebar is the better model.

---

## 4. Self-contained sketch — `academy-sentence`

Drop-in HTML + CSS + vanilla JS. Uses the two Yomu reveal mechanics (§1). In production,
replace the hand-written `<ruby>` with `renderRuby(surface, token, kanjiNav, true)` output
and the gloss markup with `renderSubtitleSecondary`. Attribute names mirror the reader
(`data-furigana`, `data-gloss`, `jpdb-reader-furi`) so the reader's CSS variables apply.

```html
<div class="academy-sentence" data-furigana="hidden" data-gloss="hidden">
  <div class="academy-sentence__toolbar">
    <button class="academy-eye" type="button" data-toggle="furigana"
            aria-pressed="false" aria-label="Reveal reading">
      <!-- swap for eyeIcon()/eyeOffIcon() added to src/reader/ui/icons.ts -->
      <span class="academy-eye__on">🙈 かな</span><span class="academy-eye__off">👁 かな</span>
    </button>
    <button class="academy-eye" type="button" data-toggle="gloss"
            aria-pressed="false" aria-label="Reveal meaning">
      <span class="academy-eye__on">🙈 EN</span><span class="academy-eye__off">👁 EN</span>
    </button>
    <button class="academy-reveal-all" type="button" data-toggle="all">Reveal all</button>
  </div>

  <!-- Each word is its own reveal button; ruby is always in the DOM, hidden by CSS. -->
  <p class="academy-line" lang="ja">
    <button class="academy-word" type="button" data-pitch-class="odaka" aria-label="reveal reading">
      <ruby><span class="jpdb-reader-ruby-base">日本語</span><rp>(</rp><rt class="jpdb-reader-furi">にほんご</rt><rp>)</rp></ruby>
    </button>
    <button class="academy-word" type="button">
      <ruby><span class="jpdb-reader-ruby-base">を</span></ruby>
    </button>
    <button class="academy-word" type="button" data-pitch-class="heiban">
      <ruby><span class="jpdb-reader-ruby-base">勉強</span><rp>(</rp><rt class="jpdb-reader-furi">べんきょう</rt><rp>)</rp></ruby>
    </button>
    <button class="academy-word" type="button">
      <ruby><span class="jpdb-reader-ruby-base">する</span></ruby>
    </button>
  </p>

  <button class="academy-gloss" type="button" data-action="toggle-gloss"
          aria-label="Reveal meaning">I study Japanese.</button>
</div>
```

```css
.academy-sentence__toolbar { display:flex; gap:8px; margin-bottom:6px; }
.academy-eye .academy-eye__on { display:none; }
.academy-eye[aria-pressed="true"] .academy-eye__on { display:inline; }
.academy-eye[aria-pressed="true"] .academy-eye__off { display:none; }

.academy-line { font-size:1.6rem; line-height:2.1; }      /* room for ruby */
.academy-word { border:0; background:none; padding:0 .04em; cursor:pointer;
  font:inherit; color:inherit; border-radius:4px; }
.academy-word:hover, .academy-word:focus-visible {
  background:color-mix(in srgb, var(--jpdb-reader-accent,#6aa) 18%, transparent); outline:none; }

/* MECHANIC 1a: furigana hidden until line-toggle OR that word is tapped.
   visibility (not display) keeps the line box height stable across reveal. */
.academy-sentence[data-furigana="hidden"] .academy-word:not(.is-revealed) rt { visibility:hidden; }

/* pitch tint reuses the reader's data-pitch-class → map to jpdb-pitch-* palette in prod */
.academy-word[data-pitch-class="heiban"]   .jpdb-reader-ruby-base { border-bottom:2px solid #4c9; }
.academy-word[data-pitch-class="odaka"]    .jpdb-reader-ruby-base { border-bottom:2px solid #e86; }
.academy-word[data-pitch-class="atamadaka"].jpdb-reader-ruby-base { border-bottom:2px solid #c6c; }

/* MECHANIC 1b: gloss is a spoiler until revealed (blur + peek-on-hover). */
.academy-gloss { border:0; background:none; cursor:pointer; font:inherit;
  color:var(--jpdb-reader-muted,#889); margin-top:8px; }
.academy-sentence[data-gloss="hidden"] .academy-gloss { filter:blur(5px); user-select:none; }
.academy-sentence[data-gloss="hidden"] .academy-gloss:hover,
.academy-sentence[data-gloss="hidden"] .academy-gloss:focus-visible { filter:blur(2px); }
```

```js
// Toggle by flipping a class/attribute — never re-render text (keeps layout stable).
function initAcademySentence(root) {
  const setPressed = (btn, on) => btn && btn.setAttribute('aria-pressed', String(on));

  root.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const scope = btn.dataset.toggle;
      if (scope === 'all') {
        root.dataset.furigana = 'shown';
        root.dataset.gloss = 'shown';
        root.querySelectorAll('.academy-word').forEach(w => w.classList.add('is-revealed'));
        root.querySelectorAll('[data-toggle="furigana"],[data-toggle="gloss"]').forEach(b => setPressed(b, true));
        return;
      }
      const next = root.dataset[scope] === 'shown' ? 'hidden' : 'shown';
      root.dataset[scope] = next;
      setPressed(btn, next === 'shown');
    });
  });

  // Per-word reveal (mechanic 1a, scoped to one word). Enter/Space come free on <button>.
  root.querySelectorAll('.academy-word').forEach(word => {
    word.addEventListener('click', () => word.classList.toggle('is-revealed'));
  });

  // Gloss body click toggles the whole gloss scope (mirrors toggleTranslationBlur).
  const gloss = root.querySelector('.academy-gloss');
  gloss?.addEventListener('click', () => {
    root.dataset.gloss = root.dataset.gloss === 'shown' ? 'hidden' : 'shown';
    setPressed(root.querySelector('[data-toggle="gloss"]'), root.dataset.gloss === 'shown');
  });
}
```

**Why this matches the sidebar:** furigana uses `visibility` on `rt` (reader
`new-tab.css:2128`); the gloss uses blur + hover-peek (reader `subtitles-youtube.css:210`
and `immersion-study.css:323`); every reveal target is a real `<button>` toggled by
attribute/class, so Enter/Space and screen-reader labels work and nothing reflows.

---

## 5. Gaps / build list for Academy
1. **`eyeIcon()` / `eyeOffIcon()`** in `src/reader/ui/icons.ts` — the one missing primitive.
2. **Local-state furigana toggle** — flip a widget-scoped `data-furigana`, do NOT mutate
   global `settings.showFurigana`.
3. **Per-word reveal state** is per-widget (`.is-revealed`) — Academy owns it; the reader's
   line-level `revealed` class is a separate concern.
4. Narrative/reward wiring: fold `scoreSpeakingBlob` verdicts and reveal-usage (à la
   `study-hints` tiers) into the Academy XP/story loop.
5. i18n: reuse existing keys `revealTranslation`, `toggleNativeSubtitleBlur`, `showFurigana`,
   `listenReplay`, `listenMicRecording`, `listenMicListenBack`, `listenMicYou`; add
   `revealReading` / `hideReading` for the furigana eye.
