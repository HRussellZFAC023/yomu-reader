import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertSafeWorkingDirectory,
  defaultAcquisitionPath,
  downloadToPartialFile,
  parseCommonArguments,
  placeContentAddressedObject,
  readJson,
  readJsonIfExists,
  safeIdentifier,
  sha256File,
  validateYomitanZip,
  writeJsonAtomic,
} from './lib.mjs';
import { crawlPublicDriveFolder } from './drive-inventory.mjs';

export async function buildAcquisitionQueue(config, inventory = null) {
  const queue = [];
  for (const source of config.sources ?? []) {
    validateAcquisitionSource(source, `sources.${source.id ?? '?'}`);
    if (source.acquisitionReview !== 'allowed') continue;
    queue.push({
      sourceId: source.id,
      filename: source.filename,
      relativePath: source.filename,
      downloadUrl: source.url,
      acquisitionKind: 'direct',
      redistributionReview: source.redistributionReview,
    });
  }
  for (const collection of config.collections ?? []) {
    if (collection.acquisitionReview !== 'allowed') continue;
    if (collection.method !== 'google-drive-folder') throw new Error(`Unsupported collection method: ${collection.method}`);
    const collectionInventory = inventory
      ? inventory.collections?.find(candidate => candidate.collectionId === collection.id)
      : await crawlPublicDriveFolder(collection);
    if (!collectionInventory) throw new Error(`Inventory does not include collection: ${collection.id}`);
    for (const file of collectionInventory.entries ?? []) {
      queue.push({
        sourceId: `drive-${file.id}`,
        collectionId: collection.id,
        sourceFileId: file.id,
        filename: file.name,
        relativePath: file.relativePath,
        downloadUrl: file.sourceUrl,
        acquisitionKind: 'google-drive',
        redistributionReview: collection.redistributionReview,
      });
    }
  }
  const unique = new Map();
  for (const item of queue) {
    const key = item.sourceFileId ? `drive:${item.sourceFileId}` : `url:${item.downloadUrl}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function acquireQueue(queue, options) {
  const stagingRoot = assertSafeWorkingDirectory(options.staging, 'dictionary staging directory');
  const ledgerPath = resolve(stagingRoot, 'acquisition-ledger.v1.json');
  const ledger = await readJsonIfExists(ledgerPath, {
    schemaVersion: 1,
    snapshotRevision: options.snapshotRevision,
    updatedAt: new Date(0).toISOString(),
    artifacts: [],
    failures: [],
  });
  const artifactsBySource = new Map(ledger.artifacts.map(artifact => [artifact.sourceId, artifact]));
  const failures = [];
  await mkdir(resolve(stagingRoot, '.partial'), { recursive: true });
  for (const item of queue) {
    const previous = artifactsBySource.get(item.sourceId);
    if (previous && await verifiedExistingArtifact(previous, stagingRoot)) {
      console.log(`[resume] ${item.relativePath} -> ${previous.object.key}`);
      continue;
    }
    const partialPath = resolve(stagingRoot, '.partial', `${safeIdentifier(item.sourceId)}.zip.part`);
    try {
      const download = await downloadToPartialFile(item.downloadUrl, partialPath);
      const dictionary = await validateYomitanZip(partialPath);
      const sha256 = await sha256File(partialPath);
      const placed = await placeContentAddressedObject(partialPath, stagingRoot, sha256);
      const bytes = (await stat(placed.path)).size;
      const artifact = {
        sourceId: item.sourceId,
        ...(item.collectionId ? { collectionId: item.collectionId } : {}),
        ...(item.sourceFileId ? { sourceFileId: item.sourceFileId } : {}),
        filename: item.filename,
        relativePath: item.relativePath,
        sourceUrl: item.downloadUrl,
        acquiredAt: new Date().toISOString(),
        redistributionReview: item.redistributionReview,
        dictionary,
        object: {
          key: placed.key,
          sha256,
          bytes,
          contentType: 'application/zip',
        },
      };
      artifactsBySource.set(item.sourceId, artifact);
      console.log(`[${download.resumed ? 'resumed' : 'downloaded'}] ${item.relativePath} -> ${placed.key}${placed.deduplicated ? ' (deduplicated)' : ''}`);
      await persistLedger(ledgerPath, ledger, artifactsBySource, failures);
    } catch (error) {
      const failure = {
        sourceId: item.sourceId,
        relativePath: item.relativePath,
        failedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
      failures.push(failure);
      console.error(`[failed] ${item.relativePath}: ${failure.message}`);
      await persistLedger(ledgerPath, ledger, artifactsBySource, failures);
    }
  }
  await persistLedger(ledgerPath, ledger, artifactsBySource, failures);
  return { ledgerPath, artifacts: [...artifactsBySource.values()], failures };
}

async function verifiedExistingArtifact(artifact, stagingRoot) {
  if (!artifact?.object?.key || !artifact.object.sha256) return false;
  const path = resolve(stagingRoot, artifact.object.key);
  try {
    const info = await stat(path);
    if (info.size !== artifact.object.bytes) return false;
    return await sha256File(path) === artifact.object.sha256;
  } catch {
    return false;
  }
}

async function persistLedger(path, base, artifactsBySource, runFailures) {
  const priorFailures = (base.failures ?? []).filter(
    failure => !runFailures.some(candidate => candidate.sourceId === failure.sourceId),
  );
  await writeJsonAtomic(path, {
    schemaVersion: 1,
    snapshotRevision: base.snapshotRevision,
    updatedAt: new Date().toISOString(),
    artifacts: [...artifactsBySource.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    failures: [...priorFailures, ...runFailures],
  });
}

function validateAcquisitionSource(source, path) {
  if (!source || typeof source !== 'object') throw new Error(`${path} must be an object.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id ?? '')) throw new Error(`${path}.id must be kebab-case.`);
  const url = new URL(source.url);
  if (url.protocol !== 'https:') throw new Error(`${path}.url must use HTTPS.`);
  if (typeof source.filename !== 'string' || !source.filename.toLowerCase().endsWith('.zip')) {
    throw new Error(`${path}.filename must name a ZIP archive.`);
  }
}

async function main() {
  const args = parseCommonArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/dictionaries/acquire.mjs [--config FILE] [--inventory FILE] [--staging-dir DIR] [--only ID] [--execute]');
    console.log('The default is a network inventory dry run. --execute is required before files are downloaded.');
    return;
  }
  const configPath = resolve(args.config || defaultAcquisitionPath);
  const config = await readJson(configPath);
  const inventory = args.inventory ? await readJson(args.inventory) : null;
  let queue = await buildAcquisitionQueue(config, inventory);
  if (args.only.length) {
    const wanted = new Set(args.only);
    queue = queue.filter(item => wanted.has(item.sourceId) || (item.collectionId && wanted.has(item.collectionId)));
  }
  console.log(JSON.stringify({
    mode: args.execute ? 'execute' : 'dry-run',
    snapshotRevision: config.snapshotRevision,
    artifacts: queue.length,
    direct: queue.filter(item => item.acquisitionKind === 'direct').length,
    googleDrive: queue.filter(item => item.acquisitionKind === 'google-drive').length,
    stagingDirectory: resolve(args.staging),
    publication: 'The frozen collection has confirmed redistribution rights. Publication still requires verified connector metadata and matching SHA-256 objects.',
  }, null, 2));
  if (!args.execute) return;
  const result = await acquireQueue(queue, {
    staging: args.staging,
    snapshotRevision: config.snapshotRevision,
  });
  if (result.failures.length) {
    throw new Error(`${result.failures.length} dictionary acquisition(s) failed. Resume by running the same command again.`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
