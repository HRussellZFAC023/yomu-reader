# 10 — Audio for Yomu Academy: music sources, YouTube jukebox, and WebAudio SFX

**Status:** design + sourcing research. No implementation in this document.
**Scope:** three deliverables — (1) per-location ambient/lofi music from CC0 / free-for-this-use
sources, (2) an optional YouTube-jukebox config the maker fills with their own picks, and
(3) asset-free WebAudio SFX synthesis recipes (short JS functions).
**Inherits (source of truth):** `docs/academy/WORLD-BIBLE.md` (§Accessibility, §Product Contract,
§Bloomsbury Location Grid), `docs/academy/research/07-study-hall.md` (sound gating precedent).

---

## 0. Canon this feature must obey (read first)

These are hard constraints pulled from `WORLD-BIBLE.md`. Audio is a **supplementary, opt-in**
layer; it can never be load-bearing.

| Constraint | Source | Consequence for audio |
| --- | --- | --- |
| `sound === 'off'` ⇒ **no fetch, no autoplay, no mic prompt**; text is the full equivalent. | Bible §Accessibility | Music files and the YouTube iframe must be **lazy-loaded only when sound is on**. Nothing network-touching may load at `off`. |
| Never encode a state solely by colour, motion, **sound**, or decoration. | Bible §Accessibility (Colour and visual state) | Every SFX must accompany an existing text + icon + ARIA change (mirror `showFeedback`). An SFX is never the only signal of correct/unlock/level-up. |
| Local-first, privacy-preserving, "no new remote surface." | Bible §Product Contract, §Local state | The **YouTube jukebox is a third-party network + tracking surface → OFF by default, explicit opt-in only**, `youtube-nocookie.com`. Bundled CC0 music has no such issue and is the default path. |
| No real-time deadline / penalty; reduced-motion disables particles. | Bible §Tone, §Accessibility | Music loops are ambient and non-reactive; no stingers that imply time pressure. Reduced-motion does not have to kill audio, but a single **`sound` setting `off | sfx | full`** should. |
| Determinism; local-only state. | study-hall §2 | Track selection per location is a pure map; per-session shuffle uses an index-based seed, not `Math.random`, if it must be reproducible for tests. |

**One master rule for licensing:** because the app **bundles/hosts** its audio (userscript +
hosted reader), prefer licenses that explicitly permit **redistribution**: CC0 / public domain /
Pixabay License. CC-BY is usable but adds an attribution-UI obligation. Avoid per-track-ambiguous
libraries (DOVA-SYNDROME) for bundled defaults. See §2.

---

## 1. TL;DR — the actionable shortlist

**Default bundled soundtrack (safe to ship, no attribution UI required):**
- **Pixabay Music** — Pixabay License, commercial OK, **no attribution**, redistribution as part of
  a larger work OK. Primary source for lofi/ambient/jazz loops. `https://pixabay.com/music/`
- **FreePD.com** (Kevin MacLeod + others) — **CC0 / public domain**, zero strings. Best for
  tender/emotional piano and "scoring" beds. `https://freepd.com/`
- **Chosic "no-attribution / CC0" filter** — curated CC0 + Pixabay tracks in one place.
  `https://www.chosic.com/free-music/all/?attribution=no`
- **甘茶の音楽工房 (Amacha)** — free, commercial OK, no attribution; **Japanese aesthetic** (healing,
  piano, jazz, honobono). Caveat: cannot resell/redistribute the file *standalone* — fine as app
  BGM. `https://amachamusic.chagasi.com/`

**Attribution-required, use only if you add a credits screen:**
- **Incompetech** (Kevin MacLeod) — CC-BY 4.0, huge catalogue. Requires a visible credit line.

**Do not bundle by default:** DOVA-SYNDROME (per-track composer terms vary — great for the
*maker's* personal picks / jukebox, risky as a shipped default).

**YouTube jukebox:** optional, opt-in, off by default; a `locationId → [videoId]` config the maker
fills. Uses the IFrame Player API on `youtube-nocookie.com`, muted-autoplay + a mute/unmute toggle,
`onError` skip for non-embeddable videos. See §4.

**SFX:** 8 fully-synthesized WebAudio recipes in §5 — no asset files. Shared two-bus engine
(music bus + SFX bus so SFX can duck music) gated on the `sound` setting.

---

## 2. Licensing primer — what is safe to bundle

| Source | License | Attribution? | Redistribute in a bundled app? | Best for |
| --- | --- | --- | --- | --- |
| **Pixabay Music** | Pixabay Content License | No | Yes (as part of a larger work; not as a standalone track for resale) | lofi, ambient, jazz, upbeat — the default well |
| **FreePD.com** | CC0 1.0 | No | Yes, unconditionally | piano, emotional, scoring beds, comedy |
| **Chosic** (filtered) | mixed — **filter to CC0 / "no attribution"** | Only if the track says so | Yes for the CC0/PD subset | one-stop curated browse by mood |
| **甘茶 Amacha** | custom free license | No | Yes as BGM (no standalone resale, no JASRAC registration, no impersonation) | Japanese-flavoured healing/piano/jazz |
| **Incompetech** | CC-BY 4.0 | **Yes (required)** | Yes if credited | broad catalogue; needs a credits UI |
| **DOVA-SYNDROME** | per-track composer terms | varies | **risky** — verify each track | the maker's own jukebox picks, not defaults |
| **Freesound** | mixed (**filter CC0**) | CC0 subset: no | CC0 subset: yes | ambience *beds* (room tone) if you ever want recorded, not synth |
| **YouTube Audio Library** | YT license | some tracks | intended for *your uploads*, murky for app bundling | the maker's reference only |

Notes:
- **Pixabay caveat:** don't distribute a Pixabay track *as a standalone downloadable file* and don't
  let the app "claim/restrict/monetise" the original track. Embedding a loop in the app is fine.
- **Amacha caveat:** the file may not be sold or redistributed on its own, and you must not register
  the resulting work with a rights body (JASRAC etc.). Using it as location BGM inside the app is
  explicitly permitted; a user extracting it from the bundle is their violation, not yours — but if
  you want zero residual risk, prefer CC0/Pixabay for the shipped default and keep Amacha for the
  Japanese-mood slots you care about most.
- **Incompetech compliance:** standard credit format is
  `"<Title>" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0`.
  If you don't want a credits screen, use FreePD (same composer, CC0) instead.

---

## 3. Per-location music map (moods → sources → picks)

Locations follow the Bloomsbury grid (`WORLD-BIBLE.md` §Location Grid) plus the Study Hall
(`07-study-hall.md`). Each row gives the **mood**, the **canonical location**, the **recommended
source path** (verified browse/search URLs), and a **default pick strategy**. Audition every track
before shipping — I list confident-real entry points, not fabricated filenames.

| Mood (brief) | Academy location | Feel | Recommended source + browse path | Pick strategy |
| --- | --- | --- | --- | --- |
| **Campus / quad** | L01 Gower St, **L02 Main Quad**, L06 Errand Loop | open-air, calm, hopeful; light birdsong bed OK | Pixabay `pixabay.com/music/search/genre/beats/` + `.../search/lofi/`; Chosic `chosic.com/free-music/lofi/` | mid-tempo lofi w/ acoustic guitar or Rhodes; keep it un-busy |
| **Classroom** (lesson / activity) | core activity screens, placement | focused, neutral, "gentle school morning" | Pixabay `.../search/acoustic/` or `.../search/piano/`; Amacha ほのぼの (honobono) & ピアノ | soft piano or muted marimba, no strong hook that competes with reading |
| **Library** (quiet drafting) | **L05 Tavistock Sq "Quiet Table"** | very low-stimulation, sparse | Chosic `chosic.com/free-music/ambient/`; Pixabay `.../search/ambient/`; Amacha 癒し (iyashi) | ambient pad / slow piano, minimal percussion; lowest volume default |
| **Pub / social** | after-school social scene | warm, convivial, a little jazzy | Pixabay `.../search/jazz/`; Amacha ジャズ; FreePD "Comedy/Upbeat" for lighter rooms | relaxed jazz trio / swing brush kit; keep tasteful, not comedic |
| **Ramen shop** | evening L06 errand/food scene | cozy, bustling-but-warm, evening | Pixabay `.../search/lofi/` + `.../search/jazz/`; Amacha 和風 (wafū / Japanese-style) if present | lofi + light shamisen/koto colour or warm jazz; a low crowd-murmur SFX bed (see §5 note) optional |
| **Gym / club** | after-school sports club | energetic, upbeat, driving | Pixabay `.../search/upbeat/` or `.../search/electronic/`; FreePD "Upbeat" | faster tempo, still non-aggressive (no combat/EDM drops — it's a school) |
| **Study Hall** (自習室) | **L07 / Study Hall** review room | calm, warm, "quiet afternoon room" | Amacha 癒し + ピアノ; Pixabay `.../search/lofi/`; FreePD "Piano" | slow lofi or solo piano; must sit *under* the hana-maru/marking SFX (duck on stamp) |
| **Tender / emotional** | arc endings, L07 reflection beats | soft, sincere, a little melancholy-hopeful | **FreePD** `freepd.com/romantic.php` + "Piano"; Amacha 感動 (kandō / moving) & 癒し | solo piano or strings pad; reserve for authored story beats, never loop under practice |

**Concrete confident-real starting picks** (verify licence + audition):
- Tender/emotional & classroom piano — **Kevin MacLeod** solo-piano works via **FreePD** (CC0) or
  Incompetech (CC-BY). A well-known light one: *"Carefree"* (Kevin MacLeod). Prefer the FreePD copy
  to avoid the attribution obligation.
- Japanese-mood slots (ramen, study hall, tender) — **甘茶/Amacha** category pages are the fastest
  win: 癒し (healing), ピアノ (piano), ジャズ (jazz), 感動 (moving). All no-attribution.
- Everything else — **Pixabay Music** genre/mood search is the deepest, lowest-friction well; filter
  to instrumental, download the loop, host it in the app bundle.

**Volume/loop guidance:** normalize beds to roughly −18 to −20 LUFS so they sit under speech/SFX;
loop with a short crossfade (see §4 crossfade helper — reuse for bundled tracks too); default
per-location gain in the library/study/tender slots lower than campus/gym.

---

## 4. Optional YouTube jukebox — design

A **per-location config the maker fills with their own video IDs.** Off by default. This is the
"bring your own music" escape hatch for makers who want real lofi-radio streams without hosting
files. It is a **privacy/network trade-off** and must be presented as one.

### 4.1 Config schema

```ts
// academy/audio/jukebox-config.ts — data only; the maker edits videoIds.
export interface JukeboxTrack {
  videoId: string;      // 11-char YouTube ID the maker supplies
  title?: string;       // shown in the "now playing" text (accessibility: text equivalent)
  start?: number;       // optional seek-in seconds
}
export interface LocationJukebox {
  locationId: string;   // matches WORLD-BIBLE location IDs: 'L01'..'L07', 'study-hall'
  label: string;        // human label for the settings UI
  tracks: JukeboxTrack[]; // empty by default; maker fills
}

export const ACADEMY_JUKEBOX: LocationJukebox[] = [
  { locationId: 'L02',         label: 'Main Quad',   tracks: [] },
  { locationId: 'L05',         label: 'Quiet Table', tracks: [] },
  { locationId: 'L07',         label: 'Open Door Desk / Study Hall', tracks: [] },
  { locationId: 'gym',         label: 'Sports Club', tracks: [] },
  { locationId: 'ramen',       label: 'Ramen Shop',  tracks: [] },
  { locationId: 'pub',         label: 'Common Room', tracks: [] },
  { locationId: 'tender',      label: 'Story beats', tracks: [] },
];
```

### 4.2 Background iframe player (IFrame Player API)

```ts
// academy/audio/jukebox.ts
// Loads ONLY when sound !== 'off' AND the user has opted into the YouTube jukebox.
let ytApiReady: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (ytApiReady) return ytApiReady;
  ytApiReady = new Promise((resolve) => {
    // youtube-nocookie is not offered for the API script; the PLAYER embeds nocookie (see host).
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytApiReady;
}

export interface Jukebox {
  playLocation(locationId: string): void;
  setMuted(muted: boolean): void;   // wired to the app mute toggle
  stop(): void;
}

export async function createJukebox(hostEl: HTMLElement): Promise<Jukebox> {
  await loadYouTubeApi();
  let queue: JukeboxTrack[] = [];
  let idx = 0;

  const player = new (window as any).YT.Player(hostEl, {
    host: 'https://www.youtube-nocookie.com',   // privacy: no tracking cookie
    width: 0, height: 0,                          // visually hidden (audio-only intent)
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: (e: any) => { e.target.mute(); /* browsers require muted autoplay */ },
      onError: () => nextTrack(),                 // 101/150 = embedding disabled → skip
      onStateChange: (e: any) => {
        if (e.data === (window as any).YT.PlayerState.ENDED) nextTrack();
      },
    },
  });

  function loadCurrent() {
    const t = queue[idx];
    if (!t) return;
    player.loadVideoById({ videoId: t.videoId, startSeconds: t.start ?? 0 });
    announceNowPlaying(t.title ?? t.videoId); // text equivalent for screen readers
  }
  function nextTrack() {
    if (!queue.length) return;
    idx = (idx + 1) % queue.length;
    loadCurrent();
  }

  return {
    playLocation(locationId) {
      const cfg = ACADEMY_JUKEBOX.find((l) => l.locationId === locationId);
      queue = cfg?.tracks ?? [];
      idx = 0;
      if (queue.length) loadCurrent(); else player.stopVideo();
    },
    setMuted(muted) { muted ? player.mute() : player.unMute(); },
    stop() { player.stopVideo(); },
  };
}
```

### 4.3 Compliance / UX caveats (must surface in the maker docs)

- **Off by default; explicit opt-in.** A youtube.com iframe is a third-party tracking surface —
  incompatible with the app's local-first stance unless the learner chooses it. Gate behind a
  settings toggle *and* the global `sound` setting; never auto-instantiate.
- **`youtube-nocookie.com` host** to minimise tracking. Still discloses an IP/embed to Google.
- **Muted autoplay only.** Autoplay policy blocks audible autoplay without a gesture; start muted,
  the app's mute/unmute toggle calls `unMute()` after the learner interacts.
- **`onError` skip.** Videos with embedding disabled return error 101/150 — the queue must skip to
  the next track, never dead-air.
- **Hidden-player ToS grey area.** A zero-size player that plays only audio can be read as against
  YouTube ToS. Because the maker supplies the IDs and opts in, keep it a documented BYO feature, not
  a shipped "radio." Do not strip/mirror audio out of the player.
- **Text equivalent.** `announceNowPlaying(title)` into an ARIA live region so the track is never a
  sound-only signal (Bible accessibility rule).

---

## 5. WebAudio SFX synthesis recipes (no asset files)

All eight cues are synthesized at runtime. Drop this into `academy/audio/sfx.ts`. Design:
a lazily-created `AudioContext`, a **two-bus** master (`musicGain` + `sfxGain`) so SFX can duck
music, and every `play*()` no-ops unless the `sound` setting allows it.

### 5.1 Shared engine

```ts
// academy/audio/sfx.ts
let _ctx: AudioContext | null = null;
let _sfxBus: GainNode | null = null;
let _musicBus: GainNode | null = null;

/** 'off' plays nothing; 'sfx' plays cues but not music beds; 'full' plays both. */
let _mode: 'off' | 'sfx' | 'full' = 'full';
export function setSoundMode(m: 'off' | 'sfx' | 'full') { _mode = m; }

function ctx(): AudioContext {
  if (!_ctx) {
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    _ctx = new AC();
    _sfxBus = _ctx.createGain();   _sfxBus.gain.value = 1;
    _musicBus = _ctx.createGain(); _musicBus.gain.value = 1;
    _sfxBus.connect(_ctx.destination);
    _musicBus.connect(_ctx.destination);
  }
  if (_ctx.state === 'suspended') void _ctx.resume(); // needs a prior user gesture
  return _ctx;
}
function sfxBus(): GainNode { ctx(); return _sfxBus!; }
export function musicBus(): GainNode { ctx(); return _musicBus!; }

/** Momentarily duck music while a cue plays (e.g., stamp/level-up). */
export function duckMusic(depth = 0.35, hold = 0.25) {
  if (_mode !== 'full' || !_musicBus) return;
  const t = ctx().currentTime, g = _musicBus.gain;
  const base = g.value;
  g.cancelScheduledValues(t);
  g.setValueAtTime(base, t);
  g.linearRampToValueAtTime(base * (1 - depth), t + 0.03);
  g.linearRampToValueAtTime(base, t + 0.03 + hold);
}

function noiseBuffer(seconds: number): AudioBuffer {
  const c = ctx();
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** True only when SFX are allowed. Every play*() guards on this. */
function sfxOn(): boolean { return _mode !== 'off'; }
```

### 5.2 The eight cues

```ts
// 1) SOFT UI CLICK — tiny, short triangle blip that drops in pitch. ~60ms.
export function playClick() {
  if (!sfxOn()) return;
  const c = ctx(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(660, t);
  o.frequency.exponentialRampToValueAtTime(440, t + 0.03);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.005); // attack
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); // decay
  o.connect(g).connect(sfxBus());
  o.start(t); o.stop(t + 0.07);
}

// 2) CONFIRM — pleasant rising two-note (D5 -> A5). ~220ms.
export function playConfirm() {
  if (!sfxOn()) return;
  const c = ctx(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(587.33, t);       // D5
  o.frequency.setValueAtTime(880.0, t + 0.09);  // A5 (step, not slide)
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
  g.gain.setValueAtTime(0.12, t + 0.09);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(sfxBus());
  o.start(t); o.stop(t + 0.24);
}

// 3) PAGE-TURN — "shhhk": noise burst through a downward-sweeping bandpass. ~300ms.
export function playPageTurn() {
  if (!sfxOn()) return;
  const c = ctx(), t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(0.35);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(3200, t);
  bp.frequency.exponentialRampToValueAtTime(1100, t + 0.28); // paper "slide"
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.06); // swell
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(bp).connect(g).connect(sfxBus());
  src.start(t); src.stop(t + 0.35);
}

// 4) HANA-MARU STAMP THUNK — noise impact transient + low pitched body. ~200ms.
export function playStamp() {
  if (!sfxOn()) return;
  duckMusic(0.4, 0.2);
  const c = ctx(), t = c.currentTime;
  // impact click
  const n = c.createBufferSource(); n.buffer = noiseBuffer(0.05);
  const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1800;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.35, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  n.connect(nf).connect(ng).connect(sfxBus());
  n.start(t); n.stop(t + 0.05);
  // low body thunk
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(sfxBus());
  o.start(t); o.stop(t + 0.2);
}

// 5) UNLOCK CHIME — two bell notes (A5, D6), each an inharmonic pair for shimmer. ~600ms.
export function playUnlock() {
  if (!sfxOn()) return;
  const c = ctx(), t = c.currentTime;
  [880.0, 1174.66].forEach((f, i) => {
    const start = t + i * 0.08;
    const o = c.createOscillator(), o2 = c.createOscillator();
    const g = c.createGain(), g2 = c.createGain();
    o.type = 'sine'; o2.type = 'sine';
    o.frequency.value = f;
    o2.frequency.value = f * 2.01; // slightly detuned overtone = bell timbre
    g2.gain.value = 0.3;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    o.connect(g); o2.connect(g2).connect(g); g.connect(sfxBus());
    o.start(start); o2.start(start); o.stop(start + 0.5); o2.stop(start + 0.5);
  });
}

// 6) LEVEL-UP ARPEGGIO — ascending C major (C5 E5 G5 C6), triangle for a soft chiptune. ~450ms.
export function playLevelUp() {
  if (!sfxOn()) return;
  duckMusic(0.35, 0.4);
  const c = ctx(), t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const start = t + i * 0.09;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.13, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    o.connect(g).connect(sfxBus());
    o.start(start); o.stop(start + 0.2);
  });
}

// 7) ERROR TICK — gentle low descending square, lowpassed so it never stings. ~140ms.
//    Non-punishing by design (Bible: no penalty framing).
export function playError() {
  if (!sfxOn()) return;
  const c = ctx(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  o.type = 'square';
  o.frequency.setValueAtTime(240, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(lp).connect(g).connect(sfxBus());
  o.start(t); o.stop(t + 0.15);
}

// 8) DOOR CREAK — sawtooth body rising in pitch, high-Q bandpass for the wood "eee",
//    plus a fast square LFO on the gain for stick-slip grind. ~800ms.
export function playDoorCreak() {
  if (!sfxOn()) return;
  const c = ctx(), t = c.currentTime, dur = 0.8;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(90, t);
  o.frequency.linearRampToValueAtTime(150, t + dur * 0.7);
  o.frequency.linearRampToValueAtTime(120, t + dur);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass';
  bp.Q.value = 12; bp.frequency.value = 320;            // resonant wood tone
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.1);        // base envelope (peak 0.08)
  g.gain.setValueAtTime(0.08, t + dur - 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  // stick-slip grind: LFO SUMS into the gain AudioParam (range ~0.02..0.14)
  const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28;
  const lfoGain = c.createGain(); lfoGain.gain.value = 0.06;
  lfo.connect(lfoGain).connect(g.gain);
  o.connect(bp).connect(g).connect(sfxBus());
  o.start(t); lfo.start(t);
  o.stop(t + dur); lfo.stop(t + dur);
}
```

### 5.3 Integration notes

- **First-gesture warm start.** Browsers create the `AudioContext` in `suspended`; the first
  `play*()` after any click resumes it. Call `ctx()` once on the first learner interaction so the
  earliest cue isn't dropped.
- **Never sound-only.** Pair each cue with the existing visual/text state change: `playStamp()`
  fires alongside the hana-maru draw + "Perfect period" text + ARIA live message; `playError()`
  fires with the correction text + icon, never alone.
- **Ducking.** `playStamp()` / `playLevelUp()` call `duckMusic()` so the celebration reads over the
  bed. Only ducks in `full` mode.
- **Bundled-track playback** reuses `musicBus()`: decode the CC0 loop, `source.loop = true`,
  `source.connect(musicBus())`. Crossfade on location change by ramping the old source's gain to 0
  and the new one from 0 over ~1.5s.
- **Volume tuning.** Peak gains here sit at 0.07–0.35; if the mix feels hot, scale `_sfxBus.gain`
  globally rather than editing each cue.
- **Tests / jsdom.** Guard `_ctx` creation and no-op when `window.AudioContext` is undefined so the
  Academy modules stay unit-testable headless (same pattern the study-hall canvas code uses).

---

## 6. Sources

Music libraries:
- [Pixabay Content License](https://pixabay.com/service/license-summary/) · [Pixabay Music](https://pixabay.com/music/)
- [FreePD.com (CC0)](https://freepd.com/) · [FreePD "Romantic"](https://freepd.com/romantic.php) · [FreePD on Internet Archive](https://archive.org/details/freepd)
- [Chosic — CC0 / no-attribution filter](https://www.chosic.com/free-music/all/?attribution=no) · [Chosic Lo-Fi](https://www.chosic.com/free-music/lofi/) · [Chosic Ambient](https://www.chosic.com/free-music/ambient/)
- [甘茶の音楽工房 (Amacha)](https://amachamusic.chagasi.com/) · [Amacha terms of use](https://amachamusic.chagasi.com/terms.html) · [Amacha 癒し (healing)](https://amachamusic.chagasi.com/image_iyashi.html)
- [Incompetech — Kevin MacLeod (CC-BY 4.0)](https://incompetech.com/music/royalty-free/music.html) · [Incompetech licenses](https://incompetech.com/music/royalty-free/licenses/)
- [DOVA-SYNDROME (per-track terms)](https://dova-s.jp/en/) · [DOVA license](https://dova-s.jp/en/contents/license)
- [Freesound (filter CC0)](https://freesound.org/) · [ZapSplat CC0 sound effects](https://www.zapsplat.com/license-type/cc0-1-0-universal/)

APIs / references:
- YouTube IFrame Player API (`https://developers.google.com/youtube/iframe_api_reference`) and the privacy-enhanced `youtube-nocookie.com` embed host.
- MDN Web Audio API (`https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API`) for the oscillator/gain/filter graph patterns used in §5.
