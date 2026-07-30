import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import {
  defaultMirrorObjectLedgerPath,
  defaultPublishedManifestRoot,
  defaultReleaseRoot,
  defaultStagingRoot,
  fileExists,
  parseCommonArguments,
  readJson,
  sha256File,
} from './lib.mjs';
import { assertPublishedObjectsResolvable } from './coverage.mjs';
import {
  expectedRecommendationFilenames,
  parseRecommendationFilename,
} from './recommendation-pairs.mjs';

const execFile = promisify(execFileCallback);
const WORKER_CONFIG = 'workers/yomu-dictionaries/wrangler.jsonc';
const WRANGLER_SINGLE_UPLOAD_LIMIT = 300 * 1024 * 1024;

/**
 * `manifestsOnly` publishes the four manifest kinds and nothing else.
 *
 * Objects are immutable and content-addressed, so a catalogue edit that adds,
 * retires or re-describes rows without changing a single digest needs no object
 * upload at all. The full plan still insists every published object is present
 * in the local staging tree and rehashes it — around 6 GB that a fresh clone
 * does not have and cannot obtain without re-acquiring the whole collection.
 * That made a manifest-only correction cost a full re-acquisition, which is why
 * catalogue fixes did not ship. The safety this drops is the staging rehash, and
 * the mirror object ledger replaces it: every digest in the catalogue has been
 * observed live, and assertPublishedObjectsResolvable fails the release gate if
 * one has not. Objects the catalogue does not yet have are exactly the ones this
 * mode must not invent, and it cannot: it uploads no objects.
 */
export async function buildUploadPlan({
  releaseRoot = defaultReleaseRoot,
  publishedManifestRoot = defaultPublishedManifestRoot,
  stagingRoot = defaultStagingRoot,
  bucket = 'yomu-dictionaries',
  manifestsOnly = false,
} = {}) {
  const releaseV1 = await fileExists(resolve(releaseRoot, 'v1/catalog.json'))
    ? resolve(releaseRoot, 'v1')
    : publishedManifestRoot;
  const catalog = await readJson(resolve(releaseV1, 'catalog.json'));
  const languages = await readJson(resolve(releaseV1, 'languages.json'));
  const items = [
    manifestUpload(bucket, 'v1/catalog.json', resolve(releaseV1, 'catalog.json')),
    manifestUpload(bucket, 'v1/languages.json', resolve(releaseV1, 'languages.json')),
  ];
  const recommendationFiles = (await readdir(resolve(releaseV1, 'recommendations')))
    .filter(name => name.endsWith('.json'))
    .sort();
  await assertPublishableManifestSet(releaseV1, catalog, languages, recommendationFiles);
  if (releaseV1 !== publishedManifestRoot) {
    await assertManifestSetMatchesTrackedPublished(releaseV1, publishedManifestRoot, recommendationFiles);
  }
  if (manifestsOnly) {
    // Skipping the staging rehash is only safe while something else vouches for
    // the objects. Fail here rather than publish a catalogue whose Install
    // buttons point at keys nobody has seen.
    assertPublishedObjectsResolvable(catalog, await readJson(defaultMirrorObjectLedgerPath));
  }
  for (const filename of recommendationFiles) {
    items.push(manifestUpload(bucket, `v1/recommendations/${filename}`, resolve(releaseV1, 'recommendations', filename)));
  }
  for (const entry of manifestsOnly ? [] : catalog.entries) {
    if (entry.distribution?.state !== 'published') continue;
    const object = entry.distribution.object;
    const path = resolve(stagingRoot, object.key);
    if (!await fileExists(path)) throw new Error(`Published object is missing from staging: ${object.key}`);
    const info = await stat(path);
    if (info.size !== object.bytes) throw new Error(`Published object size mismatch: ${object.key}`);
    if (await sha256File(path) !== object.sha256) throw new Error(`Published object SHA-256 mismatch: ${object.key}`);
    items.push({
      bucket,
      key: object.key,
      path,
      contentType: 'application/zip',
      cacheControl: 'public, max-age=31536000, immutable',
    });
  }
  return deduplicateUploadItems(items);
}

export async function buildAcquiredObjectUploadPlan({
  stagingRoot = defaultStagingRoot,
  bucket = 'yomu-dictionaries',
} = {}) {
  const ledger = await readJson(resolve(stagingRoot, 'acquisition-ledger.v1.json'));
  const items = [];
  for (const artifact of ledger.artifacts ?? []) {
    const object = artifact.object;
    const path = resolve(stagingRoot, object.key);
    if (!await fileExists(path)) continue;
    const info = await stat(path);
    if (info.size !== object.bytes) throw new Error(`Acquired object size mismatch: ${object.key}`);
    if (await sha256File(path) !== object.sha256) throw new Error(`Acquired object SHA-256 mismatch: ${object.key}`);
    items.push({
      bucket,
      key: object.key,
      path,
      contentType: 'application/zip',
      cacheControl: 'public, max-age=31536000, immutable',
    });
  }
  if (!items.length) throw new Error('No locally acquired dictionary objects are available to upload.');
  return deduplicateUploadItems(items);
}

// A catalogue row that is not published carries no object and therefore no
// Install button; Settings renders it as a guide link to the upstream project.
// That is how the catalogue describes a dictionary the mirror has not taken yet,
// and refusing to upload such a catalogue would mean the only way to record an
// unmirrored upstream dictionary is to leave it out — which is precisely how the
// gap stayed invisible. What must never ship is the opposite mistake: a row that
// claims publication with no object behind it, or a catalogue that has stopped
// publishing anything at all.
// `upstream` rows are served by their own publishing project, so an upload run
// has nothing to do for them — but it must still recognise the state, or a
// catalogue that offers a language its whole shelf reads as corrupt here.
const DISTRIBUTION_STATES = new Set(['published', 'source-only', 'blocked', 'upstream']);

async function assertPublishableManifestSet(root, catalog, languages, recommendationFiles) {
  if (languages.count !== 32 || languages.languages?.length !== 32) {
    throw new Error('Dictionary upload requires the exact 32-language Slice 1 manifest.');
  }
  const learnerLanguages = languages.languages.map(language => language.tag);
  const expectedFiles = expectedRecommendationFilenames(learnerLanguages).sort();
  if (
    recommendationFiles.length !== expectedFiles.length
    || recommendationFiles.some((filename, index) => filename !== expectedFiles[index])
  ) {
    throw new Error(
      `Dictionary upload requires the complete ${expectedFiles.length}-manifest learner-target matrix, found ${recommendationFiles.length}.`,
    );
  }
  const unknownState = catalog.entries.filter(entry => !DISTRIBUTION_STATES.has(entry.distribution?.state));
  if (unknownState.length) {
    throw new Error(`Dictionary upload refuses ${unknownState.length} catalogue entries in an unknown distribution state: ${unknownState.map(entry => `${entry.id}=${entry.distribution?.state}`).sort().join(', ')}.`);
  }
  const publishedEntries = catalog.entries.filter(entry => entry.distribution.state === 'published');
  if (!publishedEntries.length) {
    throw new Error('Dictionary upload refuses a catalogue that publishes nothing; it would replace the live catalogue with one Settings can install none of.');
  }
  const withoutObject = publishedEntries.filter(entry => !entry.distribution.object?.sha256);
  if (withoutObject.length) {
    throw new Error(`Dictionary upload refuses ${withoutObject.length} published entries with no object: ${withoutObject.map(entry => entry.id).sort().join(', ')}.`);
  }
  const publishedIds = new Set(publishedEntries.map(entry => entry.id));
  const entryById = new Map(catalog.entries.map(entry => [entry.id, entry]));
  await runPool(recommendationFiles, 32, async filename => {
    const pair = parseRecommendationFilename(filename, learnerLanguages);
    if (!pair) throw new Error(`Dictionary upload refuses invalid recommendation filename: ${filename}`);
    const recommendation = await readJson(resolve(root, 'recommendations', filename));
    if (
      recommendation.learnerLanguage !== pair.learnerLanguage
      || recommendation.targetLanguage !== pair.targetLanguage
    ) {
      throw new Error(`${filename} fields do not match its learner-target filename.`);
    }
    if (recommendation.readiness !== 'ready' || recommendation.blockers?.length) {
      throw new Error(`Dictionary upload refuses blocked recommendation manifest: ${filename}`);
    }
    for (const item of recommendation.dictionaries ?? []) {
      if (!publishedIds.has(item.dictionaryId)) {
        throw new Error(`${filename} references unpublished dictionary ${item.dictionaryId}.`);
      }
      if (!entryById.get(item.dictionaryId)?.headwordLanguages?.includes(pair.targetLanguage)) {
        throw new Error(`${filename} references ${item.dictionaryId}, which does not cover ${pair.targetLanguage} headwords.`);
      }
    }
  });
}

async function assertManifestSetMatchesTrackedPublished(releaseRoot, publishedRoot, recommendationFiles) {
  const paths = [
    'catalog.json',
    'languages.json',
    ...recommendationFiles.map(filename => `recommendations/${filename}`),
  ];
  for (const path of paths) {
    const [releaseBytes, publishedBytes] = await Promise.all([
      readFile(resolve(releaseRoot, path)),
      readFile(resolve(publishedRoot, path)),
    ]);
    if (!releaseBytes.equals(publishedBytes)) {
      throw new Error(`Prepared dictionary release differs from tracked published snapshot: ${path}`);
    }
  }
}

export async function uploadDictionaryRelease(items, {
  execute = false,
  bucket = 'yomu-dictionaries',
  confirmBucket = '',
  concurrency = 4,
  resumeUrl = '',
  uploadImplementation = uploadItem,
} = {}) {
  if (execute && confirmBucket !== bucket) {
    throw new Error(`Remote upload requires --confirm-bucket ${bucket}. No resources were changed.`);
  }
  const plan = items.map(item => ({
    destination: `${item.bucket}/${item.key}`,
    file: item.path,
    contentType: item.contentType,
    cacheControl: item.cacheControl,
  }));
  if (!execute) return { mode: 'dry-run', uploads: plan };
  const ordered = publicationOrder(items);
  const objects = ordered.filter(item => item.key.startsWith('objects/sha256/'));
  const recommendations = ordered.filter(item => item.key.startsWith('v1/recommendations/'));
  const finalManifests = ordered.filter(item =>
    !item.key.startsWith('objects/sha256/')
    && !item.key.startsWith('v1/recommendations/'));
  let completed = 0;
  let skipped = 0;
  let uploadedBytes = 0;
  let skippedBytes = 0;
  await runPool(objects, concurrency, async item => {
    const size = (await stat(item.path)).size;
    if (resumeUrl && await remoteObjectMatches(resumeUrl, item.key, size)) {
      completed += 1;
      skipped += 1;
      skippedBytes += size;
      console.log(`[verified ${completed}/${ordered.length}] ${item.key}`);
      return;
    }
    if (size > WRANGLER_SINGLE_UPLOAD_LIMIT) {
      throw new Error(
        `${item.key} is larger than Wrangler's 300 MiB single-object limit. `
        + 'Run scripts/dictionaries/upload-large-objects.mjs first and set YOMU_DICTIONARY_RESUME_URL.',
      );
    }
    await uploadImplementation(item);
    completed += 1;
    uploadedBytes += size;
    console.log(`[uploaded ${completed}/${ordered.length}] ${item.key}`);
  });
  await runPool(recommendations, concurrency, async item => {
    await uploadImplementation(item);
    completed += 1;
    console.log(`[uploaded ${completed}/${ordered.length}] ${item.key}`);
  });
  // Languages describe the matrix and the catalogue points at every object.
  // Publish both only after all pair manifests, with the catalogue last.
  for (const item of finalManifests) {
    await uploadImplementation(item);
    completed += 1;
    console.log(`[uploaded ${completed}/${ordered.length}] ${item.key}`);
  }
  return {
    mode: 'execute',
    uploads: plan,
    uploadedObjects: objects.length - skipped,
    uploadedBytes,
    skipped,
    skippedBytes,
  };
}

export async function remoteObjectMatches(baseUrl, key, size, {
  fetchImplementation = fetch,
  wait = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds)),
} = {}) {
  const url = new URL(key, `${baseUrl.replace(/\/+$/, '')}/`);
  let response;
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    response = await fetchImplementation(url, { method: 'HEAD' }).catch(() => null);
    if (response?.status === 404) return false;
    if (response?.ok) break;
    lastError = response
      ? `HTTP ${response.status}`
      : 'network request failed';
    if (attempt < 6) {
      await wait(Math.min(4_000, 500 * 2 ** (attempt - 1)));
    }
  }
  if (!response?.ok) throw new Error(`Dictionary resume HEAD failed for ${key}: ${lastError}.`);
  const digest = /^objects\/sha256\/([a-f0-9]{64})\.zip$/.exec(key)?.[1];
  return response.headers.get('content-length') === String(size)
    && response.headers.get('x-content-sha256') === digest;
}

async function uploadItem(item) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await execFile('npx', [
        'wrangler',
        'r2',
        'object',
        'put',
        `${item.bucket}/${item.key}`,
        '--file',
        item.path,
        '--content-type',
        item.contentType,
        '--cache-control',
        item.cacheControl,
        '--remote',
        '--config',
        WORKER_CONFIG,
      ], { cwd: resolve(import.meta.dirname, '../..'), maxBuffer: 8 * 1024 * 1024 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise(resolveWait => setTimeout(resolveWait, 1_000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

function manifestUpload(bucket, key, path) {
  return {
    bucket,
    key,
    path,
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'public, max-age=300, must-revalidate',
  };
}

function deduplicateUploadItems(items) {
  const byDestination = new Map();
  for (const item of items) {
    const destination = `${item.bucket}/${item.key}`;
    const existing = byDestination.get(destination);
    if (existing && existing.path !== item.path) {
      throw new Error(`Upload destination collision: ${destination}`);
    }
    if (!existing) byDestination.set(destination, item);
  }
  return [...byDestination.values()];
}

function publicationOrder(items) {
  const objects = items.filter(item => item.key.startsWith('objects/sha256/'));
  const manifests = items.filter(item => !item.key.startsWith('objects/sha256/'));
  const rank = key => key === 'v1/catalog.json' ? 2 : key === 'v1/languages.json' ? 1 : 0;
  manifests.sort((left, right) => rank(left.key) - rank(right.key) || left.key.localeCompare(right.key));
  return [...objects, ...manifests];
}

async function runPool(items, concurrency, worker) {
  const width = Math.max(1, Math.min(8, Number.isInteger(concurrency) ? concurrency : 4));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }));
}

async function main() {
  const argv = process.argv.slice(2);
  const manifestsOnly = argv.includes('--manifests-only');
  const acquiredObjectsOnly = argv.includes('--acquired-objects-only');
  const args = parseCommonArguments(argv, new Set(['--manifests-only', '--acquired-objects-only']));
  if (args.help) {
    console.log('Usage: node scripts/dictionaries/upload.mjs [--release-dir DIR] [--staging-dir DIR] [--bucket NAME] [--manifests-only|--acquired-objects-only] [--execute --confirm-bucket NAME]');
    console.log('The default is a non-mutating upload plan. This command never creates or deletes an R2 bucket.');
    console.log('--manifests-only publishes the catalogue, language and recommendation manifests without touching objects, for a catalogue edit that adds no new content hash. It needs no staging tree.');
    return;
  }
  if (manifestsOnly && acquiredObjectsOnly) throw new Error('Choose only one upload mode.');
  const plan = acquiredObjectsOnly
    ? await buildAcquiredObjectUploadPlan({ stagingRoot: args.staging, bucket: args.bucket })
    : await buildUploadPlan({
      releaseRoot: args.release,
      stagingRoot: args.staging,
      bucket: args.bucket,
      manifestsOnly,
    });
  const result = await uploadDictionaryRelease(plan, {
    execute: args.execute,
    bucket: args.bucket,
    confirmBucket: args.confirmBucket,
    resumeUrl: process.env.YOMU_DICTIONARY_RESUME_URL ?? '',
  });
  console.log(JSON.stringify(
    result.mode === 'execute' ? { ...result, uploads: result.uploads.length } : result,
    null,
    2,
  ));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
