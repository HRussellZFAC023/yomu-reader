import { createHash } from 'node:crypto';
import { access, copyFile, link, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync, zipSync } from 'fflate';
import {
  assertSafeWorkingDirectory,
  contentAddressedObjectKey,
  readJson,
  safeIdentifier,
  sha256File,
  validateYomitanZip,
  writeJsonAtomic,
} from './lib.mjs';

const EXPECTED_ENTRY_COUNT = 173;
const SNAPSHOT_REVISION = '2026-07-23.574961e8';
const COLLECTION_URL = 'https://drive.google.com/drive/folders/1LXMIOoaWASIntlx1w08njNU005lS5lez';
const PROJECT_URL = 'https://github.com/MarvNC/yomitan-dictionaries';
const FIXED_ZIP_TIME = new Date('2000-01-01T00:00:00.000Z');

export async function materializeConnectorExport({
  inventoryPath,
  sourceRoot,
  stagingRoot,
  outputPath,
}) {
  const safeSourceRoot = assertSafeWorkingDirectory(sourceRoot, 'connector download directory');
  const safeStagingRoot = assertSafeWorkingDirectory(stagingRoot, 'dictionary staging directory');
  const inventory = await readJson(inventoryPath);
  const files = flattenInventory(inventory);
  if (files.length !== EXPECTED_ENTRY_COUNT) {
    throw new Error(`Authenticated connector inventory must contain exactly ${EXPECTED_ENTRY_COUNT} ZIP files; found ${files.length}.`);
  }

  const connectorEntries = [];
  const artifacts = [];
  const catalogIds = new Set();
  let repairedArchives = 0;
  await mkdir(safeStagingRoot, { recursive: true });

  for (const file of files) {
    const sourcePath = resolve(safeSourceRoot, file.relativePath);
    const sourceInfo = await stat(sourcePath);
    if (sourceInfo.size !== file.size) {
      throw new Error(`Downloaded byte count does not match Drive inventory for ${file.relativePath}: ${sourceInfo.size} != ${file.size}.`);
    }
    const materialized = await materializeArchive(sourcePath, safeStagingRoot);
    if (materialized.normalization) repairedArchives += 1;
    const sourceId = `drive-${file.fileId}`;
    const title = displayTitle(file.name);
    const catalogId = uniqueCatalogId(file, catalogIds);
    const languageMetadata = inferLanguages(file);
    const dictionary = materialized.dictionary;
    const sourceUrl = driveDownloadUrl(file.fileId);
    const version = dictionary.revision || inferVersion(file.name);

    connectorEntries.push({
      catalogId,
      sourceId,
      title,
      version,
      categories: inferCategories(file.name),
      headwordLanguages: languageMetadata.headwordLanguages,
      definitionLanguages: languageMetadata.definitionLanguages,
      sourceUrl,
      projectUrl: PROJECT_URL,
      catalogueSection: file.group,
      attribution: `Frozen MarvNC Yomitan dictionary collection item: ${title}`,
      licenseSpdx: null,
      object: materialized.object,
    });
    artifacts.push({
      sourceId,
      collectionId: 'marvnc-public-drive',
      sourceFileId: file.fileId,
      filename: file.name,
      relativePath: file.relativePath,
      sourceUrl,
      acquiredAt: inventory.generatedAt,
      redistributionReview: 'allowed',
      dictionary,
      ...(materialized.normalization ? { sourceNormalization: materialized.normalization } : {}),
      object: materialized.object,
    });
  }

  connectorEntries.sort((left, right) => left.catalogId.localeCompare(right.catalogId));
  artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const connector = {
    schemaVersion: 1,
    snapshotRevision: SNAPSHOT_REVISION,
    expectedEntryCount: EXPECTED_ENTRY_COUNT,
    redistributionRightsConfirmed: true,
    entries: connectorEntries,
  };
  const ledger = {
    schemaVersion: 1,
    snapshotRevision: SNAPSHOT_REVISION,
    updatedAt: new Date().toISOString(),
    artifacts,
    failures: [],
  };
  await writeJsonAtomic(resolve(safeStagingRoot, 'acquisition-ledger.v1.json'), ledger);
  await writeJsonAtomic(outputPath, connector);
  return {
    entries: connectorEntries.length,
    uniqueObjects: new Set(connectorEntries.map(entry => entry.object.sha256)).size,
    repairedArchives,
    bytes: connectorEntries.reduce((total, entry) => total + entry.object.bytes, 0),
    source: COLLECTION_URL,
  };
}

function flattenInventory(inventory) {
  if (!Array.isArray(inventory?.groups)) throw new Error('Connector inventory groups are required.');
  const seenFileIds = new Set();
  return inventory.groups.flatMap(group => {
    if (typeof group?.group !== 'string' || !Array.isArray(group.items)) {
      throw new Error('Every connector inventory group must have a name and items.');
    }
    return group.items.map(item => {
      if (!/^[-_A-Za-z0-9]+$/.test(item.fileId ?? '')) throw new Error(`Invalid Drive file id: ${item.fileId}`);
      if (seenFileIds.has(item.fileId)) throw new Error(`Duplicate Drive file id: ${item.fileId}`);
      if (typeof item.name !== 'string' || extname(item.name).toLowerCase() !== '.zip') {
        throw new Error(`Connector item is not a ZIP archive: ${item.name}`);
      }
      if (!Number.isInteger(item.size) || item.size <= 0) throw new Error(`Invalid Drive byte count for ${item.name}.`);
      seenFileIds.add(item.fileId);
      return {
        fileId: item.fileId,
        name: item.name,
        size: item.size,
        group: group.group,
        relativePath: `${group.group}/${item.name}`,
      };
    });
  });
}

async function materializeArchive(sourcePath, stagingRoot) {
  let archivePath = sourcePath;
  let normalization;
  let dictionary;
  try {
    dictionary = await validateYomitanZip(sourcePath);
  } catch (error) {
    const originalHash = await sha256File(sourcePath);
    archivePath = resolve(stagingRoot, '.normalized', `${originalHash}.zip`);
    await repairArchiveMetadata(sourcePath, archivePath);
    dictionary = await validateYomitanZip(archivePath);
    normalization = {
      kind: 'zip-metadata-rebuild',
      sourceSha256: originalHash,
      reason: error instanceof Error ? error.message : String(error),
      note: 'The source DEFLATE payloads and every JSON file parsed successfully; the ZIP was rebuilt deterministically to replace invalid CRC metadata.',
    };
  }

  const sha256 = await sha256File(archivePath);
  const object = {
    key: contentAddressedObjectKey(sha256),
    sha256,
    bytes: (await stat(archivePath)).size,
    contentType: 'application/zip',
  };
  const objectPath = resolve(stagingRoot, object.key);
  await mkdir(dirname(objectPath), { recursive: true });
  if (!await exists(objectPath)) {
    try {
      await link(archivePath, objectPath);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'EXDEV') throw error;
      await copyFile(archivePath, objectPath);
    }
  } else if (await sha256File(objectPath) !== sha256) {
    throw new Error(`Existing content-addressed object has the wrong hash: ${objectPath}`);
  }
  return { object, normalization, dictionary };
}

async function repairArchiveMetadata(sourcePath, outputPath) {
  const extracted = unzipSync(await readFile(sourcePath));
  const names = Object.keys(extracted).sort();
  if (!names.includes('index.json')) throw new Error(`Cannot normalize ZIP without root index.json: ${sourcePath}`);
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    JSON.parse(new TextDecoder().decode(extracted[name]));
  }
  const ordered = Object.fromEntries(names.map(name => [
    name,
    [extracted[name], { level: 6, mtime: FIXED_ZIP_TIME }],
  ]));
  const repaired = zipSync(ordered, { level: 6, mtime: FIXED_ZIP_TIME });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, repaired);
}

function uniqueCatalogId(file, used) {
  const group = catalogIdPart(file.group.replaceAll('/', '-'));
  const rawName = basename(file.name, extname(file.name)).replace(/^\d+\s+/u, '');
  const name = catalogIdPart(rawName);
  const suffix = catalogIdPart(file.fileId).slice(-10);
  const id = `drive-${group}-${name}-${suffix}`.slice(0, 220).replace(/-+$/u, '');
  if (used.has(id)) throw new Error(`Catalog id collision: ${id}`);
  used.add(id);
  return id;
}

function catalogIdPart(value) {
  try {
    return safeIdentifier(value).replace(/[._]+/gu, '-').replace(/-+/gu, '-');
  } catch {
    return `unicode-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
  }
}

function displayTitle(name) {
  return basename(name, extname(name)).replace(/^\d+\s+/u, '').trim();
}

function inferVersion(name) {
  return name.match(/\b(20\d{2}-\d{2}-\d{2})\b/u)?.[1] ?? '2026-07-23';
}

function inferCategories(name) {
  const normalized = name.normalize('NFKC').toLowerCase();
  const categories = [];
  if (/pitch|accent|発音|アクセント/u.test(normalized)) categories.push('pronunciation');
  if (/\bfreq(?:uency)?\b|頻度/u.test(normalized)) categories.push('frequency');
  if (/grammar|文法/u.test(normalized)) categories.push('grammar');
  if (/names?|proper nouns|固有名/u.test(normalized) || /jmnedict/u.test(normalized)) categories.push('names');
  if (/kanji|hanzi|honzi|漢字/u.test(normalized)) categories.push('kanji');
  if (/sentences?|用例/u.test(normalized)) categories.push('examples');
  if (/thesaurus|antonyms?|類語|対義語/u.test(normalized)) categories.push('thesaurus');
  if (/encyclopedia|wikipedia|pixiv|百科/u.test(normalized)) categories.push('encyclopedia');
  return categories.length ? [...new Set(categories)] : ['terms'];
}

function inferLanguages(file) {
  const defaultLanguage = file.group.startsWith('mandarin')
    ? 'zh'
    : file.group.startsWith('cantonese')
      ? 'yue'
      : 'ja';
  const tag = file.name.normalize('NFKC').match(/\[([^\]]+)\]/u)?.[1] ?? '';
  const pair = tag.match(/\b(JA|JP|ZH|CN|YUE|LZH|EN|KO|DE|FR|PT|ES|RU|NL|HU|SV|MN)-([A-Z]{2,3})(?:\s*&\s*([A-Z]{2,3}))?/u);
  const headwordLanguages = pair ? [normalizeLanguage(pair[1])] : [defaultLanguage];
  const definitionLanguages = pair
    ? [pair[2], pair[3]].filter(Boolean).map(normalizeLanguage)
    : /english/u.test(file.name)
      ? ['en']
      : [defaultLanguage];
  return {
    headwordLanguages: [...new Set(headwordLanguages)],
    definitionLanguages: [...new Set(definitionLanguages)],
  };
}

function normalizeLanguage(value) {
  const normalized = value.toLowerCase();
  if (normalized === 'jp') return 'ja';
  if (normalized === 'cn') return 'zh';
  return normalized;
}

function driveDownloadUrl(fileId) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseArguments(argv) {
  const result = { inventory: '', sourceRoot: '', stagingRoot: '', output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--inventory', '--source-root', '--staging-dir', '--output'].includes(flag) || !value) {
      throw new Error('Usage: node scripts/dictionaries/materialize-connector-export.mjs --inventory FILE --source-root DIR --staging-dir DIR --output FILE');
    }
    index += 1;
    if (flag === '--inventory') result.inventory = value;
    if (flag === '--source-root') result.sourceRoot = value;
    if (flag === '--staging-dir') result.stagingRoot = value;
    if (flag === '--output') result.output = value;
  }
  if (Object.values(result).some(value => !value)) {
    throw new Error('Usage: node scripts/dictionaries/materialize-connector-export.mjs --inventory FILE --source-root DIR --staging-dir DIR --output FILE');
  }
  return result;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const summary = await materializeConnectorExport({
    inventoryPath: resolve(args.inventory),
    sourceRoot: resolve(args.sourceRoot),
    stagingRoot: resolve(args.stagingRoot),
    outputPath: resolve(args.output),
  });
  console.log(JSON.stringify(summary, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
