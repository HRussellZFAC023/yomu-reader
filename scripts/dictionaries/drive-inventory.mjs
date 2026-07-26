import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  defaultAcquisitionPath,
  parseCommonArguments,
  readJson,
  repositoryRoot,
  writeJsonAtomic,
} from './lib.mjs';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

// The anonymous folder page renders a fixed first page and expects the browser
// to fetch the rest; there is no "next page" marker in the HTML, so a folder of
// 97 files and one of 49 produce indistinguishable documents. Only the row count
// gives it away. Treating a full page as success is how the pinned collection
// folder was once counted as 49 files instead of 97 — an inventory that is
// silently short is worse than one that fails, because everything downstream
// then reports "complete" against a truncated view of upstream.
export const PUBLIC_DRIVE_FOLDER_PAGE_ROW_CAP = 50;

export function parsePublicDriveFolderHtml(html, parent = { id: '', path: '' }) {
  const rows = [...html.matchAll(/<tr data-selectable[\s\S]*?<\/tr>/g)].map(match => match[0]);
  return rows.flatMap(row => {
    const id = /\bdata-id="([^"]+)"/.exec(row)?.[1];
    const nameMarkup = /<strong class="DNoYtb">([\s\S]*?)<\/strong>/.exec(row)?.[1];
    const className = /\bclass="([^"]*)"/.exec(row)?.[1] ?? '';
    if (!id || !nameMarkup) return [];
    const name = decodeHtml(nameMarkup.replace(/<[^>]+>/g, '')).trim();
    const isFolder = className.split(/\s+/).includes('RDfNAe');
    return [{
      id,
      name,
      kind: isFolder ? 'folder' : 'file',
      mimeType: isFolder ? DRIVE_FOLDER_MIME : inferMimeType(name),
      parentId: parent.id,
      relativePath: parent.path ? `${parent.path}/${name}` : name,
      sourceUrl: isFolder
        ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
        : googleDriveDownloadUrl(id),
    }];
  });
}

export async function crawlPublicDriveFolder({
  folderUrl,
  recurse = true,
  skipFolderNames = [],
  includeExtensions = [],
  fetchImpl = fetch,
  pageRowCap = PUBLIC_DRIVE_FOLDER_PAGE_ROW_CAP,
}) {
  const rootId = googleDriveFolderId(folderUrl);
  const pending = [{ id: rootId, path: '' }];
  const visited = new Set();
  const entries = [];
  const skippedFolders = [];
  const normalizedExtensions = includeExtensions.map(value => value.toLowerCase());
  while (pending.length) {
    const folder = pending.shift();
    if (!folder || visited.has(folder.id)) continue;
    visited.add(folder.id);
    const url = `https://drive.google.com/drive/folders/${encodeURIComponent(folder.id)}`;
    const response = await fetchImpl(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`Drive folder inventory failed with HTTP ${response.status}: ${url}`);
    const html = await response.text();
    const children = parsePublicDriveFolderHtml(html, folder);
    if (!children.length) throw new Error(`Drive folder page exposed no inventory rows: ${url}`);
    if (children.length >= pageRowCap) {
      throw new Error(
        `Drive folder page returned ${children.length} rows, the anonymous page limit of ${pageRowCap}: ${url}. `
        + 'The remaining files are not in this HTML and the page carries no marker saying so, so the crawl would '
        + 'report a short inventory as a complete one. Re-inventory this folder through an authenticated connector '
        + 'export (scripts/dictionaries/materialize-connector-export.mjs) instead of the public crawler.',
      );
    }
    for (const child of children) {
      if (child.kind === 'folder') {
        if (skipFolderNames.includes(child.name)) {
          skippedFolders.push(child);
        } else if (recurse) {
          pending.push({ id: child.id, path: child.relativePath });
        }
      } else if (!normalizedExtensions.length || normalizedExtensions.some(extension => child.name.toLowerCase().endsWith(extension))) {
        entries.push(child);
      }
    }
  }
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rootFolderId: rootId,
    rootFolderUrl: `https://drive.google.com/drive/folders/${rootId}`,
    entries: [...byId.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    skippedFolders,
  };
}

export function googleDriveFolderId(value) {
  const match = /(?:\/folders\/|[?&]id=)([-_A-Za-z0-9]+)/.exec(value);
  if (!match) throw new Error(`Not a public Google Drive folder URL: ${value}`);
  return match[1];
}

export function googleDriveDownloadUrl(fileId) {
  if (!/^[-_A-Za-z0-9]+$/.test(fileId)) throw new Error(`Invalid Google Drive file id: ${fileId}`);
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

function inferMimeType(name) {
  if (name.toLowerCase().endsWith('.zip')) return 'application/zip';
  if (name.toLowerCase().endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([a-f0-9]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)));
}

async function main() {
  const args = parseCommonArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/dictionaries/drive-inventory.mjs [--config FILE] [--write --output FILE]');
    console.log('Without --write the command crawls the public folders and prints a non-mutating summary.');
    return;
  }
  const config = await readJson(resolve(args.config || defaultAcquisitionPath));
  const collections = config.collections?.filter(collection => collection.method === 'google-drive-folder') ?? [];
  const inventories = [];
  for (const collection of collections) {
    inventories.push({
      collectionId: collection.id,
      ...(await crawlPublicDriveFolder(collection)),
    });
  }
  const result = {
    schemaVersion: 1,
    snapshotRevision: config.snapshotRevision,
    generatedAt: new Date().toISOString(),
    collections: inventories,
  };
  const fileCount = inventories.reduce((total, inventory) => total + inventory.entries.length, 0);
  console.log(JSON.stringify({
    mode: args.write ? 'write' : 'dry-run',
    collections: inventories.length,
    files: fileCount,
    skippedFolders: inventories.flatMap(inventory => inventory.skippedFolders.map(folder => folder.relativePath)),
  }, null, 2));
  if (!args.write) return;
  const output = resolve(args.output || repositoryRoot, args.output ? '' : 'artifacts/dictionaries-drive-inventory.json');
  await writeJsonAtomic(output, result);
  console.log(`Inventory written to ${output}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
