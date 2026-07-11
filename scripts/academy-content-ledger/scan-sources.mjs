#!/usr/bin/env node
// Deterministic content scanner for the Yomu Academy source ledger.
//
// Walks every content root, streams a SHA-256 over each learning-relevant asset, and
// emits a raw NDJSON inventory plus a scan summary. Hashing is byte-compatible with
// public/academy/catalog.json and scripts/build-academy-digitisation-index.mjs
// (`sha256:<hex>` of the complete payload) so disk assets can be reconciled against the
// metadata-only Moodle catalog by hash.
//
// Bulk directories (e.g. a scraped website mirror) are catalogued as one aggregate
// dataset record rather than one record per file, and the decision is logged — never a
// silent cap.
//
// Usage: node scripts/academy-content-ledger/scan-sources.mjs [--out <dir>] [--root <id>]

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, opendir, stat, writeFile, open } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';

import {
    contentRoots, JUNK_DIRS, classifyExt, INSPECTABLE_ARCHIVE_EXT, RAW_DIR,
} from './lib/roots.mjs';

let inspectArchive = async () => null; // best-effort; replaced if yauzl is importable
try {
    const yauzl = (await import('yauzl')).default;
    inspectArchive = makeArchiveInspector(yauzl);
} catch {
    // yauzl unavailable: archives are hashed as opaque payloads with no member list.
}

function parseArgs(argv) {
    const args = { out: RAW_DIR, root: null };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--out') args.out = argv[++i];
        else if (argv[i] === '--root') args.root = argv[++i];
    }
    return args;
}

function toPortable(p) { return p.split('\\').join('/'); }

// Anki decks (.apkg/.anki/.colpkg) are always inspected — they are curricular study
// decks and small. Generic .zip files are inspected only when small: large archives in
// this corpus are packaged third-party dictionaries (forvo/jpod/nhk/daijisen, tens of
// thousands of pronunciation clips) whose internal members are dictionary data, not
// class resources, and are correctly catalogued as one opaque asset.
const ANKI_EXT = new Set(['.apkg', '.anki', '.colpkg']);
const ZIP_INSPECT_MAX_BYTES = 20 * 1024 * 1024;
function shouldInspectArchive(ext, byteLength) {
    if (ANKI_EXT.has(ext)) return true;
    if (ext === '.zip') return byteLength < ZIP_INSPECT_MAX_BYTES;
    return false;
}

async function hashFile(absPath) {
    const digest = createHash('sha256');
    let byteLength = 0;
    for await (const chunk of createReadStream(absPath)) {
        digest.update(chunk);
        byteLength += chunk.length;
    }
    return { sha256: `sha256:${digest.digest('hex')}`, byteLength };
}

function makeArchiveInspector(yauzl) {
    return (absPath) => new Promise((resolveMembers) => {
        yauzl.open(absPath, { autoClose: true, decodeStrings: true, lazyEntries: true, validateEntrySizes: true }, (openErr, archive) => {
            if (openErr || !archive) { resolveMembers(null); return; }
            const members = [];
            let settled = false;
            const fail = () => { if (!settled) { settled = true; try { archive.close(); } catch { /* noop */ } resolveMembers(members.length ? members : null); } };
            archive.on('error', fail);
            archive.on('entry', (entry) => {
                if (entry.fileName.endsWith('/')) { archive.readEntry(); return; }
                archive.openReadStream(entry, (streamErr, stream) => {
                    if (streamErr || !stream) { archive.readEntry(); return; }
                    const digest = createHash('sha256');
                    let byteLength = 0;
                    stream.on('data', (c) => { digest.update(c); byteLength += c.length; });
                    stream.once('error', () => archive.readEntry());
                    stream.once('end', () => {
                        members.push({
                            path: toPortable(entry.fileName),
                            ext: extname(entry.fileName).toLowerCase(),
                            kind: classifyExt(extname(entry.fileName)) ?? 'other',
                            sha256: `sha256:${digest.digest('hex')}`,
                            byteLength,
                        });
                        archive.readEntry();
                    });
                });
            });
            archive.on('end', () => { if (!settled) { settled = true; resolveMembers(members.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))); } });
            archive.readEntry();
        });
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    await mkdir(args.out, { recursive: true });
    const invPath = join(args.out, 'inventory.ndjson');
    const invHandle = await open(invPath, 'w');

    const roots = contentRoots().filter((r) => !args.root || r.id === args.root);
    const summary = {
        schema: 'yomu-academy-source-scan/v1',
        scannedRoots: [],
        counts: { files: 0, archiveMembers: 0, bulkDatasets: 0, bulkFiles: 0, errors: 0, skippedUnclassified: 0 },
        byKind: {},
        bulkDatasets: [],
        skippedByExtension: {},
        errors: [],
    };

    let written = 0;
    const emit = async (record) => {
        await invHandle.write(`${JSON.stringify(record)}\n`);
        written += 1;
        if (written % 500 === 0) process.stderr.write(`  …${written} records\n`);
    };
    const bump = (kind) => { summary.byKind[kind] = (summary.byKind[kind] ?? 0) + 1; };

    for (const root of roots) {
        let rootStat;
        try { rootStat = await stat(root.absPath); } catch { rootStat = null; }
        if (!rootStat || !rootStat.isDirectory()) {
            summary.scannedRoots.push({ id: root.id, absPath: root.absPath, available: false });
            process.stderr.write(`ROOT ${root.id}: UNAVAILABLE (${root.absPath})\n`);
            continue;
        }
        process.stderr.write(`ROOT ${root.id}: ${root.absPath}\n`);
        const excludeSet = new Set((root.excludeDirs ?? []).map(toPortable));
        const bulkSet = new Set((root.bulkDirs ?? []).map(toPortable));
        const rootCountsBefore = { files: summary.counts.files, members: summary.counts.archiveMembers };

        const walk = async (dir) => {
            let handle;
            try { handle = await opendir(dir); } catch (err) { summary.counts.errors += 1; summary.errors.push({ path: dir, error: String(err) }); return; }
            const entries = [];
            for await (const dirent of handle) entries.push(dirent);
            entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            for (const dirent of entries) {
                const abs = join(dir, dirent.name);
                const rel = toPortable(relative(root.absPath, abs));
                if (dirent.isSymbolicLink()) continue;
                if (dirent.isDirectory()) {
                    if (JUNK_DIRS.has(dirent.name) || excludeSet.has(rel)) continue;
                    if (bulkSet.has(rel)) { await aggregateBulk(root, abs, rel); continue; }
                    await walk(abs);
                } else if (dirent.isFile()) {
                    await indexFile(root, abs, rel, dirent.name);
                }
            }
        };

        const aggregateBulk = async (rootDesc, abs, rel) => {
            const agg = { files: 0, bytes: 0, byExt: {}, byKind: {} };
            const walkBulk = async (dir) => {
                let handle;
                try { handle = await opendir(dir); } catch { return; }
                for await (const dirent of handle) {
                    if (dirent.isSymbolicLink()) continue;
                    const child = join(dir, dirent.name);
                    if (dirent.isDirectory()) { if (!JUNK_DIRS.has(dirent.name)) await walkBulk(child); }
                    else if (dirent.isFile()) {
                        let st; try { st = await stat(child); } catch { continue; }
                        const ext = extname(dirent.name).toLowerCase() || '(none)';
                        agg.files += 1; agg.bytes += st.size;
                        agg.byExt[ext] = (agg.byExt[ext] ?? 0) + 1;
                        const kind = classifyExt(ext) ?? 'other';
                        agg.byKind[kind] = (agg.byKind[kind] ?? 0) + 1;
                    }
                }
            };
            await walkBulk(abs);
            const record = {
                recordType: 'bulk-dataset',
                rootId: rootDesc.id, rootRole: rootDesc.role,
                relPath: rel, absPath: abs,
                fileCount: agg.files, totalBytes: agg.bytes,
                byExtension: agg.byExt, byKind: agg.byKind,
                note: 'Aggregated dataset (scraped/bulk mirror); files not hashed individually. Represented as one ledger record by policy.',
            };
            await emit(record);
            summary.counts.bulkDatasets += 1;
            summary.counts.bulkFiles += agg.files;
            summary.bulkDatasets.push({ rootId: rootDesc.id, relPath: rel, fileCount: agg.files, totalBytes: agg.bytes, byKind: agg.byKind });
            process.stderr.write(`  BULK ${rootDesc.id}/${rel}: ${agg.files} files, ${(agg.bytes / 1e6).toFixed(1)} MB (aggregated)\n`);
        };

        const indexFile = async (rootDesc, abs, rel, name) => {
            const ext = extname(name).toLowerCase();
            const kind = classifyExt(ext);
            if (!kind) {
                // Auditable skip: record extension + a sample path so the skip bucket is never
                // an opaque count (mirrors the "never a silent cap" rule used for bulk dirs).
                summary.counts.skippedUnclassified += 1;
                const key = ext || '(none)';
                const s = summary.skippedByExtension[key] ?? (summary.skippedByExtension[key] = { count: 0, sample: null });
                s.count += 1;
                if (!s.sample) s.sample = toPortable(relative(rootDesc.absPath, abs));
                return;
            }
            let st; try { st = await stat(abs); } catch (err) { summary.counts.errors += 1; summary.errors.push({ path: abs, error: String(err) }); return; }
            let hashed;
            try { hashed = await hashFile(abs); } catch (err) { summary.counts.errors += 1; summary.errors.push({ path: abs, error: String(err) }); return; }
            const record = {
                recordType: 'file',
                rootId: rootDesc.id, rootRole: rootDesc.role,
                relPath: rel, absPath: abs, name,
                ext, kind,
                sha256: hashed.sha256, byteLength: hashed.byteLength,
                mtimeMs: st.mtimeMs, mtimeISO: new Date(st.mtimeMs).toISOString(),
            };
            if (INSPECTABLE_ARCHIVE_EXT.has(ext)) {
                if (shouldInspectArchive(ext, hashed.byteLength)) {
                    const members = await inspectArchive(abs);
                    if (members) {
                        record.archiveMemberCount = members.length;
                        record.archiveMembers = members;
                        summary.counts.archiveMembers += members.length;
                        for (const m of members) bump(`member:${m.kind}`);
                    }
                } else {
                    // Opaque by policy: packaged dictionary / oversize non-curricular zip.
                    record.archiveMembersInspected = false;
                    record.archiveNote = 'packaged-archive-catalogued-opaque (members are third-party dictionary data, not class resources)';
                }
            }
            await emit(record);
            summary.counts.files += 1;
            bump(kind);
        };

        await walk(root.absPath);
        summary.scannedRoots.push({
            id: root.id, absPath: root.absPath, role: root.role, available: true,
            files: summary.counts.files - rootCountsBefore.files,
            archiveMembers: summary.counts.archiveMembers - rootCountsBefore.members,
        });
    }

    await invHandle.close();
    summary.inventoryPath = invPath;
    summary.totalRecords = written;
    await writeFile(join(args.out, 'scan-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    process.stderr.write(`\nDONE: ${written} records → ${invPath}\n`);
    process.stdout.write(`${JSON.stringify(summary.counts)}\n`);
}

main().catch((err) => { process.stderr.write(`${err?.stack || err}\n`); process.exitCode = 1; });
