#!/usr/bin/env node
// Deterministic source inventory + extraction for Yomu Academy worksheet packs.
//
// This is the resumable, deterministic front half of the worksheet-pack pipeline. It never
// invents content: it enumerates the real class source files, computes SHA-256 payload
// identity, deduplicates identical worksheets across the two class cohorts, infers curriculum
// coordinates from paths, and stages faithful text + page renders that the per-worksheet
// digitisation workers consume.
//
// Rights policy is explicit and conservative:
//   - tier "digitise": the user's own teacher-made class handouts / homework / listening /
//     vocabulary / grammar / kanji / reading / speaking / conversation / info-gap worksheets.
//     These are fully extracted and become published packs.
//   - tier "reference": third-party commercial or scraped material (the full Genki II
//     workbook copy, open study-resource packs, the scraped Soya listening site). These are
//     recorded with identity + curriculum metadata and QUEUED. Their bytes are never
//     extracted into packs and never reproduced wholesale.
//
// Usage:
//   node scripts/academy-worksheet-packs/build-inventory.mjs
//   node scripts/academy-worksheet-packs/build-inventory.mjs --staging <dir> --render-dpi 150
//   node scripts/academy-worksheet-packs/build-inventory.mjs --no-render   (metadata + text only)

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const WORKSHEET_INVENTORY_SCHEMA = 'yomu-academy-worksheet-inventory/v1';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLASS_ROOT = '/Users/heru/Documents/Japanese/Lessons';
const DEFAULT_STAGING = resolve(REPO_ROOT, '..', '..', 'scratchpad-wpacks');

// Third-party / commercial / scraped sources: recorded + queued, never extracted into packs.
const REFERENCE_SOURCES = [
    {
        id: 'genki-ii-workbook',
        path: join(CLASS_ROOT, 'pdfcoffee.com_genki-ii-3rd-edition-workbook-pdf-free.pdf'),
        rights: 'commercial-textbook',
        note: 'Full third-party copy of the Genki II (3rd ed.) workbook. Used only as an answer-key / chapter-page cross-reference; never reproduced into published packs.',
        sourceLinks: [],
    },
    {
        id: 'genki-study-resources',
        path: join(REPO_ROOT, 'references/../../Documents/Japanese/Resource Packs/genki-study-resources-master 2'),
        rights: 'open-study-resource',
        note: 'Community open-source Genki study resources. Reference for exercise structure only.',
        sourceLinks: ['https://github.com/itazu/genki-study-resources'],
    },
    {
        id: 'soya-research',
        path: '/Users/heru/Documents/Projects/yomu/references/soya-research',
        rights: 'scraped-third-party-site',
        note: 'Scraped listening/reading site (soya-eagle-online.com). Modality reference only; never reproduced.',
        sourceLinks: ['https://soya-eagle-online.com/'],
    },
];

const IGNORED_NAMES = new Set(['.DS_Store']);

function parseArgs(argv) {
    const opts = { staging: DEFAULT_STAGING, renderDpi: 150, render: true, maxRenderPages: 24 };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--staging') opts.staging = resolve(argv[++i]);
        else if (arg === '--render-dpi') opts.renderDpi = Number(argv[++i]);
        else if (arg === '--no-render') opts.render = false;
        else if (arg === '--max-render-pages') opts.maxRenderPages = Number(argv[++i]);
        else if (arg === '--help') opts.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }
    return opts;
}

async function sha256File(filePath) {
    const digest = createHash('sha256');
    let byteLength = 0;
    for await (const chunk of createReadStream(filePath)) {
        digest.update(chunk);
        byteLength += chunk.length;
    }
    return { sha256: digest.digest('hex'), byteLength };
}

function sha256Text(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function walk(root) {
    const out = [];
    async function visit(dir) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const entry of entries) {
            if (IGNORED_NAMES.has(entry.name)) continue;
            const full = join(dir, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) await visit(full);
            else if (entry.isFile()) out.push(full);
        }
    }
    await visit(root);
    return out;
}

// ---- curriculum inference -------------------------------------------------

function inferOccurrence(absPath) {
    const rel = relative(CLASS_ROOT, absPath);
    const parts = rel.split('/');
    const lessonDir = parts.length > 1 ? parts[0] : null; // e.g. "Lesson 3-20260310"
    const bucket = parts.length > 2 ? parts[1] : parts.length > 1 ? null : null; // Handouts / Homework / audio materials / Info gap
    const folderBucket = parts.length > 2 ? parts[1] : null;
    const lessonMatch = lessonDir ? lessonDir.match(/Lesson\s*(\d+)\s*-\s*(\d{8})/i) : null;
    const week = lessonMatch ? Number(lessonMatch[1]) : null;
    const termDate = lessonMatch ? lessonMatch[2] : null;
    return {
        relPath: rel,
        absPath,
        lessonDir,
        week,
        termDate,
        bucket: folderBucket,
    };
}

function inferCurriculum(name) {
    const lower = name.toLowerCase();
    const chapterMatch = name.match(/chapter\s*(\d{1,3})/i) || name.match(/\bch\.?\s*(\d{1,3})/i);
    const chapter = chapterMatch ? Number(chapterMatch[1]) : null;
    const sectionMatch = name.match(/chapter\s*\d+-(\d)/i);
    const section = sectionMatch ? Number(sectionMatch[1]) : null;

    // Grammar-point extraction from filename (〜 forms).
    const grammarForms = [...name.matchAll(/〜[^\s_、,.]+/g)].map((m) => m[0]);

    const kinds = [];
    if (/vocabulary sheet|vocabulary_|\bvocab\b|word card/i.test(name)) kinds.push('vocabulary');
    if (/kanji/i.test(name)) kinds.push('kanji');
    if (/listening/i.test(name)) kinds.push('listening');
    if (/reading/i.test(name)) kinds.push('reading');
    if (/information gap|info gap|infogap/i.test(name)) kinds.push('info-gap');
    if (/conversation/i.test(name)) kinds.push('conversation');
    if (/speaking/i.test(name)) kinds.push('speaking');
    if (/grammar/i.test(name)) kinds.push('grammar');
    if (/review/i.test(name)) kinds.push('review');
    if (/reference/i.test(name)) kinds.push('reference');
    if (kinds.length === 0) kinds.push('worksheet');

    const delivery = /^(new_)?hw\b|homework/i.test(name) ? 'homework' : 'in-class';

    // Skills coarse tags
    const skills = new Set();
    if (kinds.includes('vocabulary')) skills.add('vocabulary');
    if (kinds.includes('kanji')) { skills.add('kanji'); skills.add('writing'); skills.add('reading'); }
    if (kinds.includes('listening')) skills.add('listening');
    if (kinds.includes('reading')) skills.add('reading');
    if (kinds.includes('speaking') || kinds.includes('conversation') || kinds.includes('info-gap')) skills.add('speaking');
    if (kinds.includes('grammar')) skills.add('grammar');
    if (/reading|writing|grammar/i.test(name)) skills.add('writing');

    // The class's "Chapter NN" numbering is Minna no Nihongo lesson numbering, not Genki:
    // 28 = 〜ながら/〜ています(habitual), 29 = 〜ています(states)/〜てしまいました, 30 = 〜てあります/〜ておきます —
    // a textbook match to Minna no Nihongo Shokyū II lessons 28–30 (Genki II ends at lesson 23).
    // The Genki II workbook in the folder is a reference cross-source, recorded in mappings, not the syllabus.
    return {
        course: 'Minna no Nihongo',
        textbook: chapter == null ? 'Minna no Nihongo II' : chapter >= 26 ? 'Minna no Nihongo II' : 'Minna no Nihongo I',
        chapter,
        lesson: chapter,
        section,
        grammarForms: [...new Set(grammarForms)],
        kinds: [...new Set(kinds)],
        delivery,
        skills: [...skills].sort(),
    };
}

function slugify(name) {
    return basename(name, extname(name))
        .normalize('NFKD')
        .replace(/[　-鿿぀-ヿ]+/g, (m) => `jp${m.length}`) // keep something for JP-only names
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 60) || 'worksheet';
}

// ---- extractors -----------------------------------------------------------

async function pdfPageCount(absPath) {
    try {
        const { stdout } = await execFileP('pdfinfo', [absPath], { maxBuffer: 1 << 20 });
        const m = stdout.match(/^Pages:\s*(\d+)/m);
        return m ? Number(m[1]) : null;
    } catch {
        return null;
    }
}

async function pdfText(absPath) {
    try {
        const { stdout } = await execFileP('pdftotext', ['-layout', '-enc', 'UTF-8', absPath, '-'], {
            maxBuffer: 32 << 20,
        });
        return stdout;
    } catch {
        return null;
    }
}

async function pdfRender(absPath, outDir, dpi, maxPages) {
    await mkdir(outDir, { recursive: true });
    try {
        const args = ['-png', '-r', String(dpi), '-l', String(maxPages), absPath, join(outDir, 'page')];
        await execFileP('pdftoppm', args, { maxBuffer: 1 << 20 });
        const files = (await readdir(outDir)).filter((f) => f.endsWith('.png')).sort();
        return files.map((f) => join(outDir, f));
    } catch {
        return [];
    }
}

async function audioProbe(absPath) {
    try {
        const { stdout } = await execFileP('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration,bit_rate', '-of', 'json', absPath,
        ], { maxBuffer: 1 << 20 });
        const parsed = JSON.parse(stdout);
        return {
            durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
            bitRate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null,
        };
    } catch {
        return { durationSeconds: null, bitRate: null };
    }
}

// ---- main -----------------------------------------------------------------

export async function buildInventory(opts) {
    const files = await walk(CLASS_ROOT);
    const referencePaths = new Set(REFERENCE_SOURCES.map((r) => resolve(r.path)));

    const pdfs = files.filter((f) => extname(f).toLowerCase() === '.pdf' && !referencePaths.has(resolve(f)));
    const audios = files.filter((f) => ['.mp3', '.wav', '.m4a'].includes(extname(f).toLowerCase()));

    // ---- audio media ----
    const media = [];
    for (const absPath of audios) {
        const { sha256, byteLength } = await sha256File(absPath);
        const probe = await audioProbe(absPath);
        const occ = inferOccurrence(absPath);
        media.push({
            id: `audio-${sha256.slice(0, 12)}`,
            kind: 'audio',
            sha256: `sha256:${sha256}`,
            byteLength,
            trackLabel: basename(absPath, extname(absPath)),
            ...probe,
            occurrence: occ,
        });
    }
    media.sort((a, b) => (a.trackLabel < b.trackLabel ? -1 : 1));

    // ---- dedup PDFs by payload ----
    const byHash = new Map();
    for (const absPath of pdfs) {
        const { sha256, byteLength } = await sha256File(absPath);
        const occ = inferOccurrence(absPath);
        if (!byHash.has(sha256)) {
            byHash.set(sha256, { sha256, byteLength, occurrences: [], primaryName: basename(absPath) });
        }
        byHash.get(sha256).occurrences.push(occ);
    }

    const slugCounts = new Map();
    const packs = [];
    for (const [sha256, rec] of [...byHash.entries()].sort((a, b) => (a[1].primaryName < b[1].primaryName ? -1 : 1))) {
        // Pick a canonical occurrence: prefer a Handouts/Homework path over loose root, earliest lessonDir.
        const sortedOcc = [...rec.occurrences].sort((a, b) => {
            const wa = a.week ?? 99;
            const wb = b.week ?? 99;
            if (wa !== wb) return wa - wb;
            return a.relPath < b.relPath ? -1 : 1;
        });
        const canonical = sortedOcc[0];
        const name = rec.primaryName;
        const curriculum = inferCurriculum(name);

        let slug = slugify(name);
        const n = (slugCounts.get(slug) ?? 0) + 1;
        slugCounts.set(slug, n);
        if (n > 1) slug = `${slug}-${sha256.slice(0, 6)}`;

        const packId = `wp-${sha256.slice(0, 12)}`;
        const stagingDir = join(opts.staging, packId);

        const pages = await pdfPageCount(canonical.absPath);
        const text = await pdfText(canonical.absPath);
        let textPath = null;
        let textSha = null;
        let textChars = 0;
        if (text != null) {
            await mkdir(stagingDir, { recursive: true });
            textPath = join(stagingDir, 'text.txt');
            await writeFile(textPath, text);
            textSha = sha256Text(text);
            textChars = text.length;
        }
        let renderPaths = [];
        if (opts.render) {
            renderPaths = await pdfRender(canonical.absPath, join(stagingDir, 'pages'), opts.renderDpi, opts.maxRenderPages);
        }

        // associate audio in the same lesson dirs
        const lessonDirs = new Set(rec.occurrences.map((o) => o.lessonDir).filter(Boolean));
        const associatedAudio = media
            .filter((m) => lessonDirs.has(m.occurrence.lessonDir))
            .map((m) => m.id);

        packs.push({
            packId,
            slug,
            tier: 'digitise',
            rights: 'user-owned-coursework',
            sourceId: `japanese-library:${relative('/Users/heru/Documents/Japanese', canonical.absPath)}`,
            primaryName: name,
            sha256: `sha256:${sha256}`,
            byteLength: rec.byteLength,
            pageCount: pages,
            curriculum,
            occurrences: sortedOcc.map((o) => ({
                relPath: o.relPath,
                week: o.week,
                termDate: o.termDate,
                bucket: o.bucket,
            })),
            associatedAudio,
            staging: {
                dir: stagingDir,
                textPath,
                textSha256: textSha ? `sha256:${textSha}` : null,
                textChars,
                renderPaths,
                renderCount: renderPaths.length,
            },
        });
    }

    // ---- reference sources (queued, never extracted) ----
    const queuedReferences = [];
    for (const ref of REFERENCE_SOURCES) {
        let exists = false;
        let byteLength = null;
        let sha256 = null;
        try {
            const st = await stat(ref.path);
            exists = true;
            if (st.isFile()) {
                const h = await sha256File(ref.path);
                byteLength = h.byteLength;
                sha256 = `sha256:${h.sha256}`;
            }
        } catch {
            exists = false;
        }
        queuedReferences.push({
            id: ref.id,
            tier: 'reference',
            rights: ref.rights,
            path: ref.path,
            exists,
            byteLength,
            sha256,
            note: ref.note,
            sourceLinks: ref.sourceLinks,
            state: 'queued-reference-only',
        });
    }

    const summary = {
        uniqueWorksheetPayloads: packs.length,
        totalWorksheetOccurrences: [...byHash.values()].reduce((s, r) => s + r.occurrences.length, 0),
        audioMediaCount: media.length,
        queuedReferenceCount: queuedReferences.length,
        byChapter: tally(packs, (p) => p.curriculum.chapter),
        byKind: tallyMulti(packs, (p) => p.curriculum.kinds),
        byDelivery: tally(packs, (p) => p.curriculum.delivery),
        pdfTextExtracted: packs.filter((p) => p.staging.textChars > 0).length,
        pdfRendered: packs.filter((p) => p.staging.renderCount > 0).length,
    };

    return {
        schema: WORKSHEET_INVENTORY_SCHEMA,
        generatedFrom: { classRoot: CLASS_ROOT },
        policy: {
            digitise: 'user-owned teacher-made class worksheets — fully extracted into packs',
            reference: 'third-party commercial/scraped material — recorded + queued, never reproduced',
        },
        summary,
        packs,
        media,
        queuedReferences,
    };
}

function tally(items, sel) {
    const m = new Map();
    for (const it of items) {
        const k = String(sel(it));
        m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Object.fromEntries([...m.entries()].sort());
}
function tallyMulti(items, sel) {
    const m = new Map();
    for (const it of items) for (const k of sel(it)) m.set(k, (m.get(k) ?? 0) + 1);
    return Object.fromEntries([...m.entries()].sort());
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        process.stdout.write('Usage: node scripts/academy-worksheet-packs/build-inventory.mjs [--staging <dir>] [--render-dpi N] [--no-render] [--max-render-pages N]\n');
        return;
    }
    await rm(opts.staging, { recursive: true, force: true });
    const inventory = await buildInventory(opts);
    const outPath = resolve(REPO_ROOT, 'public/academy/content/worksheet-packs/_inventory.json');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(inventory, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(inventory.summary, null, 2)}\n`);
    process.stdout.write(`\nInventory written to ${relative(REPO_ROOT, outPath)}\n`);
    process.stdout.write(`Staging under ${opts.staging}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error.stack || error.message}\n`);
        process.exitCode = 1;
    });
}
