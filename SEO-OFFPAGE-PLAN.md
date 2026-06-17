# よむ SEO — off-code action plan

The on-page/technical SEO is now handled in code (see "What shipped" below). This file is the
**human checklist** for everything that can't live in the repo. Work top-down; the first three
items are the highest leverage.

---

## What already shipped (in code)

- **Sitemap** auto-generated at `https://hrussellzfac023.github.io/yomu-reader/sitemap.xml` (user-facing pages only).
- **Per-page canonical + `og:url`** — previously *every* page declared itself the homepage (duplicate-content + wrong social cards). Fixed.
- **Per-page titles, meta descriptions, OG/Twitter** for every page.
- **Structured data (JSON-LD):** `SoftwareApplication` + `WebSite` on the home page, `FAQPage` + `BreadcrumbList` on the tool pages, `BreadcrumbList` elsewhere.
- **`/tools/` hub + 6 keyword-targeted landing pages** (OCR, furigana, kanji stroke order, subtitle miner, JPDB study, YouTube filter), each with its own FAQ schema.
- **Internal docs** (ADRs, backlogs, research) are now `noindex` and excluded from the sitemap.
- **Hosted apps** (`/newtab/`, `/video-player/`) now have real titles, descriptions, canonical, and OG tags.
- **`robots.txt`** at the project path (see the host-root caveat below).

---

## 1. Verify ownership + submit the sitemap (do this first — 20 min)

1. Add the site to **Google Search Console** (https://search.google.com/search-console).
   - Use a **URL-prefix** property for `https://hrussellzfac023.github.io/yomu-reader/`.
   - Verify with the **HTML file** method: GSC gives you a `googleXXXX.html` file → drop it in `docs/public/` → it deploys to `…/yomu-reader/googleXXXX.html`. (Meta-tag verification also works — paste it into the VitePress `head` array.)
2. Submit the sitemap: in GSC → Sitemaps → enter `sitemap.xml`.
3. Repeat for **Bing Webmaster Tools** (https://www.bing.com/webmasters) — you can import directly from GSC. Bing also feeds DuckDuckGo and (increasingly) ChatGPT search.
4. Use **URL Inspection → Request indexing** on the homepage, `/tools/`, and each tool page to prime crawling.

## 2. The robots.txt host-root caveat (important, 10 min)

On `*.github.io` **project pages**, crawlers fetch `https://hrussellzfac023.github.io/robots.txt`
(the *host* root), **not** `…/yomu-reader/robots.txt`. The robots.txt I added at the project path is
only honored by some validators and a future custom domain.

- If you control the **`hrussellzfac023.github.io`** repo (your user/org Pages site), put a host-root
  `robots.txt` there that references the sitemap:
  ```
  User-agent: *
  Allow: /
  Sitemap: https://hrussellzfac023.github.io/yomu-reader/sitemap.xml
  ```
- Either way, the **GSC sitemap submission in step 1 does not depend on robots.txt** — it works regardless.
- **Best long-term fix:** a custom domain (e.g. `yomu.app` / `yomureader.com`). Then robots.txt, canonicals,
  and the whole host are yours, the URL is brandable, and you escape the `/yomu-reader/` subpath. Set it in
  the repo's Pages settings + a CNAME file, then update `origin`/`siteUrl` in `docs/.vitepress/config.mts`.

## 3. Get the first backlinks (the single biggest off-page factor)

A GitHub Pages doc site has almost no domain authority on its own. The free-tools pages will only rank once
other sites link to them. Highest-ROI, all legitimate (no link schemes):

- **GreasyFork listing** — your install source. Make sure the description is keyword-rich (it is a high-authority domain) and links back to the docs + each tool page.
- **GitHub repo** — put the docs URL in the repo "About", README hero, and topics (`japanese`, `language-learning`, `ocr`, `anki`, `yomitan`, `userscript`). Repo links are followed.
- **awesome-lists** — submit to `awesome-japanese`, `awesome-anki`, `awesome-userscripts`, `awesome-language-learning`. PRs to these are the classic first backlinks.
- **Communities** (be a participant, not a spammer): r/LearnJapanese, r/movies→r/anime sentence-mining threads, the TheMoeWay / Refold / Donkuri Discord and wiki, jpdb.io forums, the Yomitan/Anki communities. Share the *specific tool page* that answers a question someone asked.
- **Comparison/alternative pages** — people search "asbplayer alternative", "Migaku free alternative", "10ten/Yomitan for manga". A short honest comparison page earns links and long-tail traffic.
- **Directories** — AlternativeTo, Product Hunt (a launch gives a spike + a permanent backlink), Chrome/Firefox store listings once the extensions ship (store pages rank *and* link out).

## 4. Keyword targets (what each page is going for)

| Page | Primary intent | Example queries |
|---|---|---|
| `/tools/japanese-ocr` | manga / image OCR | "japanese ocr", "manga ocr", "read manga in japanese", "image to text japanese" |
| `/tools/furigana-reader` | reading aid | "add furigana", "furigana generator", "furigana reader" |
| `/tools/kanji-stroke-order` | kanji reference | "kanji stroke order", "kanji components", "RTK lookup" |
| `/tools/japanese-subtitle-reader` | sentence mining | "mine subtitles to anki", "japanese subtitle reader", "asbplayer alternative" |
| `/tools/jpdb-study` | review surface | "jpdb review", "japanese flashcards new tab", "anki review browser" |
| `/tools/youtube-japanese` | immersion | "comprehensible input youtube", "filter youtube japanese", "learn japanese youtube" |

Track these in GSC → Performance after ~2–4 weeks. Double down on the pages that get *impressions but
low clicks* (rewrite the title/description) and the queries you rank #5–15 for (add a section answering them).

## 5. Content that earns links over time

The tool pages funnel installs; **guide content** is what attracts links and ranks for the fat
head terms. Candidates, in priority order:

1. "How to read manga in Japanese (free setup)" — pairs with the OCR tool.
2. "How to mine sentences from anime/YouTube to Anki" — pairs with the subtitle tool.
3. "Best comprehensible-input YouTube channels for Japanese" — you already ship a 100-channel list; turn it into a real article.
4. "Yomitan vs JPDB vs Anki — which to use when" — captures comparison searches and links to every tool.
5. A short, honest "free alternative to Migaku" page (the Support page already makes this point).

Each should link *down* to the relevant `/tools/` page and *up* to `/getting-started`.

## 6. Housekeeping / nice-to-haves

- **OG image freshness:** the shared `og-image.png` is fine, but per-tool OG images would lift social CTR. Optional.
- **Image filenames + alt text** are already descriptive — keep that up for new screenshots.
- **`lastUpdated`** is on; keeping pages genuinely updated is a small freshness signal.
- **Core Web Vitals:** VitePress is fast by default. After deploy, run PageSpeed Insights on the home + a tool page; the only likely flag is the `yomu.css` (342 KB) and `yomu.user.js` preload on docs pages — consider dropping the `yomu.user.js` *preload* from doc pages that don't run it.
- **Hreflang:** default UI is Japanese but the docs are English. If you ever ship JA docs, add `hreflang` pairs.
- **Re-submit sitemap** after big content additions; GSC re-crawls on its own but a nudge helps.

## 7. Measurement cadence

- **Week 1:** confirm GSC + Bing verified, sitemap "Success", pages "Indexed" (URL Inspection).
- **Week 2–4:** watch Performance for first impressions; fix titles on low-CTR pages.
- **Monthly:** check which tool pages rank, where the backlinks are coming from (GSC → Links), and pick the next guide article from §5.
