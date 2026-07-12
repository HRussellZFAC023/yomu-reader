# Yomu Academy durable memory

Read this before resuming implementation, then follow [`STATUS.md`](STATUS.md), [`BACKLOG.md`](BACKLOG.md), and [`discovery/PRODUCTION-RUNBOOK.md`](discovery/PRODUCTION-RUNBOOK.md).

## Product truth

- Yomu Academy is a Foundation-to-N1 Japanese-learning world, not a dashboard skin and not a static visual novel.
- The opening is a warm, rain-lit London evening class led by Rie. Her first note briefly says the AI-created story is fictional and makes no claims about real people, then asks the learner's name and private reason.
- Four protagonist choices are `quality-2` through `quality-5`; `quality-1` is excluded. Portrait choice implies no gender, personality, or romance preference.
- Enrollment always offers Lesson 0, a manual N5–N1 provisional band, and an optional skill-specific JLPT-style mock recommendation. Recommendations never lock the learner.
- Story experience and curriculum mastery are separate. Midstream starts use playable arrival bridges and replayable chronological memories.
- Every source question survives with occurrence, document hash, locus, instructions, prompt, media, answer relation, and playable representation. Occurrence, payload, source question, activity, and concept are different denominators.
- Wrong answers produce precise explanation, a smaller repair, a nearby example, retry, and future review. Model answers unlock only after an honest attempt.
- Reader services enter through `yomu-bridge` interfaces. Academy does not fork annotation, dictionary, grammar, SRS, mining, immersion, pronunciation, KanjiVG, Doodle, OCR/PDF, subtitle, or localisation internals.
- One `AudioDirector` owns music, ambience, lesson/voice, and SFX; silence is valid and no electro drone fallback exists.
- The six-season story ends at graduation. Long-term life continues through NG+, alumni storylets, recurring mock seasons, source replay, SRS encounters, and Immersion Hall without undoing the ending.

## Cast and safety truth

- Real classmates supply wholesome chemistry; high-risk real events become fictional but emotionally equivalent.
- Rose is canon. Two phone-number-only contacts remain unidentified and outside the cast. Pho is not canon.
- Every classmate needs meaningful learning appearances, three bond steps, a journal profile, replay, expressions, and bond stars.
- Aakash defaults to hat-free normal hair. Tom is blond and clean-shaven. Character likeness expands to expressions only after a neutral sample passes review.
- Pop-culture references arise naturally and create a language task; Academy never copies protected game/anime UI or characters into its own assets.

## Engineering truth

- Canonical repo: `/Users/heru/Documents/Projects/yomu/apps/yomu-reader`, branch `main`.
- Donors/worktrees are read-only and inventoried in `evidence/stage-0/inventory.json`; use `SALVAGE-LEDGER.md` before porting.
- Public content is versioned, validated, sharded, and lazy-loaded. Large/private archives stay out of the userscript and public bundle.
- Core orchestrators target 300 lines. Content is data. Plugins do not import plugins. CSS is layered and never uses broad descendant `span` rules around annotated Japanese.
- User-visible copy needs English and Japanese entries; Japanese QA must show no `未翻訳`.
- Generated `dist/yomu.user.js` remains readable and under the Greasy Fork 2 MB limit; bundle size is architectural.
- Browser visual evidence uses the real app, not fixture screenshots, and waits for Japanese annotations before layout assertions.
- Completed work is pushed and relevant deployment triggered. User-facing releases require a non-draft latest GitHub Release with built `yomu.user.js`.

## Current protected local state

The main checkout also contains pre-Academy Reader/NHK work. Do not include it in Academy commits accidentally. See `STATUS.md` for paths and stash `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` for the pre-fast-forward safety copy.
