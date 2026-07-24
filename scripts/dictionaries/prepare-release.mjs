import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertSafeWorkingDirectory,
  defaultManifestRoot,
  defaultReleaseRoot,
  defaultStagingRoot,
  parseCommonArguments,
  readJson,
  writeJsonAtomic,
} from './lib.mjs';
import { ingestVerifiedConnectorManifest } from './ingest-verified-connector-manifest.mjs';

export async function prepareDictionaryRelease({
  manifestRoot = defaultManifestRoot,
  stagingRoot = defaultStagingRoot,
  releaseRoot = defaultReleaseRoot,
  connectorInventory = null,
  write = false,
} = {}) {
  const safeReleaseRoot = assertSafeWorkingDirectory(releaseRoot, 'dictionary release directory');
  const baseCatalog = structuredClone(await readJson(resolve(manifestRoot, 'catalog.json')));
  const languages = await readJson(resolve(manifestRoot, 'languages.json'));
  const ledger = await readJson(resolve(stagingRoot, 'acquisition-ledger.v1.json'));
  const catalog = connectorInventory
    ? ingestVerifiedConnectorManifest(baseCatalog, connectorInventory, ledger)
    : baseCatalog;
  const artifactBySource = new Map(ledger.artifacts.map(artifact => [artifact.sourceId, artifact]));
  let promoted = 0;
  for (const entry of catalog.entries) {
    const artifact = artifactBySource.get(entry.source.acquisitionId);
    if (!artifact || entry.license.redistribution !== 'allowed' || artifact.redistributionReview !== 'allowed') continue;
    entry.distribution = { state: 'published', object: artifact.object };
    promoted += 1;
  }
  const recommendations = [];
  const recommendationFiles = (await readdir(resolve(manifestRoot, 'recommendations')))
    .filter(name => name.endsWith('-ja.json'))
    .sort();
  const publishedIds = new Set(
    catalog.entries.filter(entry => entry.distribution.state === 'published').map(entry => entry.id),
  );
  for (const filename of recommendationFiles) {
    const recommendation = structuredClone(await readJson(resolve(manifestRoot, 'recommendations', filename)));
    const dictionariesPublished = recommendation.dictionaries.every(item => publishedIds.has(item.dictionaryId));
    if (dictionariesPublished) {
      recommendation.blockers = recommendation.blockers.filter(blocker => blocker !== 'dictionary-objects-not-yet-mirrored');
      recommendation.readiness = recommendation.blockers.length ? 'blocked' : 'ready';
    }
    recommendations.push({ filename, manifest: recommendation });
  }
  const summary = {
    mode: write ? 'write' : 'dry-run',
    releaseRoot: safeReleaseRoot,
    catalogEntries: catalog.entries.length,
    promotedObjects: promoted,
    readyLanguages: recommendations.filter(item => item.manifest.readiness === 'ready').length,
    blockedLanguages: recommendations.filter(item => item.manifest.readiness === 'blocked').length,
  };
  if (!write) return summary;
  await writeJsonAtomic(resolve(safeReleaseRoot, 'v1/catalog.json'), catalog);
  await writeJsonAtomic(resolve(safeReleaseRoot, 'v1/languages.json'), languages);
  for (const recommendation of recommendations) {
    await writeJsonAtomic(
      resolve(safeReleaseRoot, 'v1/recommendations', recommendation.filename),
      recommendation.manifest,
    );
  }
  return summary;
}

async function main() {
  const args = parseCommonArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/dictionaries/prepare-release.mjs [--inventory VERIFIED_CONNECTOR_FILE] [--staging-dir DIR] [--release-dir DIR] [--write]');
    console.log('Without --write the command reports which licence-approved, hash-verified objects would be promoted.');
    return;
  }
  const summary = await prepareDictionaryRelease({
    stagingRoot: args.staging,
    releaseRoot: args.release,
    connectorInventory: args.inventory ? await readJson(args.inventory) : null,
    write: args.write,
  });
  console.log(JSON.stringify(summary, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
