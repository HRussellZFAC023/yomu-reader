#!/usr/bin/env node
// Deterministic curriculum correction for the worksheet packs.
//
// The class's "Chapter NN" numbering is Minna no Nihongo Shokyū lesson numbering, NOT Genki:
//   L28 = 〜ながら / 〜ています(habitual)
//   L29 = 〜ています(resultant state) / 〜てしまいました
//   L30 = 〜てあります / 〜ておきます
// This is a textbook match to Minna no Nihongo II lessons 28–30 (Genki II ends at lesson 23).
// The Genki II workbook that also lives in the class folder is a reference cross-source, not the
// syllabus — it stays in the reference tier and in each pack's `mappings.genki`.
//
// This pass ONLY corrects the inference-derived curriculum block (course / textbook / lesson) and
// fills `mappings.minnaNoNihongo` when a worker left it null. It never rewrites items, answers,
// furigana, or a worker-authored non-null mapping. Idempotent.
//
// Usage: node scripts/academy-worksheet-packs/normalize-curriculum.mjs [--dry-run]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKS_DIR = resolve(REPO_ROOT, 'public/academy/content/worksheet-packs/packs');

function textbookForChapter(chapter) {
    if (chapter == null) return 'Minna no Nihongo II';
    return chapter >= 26 ? 'Minna no Nihongo II' : 'Minna no Nihongo I';
}

function correctPack(pack) {
    const changes = [];
    const chapter = pack.curriculum?.chapter ?? null;

    if (pack.curriculum) {
        if (pack.curriculum.course !== 'Minna no Nihongo') {
            changes.push(`course ${JSON.stringify(pack.curriculum.course)} -> "Minna no Nihongo"`);
            pack.curriculum.course = 'Minna no Nihongo';
        }
        const textbook = textbookForChapter(chapter);
        if (pack.curriculum.textbook !== textbook) {
            changes.push(`textbook ${JSON.stringify(pack.curriculum.textbook)} -> ${JSON.stringify(textbook)}`);
            pack.curriculum.textbook = textbook;
        }
        if (chapter != null && pack.curriculum.lesson !== chapter) {
            changes.push(`lesson -> ${chapter}`);
            pack.curriculum.lesson = chapter;
        }
    }

    // Fill minnaNoNihongo mapping only when the worker left it empty.
    if (pack.mappings && chapter != null) {
        const m = pack.mappings.minnaNoNihongo;
        const empty = !m || m.value == null || m.value === '';
        if (empty) {
            pack.mappings.minnaNoNihongo = {
                value: `Minna no Nihongo Shokyū II, Lesson ${chapter}`,
                basis: 'The class "Chapter NN" numbering matches Minna no Nihongo lesson numbering; the grammar sequence (28 〜ながら / 29 〜てしまう・〜ています / 30 〜てある・〜ておく) confirms Minna no Nihongo II lessons 28–30.',
            };
            changes.push('filled mappings.minnaNoNihongo');
        }
    }

    return changes;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    let files;
    try {
        files = (await readdir(PACKS_DIR)).filter((f) => f.endsWith('.json')).sort();
    } catch {
        process.stderr.write(`No packs directory at ${PACKS_DIR}\n`);
        process.exitCode = 1;
        return;
    }

    let touched = 0;
    for (const file of files) {
        const path = join(PACKS_DIR, file);
        let pack;
        try {
            pack = JSON.parse(await readFile(path, 'utf8'));
        } catch (error) {
            process.stderr.write(`skip ${file}: ${error.message}\n`);
            continue;
        }
        const changes = correctPack(pack);
        if (changes.length) {
            touched++;
            process.stdout.write(`${dryRun ? '[dry] ' : ''}${file}: ${changes.join('; ')}\n`);
            if (!dryRun) await writeFile(path, `${JSON.stringify(pack, null, 2)}\n`);
        }
    }
    process.stdout.write(`\n${dryRun ? 'Would correct' : 'Corrected'} ${touched}/${files.length} packs.\n`);
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
