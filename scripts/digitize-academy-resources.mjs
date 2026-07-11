import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';

import yauzl from 'yauzl';

import { buildDigitisationIndex, defaultDigitisationRoots } from './build-academy-digitisation-index.mjs';

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_EXTENSIONS = new Set(['.csv', '.htm', '.html', '.json', '.md', '.rtf', '.txt', '.vtt', '.xml']);
const OFFICE_DOCUMENT_EXTENSIONS = new Set(['.doc', '.docx', '.odt', '.pages', '.ppt', '.pptx', '.xls', '.xlsx']);
const ZIP_EXTENSIONS = new Set(['.zip', '.apkg']);
const DIRECT_TYPES = new Map([
    ['.aac', 'audio'], ['.aiff', 'audio'], ['.flac', 'audio'], ['.m4a', 'audio'], ['.mp3', 'audio'], ['.ogg', 'audio'], ['.opus', 'audio'], ['.wav', 'audio'], ['.wma', 'audio'],
    ['.pdf', 'pdf'], ['.doc', 'document'], ['.docx', 'document'], ['.epub', 'document'], ['.htm', 'document'], ['.html', 'document'], ['.md', 'document'], ['.odt', 'document'], ['.rtf', 'document'], ['.txt', 'document'], ['.vtt', 'document'], ['.xml', 'document'], ['.json', 'document'],
    ['.csv', 'worksheet'], ['.ods', 'worksheet'], ['.xls', 'worksheet'], ['.xlsx', 'worksheet'], ['.7z', 'archive'], ['.apkg', 'archive'], ['.gz', 'archive'], ['.rar', 'archive'], ['.tar', 'archive'], ['.tgz', 'archive'], ['.zip', 'archive'],
]);
const EXERCISE_MARKERS = /\b(?:exercise|worksheet|workbook|quiz|drill|homework|fill\s+in|choose\s+the\s+correct)\b/i;

export const DIGITISATION_PIPELINE_SCHEMA = 'yomu-academy-resource-digitisation/v1';
export const DIGITISATION_RECORD_SCHEMA = 'yomu-academy-resource-record/v1';
export const DEFAULT_STAGE_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_STAGE_TOTAL_MAX_BYTES = 512 * 1024 * 1024;
export const DEFAULT_RENDER_PAGE_LIMIT = 3;

export async function runDigitisationPipeline(options = {}) {
    const settings = await normalizeOptions(options);
    if (!settings.dryRun) await mkdir(settings.output, { recursive: true });
    const inventory = await loadInventory(settings);
    const resources = inventory.resources.filter(resource => !isPipelineOutput(resource)).sort(compareResource);
    const pairings = buildAudioPdfPairings(resources);
    if (settings.dryRun) return { manifest: makeManifest(resources, settings, pairings), run: await dryRunSummary(resources, settings) };
    const staging = await createStagingLedger(settings.output, settings.stageTotalMaxBytes);
    const run = { processed: 0, resumed: 0, failures: 0, staged: 0 };

    for (const resource of resources) {
        const recordPath = join(settings.output, 'records', `${hash(resource.id).slice(7)}.json`);
        if (await reusableRecord(recordPath, resource, settings.retryFailures)) {
            run.resumed += 1;
            continue;
        }
        const record = await digitise(resource, settings, staging, pairings.get(resource.id));
        await writeJsonAtomic(recordPath, record);
        run.processed += 1;
        if (record.failures.length) run.failures += 1;
        if (record.staging.status === 'staged') run.staged += 1;
    }
    const manifest = makeManifest(resources, settings, pairings);
    await writeJsonAtomic(join(settings.output, 'manifest.json'), manifest);
    return { manifest, run };
}

export function parseDigitisationArguments(argv = process.argv.slice(2)) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const name = argv[index];
        if (name === '--help') return { help: true };
        if (name === '--dry-run') { result.dryRun = true; continue; }
        if (!['--output', '--index', '--max-stage-bytes', '--max-total-stage-bytes', '--render-pages'].includes(name)) throw new Error(`Unsupported digitisation option: ${name}`);
        const value = argv[++index];
        if (!value || value.startsWith('--')) throw new Error(`A value is required for ${name}.`);
        if (name === '--output') result.output = resolve(value);
        else if (name === '--index') result.indexPath = resolve(value);
        else if (name === '--max-stage-bytes') result.stageMaxBytes = integer(value, name);
        else if (name === '--max-total-stage-bytes') result.stageTotalMaxBytes = integer(value, name);
        else result.renderPageLimit = integer(value, name);
    }
    return result;
}

export async function runCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
    const options = parseDigitisationArguments(argv);
    if (options.help) {
        stdout.write('Usage: node scripts/digitize-academy-resources.mjs [--dry-run] [--index <file>] [--output <directory>] [--max-stage-bytes <bytes>] [--max-total-stage-bytes <bytes>] [--render-pages <count>]\n');
        return null;
    }
    const result = await runDigitisationPipeline(options);
    stdout.write(`${JSON.stringify({ ...result.manifest.summary, run: result.run })}\n`);
    return result;
}

async function normalizeOptions(options) {
    const requestedRoots = options.roots ?? defaultDigitisationRoots(REPOSITORY_ROOT);
    const roots = [];
    for (const root of requestedRoots) {
        if (await isDirectory(root.path)) roots.push(root);
        else if (options.roots) throw new Error(`Digitisation root is unavailable: ${root.id}`);
    }
    return {
        output: resolve(options.output ?? join(REPOSITORY_ROOT, 'public/academy/content/digitized')),
        index: options.index ?? null,
        indexPath: resolve(options.indexPath ?? join(REPOSITORY_ROOT, 'public/academy/content/digitisation-index.json')),
        roots,
        rootPaths: new Map(roots.map(root => [root.id, resolve(root.path)])),
        stageMaxBytes: options.stageMaxBytes ?? DEFAULT_STAGE_MAX_BYTES,
        stageTotalMaxBytes: options.stageTotalMaxBytes ?? DEFAULT_STAGE_TOTAL_MAX_BYTES,
        renderPageLimit: options.renderPageLimit ?? DEFAULT_RENDER_PAGE_LIMIT,
        retryFailures: options.retryFailures === true,
        dryRun: options.dryRun === true,
    };
}

async function loadInventory(settings) {
    if (settings.index) return validateInventory(settings.index);
    for (const path of [settings.indexPath]) {
        try { return validateInventory(JSON.parse(await readFile(path, 'utf8'))); }
        catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    try {
        return await buildDigitisationIndex({ roots: settings.roots });
    } catch (error) {
        if (!(error instanceof RangeError) || !/call stack/i.test(error.message)) throw error;
        return buildBatchedInventory(settings.roots);
    }
}

function validateInventory(index) {
    if (!index || !Array.isArray(index.resources)) throw new Error('Digitisation inventory must contain a resources array.');
    return index;
}

async function buildBatchedInventory(roots) {
    const resources = [];
    let catalogResources = [];
    for (const root of roots.sort((left, right) => compareUtf8(left.id, right.id))) {
        const { batches, directFiles } = await leafBatches(root.path);
        for (const file of directFiles) {
            const resource = await directResource(root, file);
            if (resource) resources.push(resource);
        }
        for (const batch of batches) {
            const index = await buildDigitisationIndex({ roots: [{ ...root, path: batch.path }] });
            if (catalogResources.length === 0) catalogResources = index.resources.filter(resource => resource.sourceRoot === 'academy-catalog');
            resources.push(...index.resources.filter(resource => resource.sourceRoot !== 'academy-catalog').map(resource => rebaseResource(resource, root.id, batch.prefix)));
        }
    }
    resources.push(...catalogResources);
    resources.sort(compareResource);
    return { resources };
}

async function leafBatches(rootPath) {
    const batches = [];
    const directFiles = [];
    async function visit(path, prefix) {
        const entries = (await readdir(path, { withFileTypes: true })).sort((left, right) => compareUtf8(left.name, right.name));
        const directories = entries.filter(entry => entry.isDirectory() && !['.git', '.venv', 'node_modules', '__pycache__'].includes(entry.name));
        if (directories.length === 0) {
            batches.push({ path, prefix });
            return;
        }
        for (const entry of entries.filter(entry => entry.isFile())) directFiles.push(join(path, entry.name));
        for (const entry of directories) await visit(join(path, entry.name), prefix ? join(prefix, entry.name) : entry.name);
    }
    await visit(rootPath, '');
    return { batches, directFiles };
}

function rebaseResource(resource, rootId, prefix) {
    const sourcePath = prefix ? `${portable(prefix)}/${resource.sourcePath}` : resource.sourcePath;
    return { ...resource, id: `${rootId}:${sourcePath}`, sourceRoot: rootId, sourcePath };
}

async function directResource(root, path) {
    const extension = extname(path).toLowerCase();
    const assetType = DIRECT_TYPES.get(extension);
    if (!assetType) return null;
    const sourcePath = portable(relative(root.path, path));
    return {
        id: `${root.id}:${sourcePath}`, recordType: 'file', sourceRoot: root.id, sourcePath, assetType, extension,
        canonicalHash: await hashFile(path), byteLength: (await stat(path)).size,
        inference: { year: null, course: null, lesson: null }, sourceLinks: [],
    };
}

async function digitise(resource, settings, staging, pairing) {
    const sourcePath = sourcePathFor(resource, settings.rootPaths);
    const available = sourcePath !== null && await isFile(sourcePath);
    const record = {
        schema: DIGITISATION_RECORD_SCHEMA,
        id: resource.id,
        source: {
            root: resource.sourceRoot, path: resource.sourcePath, available,
            integrity: available ? 'pending' : 'unavailable', canonicalHash: resource.canonicalHash,
            byteLength: resource.byteLength, sourceLinks: resource.sourceLinks ?? [],
        },
        lesson: resource.inference ?? { year: null, course: null, lesson: null },
        type: resource.assetType,
        extension: resource.extension ?? extname(resource.sourcePath).toLowerCase(),
        staging: { status: available ? 'not-requested' : 'unavailable', path: null },
        transcript: { status: documentStatus(resource.assetType, available), path: null, sha256: null },
        pdfVisuals: { status: resource.assetType === 'pdf' ? (available ? 'pending' : 'unavailable') : 'not-applicable', paths: [] },
        audioMetadata: { status: resource.assetType === 'audio' ? (available ? 'pending' : 'unavailable') : 'not-applicable', metadata: null },
        archiveManifest: { status: resource.assetType === 'archive' ? (available ? 'pending' : 'unavailable') : 'not-applicable', path: null },
        audioPdfPairing: pairing ?? { status: 'not-applicable', basis: null, relatedResourceIds: [] },
        exerciseConversion: { status: available ? 'unassessed' : 'blocked', evidence: [] },
        failures: [],
    };
    if (!available) return record;
    if ((await hashFile(sourcePath)) !== resource.canonicalHash) {
        record.source.integrity = 'mismatch';
        record.failures.push({ stage: 'source-integrity', message: 'Source bytes no longer match the inventory SHA-256.' });
        record.staging = { status: 'failed', path: null };
        record.transcript = { status: 'blocked', path: null, sha256: null };
        record.pdfVisuals = { status: resource.assetType === 'pdf' ? 'blocked' : 'not-applicable', paths: [] };
        record.audioMetadata = { status: resource.assetType === 'audio' ? 'blocked' : 'not-applicable', metadata: null };
        record.archiveManifest = { status: resource.assetType === 'archive' ? 'blocked' : 'not-applicable', path: null };
        record.exerciseConversion = { status: 'blocked', evidence: [] };
        return record;
    }
    record.source.integrity = 'verified';
    record.staging = await stageOriginal(resource, sourcePath, settings, staging, record.failures);
    if (isDocument(resource.assetType)) {
        const extracted = await extractText(resource, sourcePath, settings, record.failures);
        record.transcript = extracted.transcript;
        record.exerciseConversion = exerciseStatus(extracted.content, extracted.transcript.status);
    }
    if (resource.assetType === 'pdf') record.pdfVisuals = await renderPdf(resource, sourcePath, settings, record.failures);
    if (resource.assetType === 'audio') record.audioMetadata = await inspectAudio(sourcePath, record.failures);
    if (resource.assetType === 'archive') record.archiveManifest = await inspectArchive(resource, sourcePath, settings, record.failures);
    return record;
}

function sourcePathFor(resource, roots) {
    if (resource.recordType === 'catalog-archive-member' || resource.recordType === 'archive-member') return null;
    const root = roots.get(resource.sourceRoot);
    if (!root || !resource.sourcePath) return null;
    const path = resolve(root, resource.sourcePath);
    return path.startsWith(`${root}${sep}`) ? path : null;
}

async function stageOriginal(resource, sourcePath, settings, staging, failures) {
    const destination = join(settings.output, 'staging', 'sha256', resource.canonicalHash.slice(7));
    if (resource.byteLength > settings.stageMaxBytes) return { status: 'skipped-size', path: null, reason: 'per-resource-limit' };
    if (await isFile(destination)) return { status: 'already-staged', path: portable(relative(settings.output, destination)) };
    if (!staging.canReserve(resource.byteLength)) return { status: 'skipped-size', path: null, reason: 'total-limit' };
    try {
        await mkdir(dirname(destination), { recursive: true });
        const partial = `${destination}.partial`;
        await copyFile(sourcePath, partial);
        await rename(partial, destination);
        staging.reserve(resource.byteLength);
        return { status: 'staged', path: portable(relative(settings.output, destination)) };
    } catch (error) {
        failures.push(failure('staging', error));
        return { status: 'failed', path: null };
    }
}

async function extractText(resource, sourcePath, settings, failures) {
    const extension = (resource.extension ?? extname(sourcePath)).toLowerCase();
    const output = join(settings.output, 'text', `${resource.canonicalHash.slice(7)}.txt`);
    try {
        let content;
        if (extension === '.json') content = `${JSON.stringify(sortJson(JSON.parse(await readFile(sourcePath, 'utf8'))), null, 2)}\n`;
        else if (TEXT_EXTENSIONS.has(extension)) content = await readFile(sourcePath, 'utf8');
        else if (extension === '.pdf') content = await commandText('pdftotext', ['-enc', 'UTF-8', sourcePath, '-']);
        else if (OFFICE_DOCUMENT_EXTENSIONS.has(extension)) content = await commandText('textutil', ['-convert', 'txt', '-stdout', sourcePath]);
        else return { transcript: { status: 'not-applicable', path: null, sha256: null }, content: null };
        content = normalizeText(content);
        await writeTextAtomic(output, content);
        return { transcript: { status: 'extracted', path: portable(relative(settings.output, output)), sha256: hash(content) }, content };
    } catch (error) {
        failures.push(failure('text-extraction', error));
        return { transcript: { status: 'failed', path: null, sha256: null }, content: null };
    }
}

async function renderPdf(resource, sourcePath, settings, failures) {
    const directory = join(settings.output, 'pdf-visuals', resource.canonicalHash.slice(7));
    try {
        await mkdir(directory, { recursive: true });
        await execFile('pdftoppm', ['-png', '-f', '1', '-l', String(Math.max(1, settings.renderPageLimit)), sourcePath, join(directory, 'page')], { maxBuffer: 1024 * 1024 });
        const paths = (await readdir(directory)).filter(name => /^page-\d+\.png$/.test(name)).sort(compareUtf8)
            .map(name => portable(join('pdf-visuals', resource.canonicalHash.slice(7), name)));
        if (!paths.length) throw new Error('PDF renderer did not produce any page images.');
        return { status: 'page-renders', paths };
    } catch (error) {
        await rm(directory, { force: true, recursive: true });
        failures.push(failure('pdf-visual-extraction', error));
        return { status: 'failed', paths: [] };
    }
}

async function inspectAudio(sourcePath, failures) {
    try {
        const { stdout } = await execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate,format_name:stream=codec_name,codec_type,sample_rate,channels', '-of', 'json', sourcePath], { maxBuffer: 1024 * 1024 });
        const parsed = JSON.parse(stdout);
        return {
            status: 'extracted',
            metadata: {
                format: parsed.format?.format_name ?? null,
                durationSeconds: numberOrNull(parsed.format?.duration),
                bitRate: numberOrNull(parsed.format?.bit_rate),
                streams: (parsed.streams ?? []).map(stream => ({ codec: stream.codec_name ?? null, type: stream.codec_type ?? null, sampleRate: numberOrNull(stream.sample_rate), channels: numberOrNull(stream.channels) })),
            },
        };
    } catch (error) {
        failures.push(failure('audio-metadata', error));
        return { status: 'failed', metadata: null };
    }
}

function exerciseStatus(content, status) {
    if (status !== 'extracted') return { status: 'unassessed', evidence: [] };
    const matches = content.match(new RegExp(EXERCISE_MARKERS.source, 'ig')) ?? [];
    return matches.length
        ? { status: 'needs-human-review', evidence: ['structured-text-extraction', `exercise-markers:${matches.length}`] }
        : { status: 'not-indicated', evidence: ['structured-text-extraction'] };
}

function isDocument(type) { return ['document', 'worksheet', 'deck', 'pdf'].includes(type); }
function documentStatus(type, available) { return isDocument(type) ? (available ? 'pending' : 'unavailable') : 'not-applicable'; }

async function inspectArchive(resource, sourcePath, settings, failures) {
    const output = join(settings.output, 'archive-manifests', `${resource.canonicalHash.slice(7)}.json`);
    try {
        const extension = (resource.extension ?? extname(sourcePath)).toLowerCase();
        const members = ZIP_EXTENSIONS.has(extension) ? await zipManifest(sourcePath) : await listedManifest(sourcePath);
        await writeJsonAtomic(output, { schema: 'yomu-academy-archive-manifest/v1', canonicalHash: resource.canonicalHash, members });
        return { status: 'extracted', path: portable(relative(settings.output, output)) };
    } catch (error) {
        failures.push(failure('archive-manifest', error));
        return { status: 'failed', path: null };
    }
}

async function listedManifest(sourcePath) {
    const { stdout } = await execFile('bsdtar', ['-tf', sourcePath], { maxBuffer: 16 * 1024 * 1024 });
    return stdout.split(/\r?\n/).filter(Boolean).sort(compareUtf8).map(path => ({ path: portable(path), hash: null, byteLength: null }));
}

function zipManifest(sourcePath) {
    return new Promise((resolveManifest, rejectManifest) => {
        yauzl.open(sourcePath, { autoClose: true, decodeStrings: true, lazyEntries: true, validateEntrySizes: true }, (openError, archive) => {
            if (openError || !archive) return rejectManifest(openError ?? new Error('Unable to open ZIP archive.'));
            const members = [];
            let settled = false;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                archive.close();
                rejectManifest(error);
            };
            archive.on('error', fail);
            archive.on('entry', (entry) => {
                if (/\/$/.test(entry.fileName)) {
                    members.push({ path: portable(entry.fileName), hash: null, byteLength: 0, kind: 'directory' });
                    archive.readEntry();
                    return;
                }
                void hashZipEntry(archive, entry).then(member => {
                    members.push(member);
                    archive.readEntry();
                }).catch(fail);
            });
            archive.on('end', () => {
                if (settled) return;
                settled = true;
                resolveManifest(members.sort((left, right) => compareUtf8(left.path, right.path)));
            });
            archive.readEntry();
        });
    });
}

function hashZipEntry(archive, entry) {
    return new Promise((resolveMember, rejectMember) => {
        archive.openReadStream(entry, (error, stream) => {
            if (error || !stream) return rejectMember(error ?? new Error('Unable to open archive member.'));
            const digest = createHash('sha256');
            let byteLength = 0;
            stream.on('data', chunk => { digest.update(chunk); byteLength += chunk.length; });
            stream.once('error', rejectMember);
            stream.once('end', () => {
                if (byteLength !== entry.uncompressedSize) return rejectMember(new Error('Archive member byte count did not match its central directory.'));
                resolveMember({ path: portable(entry.fileName), hash: `sha256:${digest.digest('hex')}`, byteLength, kind: 'file' });
            });
        });
    });
}

function makeManifest(resources, settings, pairings = new Map()) {
    const count = selector => Object.fromEntries([...resources.reduce((map, resource) => {
        const key = selector(resource);
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
    }, new Map()).entries()].sort(([left], [right]) => compareUtf8(left, right)));
    return {
        schema: DIGITISATION_PIPELINE_SCHEMA,
        policy: {
            staging: 'unique complete local source payloads are copied by SHA-256 only within the configured byte limits',
            catalog: 'metadata-only catalog entries are recorded but never treated as locally available source bytes',
            resumption: 'an atomically written matching resource record is reused; retryFailures retries terminal failures',
        },
        limits: { stageMaxBytes: settings.stageMaxBytes, stageTotalMaxBytes: settings.stageTotalMaxBytes, renderPageLimit: settings.renderPageLimit },
        summary: {
            resourceCount: resources.length, uniquePayloadCount: new Set(resources.map(resource => resource.canonicalHash)).size,
            byType: count(resource => resource.assetType), byRoot: count(resource => resource.sourceRoot),
            audioPdfPairing: {
                pairedResources: [...pairings.values()].filter(pairing => pairing.status === 'paired').length,
                audioPdfLinkCount: resources.filter(resource => resource.assetType === 'audio' && pairings.has(resource.id))
                    .reduce((total, resource) => total + pairings.get(resource.id).relatedResourceIds.length, 0),
            },
        },
    };
}

function buildAudioPdfPairings(resources) {
    const groups = new Map();
    for (const resource of resources) {
        if (!['audio', 'pdf'].includes(resource.assetType)) continue;
        const key = pairingKey(resource);
        if (!key) continue;
        const group = groups.get(key) ?? [];
        group.push(resource);
        groups.set(key, group);
    }
    const pairings = new Map();
    for (const [key, group] of groups) {
        const audio = group.filter(resource => resource.assetType === 'audio');
        const pdf = group.filter(resource => resource.assetType === 'pdf');
        if (!audio.length || !pdf.length) continue;
        for (const resource of group) pairings.set(resource.id, {
            status: 'paired', basis: key.startsWith('archive:') ? 'shared-parent-archive' : 'shared-indexed-lesson',
            relatedResourceIds: group.filter(other => other.assetType !== resource.assetType).map(other => other.id).sort(compareUtf8),
        });
    }
    return pairings;
}

function pairingKey(resource) {
    if (resource.parentCanonicalHash) return `archive:${resource.parentCanonicalHash}`;
    const inference = resource.inference;
    if (inference?.lesson === null || inference?.lesson === undefined) return null;
    return `lesson:${resource.sourceRoot}:${inference.course ?? ''}:${inference.year ?? ''}:${inference.lesson}`;
}

async function dryRunSummary(resources, settings) {
    let available = 0;
    let stageEligible = 0;
    for (const resource of resources) {
        const sourcePath = sourcePathFor(resource, settings.rootPaths);
        if (sourcePath && await isFile(sourcePath)) {
            available += 1;
            if (resource.byteLength <= settings.stageMaxBytes) stageEligible += 1;
        }
    }
    return { dryRun: true, processed: 0, resumed: 0, failures: 0, staged: 0, available, stageEligible };
}

async function createStagingLedger(output, maximum) {
    let used = 0;
    const directory = join(output, 'staging', 'sha256');
    try {
        for (const entry of await readdir(directory, { withFileTypes: true })) if (entry.isFile()) used += (await stat(join(directory, entry.name))).size;
    } catch { /* Staging has not been created yet. */ }
    return { canReserve: bytes => used + bytes <= maximum, reserve: bytes => { used += bytes; } };
}

async function reusableRecord(path, resource, retryFailures) {
    try {
        const record = JSON.parse(await readFile(path, 'utf8'));
        if (record.schema !== DIGITISATION_RECORD_SCHEMA || record.id !== resource.id || record.source?.canonicalHash !== resource.canonicalHash) return false;
        return !(retryFailures && record.failures?.length);
    } catch { return false; }
}

function isPipelineOutput(resource) { return resource.sourceRoot === 'academy-public' && /^content\/digitized\//.test(resource.sourcePath); }
function hash(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
async function hashFile(path) {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    return `sha256:${digest.digest('hex')}`;
}
function sortJson(value) {
    if (Array.isArray(value)) return value.map(sortJson);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort(compareUtf8).map(key => [key, sortJson(value[key])]));
}
function normalizeText(value) { return value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trimEnd() + '\n'; }
function numberOrNull(value) { const result = Number(value); return Number.isFinite(result) ? result : null; }
function integer(value, name) { if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer.`); return Number(value); }
function failure(stage, error) { return { stage, message: String(error?.message ?? error).replaceAll(REPOSITORY_ROOT, '<repository>') }; }
function portable(value) { return value.split('\\').join('/'); }
function compareUtf8(left, right) { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
function compareResource(left, right) { return compareUtf8(left.sourceRoot, right.sourceRoot) || compareUtf8(left.sourcePath, right.sourcePath); }
async function isFile(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
async function isDirectory(path) { try { return (await stat(path)).isDirectory(); } catch { return false; } }
async function writeJsonAtomic(path, value) { await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`); }
async function writeTextAtomic(path, value) {
    await mkdir(dirname(path), { recursive: true });
    const partial = `${path}.partial`;
    await writeFile(partial, value);
    await rename(partial, path);
}
async function commandText(command, args) { return (await execFile(command, args, { maxBuffer: 32 * 1024 * 1024 })).stdout; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCli().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
