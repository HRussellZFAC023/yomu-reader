import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yauzl from 'yauzl';

export const CATALOG_SCHEMA = 'yomu-academy-publishable-catalog/v1';

const UTF8_FLAG = 0x0800;
const SAFE_EXTENSION_KINDS = new Map([
    ['.csv', 'text'],
    ['.doc', 'document'],
    ['.docx', 'document'],
    ['.epub', 'document'],
    ['.gif', 'image'],
    ['.htm', 'web'],
    ['.html', 'web'],
    ['.jpeg', 'image'],
    ['.jpg', 'image'],
    ['.json', 'text'],
    ['.md', 'text'],
    ['.mp3', 'audio'],
    ['.mp4', 'video'],
    ['.odp', 'presentation'],
    ['.ods', 'spreadsheet'],
    ['.odt', 'document'],
    ['.pdf', 'document'],
    ['.png', 'image'],
    ['.ppt', 'presentation'],
    ['.pptx', 'presentation'],
    ['.rtf', 'document'],
    ['.svg', 'image'],
    ['.txt', 'text'],
    ['.wav', 'audio'],
    ['.webm', 'video'],
    ['.xls', 'spreadsheet'],
    ['.xlsx', 'spreadsheet'],
    ['.xml', 'text'],
    ['.zip', 'archive'],
]);
const SAFE_MODULE_TYPES = new Set([
    'assign',
    'book',
    'chat',
    'choice',
    'data',
    'feedback',
    'folder',
    'forum',
    'glossary',
    'h5pactivity',
    'label',
    'lesson',
    'lti',
    'page',
    'quiz',
    'resource',
    'scorm',
    'survey',
    'url',
    'wiki',
    'workshop',
]);
const USAGE = [
    'Usage: node scripts/build-academy-catalog.mjs --source <directory> --output <file> --captured-at <ISO-8601> --provenance-id <opaque-id>',
    '',
    'The generated catalog is metadata-only: it contains hashes, sizes, safe classifications, and supplied capture provenance.',
].join('\n');

class CatalogError extends Error {}

export function parseCatalogArguments(argv) {
    if (argv.includes('--help')) return { help: true };

    const values = {};
    const optionNames = new Map([
        ['--source', 'source'],
        ['--output', 'output'],
        ['--captured-at', 'capturedAt'],
        ['--provenance', 'provenanceId'],
        ['--provenance-id', 'provenanceId'],
    ]);

    for (let index = 0; index < argv.length; index += 1) {
        const option = optionNames.get(argv[index]);
        if (!option) throw new CatalogError('Unsupported catalog option.');

        const value = argv[index + 1];
        if (typeof value !== 'string' || value.startsWith('--')) {
            throw new CatalogError('Each catalog option requires a value.');
        }
        if (values[option] !== undefined) throw new CatalogError('Catalog options may only be supplied once.');

        values[option] = value;
        index += 1;
    }

    return normalizeOptions(values, { requireOutput: true });
}

export async function buildAcademyCatalog(input) {
    const options = normalizeOptions(input, { requireOutput: false });
    await assertSourceDirectory(options.source);

    const manifestPath = join(options.source, 'manifest.json');
    if (options.output === manifestPath) throw new CatalogError('Catalog output must not overwrite the source manifest.');

    const { manifest, sha256: manifestSha256 } = await readSourceManifest(manifestPath);
    const archivePaths = await findZipArchives(options.source);
    if (options.output && archivePaths.includes(options.output)) {
        throw new CatalogError('Catalog output must not overwrite a source archive.');
    }

    const archivePayloads = new Map();
    const assets = new Map();
    const archiveOccurrences = [];
    const memberOccurrences = [];
    let memberOrdinal = 0;

    for (const [archiveIndex, archivePath] of archivePaths.entries()) {
        const archiveOrdinal = archiveIndex + 1;
        const archiveOccurrenceId = stableId('archive', archiveOrdinal);
        const archivePayload = await hashArchiveFile(archivePath, archiveOrdinal);
        const members = await inspectArchive(archivePath, archiveOrdinal);

        addArchivePayload(archivePayloads, archivePayload, archiveOccurrenceId);
        archiveOccurrences.push({
            id: archiveOccurrenceId,
            sha256: archivePayload.sha256,
            byteLength: archivePayload.byteLength,
            memberOccurrenceCount: members.length,
        });

        for (const member of members) {
            const occurrence = {
                id: stableId('member', ++memberOrdinal),
                archiveOccurrenceId,
                centralDirectoryIndex: member.centralDirectoryIndex,
                memberKind: member.memberKind,
                payloadSha256: member.payload.sha256,
                compressedBytes: member.compressedBytes,
                uncompressedBytes: member.payload.byteLength,
                compression: member.compression,
                classification: member.classification,
                path: member.path,
            };
            memberOccurrences.push(occurrence);
            addAsset(assets, occurrence);
        }
    }

    const manifestSummary = summarizeManifest(manifest, manifestSha256);
    return {
        schema: CATALOG_SCHEMA,
        provenance: {
            captureId: options.provenanceId,
            capturedAt: options.capturedAt,
            sourceManifestSha256: manifestSummary.sha256,
        },
        rights: {
            publication: 'metadata-only',
            excluded: [
                'archive-byte-content',
                'archive-source-paths',
                'member-byte-content',
                'member-names',
                'manifest-titles-urls-notes',
                'zip-comments-and-member-timestamps',
            ],
        },
        manifest: manifestSummary,
        summary: summarizeCatalog(archiveOccurrences, archivePayloads, memberOccurrences, assets),
        archivePayloads: materializeArchivePayloads(archivePayloads),
        archiveOccurrences,
        assets: materializeAssets(assets),
        memberOccurrences,
        patterns: buildPatterns(memberOccurrences, assets),
    };
}

export async function writeAcademyCatalog(input) {
    const options = normalizeOptions(input, { requireOutput: true });
    const catalog = await buildAcademyCatalog(options);

    try {
        await mkdir(dirname(options.output), { recursive: true });
        await writeFile(options.output, `${JSON.stringify(catalog, null, 2)}\n`);
    } catch {
        throw new CatalogError('Unable to write catalog output.');
    }

    return catalog;
}

export async function runCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
    const options = parseCatalogArguments(argv);
    if (options.help) {
        stdout.write(`${USAGE}\n`);
        return null;
    }

    const catalog = await writeAcademyCatalog(options);
    stdout.write(`${JSON.stringify({ schema: catalog.schema, summary: catalog.summary })}\n`);
    return catalog;
}

function normalizeOptions(input, { requireOutput }) {
    if (!input || typeof input !== 'object') throw new CatalogError('Catalog options are required.');

    const source = requiredString(input.source, 'A source directory is required.');
    const output = input.output === undefined ? undefined : requiredString(input.output, 'A catalog output file is required.');
    if (requireOutput && !output) throw new CatalogError('A catalog output file is required.');

    return {
        source: resolve(source),
        output: output ? resolve(output) : undefined,
        capturedAt: normalizeCapturedAt(requiredString(input.capturedAt, 'A capture timestamp is required.')),
        provenanceId: validateProvenanceId(requiredString(input.provenanceId, 'A provenance identifier is required.')),
    };
}

function requiredString(value, message) {
    if (typeof value !== 'string' || value.length === 0) throw new CatalogError(message);
    return value;
}

function normalizeCapturedAt(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
        throw new CatalogError('Capture timestamp must be an ISO-8601 instant with a timezone.');
    }

    const milliseconds = Date.parse(value);
    if (Number.isNaN(milliseconds)) throw new CatalogError('Capture timestamp is not a valid instant.');
    return new Date(milliseconds).toISOString();
}

function validateProvenanceId(value) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
        throw new CatalogError('Provenance identifier must be an opaque ASCII identifier.');
    }
    return value;
}

async function assertSourceDirectory(source) {
    try {
        if (!(await stat(source)).isDirectory()) throw new CatalogError('Catalog source must be a directory.');
    } catch (error) {
        if (error instanceof CatalogError) throw error;
        throw new CatalogError('Catalog source could not be read.');
    }
}

async function readSourceManifest(manifestPath) {
    let bytes;
    try {
        bytes = await readFile(manifestPath);
    } catch {
        throw new CatalogError('Source manifest could not be read.');
    }

    let manifest;
    try {
        manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    } catch {
        throw new CatalogError('Source manifest is not valid JSON.');
    }

    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.courses)) {
        throw new CatalogError('Source manifest does not contain a courses array.');
    }

    return { manifest, sha256: sha256(bytes) };
}

async function findZipArchives(source) {
    const archivePaths = [];

    async function visit(directory) {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            throw new CatalogError('Catalog source could not be enumerated.');
        }

        entries.sort((left, right) => compareUtf8(left.name, right.name));
        for (const entry of entries) {
            const entryPath = join(directory, entry.name);
            if (entry.isSymbolicLink()) throw new CatalogError('Catalog source contains a symbolic link.');
            if (entry.isDirectory()) {
                await visit(entryPath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
                archivePaths.push(entryPath);
            }
        }
    }

    await visit(source);
    return archivePaths.sort((left, right) => compareUtf8(relative(source, left), relative(source, right)));
}

async function hashArchiveFile(archivePath, archiveOrdinal) {
    try {
        const hash = createHash('sha256');
        let byteLength = 0;
        for await (const chunk of createReadStream(archivePath)) {
            hash.update(chunk);
            byteLength += chunk.length;
        }
        return { sha256: hash.digest('hex'), byteLength };
    } catch {
        throw new CatalogError(`Archive occurrence ${archiveOrdinal} could not be hashed.`);
    }
}

async function inspectArchive(archivePath, archiveOrdinal) {
    try {
        return await readCentralDirectory(archivePath);
    } catch {
        throw new CatalogError(`Archive occurrence ${archiveOrdinal} could not be inspected.`);
    }
}

function readCentralDirectory(archivePath) {
    return new Promise((resolvePromise, rejectPromise) => {
        yauzl.open(archivePath, {
            autoClose: true,
            decodeStrings: true,
            lazyEntries: true,
            validateEntrySizes: true,
        }, (openError, zipFile) => {
            if (openError) {
                rejectPromise(openError);
                return;
            }

            const members = [];
            let centralDirectoryIndex = 0;
            let settled = false;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                zipFile.close();
                rejectPromise(error);
            };

            zipFile.on('error', fail);
            zipFile.on('entry', (entry) => {
                const index = ++centralDirectoryIndex;
                void inspectMember(zipFile, entry, index)
                    .then((member) => {
                        if (settled) return;
                        members.push(member);
                        zipFile.readEntry();
                    })
                    .catch(fail);
            });
            zipFile.on('end', () => {
                if (settled) return;
                settled = true;
                resolvePromise(members);
            });
            zipFile.readEntry();
        });
    });
}

async function inspectMember(zipFile, entry, centralDirectoryIndex) {
    if (typeof entry.fileName !== 'string' || entry.fileName.includes('\uFFFD')) {
        throw new CatalogError('ZIP member name could not be decoded safely.');
    }
    if (entry.isEncrypted()) throw new CatalogError('Encrypted ZIP members cannot be catalogued safely.');

    const memberKind = entry.fileName.endsWith('/') ? 'directory' : 'file';
    const nameEncoding = classifyNameEncoding(entry);
    const classification = classifyMember(entry.fileName, memberKind);
    const payload = await hashMemberPayload(zipFile, entry);
    return {
        centralDirectoryIndex,
        memberKind,
        payload,
        compressedBytes: entry.compressedSize,
        compression: classifyCompression(entry.compressionMethod),
        classification,
        path: {
            depth: entry.fileName.split('/').filter(Boolean).length,
            characterSet: /^[\x00-\x7f]*$/.test(entry.fileName) ? 'ascii' : 'unicode',
            nameEncoding,
        },
    };
}

function hashMemberPayload(zipFile, entry) {
    return new Promise((resolvePromise, rejectPromise) => {
        zipFile.openReadStream(entry, (streamError, stream) => {
            if (streamError) {
                rejectPromise(streamError);
                return;
            }

            const hash = createHash('sha256');
            let byteLength = 0;
            stream.on('data', (chunk) => {
                hash.update(chunk);
                byteLength += chunk.length;
            });
            stream.once('error', rejectPromise);
            stream.once('end', () => {
                if (byteLength !== entry.uncompressedSize) {
                    rejectPromise(new CatalogError('ZIP member size did not match its central-directory record.'));
                    return;
                }
                resolvePromise({ sha256: hash.digest('hex'), byteLength });
            });
        });
    });
}

function classifyMember(memberName, memberKind) {
    if (memberKind === 'directory') return { kind: 'directory', extension: null };

    const extension = extname(memberName.split('/').at(-1) ?? '').toLowerCase();
    if (SAFE_EXTENSION_KINDS.has(extension)) {
        return { kind: SAFE_EXTENSION_KINDS.get(extension), extension };
    }
    return { kind: 'other', extension: null };
}

function classifyCompression(method) {
    if (method === 0) return 'stored';
    if (method === 8) return 'deflate';
    if (method === 12) return 'bzip2';
    if (method === 93) return 'zstd';
    return 'other';
}

function classifyNameEncoding(entry) {
    if (entry.generalPurposeBitFlag & UTF8_FLAG) return 'utf8';
    if (entry.extraFields.some((field) => field.id === 0x7075)) return 'unicode-path-extra';
    if (/^[\x00-\x7f]*$/.test(entry.fileName)) return 'ascii';
    throw new CatalogError('ZIP member name has no Unicode encoding declaration.');
}

function summarizeManifest(manifest, sha256Value) {
    const moduleTypeCounts = new Map();
    let sectionCount = 0;
    let moduleCount = 0;

    for (const course of manifest.courses) {
        const sections = Array.isArray(course?.sections) ? course.sections : [];
        sectionCount += sections.length;
        for (const section of sections) {
            const modules = Array.isArray(section?.modules) ? section.modules : [];
            moduleCount += modules.length;
            for (const module of modules) {
                const type = SAFE_MODULE_TYPES.has(module?.type) ? module.type : 'other';
                moduleTypeCounts.set(type, (moduleTypeCounts.get(type) ?? 0) + 1);
            }
        }
    }

    return {
        sha256: sha256Value,
        courseCount: manifest.courses.length,
        sectionCount,
        moduleCount,
        moduleTypeCounts: Object.fromEntries([...moduleTypeCounts.entries()].sort(([left], [right]) => compareUtf8(left, right))),
    };
}

function addArchivePayload(archivePayloads, archivePayload, archiveOccurrenceId) {
    const existing = archivePayloads.get(archivePayload.sha256);
    if (existing) {
        if (existing.byteLength !== archivePayload.byteLength) throw new CatalogError('Archive hash collision detected.');
        existing.occurrenceIds.add(archiveOccurrenceId);
        return;
    }
    archivePayloads.set(archivePayload.sha256, {
        sha256: archivePayload.sha256,
        byteLength: archivePayload.byteLength,
        occurrenceIds: new Set([archiveOccurrenceId]),
    });
}

function addAsset(assets, occurrence) {
    const existing = assets.get(occurrence.payloadSha256);
    const classification = { memberKind: occurrence.memberKind, ...occurrence.classification };
    const classificationKey = keyForClassification(classification.memberKind, classification);
    if (existing) {
        if (existing.byteLength !== occurrence.uncompressedBytes) throw new CatalogError('Member payload hash collision detected.');
        existing.occurrenceIds.add(occurrence.id);
        existing.archiveOccurrenceIds.add(occurrence.archiveOccurrenceId);
        existing.classifications.set(classificationKey, classification);
        return;
    }

    assets.set(occurrence.payloadSha256, {
        sha256: occurrence.payloadSha256,
        byteLength: occurrence.uncompressedBytes,
        occurrenceIds: new Set([occurrence.id]),
        archiveOccurrenceIds: new Set([occurrence.archiveOccurrenceId]),
        classifications: new Map([[classificationKey, classification]]),
    });
}

function summarizeCatalog(archiveOccurrences, archivePayloads, memberOccurrences, assets) {
    return {
        archiveOccurrenceCount: archiveOccurrences.length,
        uniqueArchivePayloadCount: archivePayloads.size,
        memberOccurrenceCount: memberOccurrences.length,
        uniquePayloadAssetCount: assets.size,
        totalMemberUncompressedBytes: memberOccurrences.reduce((total, occurrence) => total + occurrence.uncompressedBytes, 0),
        duplicatePayloadOccurrenceCount: memberOccurrences.length - assets.size,
    };
}

function materializeArchivePayloads(archivePayloads) {
    return [...archivePayloads.values()]
        .sort((left, right) => compareUtf8(left.sha256, right.sha256))
        .map((payload) => ({
            sha256: payload.sha256,
            byteLength: payload.byteLength,
            occurrenceCount: payload.occurrenceIds.size,
        }));
}

function materializeAssets(assets) {
    return [...assets.values()]
        .sort((left, right) => compareUtf8(left.sha256, right.sha256))
        .map((asset) => ({
            sha256: asset.sha256,
            byteLength: asset.byteLength,
            occurrenceCount: asset.occurrenceIds.size,
            archiveOccurrenceCount: asset.archiveOccurrenceIds.size,
            classifications: [...asset.classifications.values()]
                .sort((left, right) => compareUtf8(keyForClassification(left.memberKind, left), keyForClassification(right.memberKind, right))),
        }));
}

function buildPatterns(memberOccurrences, assets) {
    const fileTypes = new Map();
    const pathShapes = new Map();
    const compressions = new Map();

    for (const occurrence of memberOccurrences) {
        addPattern(fileTypes, keyForClassification(occurrence.memberKind, occurrence.classification), {
            memberKind: occurrence.memberKind,
            kind: occurrence.classification.kind,
            extension: occurrence.classification.extension,
        }, occurrence);
        addPattern(pathShapes, `${occurrence.memberKind}\u0000${occurrence.path.depth}\u0000${occurrence.path.characterSet}`, {
            memberKind: occurrence.memberKind,
            pathDepth: occurrence.path.depth,
            characterSet: occurrence.path.characterSet,
        }, occurrence);
        addPattern(compressions, occurrence.compression, { compression: occurrence.compression }, occurrence);
    }

    const reusedAssets = [...assets.values()].filter((asset) => asset.occurrenceIds.size > 1);
    return {
        byFileType: materializePatterns(fileTypes),
        byPathShape: materializePatterns(pathShapes),
        byCompression: materializePatterns(compressions),
        duplicatePayloads: {
            reusedAssetCount: reusedAssets.length,
            duplicateOccurrenceCount: reusedAssets.reduce((total, asset) => total + asset.occurrenceIds.size - 1, 0),
        },
    };
}

function addPattern(patterns, key, descriptor, occurrence) {
    let pattern = patterns.get(key);
    if (!pattern) {
        pattern = {
            key,
            descriptor,
            occurrenceCount: 0,
            compressedBytes: 0,
            uncompressedBytes: 0,
            payloadHashes: new Set(),
            archiveOccurrenceIds: new Set(),
        };
        patterns.set(key, pattern);
    }
    pattern.occurrenceCount += 1;
    pattern.compressedBytes += occurrence.compressedBytes;
    pattern.uncompressedBytes += occurrence.uncompressedBytes;
    pattern.payloadHashes.add(occurrence.payloadSha256);
    pattern.archiveOccurrenceIds.add(occurrence.archiveOccurrenceId);
}

function materializePatterns(patterns) {
    return [...patterns.values()]
        .sort((left, right) => compareUtf8(left.key, right.key))
        .map((pattern) => ({
            ...pattern.descriptor,
            occurrenceCount: pattern.occurrenceCount,
            uniquePayloadAssetCount: pattern.payloadHashes.size,
            archiveOccurrenceCount: pattern.archiveOccurrenceIds.size,
            compressedBytes: pattern.compressedBytes,
            uncompressedBytes: pattern.uncompressedBytes,
        }));
}

function keyForClassification(memberKind, classification) {
    return `${memberKind}\u0000${classification.kind}\u0000${classification.extension ?? ''}`;
}

function stableId(prefix, ordinal) {
    return `${prefix}-${String(ordinal).padStart(6, '0')}`;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function compareUtf8(left, right) {
    return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
    runCli().catch((error) => {
        const message = error instanceof CatalogError ? error.message : 'Unexpected catalog build failure.';
        process.stderr.write(`Catalog build failed: ${message}\n`);
        process.exitCode = 1;
    });
}
