#!/usr/bin/env node
// Build a per-week source ledger from the raw UCL Moodle harvest.
//
// This is a DERIVED, auditable index of exactly which worksheet files each
// class week folder contains. It reads the raw ZIP archives (central directory
// only) and the manifest, and emits one record per course -> section -> module,
// listing every member file with a SAFE descriptor: cleaned title, pedagogical
// role guess, file kind, byte length, and the payload SHA-256 that cross-
// references public/academy/catalog.json.
//
// Rights posture (mirrors src/academy/resource-library.ts):
//   - Member NAMES are retained as worksheet descriptors (the owner's own class
//     material; the task requires preserving every worksheet identity).
//   - Private filesystem paths, Moodle download URLs, and emails are rejected.
//   - No member BYTES are copied. Only metadata is emitted.
//
// The ledger is the deterministic discovery input for the weekly-lesson build.
// If the raw harvest is absent (it is not committed to the worktree), the
// previously-generated ledger under generated/ remains the source of truth.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yauzl from 'yauzl';

const DEFAULT_SOURCE = '/Users/heru/Documents/Projects/yomu/resources/yomu-academy/moodle-raw';
const HERE = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_OUTPUT = resolve(HERE, 'generated', 'week-source-ledger.json');

const SAFE_EXTENSION_KINDS = new Map([
    ['.csv', 'text'], ['.doc', 'document'], ['.docx', 'document'], ['.epub', 'document'],
    ['.gif', 'image'], ['.htm', 'web'], ['.html', 'web'], ['.jpeg', 'image'], ['.jpg', 'image'],
    ['.json', 'text'], ['.md', 'text'], ['.mp3', 'audio'], ['.mp4', 'video'], ['.odp', 'presentation'],
    ['.ods', 'spreadsheet'], ['.odt', 'document'], ['.pdf', 'document'], ['.png', 'image'],
    ['.ppt', 'presentation'], ['.pptx', 'presentation'], ['.rtf', 'document'], ['.svg', 'image'],
    ['.txt', 'text'], ['.wav', 'audio'], ['.webm', 'video'], ['.xls', 'spreadsheet'],
    ['.xlsx', 'spreadsheet'], ['.xml', 'text'], ['.zip', 'archive'],
]);

// Heuristic pedagogical role from a cleaned member title. Marked `inferred`.
const ROLE_RULES = [
    [/answer|かいとう|解答|kaitou|key/i, 'answer-key'],
    [/homework|hw|しゅくだい|宿題/i, 'homework'],
    [/reading|読|よみもの|dokkai|どっかい/i, 'reading'],
    [/listening|聞|ちょうかい|listen|audio\s*script|script|transcript/i, 'listening'],
    [/\.mp3$|\.wav$|\.mp4$|\.webm$/i, 'audio-video'],
    [/grammar|ぶんぽう|文法|practice|れんしゅう|練習|exercise/i, 'grammar-practice'],
    [/vocab| vocabulary|たんご|単語|word\s*card|word\s*list|ことば/i, 'vocabulary'],
    [/kanji|かんじ|漢字/i, 'kanji'],
    [/hiragana|ひらがな/i, 'hiragana'],
    [/katakana|カタカナ|かたかな/i, 'katakana'],
    [/speaking|かいわ|会話|conversation|role\s*play|info\s*gap/i, 'speaking'],
    [/writing|さくぶん|作文|composition/i, 'writing'],
    [/handout|プリント|slide|ppt|presentation/i, 'handout'],
    [/quiz|test|しけん|試験|review|ふくしゅう|復習/i, 'review-quiz'],
];

const FORBIDDEN = [
    { re: /https?:\/\//i, label: 'url' },
    { re: /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, label: 'email' },
    { re: /\/Users\/|\/home\/|C:\\/i, label: 'absolute-path' },
    { re: /moodle\.ucl\.ac\.uk|download_folder|mod\/resource/i, label: 'moodle-endpoint' },
];

class LedgerError extends Error {}

function parseArgs(argv) {
    const values = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--source') values.source = argv[++i];
        else if (argv[i] === '--output') values.output = argv[++i];
        else if (argv[i] === '--help') values.help = true;
        else throw new LedgerError(`Unknown option ${argv[i]}`);
    }
    return values;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function classifyKind(name) {
    if (name.endsWith('/')) return { memberKind: 'directory', kind: 'directory', extension: null };
    const ext = extname(name.split('/').at(-1) ?? '').toLowerCase();
    if (SAFE_EXTENSION_KINDS.has(ext)) return { memberKind: 'file', kind: SAFE_EXTENSION_KINDS.get(ext), extension: ext };
    return { memberKind: 'file', kind: 'other', extension: ext || null };
}

// Cleaned, human-readable worksheet title from the in-zip member name.
function cleanTitle(name) {
    const leaf = name.replace(/\/+$/, '').split('/').at(-1) ?? name;
    return leaf.replace(/\.[A-Za-z0-9]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferRole(name) {
    for (const [re, role] of ROLE_RULES) if (re.test(name)) return role;
    return 'unclassified';
}

function assertSafe(name) {
    for (const { re, label } of FORBIDDEN) {
        if (re.test(name)) throw new LedgerError(`Unsafe member descriptor (${label}): ${name}`);
    }
}

// module id + order + slug parsed from a harvest zip filename like
// "02-folder-8121195-lesson-1.zip"
function parseArchiveName(fileName) {
    const m = /^(\d+)-(folder|resource)-(\d+)-(.+)\.(zip|docx?)$/i.exec(fileName);
    if (!m) return null;
    return { order: Number(m[1]), moduleType: m[2], moduleId: Number(m[3]), slug: m[4] };
}

async function findArchives(dir) {
    const out = [];
    async function visit(d, courseId, sectionId) {
        const entries = await readdir(d, { withFileTypes: true });
        entries.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
        for (const e of entries) {
            const p = join(d, e.name);
            if (e.isSymbolicLink()) throw new LedgerError(`Symbolic link in source: ${p}`);
            if (e.isDirectory()) {
                if (courseId === null) await visit(p, e.name, null);
                else await visit(p, courseId, e.name);
            } else if (e.isFile() && e.name.toLowerCase().endsWith('.zip')) {
                out.push({ path: p, courseId, sectionId, fileName: e.name });
            }
        }
    }
    await visit(dir, null, null);
    return out;
}

function readCentralDirectory(archivePath) {
    return new Promise((resolvePromise, reject) => {
        yauzl.open(archivePath, { autoClose: true, decodeStrings: true, lazyEntries: true, validateEntrySizes: true }, (openErr, zip) => {
            if (openErr) return reject(openErr);
            const members = [];
            let index = 0;
            let settled = false;
            const fail = (err) => { if (settled) return; settled = true; zip.close(); reject(err); };
            zip.on('error', fail);
            zip.on('entry', (entry) => {
                const cdIndex = ++index;
                if (typeof entry.fileName !== 'string' || entry.fileName.includes('�')) return fail(new LedgerError('Undecodable member name'));
                if (entry.isEncrypted()) return fail(new LedgerError('Encrypted member'));
                const hash = createHash('sha256');
                zip.openReadStream(entry, (streamErr, stream) => {
                    if (streamErr) return fail(streamErr);
                    let len = 0;
                    stream.on('data', (c) => { hash.update(c); len += c.length; });
                    stream.once('error', fail);
                    stream.once('end', () => {
                        const cls = classifyKind(entry.fileName);
                        if (cls.memberKind === 'file') {
                            try { assertSafe(entry.fileName); } catch (e) { return fail(e); }
                        }
                        members.push({
                            centralDirectoryIndex: cdIndex,
                            ...cls,
                            title: cleanTitle(entry.fileName),
                            role: cls.memberKind === 'directory' ? 'directory' : inferRole(entry.fileName),
                            uncompressedBytes: len,
                            payloadSha256: hash.digest('hex'),
                        });
                        zip.readEntry();
                    });
                });
            });
            zip.on('end', () => { if (!settled) { settled = true; resolvePromise(members); } });
            zip.readEntry();
        });
    });
}

async function build({ source }) {
    const src = resolve(source);
    if (!(await stat(src)).isDirectory()) throw new LedgerError('Source is not a directory');
    const manifest = JSON.parse((await readFile(join(src, 'manifest.json'), 'utf8')).replace(/^﻿/, ''));

    const archives = await findArchives(src);
    const byModuleId = new Map();
    const bySectionOrphan = [];
    let totalMembers = 0;
    let totalFiles = 0;

    for (const a of archives) {
        const parsed = parseArchiveName(a.fileName);
        const members = await readCentralDirectory(a.path);
        totalMembers += members.length;
        totalFiles += members.filter((m) => m.memberKind === 'file').length;
        const archiveBytes = (await stat(a.path)).size;
        const archiveSha = sha256(await readFile(a.path));
        const record = {
            courseId: a.courseId,
            sectionId: a.sectionId,
            harvestOrder: parsed?.order ?? null,
            moduleType: parsed?.moduleType ?? null,
            moduleId: parsed?.moduleId ?? null,
            slug: parsed?.slug ?? a.fileName,
            archiveSha256: archiveSha,
            archiveBytes,
            memberFileCount: members.filter((m) => m.memberKind === 'file').length,
            members,
        };
        if (parsed?.moduleId) byModuleId.set(parsed.moduleId, record);
        else bySectionOrphan.push(record);
    }

    // Weave manifest metadata (titles, external URLs, ordering) onto module records.
    const courses = manifest.courses.map((course) => ({
        courseId: course.id,
        moodleCourseId: course.moodleCourseId,
        title: course.title,
        year: course.year,
        sections: course.sections.map((section) => ({
            sectionId: section.id,
            moodleSection: section.moodleSection,
            title: section.title,
            level: section.level ?? null,
            modules: section.modules.map((module, moduleIndex) => {
                const ledger = module.id ? byModuleId.get(module.id) : undefined;
                return {
                    manifestOrder: moduleIndex,
                    moduleId: module.id ?? null,
                    type: module.type,
                    title: module.title,
                    externalUrl: module.externalUrl ?? null,
                    harvested: Boolean(ledger),
                    memberFileCount: ledger?.memberFileCount ?? 0,
                    members: ledger?.members ?? [],
                };
            }),
        })),
    }));

    return {
        schema: 'yomu-academy.week-source-ledger.v1',
        note: 'Derived worksheet-level coverage index. Metadata only; no source bytes. Payload SHA-256 cross-references public/academy/catalog.json.',
        source: { root: basename(src) },
        summary: {
            archiveCount: archives.length,
            memberOccurrenceCount: totalMembers,
            memberFileCount: totalFiles,
            unmatchedArchiveCount: bySectionOrphan.length,
        },
        courses,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        process.stdout.write('Usage: node scripts/academy-weeks/build-week-source-ledger.mjs [--source <dir>] [--output <file>]\n');
        return;
    }
    const ledger = await build(args);
    await mkdir(resolve(args.output, '..'), { recursive: true });
    await writeFile(args.output, `${JSON.stringify(ledger, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(ledger.summary)}\n`);
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
    main().catch((error) => {
        process.stderr.write(`Ledger build failed: ${error instanceof LedgerError ? error.message : error.stack}\n`);
        process.exitCode = 1;
    });
}

export { build, cleanTitle, inferRole, parseArchiveName };
