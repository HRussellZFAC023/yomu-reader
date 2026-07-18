# Yomu Academy — Story Authoring Plan (2026-07-18)

I have everything needed — the design canon is essentially complete on paper; the gap is authored, wired, validated scene content. Here is the memo.

---

# Yomu Academy — Story Gap Analysis & Authoring Plan

**Scope of this memo:** understand-only. No story authored yet. Everything below is grounded in the actual runtime files and the eight-document story bible under `apps/yomu-reader/docs/academy/story/`. Counts were independently verified against source.

**Headline finding:** the *narrative design* is finished. The 48-chapter arc, the season shape, the causal spine, the ending, the per-character continuity schedule, the callback budget, the chapter→lesson→location linkage, the v2 schema, and the voice direction all exist as reviewed docs. What does **not** exist is authored, schema-valid, runtime-loadable **scene content** for 46 of 48 chapters — plus the generalized engine to load it. The owner's "finish the story before voice" is therefore a *production* problem against a *settled* design, not a design problem. That is the good news: authoring can start immediately and in parallel, against a fixed spec.

---

## 1. Current state (verified counts)

### What is authored to playable depth
| Layer | Runtime status | Real spoken bilingual lines |
|---|---|---|
| **Arrival bridge** `bridge:opening-arrival` (3 scenes) | Playable, compiled `story-package.v2` | **4** line nodes / 8 JA strings — `story-sources/opening-arrival-bridge.v2.json` |
| **Ch 1 `s1e01-the-blank-atlas`** (11 scenes) | Playable, the only canon `story-package.v2` chapter | **19** line nodes, 4 choices / 9 options, bands `{foundation, n5}` — `s1e01-the-blank-atlas.v2.json` |
| **N3 batch `s3e01`–`s3e06`** (ch 25–30, 1 scene each) | Playable via `n3StoryArcForEpisode()`, lightweight programmatic `StoryPlayableArc` | **24** line nodes (6 episodes × 4), 6 choices, bands `{n3, n2}` — `n3-story-batch.ts` |
| **Lesson-story catalog** (42 entries, Lesson 0 → l2-l16) | Loads as a **name-only continuity bridge**, *not* independently playable VN | **45** dialogue turns — but only in the 15 `l2-l02..l2-l16` world-continuity entries (need/model/transfer × 15) — `lesson-story-catalog.ts` |

**Total real character-spoken bilingual dialogue in the entire product today: ≈ 92 lines** (19 + 4 + 24 + 45).

**Playable chapters today: 7 of 48** — Ch 1, plus Ch 25–30. Note the inversion: the only playable "later" content is the **Season 3 opener**; the entire **Season 2 (Ch 13–24) is unwritten as scenes**, and Ch 2–12 (rest of Season 1) are unwritten.

### What is a thin bridge, not story
The 42-entry `lesson-story-catalog.ts` is by explicit design (`lesson-story-catalog.ts:90-93`) "a deliberately small, name-only continuity layer … without adding a second plot track." Of its content, **168 blocks are framing prose, not conversation**: 42 `setup` + 42 `handoff` + 84 `callback` (meaningNow + fallback), verified by grep. Do **not** count these toward a dialogue/voice target — they are narration glue.

### What is metadata-only stub
- `season-one-fiction.json`: **24 episodes**, of which **23 are synopsis-only** (title/ordinal/storyBeat/emotionalTurn/cast/minigame, **zero scenes, zero JA**). `playableArc()` returns `undefined` for all of them → "Not available."
- **Class events**: 9 defined, **only 1 playable** (`event:open-doors`); 8 planned — `class-event-catalog.ts`.
- **World**: 15 of 32 locations authored (arrival line + one drill + one stamp); 17 are `locked(...)` stubs. The **entire Japan region is unreachable**. Per-place narrative is one arrival line — there is no multi-beat dialogue in the world layer.
- Raw fiction seed banks exist (`himitsu-fiction-seeds.json` 28 KB, `majime-fiction-seeds.json` 26 KB) but are **not wired to the runtime** — input material only.

### The two hard truths that shape everything
1. **The generalized v2 loader does not exist.** Only `compileOpeningArc()` handles the opening arc, and `playableArc()` dispatches exactly `s1e01` + the 6 N3 episodes (`story-runtime.ts:307-309`). Authoring 46 more `story-package.v2` JSON files will **not load** until the BACKLOG engine items (`docs/academy/story/BACKLOG.md:20-25`) ship: v2 parser, generic compiler/loader, the 17 validators, the location alias resolver, the relationship manifest, and the class-thread compiler.
2. **Seasons 3–4 have no lesson spine.** Registered lesson packages stop at N4 (`l2-*`); there are **no N3/N2/N1 packages** (`CONTENT-LINKAGE.md:11-13`). Story *teaching* lines for Ch 25–48 point at functions whose grounded lessons don't yet exist, so those chapters can be authored but cannot be marked *playable/grounded* until the lessons land.

---

## 2. The gap, as a structure

"Finished story" per the bible = **48 canonical chapters, 12 per season, one finite causal spine ending at graduation** (`STORY-BIBLE.md:5-7`). Against that:

| Deliverable | Exists | Missing | Notes |
|---|---|---|---|
| Canon chapters authored as scenes | 1 full (Ch1) + 6 light (Ch25–30) | **41** | Ch 2–24 and 31–48 |
| Season 2 (Ch 13–24) | metadata synopses only | **12 chapters of scenes** | highest-leverage: plot/cast/beats already specified |
| Class-continuity beats (24 people × 5) | scheduled in matrix, ~5 audited on paper | **~120 beats to dramatize** into scenes | `RELATIONSHIP-MATRIX.md` fixes chapter placements |
| Plot callbacks (10 families, seed→payoff) | budgeted in ledger | **~40 transitions to author into scenes** | `CALLBACK-LEDGER.md` fixes every seed/echo/transform/payoff to a chapter |
| Class-thread scenes | 0 authored | ~1 per chapter target | schema exists (`MessageNode`), compiler does not |
| Elective appointment routes | 0 | 6 per `bond-authored` character (count TBD by owner) | gated behind a separate reviewed manifest |
| N3/N2/N1 lesson packages | 0 | families for Ch 25–48 | blocks *playability*, not *authoring* |

### Line-count target (this is the "well over 400")
Using the bible's own pacing (`STORY-BIBLE.md:218-224`, `NARRATIVE-STREAM.md:54-73`: normal chapter ≈ 18–36 story turns per scenelet, 1–2 scenelets, ~60–70% spoken):

| Bucket | Chapters/units | Spoken lines (semantic) | JA band variants (×≥2) |
|---|---|---|---|
| Canon spine, Season 1 | 12 | ~260 | ~520 |
| Canon spine, Season 2 | 12 | ~290 | ~580 |
| Canon spine, Season 3 | 12 | ~300 | ~600 |
| Canon spine, Season 4 | 12 | ~320 | ~640 |
| **Canon subtotal** | **48** | **≈ 1,150–1,400** | **≈ 2,300–2,800** |
| Class-thread scenes | ~24 | ~170 messages | ~340 |
| Elective appointments (if in scope) | per `bond-authored` route | +100–500 | +200–1,000 |

**The canon spine alone is ~1,150–1,400 semantic spoken lines (~2,300+ authored JA variants), against ~92 today.** That clears "well over 400" by a wide margin even before threads and appointments. The "~323 / expect 400+" figure the owner heard was almost certainly counting framing prose + band variants of the thin bridge, not conversation; the true dialogue gap is ~92 → ~1,300.

---

## 3. Proposed arc (this is canon — ratify, do not reinvent)

The arc is already fully specified in `STORY-BIBLE.md`. I recommend adopting it verbatim as the spine; it is internally load-bearing (removing any causal link breaks the next — `STORY-BIBLE.md:143-157`). Summary for the authoring team:

**Throughline — "The Lantern Atlas":** an adult evening class inherits a stalled exhibition atlas with one empty route and missing labels. Over four terms they build it, exhibit it, discover an old **unattributed caption**, and must resolve **authorship and consent** rather than a magic mystery. The mature question is *"whose voice is this, and who may carry it forward?"* It ends at graduation with the atlas closed once and a blank page offered to the next class *under terms they chose*. No magic; the atlas's "responsiveness" is Angel/Henry's projection chain plus many human contributors (`STORY-BIBLE.md:159-171`).

**Per-act shape (each season = a school term and a production arc):**
- **S1 Open Doors** (Lesson 0 → core N5; autumn rain). Strangers become a class; the atlas becomes their shared problem. Ends: Jenny's failed solo becomes an ensemble success, route still incomplete. Ch 1–12, IDs `s1e01`–`s1e12`.
- **S2 The Rebuilt Map** (late N5 → N4; winter). They rebuild the route and stage the first exhibition — then mistake a successful event for a finished story. Ends: Rose finds the old unattributed caption. Ch 13–24, reusing legacy IDs `s1e13`–`s1e24`.
- **S3 Borrowed Voices** (N3 → N2; spring). Public success forces attribution, editing, and consent to split the class. Ends: they publish a permission page and withhold what isn't theirs. Ch 25–36, `s3e01`–`s3e12`.
- **S4 The Next Page** (N2 → N1; summer). Provenance resolves to *layered stewardship, not a single owner*; the public evening tests their terms; graduation lets each person keep an open future. Ch 37–48, `s4e01`–`s4e12`.

**How bonds develop (fixed, `RELATIONSHIP-MATRIX.md`):** the design deliberately refuses 24 parallel romance ladders. Two interoperable forms:
- **Class continuity** — every story-eligible non-textbook person gets exactly **5 beats** (arrival → contribution → limit → return → future) at *scheduled* chapters. Arrivals cluster S1–2, limits S2–3, returns/futures S3–4. This is mandatory ensemble scaffolding, already placed per person.
- **Elective appointments** — only `bond-authored` characters (a *separate* reviewed manifest, not story-eligibility) may offer 6 optional, defer-friendly appointments. No affection score, no romance rank; friction/repair shows as *changed work*, not confession.

**Tone (fixed, `VOICE-AND-DIALOGUE.md`):** warm adult friendship, practical comedy, quiet mystery, earned emotion. Understated rainy-evening register; honorifics auto-rendered (Rie → りえ先生, everyone else `-san`, `angel` → **Onke-san**). Each character has a 5-field voice card; the **underPressure** failure mode drives every friction beat (Rie takes one job too many; Sam asks a second inclusion question; Jenny goes silent). Narration names only what a camera or ear could register — no diagnosing silences, no announcing the moral. Comedy callbacks (cold tea, wrong charger, paper cat, "seventy percent") are budgeted families, suspended during any boundary/refusal/apology beat.

**Callbacks (fixed, `CALLBACK-LEDGER.md`):** 10 plot callbacks, each with an exact seed/echo/transform/payoff chapter and a use budget (e.g. `callback:open-chair` seeds in the bridge, transforms at Ch 29 when Jenny declines a role, pays off at Ch 48's offered blank page). These are the connective spine across chapters — author them as families, not ad hoc.

I am **not** proposing new canon. Where the bible leaves a genuine fork (learner voice, narrator, appointment scope, 24-vs-48 ratification), those are surfaced in §5 rather than decided here.

---

## 4. Authoring plan (executable as a parallel workflow)

### 4.0 Standardize the format
Adopt **`story-package.v2` JSON**, one file per chapter, mirroring `s1e01-the-blank-atlas.v2.json`, for **all 48 canon chapters** (`SCRIPT-ARCHITECTURE.md:42-66` mandates this). Retire the lightweight `n3-story-batch.ts` programmatic path — migrate its 6 episodes (Ch 25–30) into v2 packages during Season 3. Rationale: the batch path has **no graph validation** (choice→line→`:close` string-munging), so it cannot carry canon safely at scale.

### 4.1 Two parallel tracks (both start now)
**Track A — Engine (blocks *loading*, not *authoring*).** Build the BACKLOG engine items in order (`BACKLOG.md:18-25`): 24→48 migration ADR; generic `story-package.v2` parser + compiler/loader (generalize `compileOpeningArc`); the 17 static validators (`SCRIPT-ARCHITECTURE.md:356-376`); the `location:*` → `WorldPlaceId` alias resolver; the relationship manifest (`continuity-only` / `bond-authored` / `hold`); the class-thread compiler. Route `playableArc()` off the compiled catalog instead of the hard-coded `s1e01`/N3 dispatch.

**Track B — Content (the bulk of the line count).** Author chapters as v2 JSON against the frozen schema **immediately**, validated statically, independent of Track A's landing. This is what satisfies "story before voice." Fan out by chapter, but **group by callback family and season** so seed→payoff coherence is preserved (author `callback:open-chair` seed before its Ch 29 transform).

### 4.2 Per-chapter work unit (fully specified inputs already exist)
Each chapter's authoring ticket is pre-populated from the docs — the author does not invent structure, only writes lines:

| Input | Source |
|---|---|
| Canonical ID, title, plot turn, learning+relationship job | `STORY-BIBLE.md` season tables |
| Lead + supports (1 lead, ≤2 supports, ≤2 reactive) | `RELATIONSHIP-MATRIX.md` (who has a beat this chapter) |
| Continuity beat(s) to dramatize | `RELATIONSHIP-MATRIX.md` finite-plot schedule |
| Callbacks to seed/echo/transform/pay off | `CALLBACK-LEDGER.md` |
| Lesson reservoir + transfer function | `CONTENT-LINKAGE.md:47-92` chapter→package table |
| Location(s) + required 4 location affordances | `CONTENT-LINKAGE.md:30-44` |
| Per-speaker voice cards | `VOICE-AND-DIALOGUE.md` + `character-personality-bonds.ts` |

**Line budget per chapter:** ~2 scenes, each with the 7-beat semantic rhythm (`SCRIPT-ARCHITECTURE.md:170-179`); ~20–30 spoken `line` nodes + 1–2 `choice` nodes (2–3 options) + `narration`/`stage`/`activity`/`checkpoint`/`command` nodes. Each `line` authored in **its native band + the adjacent lower support band** (S1 → foundation+n5; S2 → n5+n4; S3 → n3+n2; S4 → n2+n1); NG+/other bands are up-projected at replay time, not authored now.

### 4.3 JA source-backing workflow (the accuracy gate)
Per `VOICE-AND-DIALOGUE.md:146-156` and the source rules:
1. Write the human want + changed action in plain prose; assign each beat to the person whose attention changes it.
2. Draft semantic intents/boundaries, then **draft Japanese at the target band directly** (JA is primary authoring, not a translated English line — `VOICE-AND-DIALOGUE.md:116-129`).
3. **Never paste textbook (Genki/Minna/soya) dialogue.** `sourceSafety.externalDialogueUsed` stays `false`, `originalYomu` `true` (enforced, `story-runtime.ts:527-535`). Teaching content is *delegated* to the bound lesson's SHA-256-pinned, answer-after-attempt exercises; story lines own only the surrounding need/consequence and **may not teach a function earlier than its lesson introduces it** (Moodle chronology owns order — `SOURCE-PIPELINE.md:50-54`).
4. Preserve the 7 language-layer invariants across bands (who acts, what they want, what they know, claim strength, consent state, emotional pressure, next action).
5. Run the rejection tests (`VOICE-AND-DIALOGUE.md:159-171`) and the voice-stripping test (remove names; can you still identify the speaker?).

### 4.4 Validation (two gates, both required)
- **Static (automation):** the 17 v2 gates — unique IDs, reachable nodes/valid convergence, resumable checkpoints, registered+eligible cast (`eligibility.story`, likeness gating), 1-lead/≤2-support cap, source-safety booleans, registered lesson hooks (`requiredEvidence.activityId === hook.exerciseId`), no activity-completion command in story data, semantic invariants across layers, non-coercive refusal routes, callback lifecycle+budget, monotonic continuity cursors, chapter order complete 1–48, location→registry alias resolution, portrait hash match, voice-card + adjacent-contrast check.
- **Human:** adversarial cast-consent review (no romance/trauma/diagnosis/finances/nationality/family-history — `character-personality-bonds.ts:115-119`; forbiddenClaims per `CastUse`), **Japanese editorial review** for naturalness/register/recoverability, pedagogy review, narrative-continuity review, and copyright-similarity review against the research corpus (no Pokémon/Persona cadence or paraphrase — `VOICE-AND-DIALOGUE.md:10-14`).

### 4.5 Recommended sequencing (leverage order)
1. **Season 2 first (Ch 13–24).** Highest leverage: cast, plot turns, beats, callbacks, and lesson reservoir (`l1-l19`–`l2-l04`) already specified; it fills the current playable inversion (S3 exists, S2 doesn't) and rides *existing N4 lessons* (no lesson dependency). ~290 lines.
2. **Season 1 rest (Ch 2–12).** Rides Lesson 0 → N5, all lessons exist. Promote the 23 metadata synopses' worth that fall here. ~260 lines.
3. **Season 3 (Ch 25–36).** Migrate the 6 light N3-batch episodes into v2; author Ch 31–36. Content authored now, playability gated on N3/N2 lesson registration.
4. **Season 4 (Ch 37–48).** Gated on N1 lessons; author content in parallel, ship playability last.
5. Class-thread scenes and (if approved) elective routes as a second wave once the thread compiler and relationship manifest exist.

This is directly parallelizable: assign one author per chapter within a season-batch, one JA reviewer per season, one continuity/callback owner per callback family across seasons. Each chapter must pass the "one uninterrupted sentence" stream test (`NARRATIVE-STREAM.md:146-152`) before scripting: *"Because <person> wants <outcome> at <place>, the learner encounters <function>, proves it via <evidence>, uses it when <context changes>, therefore <fact> changes."*

---

## 5. Decisions for the owner (genuine forks only)

The bible settles the arc, cast, tone, callbacks, and schema. These are the forks canon does **not** close — each needs one ruling before scaled authoring:

1. **Ratify 48 chapters and run the migration.** Canon is contradictory in *code*: `season-one-fiction.json` declares 24 (and its validator enforces exactly 24), while the runtime overrides to 48 and `STORY-BIBLE.md` commits to 48 with a finite graduation ending. **Recommend: ratify 48**, execute the 24→48 ADR + event-projection migration (BACKLOG:18; `SCRIPT-ARCHITECTURE.md:379-397`: reproject 1-12 as S1, 13-24 as S2, map completed-24 profiles to `seasonTwoCompleted` not `graduated`). Everything downstream assumes this.

2. **Playability model: author-now, gate-later.** The whole spine cannot be playable now (generalized loader unbuilt; N3–N1 lessons don't exist). **Recommend: author all 48 to content-complete + schema-valid immediately** (voice-ready, which is the owner's stated goal), and **ship playability season-by-season** as Track A and the higher-band lessons land. Confirm this is acceptable vs. blocking authoring on engine+lessons.

3. **Band coverage per line.** **Recommend: author each chapter's native band + the adjacent lower support band only** (2 variants), with NG+/other layers up-projected at replay — not full 6-band authoring per line. Confirm, since it roughly halves the JA volume and defines the voice-line extraction surface.

4. **Learner + narrator identity.** No protagonist or narrator is defined anywhere in code. The bible implies a **silent, self-naming learner** (choices are stance/action, learner controls their name) and **objective narration** (camera/ear only). **Recommend: ratify silent self-insert learner + objective narrator.** If the owner wants a named/voiced protagonist instead, that must be decided before any scene is scripted — it changes every choice node and narration line.

5. **Elective appointments: in or out of this pass.** The 24×5 class-continuity beats are already scheduled and are mandatory. Elective 6-appointment `bond-authored` routes are optional, gated behind a *separate* reviewed manifest + per-character consent, and could add 100–500+ lines. **Recommend: continuity-only for the first pass; defer bond-authored routes to a second wave** with explicit owner consent per character. Confirm which characters (if any) are `bond-authored`.

6. **Likeness-limited cast.** Only Rie, Sophie, Steve have `likenessRuntime: true`; most classmates are name-only/silhouette (Shin is silhouette-until-met by design). **Recommend: author all dialogue name-only now, portraits deferred** (matches "story before voice"). Confirm no scene is allowed to depend on an unapproved face — or approve additional likenesses if on-screen speakers are wanted sooner.

**Minor ratifications (bundle into #1):** rename `AcademyClassEvent.season` → `curriculumBand` (BACKLOG:19); keep Mary/Takeshi/Miller/Tawapon as sparse textbook-legend cameos with no continuity cursor (they have registry rows but no voice/bond — do not put words in their mouths until voice cards pass review); hold Shaun to story-only (no lesson ownership).

---

**Bottom line:** the design is done; the writing is not. ~92 authored dialogue lines exist against a ~1,150–1,400-line canon target. Authoring can begin now, in parallel by chapter, against a frozen spec — provided the owner ratifies 48 chapters, accepts author-now/gate-later playability, and picks the band-coverage and learner-voice defaults above. Start with Season 2 (Ch 13–24): fully specified, rides existing N4 lessons, and closes the current playable gap.

Key files: bible at `/Users/heru/Documents/Projects/yomu/apps/yomu-reader/docs/academy/story/` (STORY-BIBLE, NARRATIVE-STREAM, SCRIPT-ARCHITECTURE, VOICE-AND-DIALOGUE, RELATIONSHIP-MATRIX, CALLBACK-LEDGER, CONTENT-LINKAGE, BACKLOG); schema at `src/academy/content/story-runtime.ts`; reference chapter at `src/academy/content/story-sources/s1e01-the-blank-atlas.v2.json`; thin bridge at `src/academy/content/lesson-story-catalog.ts`; metadata stubs at `src/academy/content/story-sources/season-one-fiction.json`.