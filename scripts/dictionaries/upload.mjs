import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import {
  defaultPublishedManifestRoot,
  defaultReleaseRoot,
  defaultStagingRoot,
  fileExists,
  parseCommonArguments,
  readJson,
  sha256File,
} from './lib.mjs';

const execFile = promisify(execFileCallback);
const WORKER_CONFIG = 'workers/yomu-dictionaries/wrangler.jsonc';
const WRANGLER_SINGLE_UPLOAD_LIMIT = 300 * 1024 * 1024;

export async function buildUploadPlan({
  releaseRoot = defaultReleaseRoot,
  publishedManifestRoot = defaultPublishedManifestRoot,
  stagingRoot = defaultStagingRoot,
  bucket = 'yomu-dictionaries',
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
    .filter(name => name.endsWith('-ja.json'))
    .sort();
  await assertPublishableManifestSet(releaseV1, catalog, languages, recommendationFiles);
  if (releaseV1 !== publishedManifestRoot) {
    await assertManifestSetMatchesTrackedPublished(releaseV1, publishedManifestRoot, recommendationFiles);
  }
  for (const filename of recommendationFiles) {
    items.push(manifestUpload(bucket, `v1/recommendations/${filename}`, resolve(releaseV1, 'recommendations', filename)));
  }
  for (const entry of catalog.entries) {
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

async function assertPublishableManifestSet(root, catalog, languages, recommendationFiles) {
  if (languages.count !== 32 || languages.languages?.length !== 32) {
    throw new Error('Dictionary upload requires the exact 32-language Slice 1 manifest.');
  }
  if (recommendationFiles.length !== 32) {
    throw new Error(`Dictionary upload requires 32 recommendation manifests, found ${recommendationFiles.length}.`);
  }
  const unpublished = catalog.entries.filter(entry => entry.distribution?.state !== 'published');
  if (unpublished.length) {
    throw new Error(`Dictionary upload refuses a catalogue with ${unpublished.length} unpublished entries.`);
  }
  const publishedIds = new Set(catalog.entries.map(entry => entry.id));
  for (const filename of recommendationFiles) {
    const recommendation = await readJson(resolve(root, 'recommendations', filename));
    if (recommendation.readiness !== 'ready' || recommendation.blockers?.length) {
      throw new Error(`Dictionary upload refuses blocked recommendation manifest: ${filename}`);
    }
    for (const item of recommendation.dictionaries ?? []) {
      if (!publishedIds.has(item.dictionaryId)) {
        throw new Error(`${filename} references unpublished dictionary ${item.dictionaryId}.`);
      }
    }
  }
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
  const manifests = ordered.filter(item => !item.key.startsWith('objects/sha256/'));
  let completed = 0;
  let skipped = 0;
  await runPool(objects, concurrency, async item => {
    const size = (await stat(item.path)).size;
    if (resumeUrl && await remoteObjectMatches(resumeUrl, item.key, size)) {
      completed += 1;
      skipped += 1;
      console.log(`[verified ${completed}/${ordered.length}] ${item.key}`);
      return;
    }
    if (size > WRANGLER_SINGLE_UPLOAD_LIMIT) {
      throw new Error(
        `${item.key} is larger than Wrangler's 300 MiB single-object limit. `
        + 'Run scripts/dictionaries/upload-large-objects.mjs first and set YOMU_DICTIONARY_RESUME_URL.',
      );
    }
    await uploadItem(item);
    completed += 1;
    console.log(`[uploaded ${completed}/${ordered.length}] ${item.key}`);
  });
  for (const item of manifests) {
    await uploadItem(item);
    completed += 1;
    console.log(`[uploaded ${completed}/${ordered.length}] ${item.key}`);
  }
  return { mode: 'execute', uploads: plan, skipped };
}

async function remoteObjectMatches(baseUrl, key, size) {
  const url = new URL(key, `${baseUrl.replace(/\/+$/, '')}/`);
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (response?.status === 404) return false;
    if (response?.ok) break;
    if (attempt < 3) await new Promise(resolveWait => setTimeout(resolveWait, attempt * 500));
  }
  if (!response?.ok) throw new Error(`Dictionary resume HEAD failed for ${key}.`);
  const digest = /^objects\/sha256\/([a-f0-9]{64})\.zip$/.exec(key)?.[1];
  return response.headers.get('content-length') === String(size)
    && response.headers.get('x-content-sha256') === digest;
}

async function uploadItem(item) {
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
  const args = parseCommonArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/dictionaries/upload.mjs [--release-dir DIR] [--staging-dir DIR] [--bucket NAME] [--execute --confirm-bucket NAME]');
    console.log('The default is a non-mutating upload plan. This command never creates or deletes an R2 bucket.');
    return;
  }
  const plan = await buildUploadPlan({
    releaseRoot: args.release,
    stagingRoot: args.staging,
    bucket: args.bucket,
  });
  const result = await uploadDictionaryRelease(plan, {
    execute: args.execute,
    bucket: args.bucket,
    confirmBucket: args.confirmBucket,
    resumeUrl: process.env.YOMU_DICTIONARY_RESUME_URL ?? '',
  });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
