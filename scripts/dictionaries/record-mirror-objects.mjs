// Records, as tracked repository evidence, which content-addressed dictionary
// objects the live mirror actually serves.
//
// The catalogue is the only thing Settings reads, and a catalogue entry in the
// `published` state renders an Install button pointed at
// `objectsBaseUrl + object.key`. Nothing in the repository previously knew
// whether that key exists: `upload.mjs` checks the local staging tree (absent
// from a fresh clone, ~6 GB when present) and `verify-live.mjs` needs both the
// network and that same staging tree. So a hand-edited entry naming a digest
// that was never uploaded passed every gate and shipped a 404 Install button.
//
// This script turns "the object exists" into a fact the release gate can check
// offline: it HEADs every distinct published object against the mirror and
// writes the observations to config/dictionaries/mirror-objects.v1.json. The
// gate then requires every published entry's digest to appear in that ledger.
// Re-run it after any upload; the ledger is append-only in practice because R2
// objects are immutable and are not deleted when an entry is retired.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  defaultMirrorObjectLedgerPath,
  defaultPublishedManifestRoot,
  readJson,
  writeJsonAtomic,
} from './lib.mjs';

const DEFAULT_BASE_URL = 'https://dictionaries.yomureader.com';

export function distinctPublishedObjects(catalog) {
  const byDigest = new Map();
  for (const entry of catalog.entries ?? []) {
    if (entry.distribution?.state !== 'published') continue;
    const object = entry.distribution.object;
    const existing = byDigest.get(object.sha256);
    if (existing && existing.bytes !== object.bytes) {
      throw new Error(`Catalogue disagrees with itself about ${object.sha256}: ${existing.bytes} vs ${object.bytes} bytes.`);
    }
    if (!existing) byDigest.set(object.sha256, { key: object.key, sha256: object.sha256, bytes: object.bytes });
  }
  return [...byDigest.values()].sort((left, right) => left.sha256.localeCompare(right.sha256));
}

export async function recordMirrorObjects({
  baseUrl = DEFAULT_BASE_URL,
  manifestRoot = defaultPublishedManifestRoot,
  ledgerPath = defaultMirrorObjectLedgerPath,
  concurrency = 12,
  write = false,
  fetchImplementation = fetch,
} = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const catalog = await readJson(resolve(manifestRoot, 'catalog.json'));
  const wanted = distinctPublishedObjects(catalog);
  const observedAt = new Date().toISOString();
  const observations = new Array(wanted.length);
  const failures = [];
  await runPool(wanted, concurrency, async (object, index) => {
    const response = await fetchImplementation(`${normalizedBaseUrl}/${object.key}`, {
      method: 'HEAD',
      headers: { 'cache-control': 'no-cache' },
    });
    const contentLength = response.headers.get('content-length');
    if (!response.ok) {
      failures.push(`${object.key} returned HTTP ${response.status}`);
      return;
    }
    if (contentLength !== String(object.bytes)) {
      failures.push(`${object.key} served ${contentLength} bytes, catalogue records ${object.bytes}`);
      return;
    }
    observations[index] = {
      sha256: object.sha256,
      key: object.key,
      bytes: object.bytes,
      status: response.status,
      observedAt,
    };
  });
  if (failures.length) {
    throw new Error(`The mirror does not serve ${failures.length} published object(s):\n  ${failures.sort().join('\n  ')}`);
  }
  // Previously recorded digests are kept: an object stays in R2 after its
  // catalogue entry is retired, and dropping it would make a rollback to an
  // older catalogue fail the gate for no reason.
  const previous = await readJson(ledgerPath).catch(() => ({ objects: [] }));
  const merged = new Map((previous.objects ?? []).map(object => [object.sha256, object]));
  for (const observation of observations) if (observation) merged.set(observation.sha256, observation);
  const ledger = {
    schemaVersion: 1,
    baseUrl: normalizedBaseUrl,
    generatedAt: observedAt,
    objects: [...merged.values()].sort((left, right) => left.sha256.localeCompare(right.sha256)),
  };
  if (write) await writeJsonAtomic(ledgerPath, ledger);
  return {
    mode: write ? 'write' : 'dry-run',
    baseUrl: normalizedBaseUrl,
    catalogueEntries: catalog.entries.length,
    publishedObjects: wanted.length,
    verifiedObjects: observations.filter(Boolean).length,
    ledgerObjects: ledger.objects.length,
    ledgerPath,
  };
}

async function runPool(items, concurrency, worker) {
  const width = Math.max(1, Math.min(24, Number.isInteger(concurrency) ? concurrency : 12));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  }));
}

async function main() {
  const argv = process.argv.slice(2);
  const options = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') options.write = true;
    else if (argv[index] === '--base-url') options.baseUrl = argv[++index];
    else if (argv[index] === '--manifest-root') options.manifestRoot = argv[++index];
    else if (argv[index] === '--ledger') options.ledgerPath = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  console.log(JSON.stringify(await recordMirrorObjects(options), null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await main();
