---
title: "Yomu Academy: Animation & Motion Spec"
description: "Implementation-ready motion contract for the Academy — doors, sakura, hana-maru, dialogue, transitions, sparkle, buttons, and ambient parallax, each with paste-in CSS/JS and a designed prefers-reduced-motion fallback."
---

# Yomu Academy: Animation & Motion Spec

**Status:** implementation-ready. Extends `05-vn-craft.md` (scene player, typewriter, live-region rules), `WORLD-BIBLE.md` (canon), and the two reference builds studied for this doc:
`references-academy/shinday` (rhythm-dojo: `dojo.css`/`dojo.js` — `EffectsManager` particle bursts, `judgmentPop`, `noteFall`, `floatMiku`, easing tokens) and
`references-academy/care-a-lot-celebration` (pastel celebration: `cloud.js` edge-field spawner, `sticker.js` randomized placement, `float`/`growAndFade`).

Motion here should feel **alive and a little silly, full of love** — but every flourish is presentation only. Nothing in this document is ever a gate, a timer, or the sole carrier of meaning. Every effect has a designed still-frame fallback, and none of it can strobe, shake, or block a keyboard/screen-reader user.

Two art assets anchor the palette and the staging:
- `public/academy/art/campus-blue-hour.webp` — the hero campus (grand columned hall, blue-hour indigo sky, warm window glow, cherry blossom, stone lanterns, a vermilion garden bridge, five students). Drives the **doors reveal**, the **sakura field**, and the **ambient parallax**.
- `public/academy/art/characters/rie-sensei.webp` — Rie-sensei, warm smile, holding graded papers with a big red 花丸 swirl on top. Drives the **dialogue portrait** and the **hana-maru stamp** (the mark is literally in her hand — reuse its exact red).

---

## 0. Foundation — tokens, motion contract, JS guard

Paste this block once, globally. Everything below keys off it.

### 0.1 Design tokens

```css
:root {
  /* ---- Palette, sampled from the two key arts ---- */
  --sky-indigo:   #23346b;  /* blue-hour sky */
  --sky-indigo-2: #101a3c;  /* deep top of sky */
  --sakura:       #f4b8ce;  /* petal pink */
  --sakura-deep:  #e58aa8;  /* petal core / shadow side */
  --lantern-gold: #f4c67a;  /* warm window + stone-lantern glow */
  --warm-glow:    #ffd79a;
  --hanamaru-red: #e0483d;  /* the swirl on Rie-sensei's paper — the payoff colour */
  --vermilion:    #c8432f;  /* garden bridge */
  --chalk-green:  #2f5148;  /* Rie's classroom board */
  --stone:        #b9b3a7;
  --ink:          #2a2a3a;
  --paper:        #fbf7ef;

  /* ---- Easing (shinday's two, plus a Ghibli-soft settle and a loop ease) ---- */
  --ease-out:    cubic-bezier(0.4, 0, 0.2, 1);      /* standard UI */
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55); /* playful overshoot */
  --ease-soft:   cubic-bezier(0.22, 1, 0.36, 1);    /* expo-out; unhurried settle */
  --ease-sine:   cubic-bezier(0.37, 0, 0.63, 1);    /* symmetric, for idle loops */

  /* ---- Durations ---- */
  --dur-quick:  120ms;  /* button press */
  --dur-base:   240ms;  /* portrait, hover */
  --dur-slow:   480ms;  /* panels, dissolves */
  --dur-scene:  700ms;  /* location change */
  --dur-doors: 2200ms;  /* ceremonial first entry */

  /* ---- Motion budget knobs (JS reads these too) ---- */
  --petal-count: 18;
}
@media (max-width: 768px) { :root { --petal-count: 8; } }
```

### 0.2 The reduced-motion contract (single source of truth)

Two layers, so it is correct with **and** without JS:

1. **No-JS backstop** — neutralizes any stray animation the moment the OS asks for calm:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

2. **JS-owned truth** — the app owns an attribute on `<html>` so an **in-app "Reduce motion" toggle** (required by `05-vn-craft.md`) can force calm even when the OS pref is off, and so effects can pick a *designed* still-frame instead of a jittery 0.01ms cut. **All effect CSS below guards on `html[data-motion="reduced"]`; all effect JS checks `MotionGuard.reduced`.** This is the primary mechanism; the media query above is the safety net.

```js
// motion.js — the only place that decides "is motion on?"
export const MotionGuard = (() => {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;

  const read = () => {
    const stored = localStorage.getItem('academy.motion'); // 'reduced' | 'full' | null
    const reduced = stored ? stored === 'reduced' : mq.matches;
    root.dataset.motion = reduced ? 'reduced' : 'full';
    return reduced;
  };

  let reduced = read();
  mq.addEventListener('change', () => { reduced = read(); });

  return {
    get reduced() { return reduced; },
    setPreference(v /* 'reduced'|'full'|'system' */) {
      if (v === 'system') localStorage.removeItem('academy.motion');
      else localStorage.setItem('academy.motion', v);
      reduced = read();
    },
    /** Run animated `fn`, or `fallback` (default no-op) when motion is off. */
    guard(fn, fallback) { return reduced ? (fallback && fallback()) : fn(); },
  };
})();
```

**Rules that bind every effect below:**
- No essential information is ever motion-only; each effect names its text/programmatic equivalent.
- No strobe: never more than ~3 flashes/second; the sakura, glow, and sparkle are all sub-1 Hz.
- No shake, no screen-jump, no autoplay audio sting (inherited posture from `05-vn-craft.md`).
- Particle spawners are capped and self-clean (`setTimeout(remove)` like shinday's `EffectsManager`).

---

## 1. Academy doors — first-entry ceremony

Two great doors part to reveal the blue-hour campus. Plays **once**, on first ever entry (a warm "you're here" beat), then never again unless replayed from settings.

### Structure
```html
<div class="gate" id="gate" aria-hidden="true">
  <div class="gate__scene"><!-- campus-blue-hour.webp as background --></div>
  <div class="gate__bloom"></div>
  <div class="gate__leaf gate__leaf--l"></div>
  <div class="gate__leaf gate__leaf--r"></div>
</div>
```

### CSS
```css
.gate { position: fixed; inset: 0; z-index: 90; perspective: 1600px; overflow: hidden; }
.gate__scene {
  position: absolute; inset: 0;
  background: url('/academy/art/campus-blue-hour.webp') center/cover;
  transform: scale(1.08); opacity: 0;
  animation: campusDolly var(--dur-doors) var(--ease-soft) 300ms forwards;
}
.gate__leaf {
  position: absolute; top: 0; bottom: 0; width: 50.5%; /* overlap seam */
  background: linear-gradient(180deg, var(--sky-indigo-2), var(--vermilion));
  box-shadow: inset 0 0 120px rgba(0,0,0,.5);
  backface-visibility: hidden;
}
.gate__leaf--l { left: 0;  transform-origin: left center;  animation: doorSwingL var(--dur-doors) var(--ease-soft) 250ms forwards; }
.gate__leaf--r { right: 0; transform-origin: right center; animation: doorSwingR var(--dur-doors) var(--ease-soft) 250ms forwards; }
.gate__bloom { /* soft light spill through the widening seam */
  position: absolute; inset: 0; background: radial-gradient(closest-side, var(--warm-glow), transparent 70%);
  opacity: 0; animation: gateBloom var(--dur-doors) var(--ease-out) 250ms forwards;
}

@keyframes doorSwingL { to { transform: rotateY(-108deg); } }
@keyframes doorSwingR { to { transform: rotateY( 108deg); } }
@keyframes campusDolly { 0% { opacity: 0; transform: scale(1.08); } 40% { opacity: 1; } 100% { transform: scale(1); } }
@keyframes gateBloom  { 0% { opacity: 0; } 35% { opacity: .8; } 100% { opacity: 0; } }
```

### JS
```js
function playGate() {
  const seen = localStorage.getItem('academy.gate.seen');
  const gate = document.getElementById('gate');
  const finish = () => { gate.remove(); localStorage.setItem('academy.gate.seen', '1'); };

  if (seen) { gate.remove(); return; }

  MotionGuard.guard(
    () => {
      gate.addEventListener('animationend', (e) => {
        if (e.animationName === 'doorSwingR') finish();
      });
      // Ceremony is skippable — any key/tap ends it immediately.
      gate.addEventListener('click', finish, { once: true });
      addEventListener('keydown', finish, { once: true });
    },
    finish, // reduced motion: no swing at all
  );
}
```

### Reduced-motion fallback
Doors never swing. The gate element is removed on the same frame; the learner lands directly on the campus. The "first time" flag still sets, and the welcome copy ("Welcome to Yomu Academy") is rendered as normal text, so the *ceremony's meaning* survives without any motion.

---

## 2. Falling sakura petals — ambient field

A soft, continuous drift of blossom over the campus. Decorative garnish, never interactive. Uses the **two-element technique** (outer element falls, inner sways) so drift and sway compose cleanly, and a capped, recycling spawner in the spirit of care-a-lot's `cloud.js`.

### Structure + CSS
```html
<div class="sakura" aria-hidden="true"></div> <!-- petals injected by JS -->
```
```css
.sakura { position: fixed; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }
.petal { position: absolute; top: -8vh; left: var(--x);
  animation: petalFall var(--fall) linear var(--delay) infinite; }
.petal > i { /* the visible blossom; separate element carries the sway */
  display: block; width: var(--size); height: var(--size);
  background: radial-gradient(120% 120% at 30% 30%, var(--sakura), var(--sakura-deep));
  border-radius: 100% 0 100% 0; /* petal teardrop */
  opacity: .85; transform: rotate(var(--spin));
  animation: petalSway var(--sway) ease-in-out infinite alternate;
}
@keyframes petalFall { to { transform: translateY(120vh); } }
@keyframes petalSway { from { margin-left: -14px; transform: rotate(-25deg); }
                       to   { margin-left:  14px; transform: rotate( 30deg); } }
```

### JS (capped, randomized like `getRandom`)
```js
function seedSakura() {
  const field = document.querySelector('.sakura');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const N = MotionGuard.reduced ? 0
          : parseInt(getComputedStyle(document.documentElement).getPropertyValue('--petal-count'));
  for (let i = 0; i < N; i++) {
    const p = document.createElement('span'); p.className = 'petal';
    p.style.setProperty('--x', rnd(0, 100) + 'vw');
    p.style.setProperty('--size', rnd(8, 16) + 'px');
    p.style.setProperty('--fall', rnd(9, 16) + 's');
    p.style.setProperty('--sway', rnd(2, 4) + 's');
    p.style.setProperty('--delay', -rnd(0, 16) + 's'); // negative = start mid-flight, no empty sky
    p.style.setProperty('--spin', rnd(0, 360) + 'deg');
    p.appendChild(document.createElement('i'));
    field.appendChild(p);
  }
}
```

### Reduced-motion fallback
`N = 0`: no falling petals. Instead, render a **static** dusting — a handful of `.petal--rest` blossoms CSS-positioned along the lower edge / on the ground, no animation — so the world still *feels* like blossom season without a single moving pixel. Or omit entirely; the campus art already contains petals.

```css
html[data-motion="reduced"] .petal { display: none; }
```

---

## 3. Hana-maru (花丸) stamp — correct-answer payoff

The signature reward. The red swirl from Rie-sensei's paper **stamps** onto the answer: a quick "thunk" (scale overshoot + tiny rotate) while the swirl **draws itself** on. This is the single most joyful moment in the product; keep it crisp (~600 ms) and use the exact `--hanamaru-red`.

### Structure (inline SVG so we can draw the stroke)
```html
<span class="hanamaru" role="img" aria-label="Correct — hanamaru">
  <svg viewBox="0 0 100 100">
    <path class="hanamaru__petals" d="M50 8c9 0 12 8 20 8s14-2 14 10-6 12-6 24 6 12 6 24-8 10-14 10-11 8-20 8-11-8-20-8-14 2-14-10 6-12 6-24-6-12-6-24 8-10 14-10 11-8 20-8Z"/>
    <path class="hanamaru__swirl" d="M50 30a20 20 0 1 1-14 34 14 14 0 1 1 22-18 8 8 0 1 1-10 12"/>
  </svg>
</span>
```

### CSS
```css
.hanamaru { display: inline-grid; place-items: center; width: 96px; height: 96px; }
.hanamaru svg { width: 100%; height: 100%; overflow: visible; }
.hanamaru__petals, .hanamaru__swirl {
  fill: none; stroke: var(--hanamaru-red); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round;
}
/* start hidden; JS sets --len from getTotalLength() */
.hanamaru path { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); }

.hanamaru.is-stamped { animation: stampThunk 260ms var(--ease-bounce) both; }
.hanamaru.is-stamped .hanamaru__petals { animation: drawOn 420ms var(--ease-out) 60ms forwards; }
.hanamaru.is-stamped .hanamaru__swirl  { animation: drawOn 520ms var(--ease-out) 200ms forwards; }

@keyframes stampThunk { 0% { transform: scale(1.5) rotate(-9deg); opacity: 0; }
                        55% { transform: scale(.92) rotate(2deg); opacity: 1; }
                        100% { transform: scale(1) rotate(0); } }
@keyframes drawOn { to { stroke-dashoffset: 0; } }
```

### JS
```js
function stampHanamaru(el) {
  el.querySelectorAll('path').forEach(p => p.style.setProperty('--len', p.getTotalLength()));
  MotionGuard.guard(
    () => { el.classList.remove('is-stamped'); void el.offsetWidth; el.classList.add('is-stamped'); },
    () => { el.querySelectorAll('path').forEach(p => p.style.strokeDashoffset = 0);
            el.style.opacity = 1; }, // reduced: fully drawn, instant
  );
  // Correctness is announced in text regardless of the visual:
  announce('Correct — 花丸!'); // polite live region from 05-vn-craft
}
```

### Reduced-motion fallback
No thunk, no draw-on. The completed, fully-drawn stamp simply exists (dashoffset 0, opacity 1) — a static red 花丸. The `aria-label` and the "Correct — 花丸!" live-region line carry the meaning; the mark is pure garnish.

---

## 4. Dialogue — typewriter + portrait slide/expression swap

Extends `05-vn-craft.md` §2. The typewriter is JS-driven (CJK + furigana + grapheme clusters can't use CSS `steps()`); the portrait slides in from the speaker's side and cross-fades expressions.

### Structure
```html
<figure class="portrait" data-side="right">
  <img class="portrait__img is-active" src="/academy/art/characters/rie-sensei.webp" alt="" aria-hidden="true">
</figure>
<div class="dbox" aria-live="polite" aria-atomic="true">
  <span class="dbox__name">Rie-sensei</span>
  <p class="dbox__line" lang="ja"></p>
  <button class="dbox__advance" aria-label="Continue">▸</button>
</div>
```

### CSS
```css
.portrait { position: absolute; bottom: 0; width: min(38vw, 420px); }
.portrait[data-side="right"] { right: 4vw; }
.portrait[data-side="left"]  { left: 4vw; transform: scaleX(-1); }
.portrait__img { width: 100%; opacity: 0; transform: translateY(12px) translateX(var(--from, 24px)) scale(.98);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-soft);
  filter: drop-shadow(0 8px 24px rgba(0,0,0,.35)); }
.portrait__img.is-active { opacity: 1; transform: translateY(0) translateX(0) scale(1); }
.portrait[data-side="left"] .portrait__img { --from: -24px; }

/* expression swap = cross-fade between two stacked <img> */
.portrait__img { position: absolute; inset-block-end: 0; }

.dbox__advance { animation: advPulse 1.2s var(--ease-sine) infinite; } /* gentle "your turn" */
@keyframes advPulse { 0%,100% { opacity: .55; transform: translateX(0); } 50% { opacity: 1; transform: translateX(3px); } }
.dbox__caret::after { content: '▌'; animation: caret .8s steps(1) infinite; } /* typing cursor */
@keyframes caret { 50% { opacity: 0; } }
```

### JS — typewriter (grapheme-safe, click-to-complete)
```js
function typeLine(el, text, cps = 45) {
  el.classList.add('dbox__caret');
  const seg = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  const graphemes = [...seg.segment(text)].map(s => s.segment);
  el.setAttribute('aria-label', text); // full text to a11y tree immediately (SR = Instant)

  return MotionGuard.guard(() => new Promise(resolve => {
    let i = 0, last = 0;
    const step = (t) => {
      if (t - last >= 1000 / cps) { el.textContent = graphemes.slice(0, ++i).join(''); last = t; }
      if (i >= graphemes.length) { done(); return; }
      raf = requestAnimationFrame(step);
    };
    const done = () => { el.textContent = text; el.classList.remove('dbox__caret'); cleanup(); resolve('shown'); };
    const complete = () => { cancelAnimationFrame(raf); done(); };   // 1st click completes
    const cleanup = () => el.removeEventListener('click', complete);
    let raf = requestAnimationFrame(step);
    el.addEventListener('click', complete);
  }),
  () => { el.textContent = text; el.classList.remove('dbox__caret'); return Promise.resolve('shown'); }); // Instant
}

function showPortrait(imgEl) { requestAnimationFrame(() => imgEl.classList.add('is-active')); }
function swapExpression(container, nextSrc) {
  const cur = container.querySelector('.is-active');
  const next = new Image(); next.src = nextSrc; next.className = 'portrait__img'; next.alt = ''; next.setAttribute('aria-hidden','true');
  container.appendChild(next);
  MotionGuard.guard(
    () => requestAnimationFrame(() => { next.classList.add('is-active'); cur.classList.remove('is-active');
      cur.addEventListener('transitionend', () => cur.remove(), { once: true }); }),
    () => { next.classList.add('is-active'); cur.remove(); }, // instant swap, no cross-fade
  );
}
```

### Reduced-motion fallback
- **Typewriter → Instant.** Full line in one frame, no caret blink, static `▸` advance glyph (the pulse animation is neutralized). Screen readers already got the whole line via `aria-label`, so behaviour is unchanged for them.
- **Portrait → no slide.** `is-active` applies with `transition-duration: 0.01ms`, i.e. the portrait just appears/leaves.
- **Expression → instant swap**, no cross-fade (matches `05-vn-craft.md`: "Portraits swap without cross-fade").

```css
html[data-motion="reduced"] .dbox__advance,
html[data-motion="reduced"] .dbox__caret::after { animation: none; }
html[data-motion="reduced"] .portrait__img { transition: none; }
```

---

## 5. Location-to-location transition

Moving between campus places (Library, Open-Door Desk, Garden…). Ghibli-restraint: a **soft cross-dissolve with a short directional drift**, plus an optional map-marker "drop" when a destination is chosen (reuses `cc0-school-map-marker.png`). New location name is announced for screen readers — that, not the motion, is the canonical signal.

### Structure
```html
<div class="stage" aria-live="polite">
  <section class="loc is-current" data-loc="library">…</section>
</div>
<img class="map-marker" src="/academy/art/cc0-school-map-marker.png" alt="" hidden>
```

### CSS
```css
.stage { position: relative; overflow: hidden; }
.loc { position: absolute; inset: 0; }
.loc.is-leaving  { animation: locLeave var(--dur-scene) var(--ease-soft) both; }
.loc.is-entering { animation: locEnter var(--dur-scene) var(--ease-soft) both; }
@keyframes locLeave  { to   { opacity: 0; transform: translateX(-3%) scale(.98); } }
@keyframes locEnter  { from { opacity: 0; transform: translateX( 3%) scale(1.02); }
                       to   { opacity: 1; transform: translateX(0) scale(1); } }

.map-marker { position: absolute; width: 64px; transform-origin: 50% 100%; }
.map-marker.is-dropping { display: block; animation: markerDrop 520ms var(--ease-bounce) both; }
@keyframes markerDrop { 0% { transform: translateY(-40px) scale(.6); opacity: 0; }
                        60% { transform: translateY(4px) scale(1.05); opacity: 1; }
                        100% { transform: translateY(0) scale(1); } }
```

### JS
```js
function goToLocation(nextEl, name) {
  const cur = document.querySelector('.loc.is-current');
  const enter = () => { nextEl.classList.add('is-current'); announce(`Now at: ${name}`); };
  MotionGuard.guard(
    () => {
      cur.classList.add('is-leaving');
      nextEl.classList.add('is-entering');
      nextEl.addEventListener('animationend', () => nextEl.classList.remove('is-entering'), { once: true });
      cur.addEventListener('animationend', () => { cur.classList.remove('is-current','is-leaving'); }, { once: true });
      enter();
    },
    () => { cur.classList.remove('is-current'); enter(); }, // hard cut
  );
}
```

### Reduced-motion fallback
A **static cut**: the current location is removed and the next shown on the same frame — no dissolve, no drift. The marker does not drop; it appears at the destination. The "Now at: {name}" live-region announcement is identical in both paths.

---

## 6. Level-up / unlock sparkle

Something new opened up. Borrows shinday's `EffectsManager.burst` + `ringExpand` + `modalBounce`, tuned **down** to Ghibli restraint — a gentle bloom, not a confetti cannon. A card pops in, one ring expands, a small capped scatter of sparkles twinkles out.

### Structure + CSS
```html
<div class="unlock" role="status">
  <div class="unlock__card">★ Unlocked: Library access</div>
  <div class="spark-layer" aria-hidden="true"></div>
</div>
```
```css
.unlock__card { animation: unlockPop 460ms var(--ease-bounce) both; }
@keyframes unlockPop { 0% { transform: scale(0); opacity: 0; }
                       60% { transform: scale(1.06); opacity: 1; }
                       100% { transform: scale(1); } }
.ring { position: absolute; border: 3px solid var(--lantern-gold); border-radius: 50%;
  transform: translate(-50%,-50%); animation: ringExpand 640ms var(--ease-out) both; }
@keyframes ringExpand { 0% { width: 16px; height: 16px; opacity: .9; }
                        100% { width: 220px; height: 220px; opacity: 0; } }
.spark { position: absolute; width: 8px; height: 8px; background: var(--warm-glow);
  clip-path: polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%);
  animation: sparkle 800ms var(--ease-out) forwards; }
@keyframes sparkle { from { transform: translate(0,0) scale(1) rotate(0); opacity: 1; }
                     to   { transform: translate(var(--tx),var(--ty)) scale(0) rotate(140deg); opacity: 0; } }
```

### JS (capped spawner, self-cleaning — pattern from `EffectsManager.burst`)
```js
function celebrateUnlock(x, y) {
  const layer = document.querySelector('.spark-layer');
  MotionGuard.guard(() => {
    const ring = document.createElement('div'); ring.className = 'ring';
    ring.style.left = x + 'px'; ring.style.top = y + 'px';
    layer.appendChild(ring); setTimeout(() => ring.remove(), 700);
    for (let i = 0; i < 10; i++) {                       // capped; no strobe
      const s = document.createElement('span'); s.className = 'spark';
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--tx', (Math.random() - .5) * 160 + 'px');
      s.style.setProperty('--ty', (Math.random() - .5) * 160 + 'px');
      layer.appendChild(s); setTimeout(() => s.remove(), 850);
    }
  }); // reduced: no fallback fn needed — card + text already convey it
}
```

### Reduced-motion fallback
No pop, no ring, no sparkles. The card is simply present with a static "★ Unlocked: Library access" line inside a `role="status"` region, so assistive tech and calm-motion users still get the full, unambiguous news. The sparkle layer stays empty.

---

## 7. Button press micro-interactions

Rest → hover lift → press-down → spring-back, with a focus ring that is **never** removed (it is accessibility, not decoration). Tamer than care-a-lot's `scale(1.3)` — this is a study tool, so lift is subtle (~3%).

### CSS
```css
.btn {
  padding: .7em 1.4em; border-radius: 999px; border: 2px solid transparent;
  background: var(--lantern-gold); color: var(--ink); cursor: pointer;
  transition: transform var(--dur-quick) var(--ease-bounce),
              box-shadow var(--dur-base) var(--ease-out),
              background-color var(--dur-base) var(--ease-out);
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
}
.btn:hover  { transform: translateY(-2px) scale(1.03); box-shadow: 0 6px 16px rgba(0,0,0,.18); }
.btn:active { transform: translateY(1px) scale(.96); transition-duration: 60ms; } /* the "press" */
.btn:focus-visible { outline: 3px solid var(--sky-indigo); outline-offset: 3px; }

/* Optional love-tap: a tiny heart pops on the primary confirm */
.btn--primary.is-tapped::after {
  content: '♥'; position: absolute; color: var(--hanamaru-red);
  animation: loveTap 600ms var(--ease-out) forwards;
}
@keyframes loveTap { from { transform: translateY(0) scale(.6); opacity: 1; }
                     to   { transform: translateY(-28px) scale(1.1); opacity: 0; } }
```
```js
primaryBtn.addEventListener('click', (e) => MotionGuard.guard(() => {
  primaryBtn.classList.remove('is-tapped'); void primaryBtn.offsetWidth; primaryBtn.classList.add('is-tapped');
}));
```

### Reduced-motion fallback
Keep every **state change**, drop every **transform**: hover/active express through colour + box-shadow + the focus outline only; no lift, no scale, no spring, no heart. Focus-visible ring is untouched.

```css
html[data-motion="reduced"] .btn { transition: background-color var(--dur-base), box-shadow var(--dur-base); }
html[data-motion="reduced"] .btn:hover  { transform: none; }
html[data-motion="reduced"] .btn:active { transform: none; }
html[data-motion="reduced"] .btn--primary.is-tapped::after { display: none; }
```

---

## 8. Gentle ambient parallax — campus

The hero art breathes: layers drift a few pixels against pointer/scroll, the warm windows glow ever so slightly, the whole scene has a slow idle sway. Deliberately **tiny** (Ghibli calm, not a video-game camera).

**If layered assets exist** (sky / hall / garden+lantern / blossom-branch as separate PNGs), use the multi-layer path. **If only the single `campus-blue-hour.webp` ships**, use the single-image path (whole-image drift + a glow overlay) — both below.

### Structure + CSS
```html
<div class="campus" style="--px:0; --py:0;">
  <div class="campus__layer" data-depth="6"  style="background-image:url('/academy/art/campus-blue-hour.webp')"></div>
  <div class="campus__glow"></div>
</div>
```
```css
.campus { position: relative; overflow: hidden; height: 100%; }
.campus__layer {
  position: absolute; inset: -4%; background-size: cover; background-position: center;
  transform: translate(calc(var(--px) * (var(--depth) * 1px)), calc(var(--py) * (var(--depth) * 1px)));
  transition: transform 400ms var(--ease-out); /* smooths pointer jitter */
  animation: campusBreathe 14s var(--ease-sine) infinite; /* idle sway */
}
@keyframes campusBreathe { 0%,100% { scale: 1.02; } 50% { scale: 1.045; } }
.campus__glow { /* warm window flicker over the building */
  position: absolute; inset: 0; pointer-events: none; mix-blend-mode: screen;
  background: radial-gradient(40% 30% at 72% 46%, var(--warm-glow), transparent 70%);
  opacity: .25; animation: windowGlow 6s var(--ease-sine) infinite;
}
@keyframes windowGlow { 0%,100% { opacity: .18; } 50% { opacity: .32; } }
```

### JS (pointer + scroll → CSS vars; rAF-throttled)
```js
function ambientParallax(root) {
  if (MotionGuard.reduced) return; // no listeners at all when motion is off
  let px = 0, py = 0, queued = false;
  const apply = () => { root.style.setProperty('--px', px.toFixed(3));
                        root.style.setProperty('--py', py.toFixed(3)); queued = false; };
  addEventListener('pointermove', (e) => {
    px = (e.clientX / innerWidth  - .5) * -2; // -1..1, inverted for depth-parallax
    py = (e.clientY / innerHeight - .5) * -2;
    if (!queued) { queued = true; requestAnimationFrame(apply); }
  }, { passive: true });
}
```
`data-depth` sets the per-layer strength: sky `2`, hall `6`, garden `10`, blossom branch `16` (nearer = moves more). With a single image, keep one layer at depth `6`.

### Reduced-motion fallback
`ambientParallax` returns immediately — **no** pointer/scroll listeners bound (also a perf win). The `campusBreathe` and `windowGlow` loops are cancelled by the contract. The campus is a crisp, still image — which, given how lovely the art is, is a perfectly good resting state.

```css
html[data-motion="reduced"] .campus__layer { animation: none; transform: none; }
html[data-motion="reduced"] .campus__glow  { animation: none; opacity: .22; }
```

---

## 9. Effect → asset → beat map (for the lead)

| Effect | Reuses from refs | Key art | Emotional beat | Motion-off signal |
| --- | --- | --- | --- | --- |
| Doors | shinday `panelFadeIn`/perspective | campus-blue-hour | "You've arrived" (once) | Land on campus + welcome text |
| Sakura field | care-a-lot `cloud.js` spawner | campus-blue-hour | Living, seasonal world | Static dusting or none |
| Hana-maru | shinday `judgmentPop`, SVG draw | rie-sensei's red swirl | "花丸! You got it" | Static drawn stamp + "Correct — 花丸!" |
| Typewriter/portrait | shinday `floatMiku`, `05-vn-craft` | rie-sensei | Presence, conversation | Instant text, no slide, instant swap |
| Location change | shinday `EffectsManager` | school-map-marker | Gentle travel | Hard cut + "Now at: {name}" |
| Level-up sparkle | shinday `ringExpand`/`burst`, care-a-lot `growAndFade` | — | Quiet "something opened" | `role="status"` card + text |
| Button press | care-a-lot `cute-button` (tamed) | — | Responsive, affectionate | Colour/shadow/outline only |
| Ambient parallax | care-a-lot `float`, shinday `floatMiku` | campus-blue-hour | The world breathes | Still image |

**Paste order:** §0 first (tokens + `MotionGuard`), then any effect independently. Every effect's CSS guards on `html[data-motion="reduced"]` and its JS calls `MotionGuard.guard(...)`, so wiring the in-app "Reduce motion" toggle to `MotionGuard.setPreference(...)` is the only integration step that touches all eight at once.
