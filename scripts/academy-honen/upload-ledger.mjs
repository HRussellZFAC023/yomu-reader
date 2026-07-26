import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporaryPath, filePath);
}

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    const descriptor = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
        let bytesRead = 0;
        do {
            bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
        } while (bytesRead > 0);
    } finally {
        fs.closeSync(descriptor);
    }
    return hash.digest('hex');
}

function buildEntries(batchDocument) {
    return batchDocument.batches.flatMap(batch => batch.files.map(file => ({
        sourceId: file.sourceId,
        sourceRoot: batchDocument.libraryRoot,
        relativePath: file.relativePath,
        sha256: file.sha256,
        byteLength: file.byteLength,
        batchId: batch.id,
        group: batch.group,
        status: 'pending',
        receipt: null,
    })));
}

export function initialiseUploadLedger(batchDocument, existing = null) {
    const previousBySource = new Map(
        (existing?.entries ?? []).map(entry => [entry.sourceId, entry]),
    );
    const entries = buildEntries(batchDocument).map(entry => {
        const previous = previousBySource.get(entry.sourceId);
        if (
            previous?.sha256 === entry.sha256
            && previous?.relativePath === entry.relativePath
            && previous?.status === 'imported'
            && previous?.receipt?.itemId
        ) {
            return { ...entry, status: 'imported', receipt: previous.receipt };
        }
        return entry;
    });

    const directIds = new Set(entries.map(entry => entry.sourceId));
    for (const entry of existing?.entries ?? []) {
        if (entry.origin === 'external' && !directIds.has(entry.sourceId)) entries.push(entry);
    }

    return {
        schema: 'yomu-academy.honen-upload-ledger.v1',
        generatedAt: new Date().toISOString(),
        sourceGeneratedAt: batchDocument.generatedAt,
        libraryRoot: batchDocument.libraryRoot,
        entries,
    };
}

export function summariseUploadLedger(ledger) {
    const summary = {
        total: ledger.entries.length,
        imported: 0,
        pending: 0,
        failed: 0,
        importedBytes: 0,
        pendingBytes: 0,
    };
    for (const entry of ledger.entries) {
        if (entry.status === 'imported') {
            summary.imported += 1;
            summary.importedBytes += entry.byteLength;
        } else if (entry.status === 'failed') {
            summary.failed += 1;
        } else {
            summary.pending += 1;
            summary.pendingBytes += entry.byteLength;
        }
    }
    return summary;
}

function verifySource(entry, absolutePath) {
    if (!fs.existsSync(absolutePath)) throw new Error(`Source file not found: ${absolutePath}`);
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) throw new Error(`Source is not a regular file: ${absolutePath}`);
    if (stat.size !== entry.byteLength) {
        throw new Error(`Source size changed for ${entry.sourceId}: expected ${entry.byteLength}, got ${stat.size}.`);
    }
    const actualSha256 = sha256File(absolutePath);
    if (actualSha256 !== entry.sha256) {
        throw new Error(`Source hash changed for ${entry.sourceId}: expected ${entry.sha256}, got ${actualSha256}.`);
    }
}

export function recordImport(ledger, {
    sourceId,
    workspaceId,
    parentId,
    itemId,
    versionId = null,
    title,
    absolutePath = null,
    importedAt = new Date().toISOString(),
}) {
    const entry = ledger.entries.find(candidate => candidate.sourceId === sourceId);
    if (!entry) throw new Error(`Unknown Honen source ID: ${sourceId}`);
    const sourcePath = absolutePath ?? entry.absolutePath ?? path.join(entry.sourceRoot, entry.relativePath);
    verifySource(entry, sourcePath);

    entry.status = 'imported';
    entry.receipt = {
        workspaceId,
        parentId,
        itemId,
        versionId,
        title,
        importedAt,
    };
    return entry;
}

export function appendExternalSource(ledger, {
    absolutePath,
    logicalPath,
    sourceId = null,
}) {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) throw new Error(`External source is not a regular file: ${absolutePath}`);
    const sha256 = sha256File(absolutePath);
    const resolvedSourceId = sourceId ?? `external-${sha256.slice(0, 16)}`;
    const existing = ledger.entries.find(entry => entry.sourceId === resolvedSourceId);
    if (existing) return existing;

    const entry = {
        sourceId: resolvedSourceId,
        origin: 'external',
        sourceRoot: path.dirname(absolutePath),
        relativePath: logicalPath,
        absolutePath,
        sha256,
        byteLength: stat.size,
        batchId: null,
        group: 'external',
        status: 'pending',
        receipt: null,
    };
    ledger.entries.push(entry);
    return entry;
}

function parseArguments(argv) {
    const options = { limit: 1 };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (!argument.startsWith('--') && !options.action) options.action = argument;
        else if (argument === '--batches') options.batchesPath = argv[++index];
        else if (argument === '--ledger') options.ledgerPath = argv[++index];
        else if (argument === '--limit') options.limit = Number(argv[++index]);
        else if (argument === '--source-id') options.sourceId = argv[++index];
        else if (argument === '--file') options.absolutePath = path.resolve(argv[++index]);
        else if (argument === '--logical-path') options.logicalPath = argv[++index];
        else if (argument === '--workspace-id') options.workspaceId = argv[++index];
        else if (argument === '--parent-id') options.parentId = argv[++index];
        else if (argument === '--item-id') options.itemId = argv[++index];
        else if (argument === '--version-id') options.versionId = argv[++index];
        else if (argument === '--title') options.title = argv[++index];
        else throw new Error(`Unknown argument: ${argument}`);
    }
    return options;
}

function required(options, ...keys) {
    for (const key of keys) {
        if (!options[key]) throw new Error(`Missing required --${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}.`);
    }
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.action === 'init') {
        required(options, 'batchesPath', 'ledgerPath');
        const existing = fs.existsSync(options.ledgerPath) ? readJson(options.ledgerPath) : null;
        const ledger = initialiseUploadLedger(readJson(options.batchesPath), existing);
        writeJsonAtomic(options.ledgerPath, ledger);
        process.stdout.write(`${JSON.stringify(summariseUploadLedger(ledger))}\n`);
        return;
    }

    required(options, 'ledgerPath');
    const ledger = readJson(options.ledgerPath);
    if (options.action === 'next') {
        const entries = ledger.entries
            .filter(entry => entry.status === 'pending')
            .slice(0, options.limit)
            .map(entry => ({
                ...entry,
                absolutePath: entry.absolutePath ?? path.join(entry.sourceRoot, entry.relativePath),
            }));
        process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
        return;
    }
    if (options.action === 'summary') {
        process.stdout.write(`${JSON.stringify(summariseUploadLedger(ledger))}\n`);
        return;
    }
    if (options.action === 'add-external') {
        required(options, 'absolutePath', 'logicalPath');
        const entry = appendExternalSource(ledger, options);
        writeJsonAtomic(options.ledgerPath, ledger);
        process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
        return;
    }
    if (options.action === 'record') {
        required(options, 'sourceId', 'workspaceId', 'parentId', 'itemId', 'title');
        const entry = recordImport(ledger, options);
        writeJsonAtomic(options.ledgerPath, ledger);
        process.stdout.write(`${JSON.stringify(entry.receipt)}\n`);
        return;
    }
    throw new Error(`Unknown action: ${options.action ?? '<missing>'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
