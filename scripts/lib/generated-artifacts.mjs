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
//
// The immutable stylesheet needs the same treatment without a directory to sit
// in: it is written as docs/public/yomu.<hash>.css beside the mutable copy, so
// every release renames it and no entry above ever matched the new name. Both
// consumers take these as git pathspecs, where the wildcard is matched by git
// itself, so `git add` and `git status --porcelain` see the same set.
import { pathToFileURL } from 'node:url';

export const GENERATED_ARTIFACT_PATHS = [
    'config/ci/content-addressed-retention.json',
    'dist/yomu.user.js',
    'dist/yomu.css',
    'docs/public/yomu.user.js',
    'docs/public/yomu.css',
    'docs/public/yomu.*.css',
    'docs/public/hosted-runtime-graph.js',
    // The Reader sync stamps the immutable runtime graph into these hosted
    // shells. hosted-reader-worker.js is authored source, not generated output.
    'docs/public/pdf-reader/index.html',
    'docs/public/pdf-reader/sw.js',
    'docs/public/video-player/index.html',
    'docs/public/video-player/sw.js',
    'docs/public/greasyfork',
    'docs/public/study',
    'docs/public/newtab',
    'docs/public/api',
    // Academy is the one generated route that is NOT committed wholesale. Its
    // mirror is rebuilt from public/academy on every build:academy, so the tracked
    // duplicate bought nothing and cost 239 MB; .gitignore now keeps it out. Only
    // these four are still committed, so only these four belong here -- naming the
    // directory would make the Build Userscript workflow's `git add -f` re-commit
    // all 859 ignored mirror files. The workflow rebuilds that mirror so these
    // four published shell files stay coherent, but only these four are release
    // artifacts Git needs to own.
    'docs/public/academy/app.js',
    'docs/public/academy/style.css',
    'docs/public/academy/index.html',
    'docs/public/academy/sw.js',
];

// `node scripts/lib/generated-artifacts.mjs` prints the list for shell callers
// (see .github/workflows/build-userscript.yml).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(GENERATED_ARTIFACT_PATHS.join('\n'));
}
