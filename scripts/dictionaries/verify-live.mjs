import { open, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://dictionaries.yomureader.com';
const SAMPLE_BYTES = 128;

export async function verifyLiveDictionaryRelease({
  baseUrl = DEFAULT_BASE_URL,
  releaseRoot = 'artifacts/dictionaries-release',
  stagingRoot = 'artifacts/dictionaries-staging',
  concurrency = 12,
} = {}) {
  const releaseV1 = resolve(releaseRoot, 'v1');
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const manifestPaths = [
    ['v1/catalog.json', resolve(releaseV1, 'catalog.json')],
    ['v1/languages.json', resolve(releaseV1, 'languages.json')],
  ];
  const recommendationNames = (await readdir(resolve(releaseV1, 'recommendations')))
    .filter(name => name.endsWith('-ja.json'))
    .sort();
  for (const name of recommendationNames) {
    manifestPaths.push([
      `v1/recommendations/${name}`,
      resolve(releaseV1, 'recommendations', name),
    ]);
  }

  await runPool(manifestPaths, concurrency, async ([key, localPath]) => {
    const expected = await readFile(localPath);
    const response = await fetch(`${normalizedBaseUrl}/${key}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`Live manifest ${key} returned HTTP ${response.status}.`);
    const actual = new Uint8Array(await response.arrayBuffer());
    if (!Buffer.from(actual).equals(expected)) throw new Error(`Live manifest bytes differ: ${key}`);
    if (response.headers.get('access-control-allow-origin') !== '*') {
      throw new Error(`Live manifest is missing public CORS: ${key}`);
    }
  });

  const catalog = JSON.parse(await readFile(resolve(releaseV1, 'catalog.json'), 'utf8'));
  const publishedByKey = new Map();
  for (const entry of catalog.entries) {
    if (entry.distribution?.state !== 'published') continue;
    publishedByKey.set(entry.distribution.object.key, entry.distribution.object);
  }
  const objects = [...publishedByKey.values()];
  await runPool(objects, concurrency, async object => {
    const url = `${normalizedBaseUrl}/${object.key}`;
    const head = await fetch(url, { method: 'HEAD', headers: { 'cache-control': 'no-cache' } });
    if (!head.ok) throw new Error(`Live object HEAD returned HTTP ${head.status}: ${object.key}`);
    if (head.headers.get('content-length') !== String(object.bytes)) {
      throw new Error(`Live object size differs: ${object.key}`);
    }
    if (head.headers.get('x-content-sha256') !== object.sha256) {
      throw new Error(`Live object digest metadata differs: ${object.key}`);
    }
    if (head.headers.get('accept-ranges') !== 'bytes') {
      throw new Error(`Live object does not advertise ranges: ${object.key}`);
    }

    const sampleLength = Math.min(SAMPLE_BYTES, object.bytes);
    const offsets = object.bytes > sampleLength
      ? [0, object.bytes - sampleLength]
      : [0];
    const handle = await open(resolve(stagingRoot, object.key), 'r');
    try {
      for (const offset of offsets) {
        const expected = Buffer.alloc(sampleLength);
        const { bytesRead } = await handle.read(expected, 0, sampleLength, offset);
        if (bytesRead !== sampleLength) throw new Error(`Local sample read failed: ${object.key}`);
        const response = await fetch(url, {
          headers: {
            range: `bytes=${offset}-${offset + sampleLength - 1}`,
            'cache-control': 'no-cache',
          },
        });
        if (response.status !== 206) {
          throw new Error(`Live object range returned HTTP ${response.status}: ${object.key}`);
        }
        const actual = Buffer.from(await response.arrayBuffer());
        if (!actual.equals(expected)) throw new Error(`Live object sample differs: ${object.key}@${offset}`);
      }
    } finally {
      await handle.close();
    }
  });

  const health = await fetch(`${normalizedBaseUrl}/healthz`, {
    headers: { 'cache-control': 'no-cache' },
  });
  if (!health.ok) throw new Error(`Dictionary health endpoint returned HTTP ${health.status}.`);
  const healthPayload = await health.json();
  if (healthPayload?.status !== 'ok' || healthPayload?.learnerLanguageCount !== 32) {
    throw new Error('Dictionary health payload does not describe the Slice 1 service.');
  }

  return {
    baseUrl: normalizedBaseUrl,
    manifestCount: manifestPaths.length,
    recommendationCount: recommendationNames.length,
    catalogueEntryCount: catalog.entries.length,
    uniqueObjectCount: objects.length,
    uniqueObjectBytes: objects.reduce((total, object) => total + object.bytes, 0),
    sampledRanges: objects.reduce((total, object) => total + (object.bytes > SAMPLE_BYTES ? 2 : 1), 0),
  };
}

async function runPool(items, concurrency, worker) {
  const width = Math.max(1, Math.min(24, Number.isInteger(concurrency) ? concurrency : 12));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }));
}

function parseArguments(argv) {
  const result = {
    baseUrl: DEFAULT_BASE_URL,
    releaseRoot: 'artifacts/dictionaries-release',
    stagingRoot: 'artifacts/dictionaries-staging',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new Error('Usage: node scripts/dictionaries/verify-live.mjs [--base-url URL] [--release-dir DIR] [--staging-dir DIR]');
    }
    index += 1;
    if (flag === '--base-url') result.baseUrl = value;
    else if (flag === '--release-dir') result.releaseRoot = value;
    else if (flag === '--staging-dir') result.stagingRoot = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return result;
}

async function main() {
  const result = await verifyLiveDictionaryRelease(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await main();
