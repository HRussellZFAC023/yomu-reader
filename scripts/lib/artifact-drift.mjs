// Does a gate run rewrite the build output the commit already ships?
//
// The check pipeline regenerates its artifacts before anything inspects them
// (build -> sync-docs-userscript -> build:academy -> docs:build -> verify), so
// `verify` only ever compares freshly written bytes with freshly written bytes.
// It cannot see a stale COMMITTED artifact. What it can see -- and what this
// module reports -- is the gate quietly rewriting tracked build output on its
// way through. On a commit whose artifacts are current that cannot happen, so
// when it does happen the committed copy was stale.
//
// scripts/check-committed-artifacts.mjs is the other half of the guard: it
// reads committed bytes out of git and asserts the things it knows how to name
// (version stamps, cache-busting hashes, pinned companions). This half needs no
// such knowledge -- it catches drift in ANY generated artifact, including ones
// nobody thought to write an assertion for.
import { execFileSync } from 'node:child_process';
import { GENERATED_ARTIFACT_PATHS } from './generated-artifacts.mjs';

// UNTRACKED FILES ARE DRIFT, BUT THEY ARE NOT A SOURCE EDIT
//
// The two questions this module asks want opposite treatment of `??` entries:
//
//   "did the gate produce an artifact that is not committed?"  -- untracked
//      files COUNT. A fresh content-addressed companion is a NEW file, and the
//      userscript header already pins its URL: miss it and every @require 404s
//      at install time. This is exactly what `git add -u` drops.
//
//   "could an uncommitted edit of mine explain that?"  -- untracked files do
//      NOT count. A file nothing tracks cannot change output derived from
//      tracked sources; referencing it would itself modify a tracked file.
//      Counting them meant any stray file downgraded a hard failure into a
//      note -- including docs/.vitepress/.temp/, which the gate's own
//      docs:build stage creates, so the guard disarmed itself on every run
//      after the first.
//
// Each question therefore asks git for exactly the entries it wants, rather
// than asking once and filtering: `--untracked-files=all` below, `no` for the
// source-edit question.

/**
 * Generated artifacts this run added, changed or deleted relative to HEAD.
 * Untracked files included: a new companion is drift the release must stage.
 */
export function artifactDrift(cwd) {
    // `all`, not the default `normal`: git otherwise collapses a wholly
    // untracked directory to `docs/public/greasyfork/` and the operator never
    // sees WHICH companion is the new one.
    return porcelain(cwd, GENERATED_ARTIFACT_PATHS, 'all');
}

/**
 * Whether a tracked file is modified anywhere in the tree, which is the one
 * innocent explanation for regenerated output: you changed something the build
 * reads. Untracked files are ignored (see above) and so is the artifact churn
 * itself, which is the effect being explained rather than a cause.
 */
export function hasUncommittedSourceEdits(cwd) {
    // `no`: untracked files are not a source edit, and not enumerating them
    // keeps this off the working tree's untracked walk entirely.
    return porcelain(cwd, [], 'no').length > 0;
}

/**
 * Verdict for the end of a gate run.
 *
 * Stale committed artifacts are a hard failure: the tree carried no edit that
 * could explain the rewrite, so HEAD ships build output that does not match its
 * own sources -- which is how yomureader.com/study/ served a 1.8.14 build under
 * the 1.8.15 release. With local edits present the rewrite is expected, so the
 * run reports the paths to stage instead of failing.
 */
export function describeArtifactDrift({ drifted, sourceEdits }) {
    if (drifted.length === 0) return { ok: true, lines: [] };
    const paths = drifted.map(path => `  ${path}`);
    if (sourceEdits) {
        return {
            ok: true,
            lines: [
                '',
                '[check] this run regenerated tracked build output:',
                ...paths,
                // Directory paths, not the individual files: `git add -u` stages
                // modifications only and would leave a new companion behind.
                `[check] stage it with your change: git add -f -- ${GENERATED_ARTIFACT_PATHS.join(' ')}`,
            ],
        };
    }
    return {
        ok: false,
        lines: [
            '',
            '[check] FAIL artifact-drift — nothing in the tree explains this, so HEAD ships stale build output:',
            ...paths,
            '[check] Commit the regenerated files above.',
        ],
    };
}

// `git status --porcelain` v1: two status columns, a space, then the path.
// Renames arrive as `R  old -> new`; the destination is what exists on disk.
function porcelain(cwd, paths = [], untracked = 'normal') {
    let output;
    try {
        output = execFileSync('git', ['status', '--porcelain', `--untracked-files=${untracked}`, '--', ...paths], {
            cwd,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch {
        // No git and no repository means no committed baseline to compare
        // against. Report nothing rather than guess.
        return [];
    }
    return output
        .split('\n')
        .filter(Boolean)
        .map(line => unquote(line.slice(3).split(' -> ').pop().trim()));
}

// Paths with unusual bytes come back C-quoted.
function unquote(path) {
    if (!path.startsWith('"') || !path.endsWith('"')) return path;
    try {
        return JSON.parse(path);
    } catch {
        return path;
    }
}
