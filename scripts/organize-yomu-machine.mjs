#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(repoRoot, '../..');
const homeRoot = homedir();
const artRoot = path.join(repoRoot, 'public/academy/art');
const docsRoot = path.join(repoRoot, 'docs/academy');
const metadataRoot = path.join(docsRoot, 'recovery/art-source-metadata/codex-tasks');
const historyRoot = path.join(docsRoot, 'history/external-notes');
const evidenceRoot = path.join(docsRoot, 'evidence/external-reviews');
const catalogPath = path.join(docsRoot, 'recovery/YOMU-MACHINE-CATALOG.json');
const cleanup = process.argv.includes('--cleanup');
const imagePattern = /\.(?:png|jpe?g|webp|gif)$/i;

const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: 'Canonical project sources live in the Yomu repository; generated copies are removed only after hash verification.',
  codexTasks: [],
  desktopNotes: [],
  references: [],
  releaseArtifacts: [],
};

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function walk(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue;
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) files.push(...await walk(absolute));
      else files.push(absolute);
    }
    return files;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function slug(value) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

async function verifiedCopy(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const sourceHash = await sha256(source);
  try {
    if (await sha256(destination) === sourceHash) return sourceHash;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await copyFile(source, destination);
  if (await sha256(destination) !== sourceHash) throw new Error(`Hash verification failed: ${destination}`);
  return sourceHash;
}

const canonicalArtByHash = new Map();
for (const file of await walk(artRoot)) {
  if (imagePattern.test(file)) canonicalArtByHash.set(await sha256(file), file);
}

const codexDayRoot = path.join(homeRoot, 'Documents/Codex/2026-07-17');
for (const entry of await readdir(codexDayRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('academy-')) continue;
  const taskRoot = path.join(codexDayRoot, entry.name);
  const record = { source: taskRoot, images: [], metadata: [], removed: false };
  for (const file of await walk(taskRoot)) {
    const relative = path.relative(taskRoot, file);
    if (imagePattern.test(file)) {
      const hash = await sha256(file);
      let destination = canonicalArtByHash.get(hash);
      if (!destination) {
        const extension = path.extname(file).toLowerCase().replace('.jpeg', '.jpg');
        const stem = `external__${slug(entry.name)}__${slug(path.basename(file, path.extname(file)))}`;
        let version = 1;
        do {
          destination = path.join(artRoot, 'unassigned', `${stem}__v${String(version).padStart(3, '0')}${extension}`);
          version += 1;
        } while (await stat(destination).then(() => true, () => false));
        await verifiedCopy(file, destination);
        canonicalArtByHash.set(hash, destination);
      }
      record.images.push({ sha256: hash, source: relative, destination: path.relative(repoRoot, destination) });
    } else {
      const destination = path.join(metadataRoot, slug(entry.name), relative);
      const hash = await verifiedCopy(file, destination);
      record.metadata.push({ sha256: hash, source: relative, destination: path.relative(repoRoot, destination) });
    }
  }
  if (cleanup) {
    await rm(taskRoot, { recursive: true, force: true });
    record.removed = true;
  }
  catalog.codexTasks.push(record);
}

const desktop = path.join(homeRoot, 'Desktop');
for (const entry of await readdir(desktop, { withFileTypes: true })) {
  if (!/yomu/i.test(entry.name)) continue;
  const source = path.join(desktop, entry.name);
  if (/\.swp$/i.test(entry.name)) {
    if (cleanup) await rm(source, { force: true });
    continue;
  }
  const targetRoot = entry.isDirectory() && /shots|review/i.test(entry.name) ? evidenceRoot : historyRoot;
  const destination = path.join(targetRoot, entry.name);
  const files = entry.isDirectory() ? await walk(source) : [source];
  const record = { source, destination: path.relative(repoRoot, destination), files: [], removed: false };
  for (const file of files) {
    const target = entry.isDirectory() ? path.join(destination, path.relative(source, file)) : destination;
    const hash = await verifiedCopy(file, target);
    record.files.push({ sha256: hash, source: path.relative(source, file), destination: path.relative(repoRoot, target) });
  }
  if (cleanup) {
    await rm(source, { recursive: true, force: true });
    record.removed = true;
  }
  catalog.desktopNotes.push(record);
}

const dictionarySource = path.join(homeRoot, 'Documents/Japanese/Dictionaries and Tools/yomu-dictionaries-2026-05-09T08-29-11-587Z.json');
const dictionaryDestination = path.join(projectRoot, 'references-academy/dictionaries/yomu-dictionaries-2026-05-09.json');
try {
  const hash = await verifiedCopy(dictionarySource, dictionaryDestination);
  catalog.references.push({ sha256: hash, source: dictionarySource, destination: dictionaryDestination });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

for (const artifact of [
  path.join(homeRoot, 'Documents/artifacts/yomu-reader'),
  path.join(homeRoot, 'Downloads/Yomu Gaming.app'),
  path.join(homeRoot, 'Downloads/yomu-gaming-1.6.73-mac-arm64.zip'),
]) {
  try {
    const info = await stat(artifact);
    catalog.releaseArtifacts.push({ path: artifact, type: info.isDirectory() ? 'directory' : 'file', bytes: info.size });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await mkdir(path.dirname(catalogPath), { recursive: true });
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({
  codexTasks: catalog.codexTasks.length,
  codexTaskImages: catalog.codexTasks.reduce((sum, task) => sum + task.images.length, 0),
  desktopItems: catalog.desktopNotes.length,
  references: catalog.references.length,
  cleanup,
  catalogPath,
}, null, 2));
