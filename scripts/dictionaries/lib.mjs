import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptsDirectory, '../..');
export const defaultAcquisitionPath = resolve(repositoryRoot, 'config/dictionaries/acquisition.v1.json');
export const defaultManifestRoot = resolve(repositoryRoot, 'config/dictionaries/manifests/v1');
export const defaultPublishedManifestRoot = resolve(repositoryRoot, 'config/dictionaries/published/v1');
export const defaultStagingRoot = resolve(repositoryRoot, 'artifacts/dictionaries-staging');
export const defaultReleaseRoot = resolve(repositoryRoot, 'artifacts/dictionaries-release');

export function parseCommonArguments(argv, extraOptions = new Set()) {
  const result = {
    execute: false,
    write: false,
    config: defaultAcquisitionPath,
    staging: defaultStagingRoot,
    release: defaultReleaseRoot,
    inventory: '',
    output: '',
    bucket: 'yomu-dictionaries',
    confirmBucket: '',
    only: [],
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') result.execute = true;
    else if (argument === '--write') result.write = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument === '--config') result.config = requiredValue(argv, ++index, argument);
    else if (argument === '--staging-dir') result.staging = requiredValue(argv, ++index, argument);
    else if (argument === '--release-dir') result.release = requiredValue(argv, ++index, argument);
    else if (argument === '--inventory') result.inventory = requiredValue(argv, ++index, argument);
    else if (argument === '--output') result.output = requiredValue(argv, ++index, argument);
    else if (argument === '--bucket') result.bucket = requiredValue(argv, ++index, argument);
    else if (argument === '--confirm-bucket') result.confirmBucket = requiredValue(argv, ++index, argument);
    else if (argument === '--only') result.only.push(requiredValue(argv, ++index, argument));
    else if (!extraOptions.has(argument)) throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

export function assertSafeWorkingDirectory(path, label = 'working directory') {
  const target = resolve(path);
  const disallowed = new Set([parse(target).root, resolve(homedir()), repositoryRoot]);
  if (disallowed.has(target)) throw new Error(`Refusing to use ${label} at broad path: ${target}`);
  if (!target.startsWith(`${repositoryRoot}${sep}`) && !target.startsWith(`${resolve(homedir())}${sep}`)) {
    throw new Error(`${label} must be under the repository or the current user's home directory: ${target}`);
  }
  return target;
}

export async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

export async function readJsonIfExists(path, fallback) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJsonAtomic(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
}

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function contentAddressedObjectKey(sha256) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Invalid SHA-256 digest: ${sha256}`);
  return `objects/sha256/${sha256}.zip`;
}

export function safeIdentifier(value) {
  const normalized = String(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error(`Cannot derive a safe identifier from "${value}".`);
  return normalized.slice(0, 120);
}

export async function validateYomitanZip(path) {
  const firstBytes = Buffer.alloc(4);
  const stream = createReadStream(path, { start: 0, end: 3 });
  let offset = 0;
  for await (const chunk of stream) {
    Buffer.from(chunk).copy(firstBytes, offset);
    offset += chunk.length;
  }
  if (firstBytes[0] !== 0x50 || firstBytes[1] !== 0x4b) throw new Error('Downloaded object is not a ZIP archive.');
  await execFile('unzip', ['-tqq', path], { maxBuffer: 8 * 1024 * 1024 });
  const { stdout } = await execFile('unzip', ['-p', path, 'index.json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!stdout.trim()) throw new Error('ZIP archive does not contain a root index.json.');
  const index = JSON.parse(stdout);
  if (!index || typeof index !== 'object' || typeof index.title !== 'string' || !index.title.trim()) {
    throw new Error('Yomitan index.json is missing a dictionary title.');
  }
  if (!Number.isInteger(index.format) && !Number.isInteger(index.version)) {
    throw new Error('Yomitan index.json is missing its format/version number.');
  }
  return {
    title: index.title,
    revision: typeof index.revision === 'string' ? index.revision : '',
    format: Number.isInteger(index.format) ? index.format : index.version,
  };
}

export async function downloadToPartialFile(url, partialPath) {
  await mkdir(dirname(partialPath), { recursive: true });
  const existingBytes = await stat(partialPath).then(value => value.size).catch(() => 0);
  const headers = existingBytes > 0 ? { range: `bytes=${existingBytes}-` } : {};
  let response = await fetch(url, { headers, redirect: 'follow' });
  if (response.status === 416 && existingBytes > 0) return { bytes: existingBytes, resumed: true };
  if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  const resumed = existingBytes > 0 && response.status === 206;
  if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error(`Download returned HTML instead of a dictionary archive: ${url}`);
  }
  if (!resumed && existingBytes > 0) {
    await unlink(partialPath).catch(() => undefined);
    response = await fetch(url, { redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`Download restart failed with HTTP ${response.status}: ${url}`);
  }
  const destination = createWriteStream(partialPath, { flags: resumed ? 'a' : 'w' });
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!destination.write(value)) await new Promise(resolveDrain => destination.once('drain', resolveDrain));
    }
    await new Promise((resolveFinish, rejectFinish) => {
      destination.end(resolveFinish);
      destination.once('error', rejectFinish);
    });
  } catch (error) {
    destination.destroy();
    throw error;
  }
  return { bytes: (await stat(partialPath)).size, resumed };
}

export async function placeContentAddressedObject(partialPath, stagingRoot, sha256) {
  const key = contentAddressedObjectKey(sha256);
  const destination = resolve(stagingRoot, key);
  await mkdir(dirname(destination), { recursive: true });
  if (await fileExists(destination)) {
    const existingHash = await sha256File(destination);
    if (existingHash !== sha256) throw new Error(`Existing content-addressed object has the wrong hash: ${destination}`);
    await unlink(partialPath).catch(() => undefined);
    return { key, path: destination, deduplicated: true };
  }
  await rename(partialPath, destination);
  return { key, path: destination, deduplicated: false };
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}
