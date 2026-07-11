import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import yauzl from 'yauzl';

export const DIGITISATION_INDEX_SCHEMA = 'yomu-academy-digitisation-index/v1';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_EXTENSIONS = new Set(['.7z', '.apkg', '.gz', '.rar', '.tar', '.tgz', '.zip']);
const IGNORED_DIRECTORIES = new Set(['.git', '.venv', 'node_modules', '__pycache__']);
const MEDIA_EXTENSIONS = new Map([
    ['.aac', 'audio'], ['.aiff', 'audio'], ['.avi', 'video'], ['.flac', 'audio'], ['.m4a', 'audio'],
    ['.mkv', 'video'], ['.mov', 'video'], ['.mp3', 'audio'], ['.mp4', 'video'], ['.mpeg', 'video'],
    ['.mpg', 'video'], ['.ogg', 'audio'], ['.ogv', 'video'], ['.opus', 'audio'], ['.wav', 'audio'],
    ['.webm', 'video'], ['.wma', 'audio'],
    ['.avif', 'image'], ['.bmp', 'image'], ['.gif', 'image'], ['.heic', 'image'], ['.ico', 'image'],
    ['.jpeg', 'image'], ['.jpg', 'image'], ['.png', 'image'], ['.svg', 'image'], ['.tif', 'image'],
    ['.tiff', 'image'], ['.webp', 'image'],
    ['.key', 'deck'], ['.odp', 'deck'], ['.pdf', 'pdf'], ['.potx', 'deck'], ['.ppsx', 'deck'],
    ['.ppt', 'deck'], ['.pptx', 'deck'],
    ['.csv', 'worksheet'], ['.ods', 'worksheet'], ['.xls', 'worksheet'], ['.xlsx', 'worksheet'],
    ['.doc', 'document'], ['.docx', 'document'], ['.djvu', 'document'], ['.epub', 'document'],
    ['.htm', 'document'], ['.html', 'document'], ['.md', 'document'], ['.odt', 'document'],
    ['.pages', 'document'], ['.rtf', 'document'], ['.txt', 'document'], ['.vtt', 'document'],
    ['.xml', 'document'], ['.json', 'document'], ['.anki', 'document'],
]);

export function defaultDigitisationRoots(repositoryRoot = REPOSITORY_ROOT) {
    return [
        { id: 'repository-references', path: join(repositoryRoot, 'references'), sourceLinks: [] },
        { id: 'academy-references', path: join(repositoryRoot, 'references-academy'), sourceLinks: [] },
        { id: 'japanese-library', path: '/Users/heru/Documents/Japanese', sourceLinks: [] },
        { id: 'soya-research', path: '/Users/heru/Documents/Projects/yomu/references/soya-research', sourceLinks: ['https://soya-eagle-online.com/'] },
        { id: 'academy-public', path: join(repositoryRoot, 'public/academy'), sourceLinks: [] },
    ];
}

export async function buildDigitisationIndex({ roots = defaultDigitisationRoots(), academyCatalogPath = join(REPOSITORY_ROOT, 'public/academy/catalog.json') } = {}) {
    const normalizedRoots = await normalizeRoots(roots);
    const resources = [];

    for (const root of normalizedRoots) {
        const sourceLinkMap = await buildSourceLinkMap(root);
        const files = await findCandidateFiles(root.path);

        const indexedFiles = await mapWithConcurrency(files, 8, async (filePath) => {
            const sourcePath = toPortablePath(relative(root.path, filePath));
            if (root.id === 'academy-public' && sourcePath === 'content/digitisation-index.json') return [];

            const assetType = classify(filePath);
            const metadata = await hashFile(filePath);
            const inference = inferCurriculum(sourcePath);
            const sourceLinks = sourceLinksFor(sourceLinkMap, sourcePath, root.sourceLinks);
            const record = makeResource({ root, sourcePath, assetType, metadata, inference, sourceLinks });
            const records = [record];

            if (ARCHIVE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
                const members = await inspectArchive(filePath);
                for (const member of members) {
                    records.push(makeArchiveMember({ root, archive: record, member, sourceLinks }));
                }
            }
            return records;
        });
        for (const records of indexedFiles) {
            for (const record of records) resources.push(record);
        }
    }

    const catalogResources = await catalogOnlyResources(academyCatalogPath);
    for (const resource of catalogResources) resources.push(resource);
    resources.sort(compareResources);

    return {
        schema: DIGITISATION_INDEX_SCHEMA,
        roots: normalizedRoots.map(({ id, sourceLinks }) => ({ id, sourceLinks })),
        policy: {
            hashes: 'sha256 of the complete source payload; archive member hashes use uncompressed member bytes',
            sourcePaths: 'root-relative paths; Moodle catalog entries retain its metadata-only catalog pointer because source paths are deliberately withheld',
            publication: 'index metadata only; source bytes are never copied by this builder',
        },
        summary: summarize(resources),
        resources,
    };
}

export async function writeDigitisationIndex({ output = join(REPOSITORY_ROOT, 'public/academy/content/digitisation-index.json'), ...input } = {}) {
    const index = await buildDigitisationIndex(input);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(index)}\n`);
    return index;
}

export async function runCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
    if (argv.includes('--help')) {
        stdout.write('Usage: node scripts/build-academy-digitisation-index.mjs [--output <file>]\n');
        return null;
    }
    if (argv.length !== 0 && (argv.length !== 2 || argv[0] !== '--output')) throw new Error('Unsupported digitisation index option.');
    const index = await writeDigitisationIndex(argv.length ? { output: resolve(argv[1]) } : {});
    stdout.write(`${JSON.stringify(index.summary)}\n`);
    return index;
}

async function normalizeRoots(roots) {
    if (!Array.isArray(roots) || roots.length === 0) throw new Error('At least one digitisation root is required.');
    const seen = new Set();
    const result = [];
    for (const root of roots) {
        if (!root || !/^[a-z0-9-]+$/.test(root.id ?? '')) throw new Error('Digitisation root ids must be lowercase ASCII slugs.');
        if (seen.has(root.id)) throw new Error(`Duplicate digitisation root: ${root.id}`);
        seen.add(root.id);
        const path = resolve(root.path);
        if (!(await stat(path)).isDirectory()) throw new Error(`Digitisation root is unavailable: ${root.id}`);
        result.push({ id: root.id, path, sourceLinks: uniqueSorted(root.sourceLinks ?? []) });
    }
    return result.sort((left, right) => compareUtf8(left.id, right.id));
}

async function findCandidateFiles(root) {
    const files = [];
    async function visit(directory) {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => compareUtf8(left.name, right.name));
        for (const entry of entries) {
            const entryPath = join(directory, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(entryPath);
            } else if (entry.isFile() && isCandidate(entryPath)) {
                files.push(entryPath);
            }
        }
    }
    await visit(root);
    return files.sort((left, right) => compareUtf8(relative(root, left), relative(root, right)));
}

function isCandidate(filePath) {
    const extension = extname(filePath).toLowerCase();
    return ARCHIVE_EXTENSIONS.has(extension) || MEDIA_EXTENSIONS.has(extension);
}

function classify(filePath) {
    const extension = extname(filePath).toLowerCase();
    if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive';
    const path = filePath.toLowerCase();
    if (MEDIA_EXTENSIONS.get(extension) === 'document' && /(?:workbook|worksheet|exercise|grammar|quiz|drill)/.test(path)) return 'worksheet';
    return MEDIA_EXTENSIONS.get(extension) ?? 'other';
}

async function hashFile(filePath) {
    const digest = createHash('sha256');
    let byteLength = 0;
    for await (const chunk of createReadStream(filePath)) {
        digest.update(chunk);
        byteLength += chunk.length;
    }
    return { canonicalHash: `sha256:${digest.digest('hex')}`, byteLength };
}

function inferCurriculum(sourcePath) {
    const normalized = sourcePath.toLowerCase();
    const year = normalized.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/)?.[1] ?? null;
    const lesson = normalized.match(/(?:lesson|chapter|chap|ch)[-_ .]*(\d{1,3})\b/i)?.[1]
        ?? normalized.match(/(?:^|[_ -])l(\d{1,3})(?:[_ .-]|$)/i)?.[1]
        ?? null;
    const course = normalized.includes('genki') ? 'Genki'
        : normalized.includes('minna no nihongo') || normalized.includes('minna_no_nihongo') ? 'Minna no Nihongo'
            : normalized.includes('bunka nihongo') ? 'Bunka Nihongo'
                : normalized.match(/jlpt[_ -]?n([1-5])/)?.[1] ? `JLPT N${normalized.match(/jlpt[_ -]?n([1-5])/)?.[1]}`
                    : normalized.includes('let\'s learn japanese') ? "Let's Learn Japanese"
                        : null;
    const week = normalized.match(/(?:week|wk)[-_ .]*(\d{1,2})\b/i)?.[1] ?? null;
    return { year: year ? Number(year) : null, week: week ? Number(week) : null, course, lesson: lesson ? Number(lesson) : null };
}

function makeResource({ root, sourcePath, assetType, metadata, inference, sourceLinks }) {
    const digitisation = digitisationFor(root.id, assetType);
    return {
        id: `${root.id}:${sourcePath}`,
        recordType: 'file',
        sourceRoot: root.id,
        sourcePath,
        assetType,
        extension: extname(sourcePath).toLowerCase(),
        canonicalHash: metadata.canonicalHash,
        byteLength: metadata.byteLength,
        inference,
        digitisation,
        intendedAcademyUse: intendedUse(root.id, assetType),
        sourceLinks,
    };
}

function makeArchiveMember({ root, archive, member, sourceLinks }) {
    const memberPath = `${archive.sourcePath}!/${member.path}`;
    const assetType = classify(member.path);
    return {
        id: `${root.id}:${memberPath}`,
        recordType: 'archive-member',
        sourceRoot: root.id,
        sourcePath: memberPath,
        assetType,
        extension: extname(member.path).toLowerCase(),
        canonicalHash: member.canonicalHash,
        byteLength: member.byteLength,
        parentCanonicalHash: archive.canonicalHash,
        inference: inferCurriculum(memberPath),
        digitisation: digitisationFor(root.id, assetType),
        intendedAcademyUse: intendedUse(root.id, assetType),
        sourceLinks,
    };
}

function digitisationFor(rootId, assetType) {
    if (rootId === 'academy-public') return { state: 'already-digitised', conversion: 'none' };
    if (rootId === 'academy-catalog') return { state: 'metadata-only', conversion: 'rights-review-and-source-recovery' };
    if (assetType === 'audio') return { state: 'source-only', conversion: 'rights-review-and-transcode' };
    if (assetType === 'image' || assetType === 'video') return { state: 'source-only', conversion: 'rights-review-and-original-derivative' };
    if (assetType === 'archive') return { state: 'source-only', conversion: 'inspect-or-extract' };
    return { state: 'source-only', conversion: 'rights-review-and-text-or-structure-extraction' };
}

function intendedUse(rootId, assetType) {
    if (rootId === 'academy-public') return 'production-asset';
    if (rootId === 'academy-catalog') return 'metadata-and-topic-provenance-only';
    if (rootId === 'soya-research') return assetType === 'image' || assetType === 'audio' ? 'modality-reference-only' : 'research-reference-only';
    if (rootId === 'japanese-library' && assetType === 'worksheet') return 'curriculum-ingestion-candidate';
    return 'curriculum-reference-only';
}

async function inspectArchive(filePath) {
    const extension = extname(filePath).toLowerCase();
    if (extension !== '.zip' && extension !== '.apkg') return [];
    return new Promise((resolveMembers, rejectMembers) => {
        yauzl.open(filePath, { autoClose: true, decodeStrings: true, lazyEntries: true, validateEntrySizes: true }, (openError, archive) => {
            if (openError || !archive) return rejectMembers(new Error(`Unable to inspect archive: ${filePath}`));
            const members = [];
            let settled = false;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                archive.close();
                rejectMembers(error);
            };
            archive.on('error', fail);
            archive.on('entry', (entry) => {
                // ZIP directory entries have no payload; file members are the resources to index.
                if (entry.fileName.endsWith('/')) {
                    archive.readEntry();
                    return;
                }
                void hashArchiveMember(archive, entry)
                    .then((member) => {
                        if (settled) return;
                        members.push(member);
                        archive.readEntry();
                    })
                    .catch(fail);
            });
            archive.on('end', () => {
                if (settled) return;
                settled = true;
                resolveMembers(members.sort((left, right) => compareUtf8(left.path, right.path)));
            });
            archive.readEntry();
        });
    });
}

function hashArchiveMember(archive, entry) {
    return new Promise((resolveMember, rejectMember) => {
        archive.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return rejectMember(new Error(`Unable to read archive member: ${entry.fileName}`));
            const digest = createHash('sha256');
            let byteLength = 0;
            stream.on('data', (chunk) => { digest.update(chunk); byteLength += chunk.length; });
            stream.once('error', rejectMember);
            stream.once('end', () => {
                if (byteLength !== entry.uncompressedSize) return rejectMember(new Error(`Archive member size mismatch: ${entry.fileName}`));
                resolveMember({ path: toPortablePath(entry.fileName), canonicalHash: `sha256:${digest.digest('hex')}`, byteLength });
            });
        });
    });
}

async function buildSourceLinkMap(root) {
    const map = new Map();
    const jsonFiles = (await findJsonFiles(root.path)).slice(0, 2000);
    for (const filePath of jsonFiles) {
        let payload;
        try { payload = JSON.parse(await readFile(filePath, 'utf8')); } catch { continue; }
        visitJson(payload, (object) => {
            const links = Object.entries(object)
                .filter(([key, value]) => /(?:url|link)$/i.test(key) && typeof value === 'string' && /^https?:\/\//.test(value))
                .map(([, value]) => value);
            if (links.length === 0) return;
            for (const value of Object.values(object)) {
                if (typeof value !== 'string') continue;
                const path = pathWithinRoot(value, root);
                if (!path) continue;
                const previous = map.get(path) ?? [];
                map.set(path, uniqueSorted([...previous, ...links]));
            }
        });
    }
    return map;
}

async function findJsonFiles(root) {
    const files = [];
    async function visit(directory) {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = join(directory, entry.name);
            if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) await visit(entryPath);
            else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(entryPath);
        }
    }
    await visit(root);
    return files.sort((left, right) => compareUtf8(left, right));
}

function visitJson(value, visitor) {
    const pending = [value];
    while (pending.length > 0) {
        const current = pending.pop();
        if (Array.isArray(current)) {
            for (const item of current) pending.push(item);
            continue;
        }
        if (!current || typeof current !== 'object') continue;
        visitor(current);
        for (const item of Object.values(current)) pending.push(item);
    }
}

function pathWithinRoot(value, root) {
    const normalized = toPortablePath(value);
    const portableRoot = toPortablePath(root.path);
    if (normalized === portableRoot) return '';
    if (normalized.startsWith(`${portableRoot}/`)) return normalized.slice(portableRoot.length + 1);
    const rootSuffix = `${basename(root.path)}/`;
    const suffixIndex = normalized.lastIndexOf(rootSuffix);
    if (suffixIndex < 0) return null;
    const candidate = normalized.slice(suffixIndex + rootSuffix.length);
    const absoluteCandidate = join(root.path, ...candidate.split('/'));
    return absoluteCandidate.startsWith(`${root.path}${sep}`) ? toPortablePath(relative(root.path, absoluteCandidate)) : null;
}

function sourceLinksFor(map, sourcePath, rootLinks) {
    // A report can repeat a broad URL set; retain the stable actionable subset per source.
    return uniqueSorted([...(map.get(sourcePath) ?? []), ...rootLinks]).slice(0, 2);
}

async function catalogOnlyResources(catalogPath) {
    let catalog;
    try { catalog = JSON.parse(await readFile(catalogPath, 'utf8')); } catch { return []; }
    if (catalog?.schema !== 'yomu-academy-publishable-catalog/v1' || !Array.isArray(catalog.memberOccurrences)) return [];
    const archiveHashes = new Map((catalog.archiveOccurrences ?? []).map((archive) => [archive.id, archive.sha256]));
    return catalog.memberOccurrences.map((member) => {
        const classification = member.classification ?? { kind: 'other', extension: null };
        return {
            id: `academy-catalog:${member.id}`,
            recordType: 'catalog-archive-member',
            sourceRoot: 'academy-catalog',
            sourcePath: `catalog/member-occurrences/${member.id}`,
            assetType: classification.kind,
            extension: classification.extension,
            canonicalHash: `sha256:${member.payloadSha256}`,
            byteLength: member.uncompressedBytes,
            parentCanonicalHash: archiveHashes.has(member.archiveOccurrenceId) ? `sha256:${archiveHashes.get(member.archiveOccurrenceId)}` : null,
            inference: { year: null, week: null, course: null, lesson: null },
            digitisation: digitisationFor('academy-catalog', classification.kind),
            intendedAcademyUse: intendedUse('academy-catalog', classification.kind),
            sourceLinks: [],
        };
    });
}

function summarize(resources) {
    const by = (selector) => Object.fromEntries([...resources.reduce((counts, item) => {
        const key = selector(item);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
    }, new Map()).entries()].sort(([left], [right]) => compareUtf8(left, right)));
    return {
        resourceCount: resources.length,
        uniqueCanonicalPayloadCount: new Set(resources.map((resource) => resource.canonicalHash)).size,
        byType: by((resource) => resource.assetType),
        byRoot: by((resource) => resource.sourceRoot),
        byDigitisationState: by((resource) => resource.digitisation.state),
        missingConversions: by((resource) => resource.digitisation.conversion),
    };
}

function compareResources(left, right) {
    return compareUtf8(left.sourceRoot, right.sourceRoot) || compareUtf8(left.sourcePath, right.sourcePath);
}

async function mapWithConcurrency(values, limit, mapper) {
    const results = new Array(values.length);
    let next = 0;
    async function worker() {
        while (next < values.length) {
            const index = next++;
            results[index] = await mapper(values[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
    return results;
}

function compareUtf8(left, right) { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
function toPortablePath(value) { return value.split('\\').join('/'); }
function uniqueSorted(values) { return [...new Set(values)].sort(compareUtf8); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCli().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
