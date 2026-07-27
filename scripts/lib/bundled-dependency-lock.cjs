// A runtime dependency is inlined into dist/yomu.user.js and into every
// artifact built from it, so its exact version is part of the bytes we commit.
// When the installed copy drifts from the version package-lock.json pins, every
// committed artifact silently stops matching a fresh build. The symptom shows
// up far from the cause: the artifact comparison reports "stale artifacts" and
// blames whoever is releasing, when nothing about the source changed at all.
// (Seen for real: node_modules held fflate 0.8.3 while the lock pinned 0.8.2,
// which added one comment line to eleven committed artifacts and changed a
// content-addressed companion filename.)
//
// devDependencies are deliberately out of scope. Test and tooling packages do
// not end up in the shipped bytes, so their drift cannot corrupt an artifact.

function collectBundledDependencyDrift(dependencies, lockPackages, readInstalledVersion) {
  const drift = [];
  for (const name of Object.keys(dependencies || {}).sort()) {
    const locked = lockPackages?.[`node_modules/${name}`]?.version;
    if (!locked) continue;
    const installed = readInstalledVersion(name);
    if (installed === locked) continue;
    drift.push({ name, locked, installed: installed || null });
  }
  return drift;
}

function formatBundledDependencyDrift(drift) {
  const detail = drift
    .map(({ name, locked, installed }) =>
      `${name}: package-lock.json pins ${locked}, node_modules has ${installed || 'no installed copy'}`)
    .join('; ');
  return `Bundled dependencies do not match package-lock.json (${detail}). `
    + 'The build inlines these into the userscript and everything derived from it, so committed artifacts '
    + 'cannot match a fresh build until the installed tree matches the lock. Run npm ci. '
    + '(A pnpm install in a shared node_modules is the usual way this drifts.)';
}

module.exports = {
  collectBundledDependencyDrift,
  formatBundledDependencyDrift,
};
