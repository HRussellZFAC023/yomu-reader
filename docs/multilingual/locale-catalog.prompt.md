<!-- Owner: multilingual-coordinator -->

# Reproducible locale-catalogue prompt

Use this prompt as the starting point for each locale thread. Replace bracketed values from the frozen roster.

> You own only `src/reader/locales/catalogs/[ID].ts`. Read `docs/multilingual/AGENTS.md`, `Decisions.md`, and the English source catalogue. Translate every message into [NATIVE NAME] for a Japanese-language learner. Preserve all `{placeholders}` exactly. Keep `よむ`, Japanese source text, dictionary names, and provider names unchanged. Use [SCRIPT] and [DIRECTION]. Set status to `machine-draft`, run the locale tests, then adversarially review the copy as a native [NATIVE NAME] speaker encountering Yomu for the first time. Do not claim `native-reviewed`; return uncertain terminology as findings for a human reviewer.

After human review, the locale owner may set `native-reviewed` and attach browser evidence to the closure ledger. Automated processes must never overwrite that state.
