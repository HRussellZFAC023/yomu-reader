// Is the installed dependency tree the one package-lock.json pins?
//
// scripts/lib/artifact-drift.mjs fails a gate run by ELIMINATION: the pipeline
// rewrote tracked build output, the tree carried no edit that could explain it,
// therefore the committed copy was stale. That inference has exactly one other
// explanation, and it is common on a workstation where many worktrees share one
// node_modules: the bytes were not produced by the pinned toolchain at all. A
// single off-lockfile bundler emits different bundles from identical sources --
// on this machine an fflate 0.8.3 installed against a 0.8.2 pin inserted one
// comment line into every bundle, and the guard read 11 rewritten artifacts as
// proof that HEAD was stale when HEAD was fine.
//
// So before the guard accuses a commit, it asks this module whether the machine
// is even in a position to judge. A wrong diagnosis is worse than no diagnosis:
// the old message told the operator to commit build output that came from the
// wrong dependency versions.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Packages whose installed version differs from the version package-lock.json
 * pins, as `{ path, pinned, installed }` in lockfile order.
 *
 * Returns an empty list when there is no lockfile to compare against, which is
 * the honest answer: no pin, no claim.
 */
export function offLockfilePackages(cwd) {
    let lockfile;
    try {
        lockfile = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'));
    } catch {
        return [];
    }
    const mismatched = [];
    for (const [path, entry] of Object.entries(lockfile?.packages ?? {})) {
        // '' is the root project; `link: true` entries are workspace symlinks
        // whose real version lives at their target's own lockfile entry.
        if (!path || entry?.link || typeof entry?.version !== 'string') continue;
        let installed;
        try {
            installed = JSON.parse(readFileSync(join(cwd, path, 'package.json'), 'utf8'))?.version;
        } catch {
            // ABSENCE IS NOT THE SIGNAL. Optional platform-specific packages
            // (the esbuild/rollup/sharp binaries for every OS but this one) are
            // missing by design on every machine, and a dependency that is
            // genuinely needed and genuinely missing fails the build stage long
            // before this runs. Only a WRONG version is quiet enough to reach
            // here and change the output bytes.
            continue;
        }
        if (typeof installed === 'string' && installed !== entry.version) {
            mismatched.push({ path, pinned: entry.version, installed });
        }
    }
    return mismatched;
}
