# Website language belongs to the route

Reconsidered 18 September 2026. Retain language-correct rendering and independent preferences. The current theme, prose catalogue and source-hash translation keys are not requirements for the rebrand.

A website locale is separate from the language being studied and the Reader's interface language. Changing the site language must not change either saved preference. Each published route must deliver its selected language in the initial HTML, hydration data, navigation and metadata. Rewriting English content with a browser observer does not satisfy that contract.

The current implementation uses VitePress locale routes, a build-time prose catalogue and a publication ledger. A replacement may use directly authored localized pages or another build system, provided it preserves reachable URLs, accurate metadata and correct first paint. Do not carry the compatibility catalogue into a new site by default.

Publish only reviewed locales. A generated directory, translated Reader labels or a machine draft does not establish reviewed website copy. Missing translations belong in planning and review, not behind claims of full language support.

Acceptance requires rendered-page and browser checks for initial language, hydration, navigation, accessible labels, canonical links and locale alternatives. RTL locales also need layout proof. Language and page counts belong in the publication ledger, not this decision. The rebrand and remaining locale work are unfinished.
