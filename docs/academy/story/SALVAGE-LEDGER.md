# STORY SALVAGE LEDGER — Yomu Academy Authoring Campaign

Consolidates five scan lanes (se-scenes, se-cast, se-world-comedy, se-edu, seed-banks, code-refs) against the current 48-chapter Lantern Atlas canon. Everything below is either `fits` (canon-consistent, pull as-is subject to JA review) or `adapt` (reuse the idea/beat, change the framing named). Contradictions are quarantined in §4.

**Standing guards (apply to every item):**
- All JA is `adapt`, never `verbatim` — every Japanese line/fragment must clear current naturalness/register review before authoring, even the "clean" ones.
- The bible has already assigned chapter owners. Do **not** reassign a canonical chapter back to a seed's real-source-participant `castCandidate` (Henry/Aakash/Tom/Nanako/Mira). Those names feed elective bond routes at most, and only Rie is likeness-cleared.
- No invented biography for real people (sharpest on Rie). Fictional composites must be tagged as invented, never asserted as real habit.

---

## 1. High-value salvage, by current chapter / system

### s1e01 — the-blank-atlas (the anchor chapter; richest salvage — effectively pre-drafted)
This chapter has the most convergent material across five lanes. A near-complete opening scene can be assembled rather than written cold.

| Beat | Source | Mode | How-to |
|---|---|---|---|
| **The spare chair** — unclaimed chair set apart, coat folded over back, blank name-card, `こんばんは`/`ここ、どうぞ` — "was going to stay empty tonight; it isn't now" | 09-special-scene-scripts.md PR.1; 04-location-arcs.md PR.1 | adapt | Realizes callback:open-chair seed verbatim-adjacent. The blank name-card that *stays* blank physically anchors the Ch48 "blank page under terms, no person assigned" payoff. |
| **Prologue arrival** — rain, Room B03 on the second try, Rie's "You made it. That's the hard part, honestly," `こんばんは！`/`どうぞ、どうぞ` | code-refs: `src/academy/story/prologue.ts` (PROLOGUE_SCENE) | adapt | Already-authored SceneScript. Lift stage/line beats; replace the 4-way motivation menu (see §4) with the canonical route-choice. |
| **Foundation-00 classroom-repair** — `もう一度お願いします`/`ゆっくり言います`/`はい、ゆっくり読みます`; model line `こんばんは。ヘンリーです。すみません、もう一度ゆっくりお願いします。` | code-refs: `release-worktrees/yomu-academy-rebuild-20260711/src/academy/foundation-course.ts` (Lesson 0) | adapt | Register-correct N5, exactly s1e01's job (greet / follow instruction / ask for repetition). Recast the model line off "Henry" to the learner. |
| **Classroom-repair texture** — ask for one more pass, check one kana aloud, write it | 01-scene-graph.md PR.4/PR.5 | adapt | Keep the humane "catch it on the second pass" feel. |
| **Consent-respecting learner-reason mechanic** — Rie asks what would be nice to do one day; learner taps a preset or "tell you later" (fully honoured); `うん。おぼえておくね`; never asks why, never scores/gates/routes | 09 PR.3 / 01-scene-graph.md | adapt | Mechanizes Rie's opening consent disclaimer. **Retire trip tokens** (for-the-trip / for-work-someday); keep for-the-stories / for-a-person / just-curious / tell-you-later. |
| **Rie coat/no-test opening lines** — `こんばんは。コート、そこにかけてください。` / `今日はテストなし。やくそく。` | 02-character-arc-matrix.md; 03-relationship-unlock-table.md | adapt | Register review, then drop into the classroom opening. |
| **Self-intro reservoir** — Mika/Tom `は`+`です`+hobby (`ゲームが好きです`) | code-refs: foundation-course.ts lesson-01-hajimemashite | adapt | Hobby lines align with canon interests; also seeds Mika→s1e04, Tom→s1e05. |

### s1e03 — route-zero (Aakash)
- **Wrong-object-permission gag** — first brave request is grammatically flawless but asks to photograph the wrong object; labels-vanish "asking-is-competence" beat. Source: himitsu `seed:camera-quest-zero` + `seed:the-quiet-route`. Mode: **adapt** (idea-only). Keep only the language-repair comedy; do **not** import the-quiet-route as Aakash solo-travel biography.
- **Aakash city-pop runner** — shares an earbud, "The lyrics are basically N5," queues three more songs before you answer. Source: code-refs `bonds.ts` (bond-aakash-0-citypop). Mode: **adapt**. The over-eager queuing *is* his flaw made comic.

### s1e05 — final-boss-kana (Tom)
- **Mock-grand-ranking comedy** — self-appointed captain drafts a heroic defeat speech, then learns they only finished the instructions page. Source: majime `seed:the-mock-exam-pact`; himitsu `comedy:mock-grand-ranking`. Mode: idea-only. Tone match for Tom's boss-battle framing. **Strip all Pokémon** (see §4).

### s1e06 — invitation-chain (Sam)
- **Sam generous-host framing** — feeds the table without asking if anyone's hungry; food is how this class says "I like you"; invitation-to-eat is his one competitive arena. Source: 09 C3.4. Mode: idea-only. Use to frame the invitation/refusal/first-explicit-consent beat; the okonomiyaki set-piece itself is idea-only.
- Seeds callback:overbuilt-schedule (over-optioned invitation) — see §2.

### s1e07 — no-spoilers (Francis)
- **Euphemism-wall comedy** — one member is an episode behind; safe synonyms for the villain get *more* suspicious than the forbidden answer, so the no-spoilers board becomes a wall of alarming euphemisms. Plus "stop explaining, start asking careful questions." Source: himitsu `seed:one-episode-behind` + `visual:cliffhanger-watch-club`. Mode: idea-only (premise already canon; owner Francis, not Aakash/Tom).
- **Opinion + single-reason bridge** (`と思う`/`から`) frames the reasoning beat. Source: 08 C4.3. Mode: adapt. **Order caveat:** do not bundle with te-form past (see §3/§4).

### s1e08 — menu-without-pictures (Shin)
- **Shin decodes a pictureless menu with visible uncertainty** — taps `肉`, "two little people tucked inside the meat… might be nonsense, but you'll remember it now, right?" then orders without panic. Source: 09 C3.3 / 01-scene-graph.md. Mode: adapt. Reframe as shape-based memory image, **not an etymology claim** (canon bans asserting etymology). The "might be nonsense" is a textbook embodiment of "expertise includes visible uncertainty."
- **Glyph-variation rotate-card reveal** — mnemonic specialist confidently narrates components for the *wrong* character before a quiet observer rotates the card. Source: majime `seed:the-character-that-changed-shape`. Mode: idea-only. Use an invented glyph pending linguistic review.

### s1e09 — story-in-two-tenses (Jodi)
- **Jodi's Tokyo memory** — old photo of a Tokyo that half-exists now; `昔ね、日本に住んでいたの。`/`この店、もうないんだ。でも、匂いは覚えてる。` Past/present held together without forcing one truth. Source: 09 C4.4; 06 C4.4. Mode: adapt. Exact learning+relationship job of s1e09 (`〜ていた`/`覚えてる`). **Drop the "we should go to Japan" ember**; point the memory-vs-permission tension at the central caption-provenance mystery instead. Strip the "lived in Tokyo" biography + real-photo-sharing.
- Thematic rhyme with s4e04 (three-true-versions) via majime `seed:the-rival-version` — two-true-versions structure. Mode: adapt, idea-only.

### s1e13 — dinner-by-if (Robert; reference v2 chapter)
- **Dinner-by-conditional** — each next action unlocked by a correct conditional; a surprise ingredient forces abandoning the recipe; a quieter learner's improvised contribution becomes the dish's defining feature; empty-plate-garnish gag. Source: majime `seed:dinner-by-conditional` + `visual:recipe-sequence`. Mode: idea-only. **Cross-check `s1e13-dinner-by-if.v2.json` before importing** so you don't duplicate authored content.
- **Robert `授業のあと、一杯どう？`** expansive-welcome-then-logistics. Source: 02; 03. Mode: adapt (his Arrival beat).

### s1e14 — two-answers (Sophie)
- **は/が courtroom** — particles as evidence cards, example sentences as witnesses, each new witness overturns the prior verdict, an objection also needs the correct particle. Source: himitsu `seed:the-particle-trial` + `visual:particle-courtroom`. Mode: adapt (staging/mechanic + art brief). **Keep Sophie as owner** — do not import the seed's Nanako-as-teacher lead.

### s1e15 — chorus-with-a-hole (Xingyu)
- **Perfectly-wrong study song** — irresistible chorus is grammatically wrong; the bad chorus is *why* the te-form distinction sticks; machine treats a humble preparation phrase as an arena-anthem climax. Source: majime `seed:the-perfectly-wrong-study-song` + `visual:grammar-concert`. Mode: idea-only. Echoes callback:quiet-count. Use an **original/unnamed melody** (no Hatsune Miku — §4).

### s1e16 — night-the-map-went-dark (Angel)
- **Literal-machine comedy** — study tool follows an imprecise instruction with technically-correct-but-useless output; peers diagnose the *prompt* together (not blame the tool); beautiful-but-wrong poster fixed via labeled input dials. Source: majime `comedy:literal-machine` + `visual:prompt-workshop`; himitsu `comedy:autocorrect-betrayal`. Mode: idea-only. Keeps the no-magic rule (AI = tool, not sentient authority); tonally supports callback:wrong-charger transform at s1e32.

### s1e18 — memory-card-museum (Stasi)
- **Mnemonic gallery, accuracy over applause** — funniest exhibit teaches a vivid *false* association; curator chooses accuracy over applause; public revision invites better submissions; corrected mnemonic is less majestic but unforgettable. Add-a-verification-step mechanic + "ceremonial moon banquet for an ordinary verb" gag. Source: majime `seed:the-memory-card-museum` + himitsu `seed:the-wrong-mnemonic` + `visual:mnemonic-exhibition`. Mode: idea-only. Merge both seeds into one reservoir.

### s1e19 — seventy-percent-door (Ruparna)
- **Comprehension-meter comedy** — subtitles fail mid-clip; solve the ending from tone/gesture/known words; a viewer mistakes a dramatic confession for a sandwich order because one food word drowns out the rest; understood words light up around the frame. Source: majime `seed:seventy-percent-is-a-door` + `visual:comprehension-meter`. Mode: idea-only (title/owner/turn already match). Seeds callback:seventy-percent.

### s1e21 — questions-in-the-dark (teach-back)
- **Explanation-that-talked-back** — synthetic audio hosts invite the narrator to explain the hardest point live, exposing a hidden contradiction; embarrassment becomes ownership via a re-recorded human explanation. Source: majime `seed:the-explanation-that-talked-back`. Mode: idea-only. Treat generated hosts as a tool; feeds callback:one-strong-question tone. (Alt home: s3e03-helpful-rewrite.)

### s1e22 — blank-space (Shaun)
- **Register-gap contribution** — returning learner finds the game-world built and feels replaceable until noticing every route needs a *missing* casual-dialogue/register system only their ear supplies; polite NPCs stay impeccably polite while fleeing a collapsing pastry tower; hand-drawn map with one blank space. Source: majime `seed:the-blank-space-on-the-board` + `visual:welcome-back-board`. Mode: idea-only. Reinforces callback:open-chair. **Keep Shaun as owner** (seed lists aakash — ignore).
- **Casual-form register beat** — `見る？` plain-form + rising tone as casual "wanna…?", `きいて` as て-form request. Source: code-refs `bonds.ts` (bond-tom-0-chestnut note fields). Mode: idea-only. **Take the teaching beat only; leave the dog behind** (§4). Alt home: Tom's s1e05 casual-speech thread.

### s1e23 — farewell-rehearsal (Nanako)
- **Farewell-meal-falls-apart** — abandon the over-optimized perfect plan, meet in the kitchen, each make one imperfect dish + say one postponed line; departure as the pressure. Source: himitsu `seed:four-seats-one-empty`. Mode: adapt. Maps near-verbatim to s1e23's job (intentions, before/after, gratitude, unfinished intentions). **Relocate from "island academy / distant research term" to the Academy kitchen** (§4).

### s3e02 / s3e11 / s4e11 — the caption-provenance mystery (strongest genuinely-new salvage)
- **The borrowed margin** — a well-used textbook whose margins hold two competing voices (bold advice + tiny near-giving-up admissions), assumed one author until the final page reveals a *chain of previous learners*; the reader adds their own honest note, turning the book from proof-of-success into a record of persistence. Source: himitsu `seed:the-borrowed-margin`. Mode: adapt. This is a small-scale rehearsal of the CENTRAL mystery ("the old caption has at least three contributors"). Adapt the object from a personal textbook to the atlas caption/backing. Feeds s3e11-names-in-the-margin (paper/ink/version traces), s3e02-caption-without-owner, s4e11-atlas-closes; the honest-note gesture can echo callback:useful-number-notebook.

### s3e06 — two-schedules (Angel) & the overbuilt-schedule callback
- **Angel's overbuilt colour-coded tabbed spreadsheet** — "just in case" tab, risk column with one classmate's row in red, "Of course she did." Source: 09 C5.10; 06 §3.6. Mode: adapt. Maps to callback:overbuilt-schedule + Angel's voice. **Invert the payoff polarity:** current arc requires the master plan to *break* (Ch13/Ch30) so Angel learns to expose assumptions and trust the ensemble — not triumph as the old doc has it. Use the `六時に、駅で`→`予約してあります` progression. Drop the "the trip is real now" payoff.

### s4e07 — journey-not-everyone-takes (Alex)
- **Alex's understated register** — delivers life-changing news "like a weekend errand," the room's small reaction (a pen stops, humming stops) *is* the scene. Source: 09 C5.7; 06 C5.7; 02. Mode: idea-only. VOICE only — feeds s4e07's job to resolve his departure "without making departure the brave choice." **Do not reuse the send-off-party / station-goodbye framing** (§4). Note placement is S4, not S1.

### CALLBACK-LEDGER (system)
- **cold-tea** — Rie's thermos + hanamaru (red-flower) marking ritual (code-refs `bonds.ts` bond-rie-0-marking); pub "pint of tea because she came" detail (06 §3.1) can seed Ch1 → Francis echo Ch7. Mode: adapt. Tea prop is the safe part; the noodle-plant "secret" is optional invented colour, tag as fictional.
- **overbuilt-schedule** — Angel spreadsheet (above) + Henry "app-instead-of-homework" (`アプリはできたけど、宿題はまだです`, 06 §3.2, shrink-to-ten-honest-minutes) + plan-by-committee/option-spiral comedy (himitsu `comedy:plan-by-committee`, majime `comedy:option-spiral`). Seed s1e06 → echo s1e13 → transform s3e06 → decline s1e39. Mode: adapt/idea-only.
- **wrong-charger** — Henry "builds an app to remember his passport instead of remembering it" (01 C5.2 / 09 C5.10). Mode: idea-only. Characterization only, drop trip context.
- **quiet-count** — Mika listening-booth "transcript toggle beside the play button" + `もう一度、いいですか` + drafting-a-hello comedy (04 lab / 06 §3). Seed Ch4. Mode: adapt.
- **seed→echo→payoff discipline** — author every persistent flag *both* ways (chosen-variant line AND equally warm neutral fallback) so skipping any optional beat costs no coherence. Source: 01 Graph / 09. Mode: idea-only, process hygiene.

---

## 2. Cross-cutting reuse (running jokes, rhythms, location beats)

- **Miller-san "always going to Kobe"** — textbook legend materializes, one flawless off-topic declarative (`わたしは来週、神戸に行きます。` / `わたしは会社員です。では、神戸へ。`), then a textbook-neat postcard payoff `神戸は いい町です。` Kobe is the textbook's own destination (not invented biography); needs no trip; one cameo per season. Source: 01 C1.3 / 09 C6.3; 02; 06 §3.5. Mode: adapt (`fits` as a role). **Keep him a clean model-sentence ghost — no emotional arc** (§4).
- **Tawapon the eternal student** — Miller's foil (working man vs eternal student); treats improbable setups as ordinary tasks. Deliberate cameo stiffness is the joke, only for these two legends. Source: 02 / 05 V5. Mode: adapt.
- **Christian's unexplained-prop-as-belonging rhythm** — a recurring prop nobody questions anymore ("an act of belonging"). Source: 09 C1.5; 06 §3.3. Mode: idea-only. **Transfer the rhythm onto his canon hot-room contraption — do NOT add the recorder as a second signature prop** (§4).
- **Rie "too many jobs" texture** — turns up delighted/exhausted/kind, quietly quizzing count/price at a till; tea goes cold while she keeps the room moving; "the world is the joke, not her." Source: 02; 06 §3.1. Mode: adapt. **Fictional composite only — never invent a real "nine jobs" life for the likeness-cleared real person** (§4). The konbini/till counting scenelet serves real N5 "in the wild."
- **Xingyu's humming-that-changes-function** — humming through a listening exercise becomes a review-while-listening study technique. Source: 02. Mode: adapt. **Original/unnamed melody only.**
- **Food-as-love-language** — someone over-orders and it's always fine; every meal carries real language (invitations, counters, inclusive planning). Source: 06 §2; 04. Mode: idea-only. Ties to Sam + Robert; over-orders-and-it's-fine pairs with Robert's "hosting includes silence, refusal, changed plans."
- **Teasing-with-repair / absence-does-not-break-belonging** friendship textures. Source: himitsu+majime `friendshipDynamics`. Mode: fits. Use as a voice/tone checklist for RELATIONSHIP-MATRIX Arrival/Return beats (comedy suspended from the first boundary/refusal/apology beat; returning learner resumes with recap, no guilt).
- **Location "one useful inspectable detail" discipline** — a place is established by one text-first inspectable detail holding a language hook (chalk menu price, platform time, "ready" state, carved kanji), never an abstract mood screen; reduced-motion hides no info; time-of-day is orientation, never a deadline. Source: 04 (visual-language + reduced-motion). Mode: fits → feed CONTENT-LINKAGE location-truth column.
  - Concrete inspectables ready to attach: `てある/ておく` wonky card table `机が動いています。`→`もう片づけてあります。` (04 studio); carved-kanji garden stone (Shin reading scenelet); listening-booth transcript toggle (accessibility beat, s1e19/Mika).
- **Inline "note" gloss riding a dialogue line** — SceneScript attaches a short pedagogy note to a spoken line (e.g. `のみますか` — offering is often just verb + ますか). Source: code-refs `prologue.ts`/`bonds.ts` note: fields, engine/script.ts. Mode: fits → a v2 per-line gloss convention mapping to the lesson reservoir.

**Pop-culture / IP note:** every borrowed-IP hook is banned (§4). Where a seed leaned on IP, use an in-world original: creature-collecting/RPG interests (majime `culture:creature-collecting-rpgs`, `the-rival-version`) → an original in-world franchise, no protected creatures reproduced.

---

## 3. Educational-alignment refinements (over current CONTENT-LINKAGE)

The old educational layer (docs 00 + 08) is the one place with concrete grammar decomposition that *sharpens* currently-abstract transfer-function wording. All are `adapt` on context (drop trip-logistics scenes) but the function→chapter mappings are sound:

| Refinement | Feeds CONTENT-LINKAGE | Source |
|---|---|---|
| Classroom-repair surface = `もう一度お願いします` / `〜てください` | ch1 (foundation-00 + classroom-expression shard) "greet, follow instruction, ask for repetition" | 08 PR.4 / §2A route 0 |
| Counters `〜つ`/`〜人`/`〜杯` in a failed-service beat | ch12 (l1-l17–l18) "ask how many are needed in a failed service plan" | 08 C3.5 / C2.4 |
| Opinion `と思う` + single reason `から` (N5→N4 bridge) | ch9 (l1-l13–l14) "give one reason"; supports s1e07 opinion beat | 08 C4.3 / 00 §5 |
| Minna 28/29/30 split: `し`/`ながら` reasons; intransitive `ています`/`てしまいました`; `てあります`/`ておきます` | ch19 (l2-l12–l15) + ch20 (l2-l16–l18) | 08 C5.3–C5.9 / 00 §6 |
| `Vたほうがいい` advice softened by `と思います`, room to decline | ch22 (l2-l23–l25) "give advice with room to decline" | 08 C5.1 |
| Lesson-9 capstone: `なら` conditional / `Nはありませんか` availability / `Vように・ないように` purpose / menu-kanji 肉料理野半大小 | ch24 (l2-l31–l34) "negotiate a conditional plan… menu reading in the exhibition finale" | 08 §2D / C6.1–C6.2 |

**Reusable authoring techniques (method, not content):**
- **Single-intent three-band variant ladder** — author ONE beat at N5 / bridge / N4 for the same communicative intent (a re-say, not a paraphrase); N5 rung strictly in-level; one optional collapsible `[bridge-expansion]` above-ceiling line, strippable. Source: 01 C4.3 / 05 V0–V5. → VOICE-AND-DIALOGUE band convention.
- **Worksheet→solo-conversation conversion catalogue** — five interaction modes (listen-respond, pair-rehearsal, info-gap, role-play, group-message) each converted to a single-player mission fully satisfied by text + self-assessment, no mic/live partner. Source: 07 §3. → directly serves the canon's audio-off-equivalence requirement.
- **Dialogue-craft rules layer** — AI-slop ban list (journey/unlock/delve/tapestry/seamless/named real institutions/melodrama), robot-EN→friend-EN gloss principle (JA unchanged, English support explains *after* the Japanese need), humour-register-in-one-line table, 8-point per-line checklist. Source: 05 §3–6. → VOICE-AND-DIALOGUE authoring/QA pass over new v2 JSON.
- **Chapter-ceiling / cumulative-grammar discipline** — a scene uses only grammar acquired at or below its own chapter. Take the RULE; **rebuild the ceiling TABLE against the 48-chapter reservoir** (the old 6-chapter table is arc-bound). Source: 05 §1–2.
- **Seven-point non-gating audit checklist** — skip-with-recap; no anchor behind a branch; choices cosmetic/practice-order; review owned by lesson not story. Source: 08 §3. → an audit template over CONTENT-LINKAGE class-thread/reservoir rows. Strip bonds/currency/pr.reason references that don't exist in canon.
- **Relationship guardrail language** — bonds optional, hidden-by-default, fully skippable with zero lost grammar, platonic only, no romance/guilt/decay, a bond only goes up or stays. Source: 03 unlock policy. → RELATIONSHIP-MATRIX consent copy. **Reuse the guardrails, NOT the 4-step coursemate→acquainted→friend→close ladder** (§4) — canon uses the 5-beat continuity schedule + separate 6-package bond-authored manifest.

---

## 4. Do NOT reuse (consolidated contradictions)

**Whole arc / structure (all lanes):**
- The entire single-term N5→N4 arc culminating in a **class trip to Japan** (shinkansen/ryokan/temple/night-street; London↔Japan mirror spine). Canon ends at graduation with the atlas closed and a blank next page. CONTENT-LINKAGE explicitly forbids travel-as-reward. Do not import the trip, the 12-week Thursday calendar, the Prologue+Ch1–6 skeleton, C-numbers/PR.x/R0–R9 scene ids, or the class-warmth friendship-escalation ladder (strangers→…→friends-who-travelled) as the through-line. Recast individual scenes into canonical chapter ids only.
- The **HelloTalk penpal subplot** (opt-in → Mika types first → Tokyo in-person payoff). Real third-party app + trip-dependent + invented event. The drafting-a-hello *comedy* is reusable; the reunion-abroad is not.

**Invented biography / consent violations:**
- **Alex's job offer → surprise send-off party → station goodbye** as a celebratory departure. Canon s4e07 resolves his departure "without making departure the brave choice." Only his flat-delivery VOICE survives.
- **Rie's "nine jobs" as real biography** (midnight konbini till, station kiosk, after-class pub cameo painting her private life). Rie is the only likeness-cleared real person and the no-invented-biography rule is sharpest on her. The "too many jobs" texture survives only as clearly-fictional composite tone; the emotional idea "the teacher is a person too" is at most idea-only.
- **Jodi lived in Tokyo + shows real personal photos.** Invented biography + violates "memory is not publication permission." Her memory-vs-permission VOICE survives and should point at the caption mystery; the lived-in-Tokyo fact and photo-sharing do not.
- **Tom's dog "Chestnut / くり"** (code-refs bonds.ts). Invented pet + naming backstory on a name-only cast member. Salvage only the `見る？` casual-register teaching beat, decoupled.
- **Rie's noodle-plant/cup-noodle "secret" + decade-old thermos** as real habit. Fine only tagged `fictionalComposite`; the tea prop (matches cold-tea) is the safe part.

**Cast the bible excludes — do not import as cast:**
- **Pho** (`pho`) — not in the 24-person roster; its "quietly homesick / for-a-person" beat also manufactures forbidden private stakes.
- **Nico, Ena, Leo, Sora, Remi, Noa** and the six invented pair-work counterparts (noa/remi/ena/leo/sora/nico) — canon fills partner/model roles with Mary, Takeshi, Nanako, Mira (+ Rose, Peter, Felix, Shaun). Verify any reused scene's roster against CAST-AND-CONSENT.
- **Cast-reassignment trap:** seeds cast real-source participants as chapter leads, but the bible reassigned those chapters to textbook-legend owners (s1e07→Francis, s1e13→Robert, s1e14→Sophie, s1e15→Xingyu, s1e18→Stasi, s1e19→Ruparna, s1e22→Shaun). Never reassign a canonical chapter back to a seed candidate.

**Borrowed IP (banned):**
- **Tom's Pokémon** ("catch/learn 'em all") — keep the generous-challenge framing, drop all Pokémon.
- **Xingyu's Hatsune Miku** — humming motif survives with an original/unnamed melody only.
- Any protected creatures from creature-collecting-RPG seeds → in-world original franchise.

**Payoff-polarity / arc inversions (reuse the gag, invert the ending):**
- **Angel's plan triumphs** — canon requires the master plan to *break* so she learns to expose assumptions.
- **Shin's mnemonic always works** — canon requires at least one mnemonic to fail/need revision so he learns to expose uncertainty. Also: never assert etymology; frame as shape-based memory.
- **Miller attempts a feeling** (`〜と思う`, "a ghost trying to emote") — canon: comic continuity only, never a private emotional arc.

**Mechanics that collide with canon:**
- **Streak-freeze-heist** streak-token/virtual-currency/midnight-expiry "challenge tower" — collides with the no-streaks/no-attendance-pressure rule and risks the no-magic line. Salvage only the values turn ("habit matters more than the badge") idea-only.
- **4-step Study-Connection bond ladder** with per-scene rel-deltas and `study.<id>.state` flags — contradicts the 5-beat continuity + 6-package bond-authored manifest. Principles fit; ladder shape does not.
- **Protagonist-reason token flavour system** wired to trip callbacks (`for-the-trip`/`for-work-someday`, `旅行のためって…`) — the reason mechanic survives only with trip tokens/echoes removed.
- **Prologue 4-way why-Japanese motivation menu** persisted as state (code-refs) — competes with canon's route-choice-as-first-contribution. Keep the emotional beat, replace the menu with the canonical route choice.
- **Old Ch4 order bundling** te-form past (`Vました`/`Vて、Vました`) with the N4 bridge (`と思う`/`から`) in one chapter — breaks the per-chapter level ceiling (te-form sequence → s1e10, past/opinion → s1e07/s1e09, conditionals → s1e13). Keep the grammar anchors, discard the ordering.
- **"island academy / distant research term"** relocation for four-seats-one-empty — contradicts fixed evening-class location truth; relocate to the Academy kitchen.
- **Framing Alex/Jodi as the plot-carrying leads** — contradicts the lattice; the spine is the caption-authorship mystery (Peter grows into "asks whether ownership is the wrong question"). They remain ensemble continuity.

**Nothing to salvage:** `references/academy-engine/*` (howler, ink, inkjs, monogatari, ts-fsrs, workbox) are third-party OSS libraries — no authored Yomu narrative; do not treat their demos as canon. `references/references-academy` does not exist on disk.

---

## 5. Verdict — decision-ready

**There is enough salvage to change the authoring plan for exactly one chapter, and to meaningfully accelerate ~10 more.**

- **s1e01-the-blank-atlas is effectively pre-drafted, not idea-level.** Across five lanes you have an authored prologue SceneScript (`prologue.ts`), authored foundation-00 repair dialogue with a model line (`foundation-course.ts`), the spare-chair opening image (two independent docs), the consent-reason mechanic, Rie's coat/no-test lines, the tea/hanamaru after-class beat, and self-intro reservoir lines. An author should **assemble and register-review** this chapter, not write it cold. Two mechanical swaps are mandatory: replace the motivation menu with the canonical route-choice, and keep the name-card blank as the Ch48 seed.

- **~10 chapters get a ready-made comedy beat + visual brief + emotional turn** that already matches the canonical owner and job: s1e07, s1e08, s1e09, s1e13, s1e14, s1e15, s1e16, s1e18, s1e19, s1e22, s1e23. These are `idea-only`/`adapt` — they save the "what happens in this scene" invention step but still need full JA authoring and (for Angel/Shin) payoff inversion. The seed banks are clearly the raw material the bible was built from, so premises are already canon; the value is the *unused* comedy/visual/turn detail inside each seed.

- **One genuinely new plot contribution:** `the-borrowed-margin` (chain-of-anonymous-previous-learners in the margins) is a small-scale rehearsal of the central caption-provenance mystery and directly feeds s3e02/s3e11/s4e11. Worth authoring into the mystery spine deliberately.

- **The educational layer (§3) is the most underrated salvage** — it converts abstract CONTENT-LINKAGE transfer strings into concrete, orderable grammar anchors for ~8 reservoir rows, plus four reusable authoring techniques (band ladder, worksheet→solo conversion, non-gating audit, craft-rules checklist). This is process leverage across the whole campaign, not one chapter.

- **Everything else is idea-level enrichment or texture** (running jokes, location inspectables, tone guardrails) — real value for consistency, but not plan-changing.

Bottom line: **pull s1e01 as a near-complete draft; treat the ~10 mapped chapters as scene-and-turn accelerators; adopt the §3 grammar refinements into CONTENT-LINKAGE now; and quarantine §4 in a shared "banned" note so no author re-imports the Japan-trip arc, the excluded cast, or the invented Rie/Jodi/Alex biography.**

**Key source files cited:** `story-expansion/{00-term-architecture,01-scene-graph,04-location-arcs,05-dialogue-constraints,06-events-humour-runningjokes,07-week-to-scene-mapping,08-educational-alignment,09-special-scene-scripts,02-character-arc-matrix,03-relationship-unlock-table}.md`; seed banks `himitsu-fiction-seeds.json`, `majime-fiction-seeds.json`; `release-worktrees/yomu-academy-rebuild-20260711/src/academy/{foundation-course.ts,story/prologue.ts,story/bonds.ts,engine/script.ts}`. Reference v2 to cross-check before importing: `apps/yomu-reader/src/academy/content/story-sources/{s1e01-the-blank-atlas.v2.json,s1e13-dinner-by-if.v2.json}`.