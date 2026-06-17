# PDF reader — simulated user research (2026-06-18)

Simulated persona research to decide what a hosted "よむ PDF" reader must do, before
building. Grounded against how the Japanese-learning community already reads PDFs with
popup dictionaries (yomitan needs *selectable text*; image-only/scanned PDFs need OCR —
see [Yomitan PDF viewer notes](https://learnjapanese.moe/yomichan/) and the manga/OCR
discussion at [lexirise](https://lexirise.app/blog/article/yomitan-manga-images)).

## Personas and what each one actually wants

| Persona | Material | Top wants | Pain today |
| --- | --- | --- | --- |
| **Mei** — light/web-novel reader (N3→N2) | Digital JP novels, BOOTH doujin, free PDFs (text layer) | Tap-to-lookup on every word, mine to JPDB/Anki, furigana, remember my place, dark night reading | Browser PDF viewer has no よむ; copy-pasting into a reader loses layout |
| **Ken** — scanned/doujin reader | Photographed pages, scanned books, image-only PDFs | Lookups even with **no text layer** → OCR; clean image rendering; zoom | Popup dicts see nothing on image PDFs |
| **Aiko** — student/researcher (advanced) | Papers, JLPT practice, business/gov docs with figures & columns | Faithful layout (figures/tables/columns intact), lookups on technical vocab, big multi-page docs stay responsive, page jump | Reflow readers mangle multi-column layout; large PDFs lag |
| **Sora** — iPad/iPhone immersion learner | Anything, on the go | **No extension install**, touch tap-to-lookup, responsive | Can't install userscript managers easily on iOS |
| **Dan** — privacy-conscious | Personal/work docs | Files never leave the device | Upload-based readers are a non-starter |

## Refined requirements (persona → product decision)

- **Render fully client-side with PDF.js** — file never uploaded (Dan); no backend (project rule). ✅ MUST
- **Hosted page injects the よむ runtime** so visitors need no userscript (Sora). ✅ MUST — reuse the video-player runtime-injection contract.
- **Canvas render = full fidelity** for images, figures, multi-column, tables — "anything a PDF can do" (Aiko, Mei). ✅ MUST
- **Selectable text layer over the canvas** → よむ popup lookups + mining work on real text (Mei, Aiko). ✅ MUST
- **OCR fallback for image-only/sparse-text pages**, reusing よむ's existing manga/image OCR (Ken). ✅ SHOULD — auto-detect low-text pages; OCR on demand so text pages aren't double-scanned.
- **Furigana** comes from よむ's normal scan of the text layer (Mei). ✅ SHOULD — validate visually in Playwright.
- **Page navigation + lazy/continuous rendering** so 300-page PDFs stay responsive (Aiko). ✅ MUST — only render pages near the viewport.
- **Zoom / fit-width / fit-page, responsive + touch** (Sora, all). ✅ MUST
- **Remember last page per document** (Mei, Sora). ✅ MUST — localStorage keyed by name+size.
- **Theme / accent / interface-language synced with よむ settings + overflow menu** (all). ✅ MUST — mirror the video player exactly.
- **Drag-drop + file picker** (all). ✅ MUST
- CJK cMaps + standard fonts + JBIG2/JPEG2000 wasm decoders vendored so Japanese & scanned PDFs render (Aiko, Ken). ✅ MUST

## Out of scope for v1 (documented follow-ups)

Outline/bookmark sidebar (PDF TOC), in-PDF text search, two-page spread, highlight/annotation export, open-from-URL. None block the core "load any PDF and read it with よむ" loop.

## Why build on PDF.js (not invent)

PDF.js is the reference browser PDF engine: it draws each page to `<canvas>` (full image
fidelity) **and** emits an absolutely-positioned, selectable DOM text layer aligned to the
canvas — which is exactly the selectable text よむ's runtime already scans for popups,
furigana and mining. Scanned pages with no text layer fall through to よむ's existing OCR.
Vendored under `docs/public/pdf-reader/vendor/` (Apache-2.0). Reference copy of the full
dist kept in `/references/pdfjs-dist`.
