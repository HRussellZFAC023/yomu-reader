// Single source of truth for the tracked files the build pipeline regenerates.
//
// These paths are committed build output: the hosted Study app, the published
// OpenAPI specs, the reader stylesheet, and the content-addressed Greasy Fork
// companions the userscript header pins by URL + SRI hash. Anything that stages
// build output (the Build Userscript workflow) or asks "did this run mutate
// tracked artifacts?" (scripts/run-check.mjs) reads the list from here.
//
// It lives in one place because the duplicate that went stale is exactly how
// yomureader.com/study/ ended up serving a 1.8.14 build under a 1.8.15 release:
// the workflow's hand-maintained `git add` list still named the old
// docs/public/newtab route and never learned about docs/public/study or the
// published API specs, so those artifacts were never committed again.
//
// Directory entries are deliberate. `git add` on a directory picks up NEW files
// as well as modified ones, which is what keeps a fresh content-addressed
// companion from being left behind while the userscript header already pins its
// URL -- a missing companion is a hard 404 on every @require at install time.
import { pathToFileURL } from 'node:url';

export const GENERATED_ARTIFACT_PATHS = [
    'dist/yomu.user.js',
    'dist/yomu.css',
    'docs/public/yomu.user.js',
    'docs/public/yomu.css',
    'docs/public/greasyfork',
    'docs/public/study',
    'docs/public/newtab',
    'docs/public/api',
    'docs/public/academy',
];

// `node scripts/lib/generated-artifacts.mjs` prints the list for shell callers
// (see .github/workflows/build-userscript.yml).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(GENERATED_ARTIFACT_PATHS.join('\n'));
}
