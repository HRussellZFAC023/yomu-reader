import { randomBytes } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { open, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { buildUploadPlan } from './upload.mjs';

const execFile = promisify(execFileCallback);
const UPLOADER_CONFIG = 'workers/yomu-dictionaries/wrangler.upload.jsonc';
const UPLOADER_NAME = 'yomu-dictionaries-uploader';
const WRANGLER_SINGLE_UPLOAD_LIMIT = 300 * 1024 * 1024;
const PART_SIZE = 100 * 1024 * 1024;
const PART_CONCURRENCY = 6;
const OBJECT_CONCURRENCY = 3;

export async function uploadLargeDictionaryObjects({
  releaseRoot,
  stagingRoot,
  bucket = 'yomu-dictionaries',
}) {
  if (bucket !== 'yomu-dictionaries') throw new Error('The reviewed multipart uploader is restricted to yomu-dictionaries.');
  const plan = await buildUploadPlan({ releaseRoot, stagingRoot, bucket });
  const copySources = await loadDriveCopySources(stagingRoot);
  const copyAllDrive = process.env.YOMU_DICTIONARY_COPY_ALL_DRIVE === '1';
  const selectedObjects = [];
  for (const item of plan) {
    if (!item.key.startsWith('objects/sha256/')) continue;
    const size = (await stat(item.path)).size;
    const sourceUrl = copySources.get(item.key);
    if (size > WRANGLER_SINGLE_UPLOAD_LIMIT || (copyAllDrive && sourceUrl)) {
      selectedObjects.push({ ...item, size, sourceUrl });
    }
  }
  if (!selectedObjects.length) return { uploaded: 0, bytes: 0 };

  const token = randomBytes(32).toString('base64url');
  const resumeUrl = process.env.YOMU_DICTIONARY_RESUME_URL?.trim() ?? '';
  let uploaderUrl;
  try {
    uploaderUrl = await deployTemporaryUploader(token);
    await waitForUploader(uploaderUrl, token);
    // workers.dev route propagation can be edge-specific even after the first
    // health request succeeds. Give all upload paths a short convergence window.
    await new Promise(resolveWait => setTimeout(resolveWait, 15_000));
    let completedBytes = 0;
    let uploaded = 0;
    await runPool(selectedObjects.map((item, index) => ({ item, index })), OBJECT_CONCURRENCY, async selected => {
      const { item, index } = selected;
      const { size, sourceUrl } = item;
      if (await remoteObjectMatches(resumeUrl || uploaderUrl, resumeUrl ? '' : token, item.key, size)) {
        completedBytes += size;
        console.log(`[multipart ${index + 1}/${selectedObjects.length}] already present ${item.key}`);
        return;
      }
      await uploadOneObjectWithRetry(uploaderUrl, token, item, size, sourceUrl, (completed, total) => {
        console.log(`[multipart ${index + 1}/${selectedObjects.length}] ${item.key} parts ${completed}/${total}`);
      });
      if (!await remoteObjectMatches(uploaderUrl, token, item.key, size)) {
        throw new Error(`Multipart verification failed for ${item.key}.`);
      }
      completedBytes += size;
      uploaded += 1;
      console.log(`[multipart ${index + 1}/${selectedObjects.length}] complete ${item.key}`);
    });
    return { uploaded, verified: selectedObjects.length, bytes: completedBytes };
  } finally {
    if (uploaderUrl) await deleteTemporaryUploader();
  }
}

async function uploadOneObjectWithRetry(baseUrl, token, item, size, sourceUrl, onProgress) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await uploadOneObject(baseUrl, token, item, size, sourceUrl, onProgress);
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      console.warn(`[multipart retry ${attempt}/3] ${item.key}`);
      await new Promise(resolveWait => setTimeout(resolveWait, 20_000));
    }
  }
  throw lastError;
}

async function uploadOneObject(baseUrl, token, item, size, sourceUrl, onProgress) {
  const objectUrl = `${baseUrl}/${item.key}`;
  const created = await retryJson(`${objectUrl}?action=create`, {
    method: 'POST',
    headers: authorization(token),
  });
  const uploadId = requiredText(created.uploadId, 'uploadId');
  const totalParts = Math.ceil(size / PART_SIZE);
  const uploadedParts = new Array(totalParts);
  let completed = 0;
  const handle = sourceUrl ? null : await open(item.path, 'r');
  try {
    await runPool(Array.from({ length: totalParts }, (_, index) => index), PART_CONCURRENCY, async index => {
      const offset = index * PART_SIZE;
      const length = Math.min(PART_SIZE, size - offset);
      const partNumber = index + 1;
      if (sourceUrl) {
        uploadedParts[index] = await retryJson(
          `${objectUrl}?action=copy&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}&offset=${offset}&length=${length}`,
          {
            method: 'PUT',
            headers: {
              ...authorization(token),
              'x-yomu-source-url': sourceUrl,
            },
          },
        );
      } else {
        const data = Buffer.allocUnsafe(length);
        let bytesRead = 0;
        while (bytesRead < length) {
          const result = await handle.read(data, bytesRead, length - bytesRead, offset + bytesRead);
          if (!result.bytesRead) throw new Error(`Unexpected EOF reading ${item.path}.`);
          bytesRead += result.bytesRead;
        }
        uploadedParts[index] = await retryJson(
          `${objectUrl}?action=upload&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
          {
            method: 'PUT',
            headers: {
              ...authorization(token),
              'content-type': 'application/octet-stream',
              'content-length': String(length),
            },
            body: data,
          },
        );
      }
      completed += 1;
      onProgress(completed, totalParts);
    });
    await requestJson(`${objectUrl}?action=complete&uploadId=${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      headers: {
        ...authorization(token),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parts: uploadedParts }),
    });
  } catch (error) {
    await fetch(`${objectUrl}?action=abort&uploadId=${encodeURIComponent(uploadId)}`, {
      method: 'DELETE',
      headers: authorization(token),
    }).catch(() => undefined);
    throw error;
  } finally {
    await handle?.close();
  }
}

async function loadDriveCopySources(stagingRoot) {
  const ledgerPath = join(stagingRoot, 'acquisition-ledger.v1.json');
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  if (!Array.isArray(ledger.artifacts)) throw new Error(`Invalid acquisition ledger: ${ledgerPath}`);
  const sources = new Map();
  for (const artifact of ledger.artifacts) {
    if (artifact?.sourceNormalization || typeof artifact?.sourceUrl !== 'string') continue;
    let source;
    try {
      source = new URL(artifact.sourceUrl);
    } catch {
      continue;
    }
    if (source.protocol !== 'https:' || source.hostname !== 'drive.usercontent.google.com' || source.pathname !== '/download') continue;
    const key = artifact?.object?.key;
    if (typeof key === 'string' && /^objects\/sha256\/[a-f0-9]{64}\.zip$/.test(key)) {
      sources.set(key, source.href);
    }
  }
  return sources;
}

async function remoteObjectMatches(baseUrl, token, key, size) {
  let response;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    response = await fetch(`${baseUrl}/${key}`, {
      method: 'HEAD',
      headers: token ? authorization(token) : undefined,
    }).catch(() => null);
    if (response?.ok) break;
    if (attempt < 5) await new Promise(resolveWait => setTimeout(resolveWait, attempt * 500));
  }
  if (response?.status === 404) return false;
  if (!response?.ok) throw new Error(`Multipart HEAD failed${response ? ` with HTTP ${response.status}` : ''}.`);
  const digest = key.match(/([a-f0-9]{64})\.zip$/)?.[1];
  return response.headers.get('content-length') === String(size)
    && response.headers.get('x-content-sha256') === digest;
}

async function retryJson(url, init) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      return await requestJson(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < 8) await new Promise(resolveWait => setTimeout(resolveWait, Math.min(attempt * 750, 3_000)));
    }
  }
  throw lastError;
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    const detail = text.trim().slice(0, 160);
    throw new Error(`Multipart request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}.`);
  }
  return text ? JSON.parse(text) : {};
}

function authorization(token) {
  return { authorization: `Bearer ${token}` };
}

async function deployTemporaryUploader(token) {
  try {
    const { stdout } = await execFile('npx', [
      'wrangler',
      'deploy',
      '--config',
      UPLOADER_CONFIG,
      '--var',
      `UPLOAD_TOKEN:${token}`,
    ], {
      cwd: resolve(import.meta.dirname, '../..'),
      maxBuffer: 8 * 1024 * 1024,
    });
    const url = stdout.match(/https:\/\/[^\s]+\.workers\.dev/u)?.[0];
    if (!url) throw new Error('Wrangler did not report the temporary uploader URL.');
    console.log('Temporary authenticated multipart uploader deployed.');
    return url;
  } catch {
    throw new Error('Temporary multipart uploader deployment failed.');
  }
}

async function waitForUploader(baseUrl, token) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const response = await fetch(`${baseUrl}/health`, {
      headers: authorization(token),
    }).catch(() => null);
    consecutiveReadyChecks = response?.status === 400 ? consecutiveReadyChecks + 1 : 0;
    if (consecutiveReadyChecks >= 10) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error('Temporary multipart uploader did not become reachable.');
}

async function deleteTemporaryUploader() {
  try {
    await execFile('npx', [
      'wrangler',
      'delete',
      UPLOADER_NAME,
      '--config',
      UPLOADER_CONFIG,
      '--force',
    ], {
      cwd: resolve(import.meta.dirname, '../..'),
      maxBuffer: 8 * 1024 * 1024,
    });
    console.log('Temporary multipart uploader removed.');
  } catch {
    throw new Error('Temporary multipart uploader cleanup failed.');
  }
}

async function runPool(items, concurrency, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }));
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`Multipart response is missing ${label}.`);
  return value;
}

function parseArguments(argv) {
  const result = {
    releaseRoot: 'artifacts/dictionaries-release',
    stagingRoot: 'artifacts/dictionaries-staging',
    bucket: 'yomu-dictionaries',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error('Usage: node scripts/dictionaries/upload-large-objects.mjs [--release-dir DIR] [--staging-dir DIR] [--bucket yomu-dictionaries]');
    index += 1;
    if (flag === '--release-dir') result.releaseRoot = value;
    else if (flag === '--staging-dir') result.stagingRoot = value;
    else if (flag === '--bucket') result.bucket = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return result;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await uploadLargeDictionaryObjects({
    releaseRoot: resolve(args.releaseRoot),
    stagingRoot: resolve(args.stagingRoot),
    bucket: args.bucket,
  });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
