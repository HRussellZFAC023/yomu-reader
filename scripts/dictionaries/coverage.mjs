// The three things the catalogue cannot check about itself.
//
// 1. Does the object behind a `published` entry exist? Settings turns every
//    published entry into an Install button pointed at objectsBaseUrl + key.
//    Nothing else in the repository can answer this: upload.mjs checks a local
//    staging tree that a fresh clone does not have, and verify-live.mjs needs
//    both the network and that same tree. A published entry naming a digest
//    nobody uploaded is worse than no entry at all — it is a 404 Install
//    button — so the digest has to be checked against observed reality.
//    mirror-objects.v1.json is that observation, written by
//    record-mirror-objects.mjs from live HEAD responses.
//
// 2. Did anything staged get dropped on the way to publication? The release
//    catalogue is rebuilt from manifests/v1 plus an operator-supplied connector
//    inventory, and the merge is keyed by id. An id that changes shape, or a
//    base entry the connector overwrites, disappears silently.
//
// 3. Is anything upstream missing entirely? A dictionary nobody ever acquired
//    leaves no trace in the catalogue, so a complete catalogue and one missing
//    twelve dictionaries look identical from the inside. upstream-coverage.v1.json
//    records what the frozen sources actually hold; these assertions make the
//    catalogue answer for every one of those artifacts.
import { resolve } from 'node:path';
import {
  contentAddressedObjectKey,
  defaultManifestRoot,
  defaultMirrorObjectLedgerPath,
  defaultPublishedManifestRoot,
  defaultUpstreamCoveragePath,
  readJson,
} from './lib.mjs';

export function publishedEntries(catalog) {
  return (catalog.entries ?? []).filter(entry => entry.distribution?.state === 'published');
}

/**
 * Fails when a catalogue entry offers an object the mirror is not known to
 * serve. Both directions of the object record are checked, because a digest
 * that is present but describes a different size is the same broken download
 * with a friendlier failure mode.
 */
export function assertPublishedObjectsResolvable(catalog, ledger) {
  if (ledger?.schemaVersion !== 1) throw new Error('Mirror object ledger schemaVersion must equal 1.');
  const known = new Map((ledger.objects ?? []).map(object => [object.sha256, object]));
  if (!known.size) throw new Error('Mirror object ledger is empty; run scripts/dictionaries/record-mirror-objects.mjs --write.');
  const problems = [];
  for (const entry of publishedEntries(catalog)) {
    const object = entry.distribution.object;
    if (!object) {
      problems.push(`${entry.id} is published without an object`);
      continue;
    }
    if (object.key !== contentAddressedObjectKey(object.sha256)) {
      problems.push(`${entry.id} object key ${object.key} is not addressed by its SHA-256`);
      continue;
    }
    if (!Number.isSafeInteger(object.bytes) || object.bytes <= 0) {
      problems.push(`${entry.id} object size ${object.bytes} is not a positive integer`);
      continue;
    }
    const observed = known.get(object.sha256);
    if (!observed) {
      problems.push(`${entry.id} publishes ${object.key}, which the mirror has never been observed to serve`);
      continue;
    }
    if (observed.bytes !== object.bytes) {
      problems.push(`${entry.id} publishes ${object.bytes} bytes but the mirror serves ${observed.bytes} for ${object.key}`);
    }
  }
  if (problems.length) {
    throw new Error(
      `${problems.length} published catalogue entr${problems.length === 1 ? 'y has' : 'ies have'} no resolvable object. `
      + 'Each one renders an Install button in Settings that downloads nothing. '
      + 'Either upload the object and re-run scripts/dictionaries/record-mirror-objects.mjs --write, '
      + 'or set the entry to distribution.state "source-only" so Settings offers a guide link instead:'
      + `\n  ${problems.sort().join('\n  ')}`,
    );
  }
  return { publishedEntries: publishedEntries(catalog).length, ledgerObjects: known.size };
}

/**
 * Fails when publication loses an entry the pre-release manifests carry. A
 * staged entry may legitimately gain an object on the way through; it may never
 * vanish.
 */
export function assertStagedEntriesReachPublished(stagingCatalog, publishedCatalog) {
  const publishedById = new Map((publishedCatalog.entries ?? []).map(entry => [entry.id, entry]));
  const dropped = (stagingCatalog.entries ?? []).filter(entry => !publishedById.has(entry.id));
  if (dropped.length) {
    throw new Error(
      `${dropped.length} staged catalogue entr${dropped.length === 1 ? 'y' : 'ies'} never reached the published catalogue: `
      + `${dropped.map(entry => entry.id).sort().join(', ')}. `
      + 'The release merge is keyed by id, so a renamed or connector-overwritten id disappears without any other symptom.',
    );
  }
  return { stagedEntries: (stagingCatalog.entries ?? []).length, publishedEntries: publishedById.size };
}

/**
 * Fails when the catalogue does not account for every artifact the upstream
 * survey recorded.
 */
export function assertUpstreamCoverage(coverage, catalog) {
  if (coverage?.schemaVersion !== 1) throw new Error('Upstream coverage ledger schemaVersion must equal 1.');
  const entryById = new Map((catalog.entries ?? []).map(entry => [entry.id, entry]));
  const digests = new Set(publishedEntries(catalog).map(entry => entry.distribution.object.sha256));
  const problems = [];
  let artifactCount = 0;
  for (const collection of coverage.collections ?? []) {
    for (const artifact of collection.artifacts ?? []) {
      artifactCount += 1;
      const where = `${collection.id}/${artifact.path}`;
      for (const id of artifact.catalogEntryIds ?? []) {
        if (!entryById.has(id)) problems.push(`${where} names catalogue entry ${id}, which does not exist`);
      }
      if (artifact.disposition === 'mirrored') {
        if (artifact.sha256 && !digests.has(artifact.sha256)) {
          problems.push(`${where} is recorded as mirrored but no published entry serves ${artifact.sha256}`);
        }
        for (const id of artifact.catalogEntryIds ?? []) {
          const entry = entryById.get(id);
          if (entry && entry.distribution?.state !== 'published') {
            problems.push(`${where} is recorded as mirrored but ${id} is ${entry.distribution?.state ?? 'missing a distribution'}`);
          }
        }
      }
      if (artifact.disposition === 'catalogued-not-mirrored') {
        for (const id of artifact.catalogEntryIds ?? []) {
          const entry = entryById.get(id);
          if (!entry) continue;
          if (entry.source?.url !== artifact.downloadUrl) {
            problems.push(`${where} is catalogued as ${id}, whose source URL is ${entry.source?.url} rather than ${artifact.downloadUrl}`);
          }
        }
      }
      if (artifact.disposition === 'superseded') {
        for (const id of artifact.catalogEntryIds ?? []) {
          const entry = entryById.get(id);
          if (entry && entry.distribution?.state !== 'published') {
            problems.push(`${where} is recorded as superseded by ${id}, which is not published`);
          }
        }
      }
    }
    if (collection.expectedCatalogEntries !== undefined) {
      const prefix = collection.catalogEntryIdPrefix ?? '';
      const actual = (catalog.entries ?? []).filter(entry => entry.id.startsWith(prefix)).length;
      if (actual !== collection.expectedCatalogEntries) {
        problems.push(`${collection.id} expects ${collection.expectedCatalogEntries} catalogue entries with id prefix "${prefix}", found ${actual}`);
      }
    }
  }
  if (problems.length) {
    throw new Error(`Upstream coverage ledger and catalogue disagree in ${problems.length} place(s):\n  ${problems.sort().join('\n  ')}`);
  }
  return {
    collections: (coverage.collections ?? []).length,
    artifacts: artifactCount,
    unsurveyedCollections: (coverage.unsurveyedCollections ?? []).length,
  };
}

/**
 * Fails when an unmirrored catalogue row would render as a dead card.
 *
 * Settings builds a card for every catalogue entry whose headword language
 * matches, published or not. A published row gets an Install button; a row
 * without an object falls back to a "Guide" link built from source.projectUrl,
 * and with neither it renders a name, a size-less description and no action at
 * all. Describing an upstream dictionary the mirror has not taken is useful only
 * if the reader can still go and get it, so every unmirrored row has to carry
 * somewhere to go.
 */
export function assertUnmirroredEntriesAreExplorable(catalog) {
  const dead = (catalog.entries ?? []).filter(
    entry => entry.distribution?.state !== 'published' && !entry.source?.projectUrl,
  );
  if (dead.length) {
    throw new Error(
      `${dead.length} unmirrored catalogue entr${dead.length === 1 ? 'y has' : 'ies have'} no source.projectUrl: `
      + `${dead.map(entry => entry.id).sort().join(', ')}. `
      + 'Settings renders these as a card with no Install button and no guide link — a name and nothing to do with it.',
    );
  }
  return { unmirroredEntries: (catalog.entries ?? []).filter(entry => entry.distribution?.state !== 'published').length };
}

/**
 * Fails when a catalogue entry names an acquisition source that does not exist.
 * An entry with no acquisition source can never be mirrored: the acquisition run
 * has no URL to fetch, so the entry stays source-only for ever with nothing in
 * the repository saying why.
 */
export function assertEntriesAreAcquirable(catalog, acquisition) {
  const sourceIds = new Set((acquisition.sources ?? []).map(source => source.id));
  const collectionIds = new Set((acquisition.collections ?? []).map(collection => collection.id));
  const orphans = (catalog.entries ?? []).filter(entry => {
    const id = entry.source?.acquisitionId ?? '';
    if (sourceIds.has(id)) return false;
    // Collection members are minted as `<collectionId>-<remoteFileId>`.
    return ![...collectionIds].some(collectionId => id.startsWith(`${collectionId}-`) || id.startsWith('drive-'));
  });
  if (orphans.length) {
    throw new Error(
      `${orphans.length} catalogue entr${orphans.length === 1 ? 'y names an' : 'ies name'} acquisition source(s) that do not exist: `
      + `${orphans.map(entry => `${entry.id} -> ${entry.source?.acquisitionId}`).sort().join(', ')}`,
    );
  }
  return { entries: (catalog.entries ?? []).length, sources: sourceIds.size };
}

export async function assertDictionaryCoverage({
  manifestRoot = defaultManifestRoot,
  publishedManifestRoot = defaultPublishedManifestRoot,
  ledgerPath = defaultMirrorObjectLedgerPath,
  coveragePath = defaultUpstreamCoveragePath,
  acquisitionPath = resolve(defaultManifestRoot, '../../acquisition.v1.json'),
} = {}) {
  const [staging, published, ledger, coverage, acquisition] = await Promise.all([
    readJson(resolve(manifestRoot, 'catalog.json')),
    readJson(resolve(publishedManifestRoot, 'catalog.json')),
    readJson(ledgerPath),
    readJson(coveragePath),
    readJson(acquisitionPath),
  ]);
  return {
    objects: assertPublishedObjectsResolvable(published, ledger),
    staging: assertStagedEntriesReachPublished(staging, published),
    coverage: assertUpstreamCoverage(coverage, published),
    acquirable: assertEntriesAreAcquirable(published, acquisition),
    explorable: assertUnmirroredEntriesAreExplorable(published),
  };
}
