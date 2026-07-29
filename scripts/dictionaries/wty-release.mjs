import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SLICE1_LANGUAGES } from './build-frozen-manifests.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const defaultWtySnapshotPath = resolve(repositoryRoot, 'config/dictionaries/wty-release.v1.json');
export const WTY_DATASET = 'daxida/wty-release';
export const WTY_TREE_ROOT = `https://huggingface.co/api/datasets/${WTY_DATASET}/tree`;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export async function fetchWtyReleaseSnapshot({
  fetchImplementation = fetch,
  generatedAt = new Date().toISOString(),
} = {}) {
  const roster = SLICE1_LANGUAGES.map(language => language.tag);
  const artifacts = [];
  const metadataResponse = await fetchWithRetries(
    fetchImplementation,
    `https://huggingface.co/api/datasets/${WTY_DATASET}`,
  );
  const metadata = await metadataResponse.json();
  const datasetCommit = metadata.sha;
  if (!/^[a-f0-9]{40}$/.test(datasetCommit ?? '')) {
    throw new Error('WTY dataset metadata did not return a frozen Git revision.');
  }
  for (const headwordLanguage of roster) {
    const url = `${WTY_TREE_ROOT}/${datasetCommit}/latest/dict/${headwordLanguage}?recursive=true&limit=1000`;
    const response = await fetchWithRetries(fetchImplementation, url);
    const entries = await response.json();
    for (const entry of entries) {
      const parts = entry.path?.split('/') ?? [];
      if (entry.type !== 'file' || parts.length !== 5 || !entry.path.endsWith('.zip')) continue;
      const definitionLanguage = parts[3];
      if (!roster.includes(definitionLanguage)) continue;
      const filename = parts[4];
      const sha256 = entry.lfs?.oid;
      if (!SHA256_PATTERN.test(sha256 ?? '')) {
        throw new Error(`WTY archive has no usable LFS SHA-256: ${entry.path}`);
      }
      if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.lfs?.size !== entry.size) {
        throw new Error(`WTY archive has inconsistent byte metadata: ${entry.path}`);
      }
      artifacts.push({
        id: filename.slice(0, -4),
        path: entry.path,
        filename,
        headwordLanguage,
        definitionLanguage,
        category: filename.endsWith('-ipa.zip') ? 'pronunciation' : 'terms',
        variant: filename.endsWith('-ipa.zip') ? 'ipa' : filename.endsWith('-gloss.zip') ? 'gloss' : 'terms',
        bytes: entry.size,
        sha256,
      });
    }
    console.log(`[wty snapshot] ${headwordLanguage}: ${artifacts.filter(item => item.headwordLanguage === headwordLanguage).length} archives`);
  }
  artifacts.sort((left, right) => left.path.localeCompare(right.path));
  const ids = new Set(artifacts.map(artifact => artifact.id));
  if (ids.size !== artifacts.length) throw new Error('WTY archive ids are not unique.');
  const pairDirectories = new Set(artifacts.map(artifact => `${artifact.headwordLanguage}/${artifact.definitionLanguage}`));
  const expectedPaths = [...pairDirectories].flatMap(pair => {
    const [headword, definition] = pair.split('/');
    return [
      `latest/dict/${pair}/wty-${headword}-${definition}.zip`,
      `latest/dict/${pair}/wty-${headword}-${definition}-ipa.zip`,
    ];
  });
  const actualPaths = new Set(artifacts.map(artifact => artifact.path));
  const missingExpectedPaths = expectedPaths.filter(path => !actualPaths.has(path)).sort();
  const alternatePaths = artifacts
    .filter(artifact => artifact.variant === 'gloss')
    .map(artifact => artifact.path)
    .sort();
  return {
    schemaVersion: 1,
    dataset: WTY_DATASET,
    datasetCommit,
    generatedAt,
    roster,
    pairDirectories: pairDirectories.size,
    archiveCount: artifacts.length,
    totalBytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    missingExpectedPaths,
    alternatePaths,
    artifacts,
  };
}

async function fetchWithRetries(fetchImplementation, url) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetchImplementation(url, {
        headers: { 'user-agent': 'yomu-dictionary-pipeline/1.0' },
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500 * 2 ** (attempt - 1)));
  }
  throw new Error(`WTY tree request failed for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const outputIndex = argv.indexOf('--output');
  const output = outputIndex >= 0 ? resolve(argv[outputIndex + 1]) : defaultWtySnapshotPath;
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/dictionaries/wty-release.mjs [--write] [--output FILE]');
    return;
  }
  const snapshot = await fetchWtyReleaseSnapshot();
  console.log(JSON.stringify({
    mode: write ? 'write' : 'dry-run',
    datasetCommit: snapshot.datasetCommit,
    pairDirectories: snapshot.pairDirectories,
    archiveCount: snapshot.archiveCount,
    totalBytes: snapshot.totalBytes,
    missingExpectedPaths: snapshot.missingExpectedPaths.length,
    alternatePaths: snapshot.alternatePaths.length,
    output,
  }, null, 2));
  if (write) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await main();
