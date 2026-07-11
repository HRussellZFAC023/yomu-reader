---
title: "Yomu Academy — Repeatable ChatGPT Image-Generation Pipeline"
description: "How to mass-produce style-consistent Academy art via chatgpt.com (logged in) using two anchor references, a master style prompt, an asset manifest, and browser-MCP driving steps."
status: research / implementation playbook
---

# 08 · ChatGPT Image-Generation Pipeline for Yomu Academy Art

Goal: produce a large, **visually consistent** set of Academy art (character portraits, expression sheets, location backdrops, item icons, story CGs) by driving **chatgpt.com while logged in**, re-using two fixed anchor images so every asset shares one house style. All assets land in `public/academy/art/`.

Everything below is grounded in three things actually in this repo:

- The maker's own automation tool: `references-academy/ChatGptAutomator/chatgptAutomation.js` (a Tampermonkey userscript that adds an on-page "Automation" panel to chatgpt.com).
- The two shipped anchor images: `public/academy/art/campus-blue-hour.webp` and `public/academy/art/characters/rie-sensei.webp`.
- The live campus in `src/academy/app.ts` (locations: classroom, library, language lab, kanji garden, writing studio, after-class cafe, quad) plus the palette tokens in `src/academy/styles.css`.

---

## 1. How the maker's ChatGptAutomator actually works (findings)

`chatgptAutomation.js` (6,485 lines; ~90% is a 30-language translation table) is a **Greasemonkey/Tampermonkey userscript**. It injects an "Automation" button into the ChatGPT conversation header and runs prompt → send → wait → post-process chains entirely from inside the page. Key mechanics (from the `chatGPT` object, ~lines 2696–2856, and the chain runner, ~lines 6246–6459):

| Concern | How the tool does it | Selector / detail |
| --- | --- | --- |
| Find the composer | `getChatInput()` | `#prompt-textarea`, then `div[contenteditable="true"]`, `textarea[placeholder*="Message"]`, `div.ProseMirror` |
| Type a message | `typeMessage()` — sets a `<p>` child on the contenteditable, dispatches `input`+`change` | writes into the ProseMirror div, not `.value` |
| Send | `getSendButton().click()` | `#composer-submit-button`, then `button[data-testid="send-button"]`, `button[aria-label*="Send"]` |
| Detect "done" | `waitForResponse()` — MutationObserver on `<body>`; resolves when the newest assistant turn is present **and** generation stopped | newest `[data-message-author-role="assistant"]`; "still generating" = presence of `[data-testid="stop-button"]` / `.result-thinking` / `.typing-indicator`; container preferred is `article[data-turn="assistant"]` |
| Extract generated image URLs | `extractResponseImages()` | `div[id^="image-"] img[alt="Generated image"]`, **skipping** blurred backdrops (`img.closest('.blur-2xl')` / `.scale-110`) |
| Batch / templating | `dynamicElements` (JSON array/object or a generator fn) + `{item}`, `{item.field}`, `{index}`, `{total}`, `{steps.<id>.response}`; `responseType:'image'`; optional `newChat` per item; `batchWaitTime` between items | see `handleTemplateStep` |
| Cross-origin fetch/download | GM-style `http.request()` proxy through a background service worker (CORS-safe), with 3× retry | used for HTTP steps; can also fetch an image URL |
| Chain step types | `prompt`, `template` (batch), `js` (post-reply sandbox: `response, steps, http, utils.log`), `http` | `processChain()` |

**The one gap that shapes the whole design:** the automator **types and sends text only — it never attaches/uploads a reference image.** So reference-image consistency cannot come from the automator alone. It must come from one of the two strategies in §2, and any file attachment must be done by a **browser MCP** (`mcp__claude-in-chrome__file_upload` / `upload_image`) or by hand.

Two more realities to design around:
- **Image-gen is rate-limited.** ChatGPT caps image generations per rolling window (Plus lower, Pro higher). The automator *paces* but cannot *bypass* caps. Expect a "you've hit the image generation limit / try again later" assistant message — the loop must detect that text and pause/retry rather than saving a blank.
- **Generated image URLs are short-lived signed `*.oaiusercontent.com` links.** Fetch/download them promptly after each generation.

---

## 2. Consistency strategy (the core decision)

gpt-image (ChatGPT's image model) keeps **visual memory within a single conversation**. That is the lever for consistency. Two workable modes:

### Mode A — "Style Bible" conversation (recommended default)
1. Open **one** new chat. Attach **both** anchors (`campus-blue-hour.webp` + `rie-sensei.webp`) and paste the **Master Style Prompt** (§3). Ask ChatGPT to acknowledge the style, not to generate yet.
2. Generate every asset as a **follow-up in the same chat** (`newChat: false`). Each prompt is short and only says *what changes* ("same style and palette as established; now draw …"). The model carries palette, line quality, and the pixel/anime blend forward automatically — **no re-upload per image.**
3. Re-seed when the thread gets long or drifts: every ~15–20 images, start a fresh chat and re-attach the anchors + master prompt. Long threads slowly lose fidelity.

Pros: best consistency, fastest (attach once). Cons: one long thread; re-seed discipline required.

### Mode B — Per-asset fresh chat + re-attach (use for isolation / after drift)
For each asset: new chat → attach the relevant reference(s) via MCP → master prompt + asset prompt → generate → download. Slower (upload every time) but each image is independent of thread history. Use it for the hero CGs (§4E) and any asset where Mode A output drifted.

### Character-lock trick (critical for the 15 classmates)
A classmate must look like the *same person* across 4 expressions. Do it in two passes:
1. **Pass 1 — reference sheet:** in the Style-Bible chat, generate one neutral, front-facing bust portrait per archetype. Download it. This becomes that character's **own anchor**.
2. **Pass 2 — expressions:** start a short chat (or continue), **attach that saved neutral portrait**, and ask for the other 3 expressions "same character, same outfit/hair, only the expression changes." Attaching the character's own portrait locks identity far better than relying on text alone.

Rie-sensei already has an anchor (`rie-sensei.webp`) — always attach it for her expression set.

---

## 3. Master Style Prompt

Paste this once per Style-Bible chat, with both anchors attached.

> **Reference images attached:** (1) `campus-blue-hour.webp` — the campus establishing shot; (2) `rie-sensei.webp` — the mentor character. Study both. Everything you generate for this project must look like it belongs in the same illustrated world as these two images.
>
> **House style — "Yomu Academy":** a cozy, warm hand-painted anime look in the spirit of Studio Ghibli / Makoto Shinkai evening scenes, **softly fused with a gentle pixel-art texture** (visible but subtle dithering and pixel structure in shading and backgrounds, never a hard 8-bit retro look). Painterly soft lighting, warm rim-light and window glow, gentle bloom, gentle depth of field. Clean readable shapes, high contrast between subject and background, calm and inviting.
>
> **Palette — blue-hour campus at dusk:** deep teal-to-indigo blue-hour sky; warm **amber** interior/window light; soft **coral / rose** accents (cherry blossom, lantern warmth); fresh **leaf-green** foliage. Cool blues in shadow, warm ambers in light. Keep these four families (teal/indigo, amber, coral/rose, leaf-green) consistent across every asset. (Matches the app tokens: green `#2f7654`, blue `#3e6f94`, rose `#925268`, gold `#80652f`.)
>
> **Cast:** ordinary **adult** university-evening-class students and staff (early 20s to 40s), warm and diverse, everyday casual clothing. **No children, no schoolgirl/uniform tropes.**
>
> **Originality & safety (hard rules):** 100% original characters and locations. **No real logos, crests, brand marks, mascots, or trademarks. No real signage, no readable text, no watermarks, no captions or letters anywhere in the image.** Do not copy or imitate any specific existing anime, game, franchise, or real person. UCL/Bloomsbury may inspire architecture only — keep all signage blank/fictional, no official emblems, no flags with real insignia.
>
> **Composition defaults:** character art = clean single subject, simple or softly blurred background, room around the figure for UI. Backdrops = wide establishing shot, empty foreground where dialogue boxes will sit, no people unless asked. Leave calm negative space; never bake in UI, borders, frames, or text.
>
> Acknowledge that you've absorbed this style. Do not generate anything yet — I'll send each asset request next.

---

## 4. Asset manifest

Conventions used below:
- **Paths** are under `public/academy/art/`. Portraits → `characters/`, backdrops → root, items → `items/`, story CGs → `cg/`. Save as `.webp` (repo standard) after converting the ChatGPT `.png` download (see §6).
- **Aspect:** portraits `1024×1536` (portrait) or `1024×1024`; backdrops & CGs `1536×1024` (landscape); item icons `1024×1024` transparent.
- **Ref attach column:** which reference image(s) to attach in the browser. In Mode A follow-ups you usually attach **nothing** (style is carried by the thread); the column tells you what to attach when starting fresh or when using the character-lock trick.
- Every asset prompt is understood to be appended to the established style; the prompts below state **only what changes**.

### 4A · Rie-sensei expression set

Anchor already exists. Attach `characters/rie-sensei.webp` for all of these; ask for "the exact same woman, same hair bun, cardigan-over-dark-shirt, lanyard — only the expression/pose changes, plain soft background."

| ID | File | Prompt (what changes) | Ref to attach |
| --- | --- | --- | --- |
| rie-neutral | `characters/rie-neutral.webp` | Calm, attentive, gentle closed-mouth smile; bust, facing viewer. | rie-sensei.webp |
| rie-warm | `characters/rie-warm.webp` | Warm open smile, welcoming, slight head tilt. | rie-sensei.webp |
| rie-encourage | `characters/rie-encourage.webp` | Encouraging, one hand raised in a small "you've got this" gesture. | rie-sensei.webp |
| rie-thoughtful | `characters/rie-thoughtful.webp` | Thoughtful, looking slightly aside, finger near chin, considering. | rie-sensei.webp |
| rie-surprised | `characters/rie-surprised.webp` | Pleasantly surprised, eyebrows up, small delighted "oh". | rie-sensei.webp |
| rie-proud | `characters/rie-proud.webp` | Proud, soft applause / hands together, evening warmth. | rie-sensei.webp |

### 4B · Classmate portraits — 15 hobby archetypes × 4 expressions (60 portraits)

**Shared spec for every classmate:** adult evening-class student, upper-body bust, facing viewer, plain softly-blurred blue-hour background, warm rim light, house style. **4 expressions per character**, filename suffix: `-neutral`, `-happy`, `-surprised`, `-thoughtful`.

- `-neutral`: relaxed, faint smile, front-facing (this is the Pass-1 reference sheet).
- `-happy`: bright laughing smile, eyes warm.
- `-surprised`: eyebrows up, mouth open, delighted surprise.
- `-thoughtful`: looking aside, considering, softer.

**Workflow:** generate all 15 `-neutral` portraits first (Pass 1). Then, for each character, attach its own `-neutral` file and generate the 3 remaining expressions with "same person, same outfit and hair, expression only" (Pass 2, character-lock trick).

File pattern: `characters/<id>-<expression>.webp`.

| # | Archetype id | Appearance / prop prompt (identity — keep constant across the 4) | Diversity note |
| --- | --- | --- | --- |
| 1 | `mangaka` | Illustrator; short tousled hair, ink-smudged fingers, holds a sketchbook and pen, canvas tote. | E. Asian, 20s |
| 2 | `foodie` | Ramen/food lover; round friendly face, apron or food-print tee, holds a steaming paper cup. | Latino, 30s |
| 3 | `gamer` | Retro-games fan; hoodie, headphones round neck, holds a small handheld console. | Black, 20s |
| 4 | `photographer` | Street photographer; utility jacket, mirrorless camera on strap, observant eyes. | White, 40s |
| 5 | `runner` | Fitness/running; athletic zip-top, towel over shoulder, water bottle, healthy flush. | S. Asian, 30s |
| 6 | `musician` | Amateur musician; beanie, denim jacket with pins, small guitar or earbuds. | Mixed, 20s |
| 7 | `gardener` | Plant-notebook keeper (echoes canon "Lina"); cardigan, small potted succulent, soft eyes. | E. Asian, 30s |
| 8 | `barista` | Home-coffee enthusiast; rolled-sleeve shirt, apron, holds a latte with leaf art. | Middle-Eastern, 30s |
| 9 | `cinephile` | Film buff; turtleneck, tote of DVDs, round glasses, wry half-smile. | White, 20s |
| 10 | `cyclist` | Bike commuter; windbreaker, helmet under arm, reflective ankle strap. | Black, 40s |
| 11 | `bookworm` | Literature reader (echoes canon "reader" affinity); knit vest, stack of paperbacks, gentle. | S. Asian, 20s |
| 12 | `calligrapher` | Stationery/calligraphy lover; neat blouse, holds brush pen and grid notebook. | E. Asian, 40s |
| 13 | `boardgamer` | Tabletop host; cozy flannel, holds a small box of meeples/dice, playful. | Latino, 30s |
| 14 | `karaoke` | Music/idol-song fan (echoes canon "speaker" affinity); bright cardigan, mic keychain, expressive. | Mixed, 20s |
| 15 | `traveller` | Backpacker (sets up the Japan trip); scarf, folded map, pin-covered daypack, curious. | White, 30s |

### 4C · Location backdrops

Wide `1536×1024`, empty foreground for dialogue, no people unless noted. In Mode A, attach nothing; if starting fresh, attach `campus-blue-hour.webp`.

| ID | File | Prompt (what changes) | Ref |
| --- | --- | --- | --- |
| loc-quad | *(exists: `campus-blue-hour.webp`)* | Establishing campus quad at blue hour — already shipped; regenerate only if a cleaner people-free variant is wanted. | — |
| loc-classroom | `loc-classroom.webp` | Cozy evening language classroom: chalkboard with faint (unreadable) marks, warm desk lamps, potted plant, window showing blue-hour city. Empty of people. | campus-blue-hour.webp |
| loc-library | `loc-library.webp` | Warm campus library nook at dusk: tall shelves, amber reading lamps, a study table by a tall window. No text on spines. | campus-blue-hour.webp |
| loc-pub | `loc-pub.webp` | Cozy Bloomsbury-style pub interior, evening: warm amber lamps, wooden booths, fairy lights, blank taps and signage. Inviting, no logos. | campus-blue-hour.webp |
| loc-ramen | `loc-ramen.webp` | Small ramen shop at night: counter seats, steam, red lanterns (blank), warm noren curtain with no readable text, konbini-warm glow. | campus-blue-hour.webp |
| loc-konbini | `loc-konbini.webp` | Late-night convenience-store interior, original/fictional: bright cool shelving light spilling to a dark street, generic unbranded products, no readable labels. | campus-blue-hour.webp |
| loc-gym | `loc-gym.webp` | Modest community gym / studio at evening: soft-lit, mats, a mirror wall, plants, calm not intense. | campus-blue-hour.webp |
| loc-station | `loc-station.webp` | Quiet railway/underground platform at blue hour: warm platform lights, a train's soft glow, blank destination boards, gentle rain sheen. | campus-blue-hour.webp |
| loc-lab | `loc-lab.webp` | *(app "Language Lab")* Listening booth room: headphone stations, soft acoustic panels, blue-hour window. | campus-blue-hour.webp |
| loc-garden | `loc-garden.webp` | *(app "Kanji Garden")* Small Japanese-style campus garden at dusk: stone lantern, koi pond, red footbridge, cherry petals (matches anchor's garden corner). | campus-blue-hour.webp |
| loc-writing | `loc-writing.webp` | *(app "Writing Studio")* Warm desk workspace: paper, brush pens, a lamp, cork board with blank notes. | campus-blue-hour.webp |
| loc-cafe | `loc-cafe.webp` | *(app "After-class Cafe")* Snug campus café corner at night: mismatched chairs, warm pendant lights, a plant, steam from mugs. | campus-blue-hour.webp |

**Japan-trip backdrops** (finale arc; keep original, no real place names/signage):

| ID | File | Prompt | Ref |
| --- | --- | --- | --- |
| jp-street | `loc-jp-street.webp` | Neon-lit Tokyo-style backstreet at night, original: warm izakaya glow, unbranded signs, wet reflective asphalt, cozy not overwhelming. | campus-blue-hour.webp |
| jp-temple | `loc-jp-temple.webp` | Quiet temple approach at blue hour: original torii-style gate (blank), stone steps, lanterns, maple/cherry, mist. | campus-blue-hour.webp |
| jp-ryokan | `loc-jp-ryokan.webp` | Warm ryokan/onsen-town evening: wooden inn, tatami glow, hillside town lights, steam. | campus-blue-hour.webp |
| jp-shinkansen | `loc-jp-shinkansen.webp` | Bright shinkansen-style platform at dawn/blue hour: sleek train (original livery, no logos), blank boards. | campus-blue-hour.webp |

### 4D · Item icons

Square `1024×1024`, **transparent background** (say "transparent background PNG, centered object, soft painterly icon, subtle pixel edge, gentle drop shadow"). Generate as a mini-batch in one chat so they share weight/lighting. Attach nothing (Mode A) or `rie-sensei.webp` for palette.

| ID | File | Prompt (object) |
| --- | --- | --- |
| item-marks | `items/campus-marks.webp` | A small glowing amber "campus mark" token/medal (currency), original, no letters. |
| item-wayfinding | `items/wayfinding-card.webp` | A folded paper wayfinding card with a hand-drawn arrow route, no readable text. |
| item-quiet-pass | `items/quiet-corner-pass.webp` | A soft teal "quiet corner" pass tag with a rounded-leaf motif. |
| item-notebook | `items/community-notebook-page.webp` | A torn community-notebook page with a tiny doodle, warm paper. |
| item-route-map | `items/folded-route-map.webp` | A folded city route map, coral pin, no place names. |
| item-rain-note | `items/rain-note.webp` | A small note with a raincloud-and-umbrella doodle. |
| item-six-oclock | `items/six-oclock-card.webp` | A card showing a clock face at six, warm amber. |
| item-blue-door | `items/blue-door-tag.webp` | A little blue door-shaped keytag / pin. |
| item-thermos | `items/thermos.webp` | Rie-sensei's green thermos (matches her anchor prop), standalone. |
| item-ramen | `items/ramen-bowl.webp` | A steaming ramen bowl, cozy, no text. |
| item-ticket | `items/train-ticket.webp` | A single train ticket stub, blank, warm. |
| item-onigiri | `items/onigiri.webp` | A wrapped konbini onigiri, generic, no branding. |

### 4E · Special-scene CGs (hero illustrations)

Wide `1536×1024`, full illustration **with** characters, cinematic. Use **Mode B** (fresh chat, attach the relevant character portraits + a location backdrop) so the hero shots are maximally controlled. Attach up to 3–4 references: the anchors, the specific classmate reference sheets involved, and the matching backdrop.

| ID | File | Scene prompt | Refs to attach |
| --- | --- | --- | --- |
| cg-pub-night | `cg/pub-night.webp` | The class gathered around a warm pub booth at night, laughing over drinks; Rie-sensei among them; string lights, amber glow, blue-hour window. Group warmth, no readable signage. | rie-sensei.webp, loc-pub.webp, 3–4 classmate `-neutral` sheets |
| cg-surprise-party | `cg/surprise-party.webp` | A gentle surprise party in the classroom/cafe: classmates mid-"surprise!", coral streamers and warm lanterns, the protagonist's POV, confetti soft, no text on banner. | loc-classroom.webp (or loc-cafe.webp), classmate sheets |
| cg-job-offer | `cg/job-offer.webp` | Quiet triumphant moment: a classmate reading good news on a phone by a blue-hour window, others leaning in warmly, Rie-sensei smiling; hopeful amber light. Phone screen blank. | rie-sensei.webp, loc-library.webp, 1–2 classmate sheets |
| cg-japan-finale | `cg/japan-finale.webp` | The group together in Japan under cherry blossoms at blue hour (original street/temple), backpacks and cameras, joyful reunion energy, petals drifting. The emotional finale shot. | loc-jp-street.webp or jp-temple.webp, `traveller` + others, rie-sensei.webp |
| cg-hellotalk | `cg/hellotalk.webp` | Cozy "language-exchange" moment: the protagonist video-calling a friendly overseas partner, split warm/cool lighting across two rooms, speech-bubble-free, phone/laptop screens blank (no app UI, no logos). | rie-sensei.webp palette ref; a classmate sheet |

> **Count:** ~6 Rie + 60 classmate + ~16 backdrops + ~12 items + 5 CGs ≈ **~99 assets**. Batch them; don't hand-craft each.

---

## 5. Exact step-by-step: driving chatgpt.com with a browser MCP

> The instructions below are for whoever/whatever runs the browser (a browser-MCP agent or the maker). **Do not** confuse this with the automator's send loop — the automator handles typing/sending/waiting/extraction; the **MCP handles the one thing the automator can't: attaching reference files** and, optionally, downloading.

### 5.0 Prerequisites
- Chrome logged into chatgpt.com on a plan with image generation (Plus/Pro). Image gen must be the active tool.
- Anchor files on disk: `public/academy/art/campus-blue-hour.webp`, `public/academy/art/characters/rie-sensei.webp`.
- Load the browser tools once via ToolSearch (single call): `mcp__claude-in-chrome__tabs_context_mcp, navigate, computer, read_page, file_upload, javascript_tool`.
- (Optional) The ChatGptAutomator userscript installed, to run the batch send-loop for you.

### 5.1 Seed the Style-Bible chat (Mode A)
1. `navigate` to `https://chatgpt.com/` (new chat). Confirm the image tool is selected.
2. `read_page` (filter `interactive`) to locate the composer and the "attach files" control (paperclip / `+`).
3. Attach **both** anchors with `mcp__claude-in-chrome__file_upload`, targeting the composer's file input (`input[type="file"]`). Upload both `campus-blue-hour.webp` and `rie-sensei.webp`. Verify two thumbnails appear via `read_page`.
4. Type the **Master Style Prompt** (§3) into `#prompt-textarea` (via `form_input`/`computer` typing) and send (`#composer-submit-button`). Wait for the acknowledgement text (no `[data-testid="stop-button"]` present).

### 5.2 Generate one asset (repeat per row)
For each manifest row, in the **same** chat (Mode A) or a fresh seeded chat (Mode B):
1. If Mode B or character-lock: attach the row's "Ref to attach" file(s) via `file_upload`.
2. Type the asset prompt (short — "same established style/palette; now: <prompt>. <aspect + background rule>."). Send.
3. **Wait for completion:** poll `read_page` / `javascript_tool` until no `[data-testid="stop-button"]` exists and an image node is present. Guard for the rate-limit message — if the assistant text contains "limit"/"try again", pause (e.g. 10–20 min) and retry the same row; do not save a placeholder.
4. **Extract the image URL** with `javascript_tool` (mirrors the automator's `extractResponseImages`):
   ```js
   [...document.querySelectorAll('article[data-turn="assistant"]')].pop()
     ?.querySelectorAll('div[id^="image-"] img[alt="Generated image"]')
     ? [...[...document.querySelectorAll('article[data-turn="assistant"]')].pop()
         .querySelectorAll('div[id^="image-"] img[alt="Generated image"]')]
         .filter(img => !img.closest('.blur-2xl') && !img.closest('.scale-110'))
         .map(img => img.src)
     : []
   ```
   Take the last URL.
5. **Download it.** Two options:
   - **(a) curl (simplest):** the `src` is a signed `*.oaiusercontent.com` URL, publicly fetchable for a short time. Hand the URL back and `curl -sL "<url>" -o <target>.png` immediately (via the Bash tool of whoever runs downloads).
   - **(b) in-page base64:** `javascript_tool` → `fetch(url).then(r=>r.blob()).then(b=>new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)}))` returns a data URL; write it to disk with `base64 -d`.
6. **Convert & place:** ChatGPT returns PNG. Convert to `.webp` and save to the manifest path (see §6).

### 5.3 Batch it with the automator (optional, faster for text-only follow-ups)
Once the Style-Bible chat is seeded and the model holds the style, the ChatGptAutomator can fire all remaining prompts as a **template batch** without any further uploads. Open the automator panel → Template tab, and use a chain like:

```json
{
  "dynamicElements": [
    { "id": "rie-warm",  "prompt": "Same established Yomu Academy style and palette. Rie-sensei, the exact same woman, warm open smile, bust, plain soft background. No text, no logos. Portrait 1024x1536." },
    { "id": "foodie-neutral", "prompt": "Same style/palette. Adult evening-class student, ramen-lover, round friendly face, apron, holding a steaming paper cup, relaxed faint smile, plain blue-hour background. No text. Portrait 1024x1536." }
  ],
  "entryId": "gen",
  "steps": [
    { "id": "gen", "type": "template", "template": "{item.prompt}", "responseType": "image", "newChat": false, "next": "save" },
    { "id": "save", "type": "js", "code": "const imgs=(steps.gen.responses||[]).flatMap(r=>r.images||[]); utils.log('Captured '+imgs.length+' image URLs'); return imgs;" }
  ]
}
```
- Set **batchWaitTime ≈ 20–30s** between items to respect pacing.
- Keep `newChat:false` to stay in the seeded style thread; flip to `true` only when you deliberately re-seed.
- The automator captures the URLs (`steps.gen.responses[].images`); pull them from the log or an `http` download step, then convert/place per §6. Note the automator's `js`/`http` steps can fetch the URLs but **cannot write to the repo filesystem** — final save to `public/academy/art/` is done by the maker's shell (curl/sharp), not from inside the page.

### 5.4 Guardrails while driving
- **Never** click any web link surfaced inside the chat; only interact with ChatGPT's own composer/generate/download controls.
- Re-seed the thread every ~15–20 images (fidelity drift).
- If an image contains readable text, a logo, a child, or a real crest → reject and regenerate with the offending rule restated.
- Do not attach anything but the intended reference files; do not paste personal data.

---

## 6. Naming, conversion, and rights metadata

- **Directory:** `public/academy/art/` (backdrops), `characters/` (portraits & expressions), `items/`, `cg/`. Match `src/academy/app.ts`, which loads e.g. `./art/characters/rie-sensei.webp` and `./art/campus-blue-hour.webp`.
- **Format:** convert each PNG download to WebP:
  - `cwebp -q 82 in.png -o out.webp`, or `sharp` (`npx sharp -i in.png -o out.webp --webp`).
  - Backdrops/CGs quality ~80–85; portraits ~85; item icons keep alpha (`cwebp -q 90 -alpha_q 100`).
- **Naming:** all lowercase, hyphenated, as in §4 (`characters/foodie-happy.webp`, `loc-ramen.webp`, `items/thermos.webp`, `cg/pub-night.webp`).
- **Rights record (required by WORLD-BIBLE "Asset boundary"):** for each generated asset, store its provenance — origin = generated, tool = ChatGPT image gen, the source prompt + which references were attached, generation date, and a line stating it is original and imitates no protected character/artwork. Keep this alongside the asset (e.g. a sibling `art/CREDITS.md` or the content-graph rights field) **before** any asset ships into a scene.

---

## 7. QA checklist (per asset, before it ships)
- [ ] Style matches anchors (line quality, soft pixel texture, blue-hour palette: teal/indigo + amber + coral + leaf-green).
- [ ] Subject is an **adult**; diverse, warm, casual; no uniforms/children.
- [ ] **No text, letters, logos, crests, watermarks, or real signage** anywhere.
- [ ] Character identity consistent across the 4 expressions (same face/hair/outfit).
- [ ] Backdrops keep an empty dialogue-safe foreground; no baked-in UI/borders.
- [ ] Item icons have clean transparent alpha.
- [ ] Correct aspect + path + `.webp` conversion.
- [ ] Provenance/rights recorded.

---

## Appendix · Facts sourced from this repo
- Automator selectors/behaviour: `references-academy/ChatGptAutomator/chatgptAutomation.js` — `getChatInput`/`getSendButton`/`typeMessage`/`waitForResponse`/`extractResponseImages` (~L2696–2856), `handleTemplateStep`/`processChain` (~L6343–6459). **No file-upload capability** in the tool.
- Live campus locations & art paths: `src/academy/app.ts` (L278, L343, L346–351, L364–383) — classroom, library, lab, garden, writing, cafe, quad; Rie-sensei mentor.
- Palette tokens: `src/academy/styles.css` (L11–18): green `#2f7654`, blue `#3e6f94`, rose `#925268`, gold `#80652f`.
- Canon tone/originality/rights rules: `docs/academy/WORLD-BIBLE.md` (Tone & Visual Direction; Fiction/People/Asset boundaries).
- Anchor images inspected: `campus-blue-hour.webp` (5 adult students, blue hour, cherry blossom, portico + dome, warm windows, Japanese garden corner) and `characters/rie-sensei.webp` (adult teacher, hair bun, cardigan + lanyard, green thermos, marked worksheets, chalkboard, evening city window).
