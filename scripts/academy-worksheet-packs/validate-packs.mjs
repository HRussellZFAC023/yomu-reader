#!/usr/bin/env node
// Validate every worksheet pack against the schema and prove coverage against the source
// inventory. Emits a machine coverage report and a human markdown report, and exits non-zero
// when any digitise-tier source is missing a valid pack — so it can gate a release.
//
// Usage:
//   node scripts/academy-worksheet-packs/validate-packs.mjs
//   node scripts/academy-worksheet-packs/validate-packs.mjs --json   (machine summary to stdout)

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePack } from './pack-schema.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKS_ROOT = resolve(REPO_ROOT, 'public/academy/content/worksheet-packs');
const INVENTORY_PATH = join(PACKS_ROOT, '_inventory.json');
const PACKS_DIR = join(PACKS_ROOT, 'packs');
const COVERAGE_JSON = join(PACKS_ROOT, '_coverage.json');
const COVERAGE_MD = resolve(REPO_ROOT, 'docs/academy/worksheet-packs/coverage-report.md');

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

async function listPackFiles() {
    try {
        return (await readdir(PACKS_DIR)).filter((f) => f.endsWith('.json')).sort();
    } catch {
        return [];
    }
}

function countItems(pack) {
    const items = Array.isArray(pack.items) ? pack.items : [];
    const byStatus = {};
    let reviewFlags = Array.isArray(pack.reviewFlags) ? pack.reviewFlags.length : 0;
    for (const it of items) {
        const s = it?.answer?.status ?? 'unknown';
        byStatus[s] = (byStatus[s] ?? 0) + 1;
        reviewFlags += Array.isArray(it?.reviewFlags) ? it.reviewFlags.length : 0;
    }
    return { itemCount: items.length, byStatus, reviewFlags };
}

async function main() {
    const jsonOnly = process.argv.includes('--json');
    let inventory;
    try {
        inventory = await readJson(INVENTORY_PATH);
    } catch {
        process.stderr.write(`Inventory not found at ${INVENTORY_PATH}. Run build-inventory.mjs first.\n`);
        process.exitCode = 1;
        return;
    }

    const packFiles = await listPackFiles();
    const packsBySlug = new Map();
    const parseErrors = [];
    for (const file of packFiles) {
        try {
            const pack = await readJson(join(PACKS_DIR, file));
            packsBySlug.set(file.replace(/\.json$/, ''), { file, pack });
        } catch (error) {
            parseErrors.push({ file, error: String(error.message || error) });
        }
    }

    const perPack = [];
    let valid = 0;
    let invalid = 0;
    let missing = 0;
    let totalItems = 0;
    let totalReviewFlags = 0;
    const statusTotals = {};

    for (const invPack of inventory.packs) {
        const entry = packsBySlug.get(invPack.slug);
        if (!entry) {
            missing++;
            perPack.push({ slug: invPack.slug, packId: invPack.packId, state: 'missing', primaryName: invPack.primaryName });
            continue;
        }
        const { pack } = entry;
        const validation = validatePack(pack);
        const shaMatch = pack.sha256 === invPack.sha256;
        if (!shaMatch) validation.errors.push(`sha256 mismatch vs inventory (${pack.sha256} != ${invPack.sha256})`);
        const counts = countItems(pack);
        totalItems += counts.itemCount;
        totalReviewFlags += counts.reviewFlags;
        for (const [k, v] of Object.entries(counts.byStatus)) statusTotals[k] = (statusTotals[k] ?? 0) + v;

        const ok = validation.errors.length === 0;
        if (ok) valid++; else invalid++;
        perPack.push({
            slug: invPack.slug,
            packId: invPack.packId,
            state: ok ? 'valid' : 'invalid',
            primaryName: invPack.primaryName,
            chapter: invPack.curriculum?.chapter ?? null,
            itemCount: counts.itemCount,
            answerStatus: counts.byStatus,
            reviewFlags: counts.reviewFlags,
            errors: validation.errors,
            warnings: validation.warnings,
        });
    }

    // Extra pack files not referenced by inventory
    const inventorySlugs = new Set(inventory.packs.map((p) => p.slug));
    const orphanPacks = [...packsBySlug.keys()].filter((s) => !inventorySlugs.has(s));

    const coverage = {
        schema: 'yomu-academy-worksheet-coverage/v1',
        generatedFromInventory: inventory.schema,
        totals: {
            digitiseSources: inventory.packs.length,
            packsValid: valid,
            packsInvalid: invalid,
            packsMissing: missing,
            queuedReferences: inventory.queuedReferences?.length ?? 0,
            audioMedia: inventory.media?.length ?? 0,
            orphanPacks: orphanPacks.length,
            totalItems,
            totalReviewFlags,
            answerStatusTotals: statusTotals,
        },
        parseErrors,
        orphanPacks,
        queuedReferences: (inventory.queuedReferences ?? []).map((r) => ({ id: r.id, rights: r.rights, state: r.state })),
        packs: perPack,
    };

    await mkdir(dirname(COVERAGE_JSON), { recursive: true });
    await writeFile(COVERAGE_JSON, `${JSON.stringify(coverage, null, 2)}\n`);
    await mkdir(dirname(COVERAGE_MD), { recursive: true });
    await writeFile(COVERAGE_MD, renderMarkdown(coverage, inventory));

    if (jsonOnly) {
        process.stdout.write(`${JSON.stringify(coverage.totals, null, 2)}\n`);
    } else {
        process.stdout.write(renderConsole(coverage));
    }

    const clean = invalid === 0 && missing === 0 && parseErrors.length === 0;
    if (!clean) process.exitCode = 1;
}

function renderConsole(c) {
    const t = c.totals;
    const lines = [];
    lines.push(`Worksheet-pack coverage`);
    lines.push(`  digitise sources : ${t.digitiseSources}`);
    lines.push(`  valid packs      : ${t.packsValid}`);
    lines.push(`  invalid packs    : ${t.packsInvalid}`);
    lines.push(`  missing packs    : ${t.packsMissing}`);
    lines.push(`  queued refs      : ${t.queuedReferences}`);
    lines.push(`  audio media      : ${t.audioMedia}`);
    lines.push(`  total items      : ${t.totalItems}`);
    lines.push(`  review flags     : ${t.totalReviewFlags}`);
    lines.push(`  answer statuses  : ${JSON.stringify(t.answerStatusTotals)}`);
    if (t.orphanPacks) lines.push(`  ORPHAN packs     : ${c.orphanPacks.join(', ')}`);
    for (const p of c.packs.filter((x) => x.state !== 'valid')) {
        lines.push(`  [${p.state}] ${p.slug}`);
        for (const e of p.errors ?? []) lines.push(`      - ${e}`);
    }
    return `${lines.join('\n')}\n`;
}

function renderMarkdown(c, inv) {
    const t = c.totals;
    const rows = c.packs
        .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0) || (a.slug < b.slug ? -1 : 1))
        .map((p) => `| ${p.chapter ?? '—'} | \`${p.slug}\` | ${p.state} | ${p.itemCount ?? '—'} | ${p.reviewFlags ?? '—'} | ${p.state === 'valid' ? '✅' : '⚠️ ' + (p.errors?.length ?? 0) + ' errors'} |`)
        .join('\n');
    const refs = (inv.queuedReferences ?? [])
        .map((r) => `| \`${r.id}\` | ${r.rights} | ${r.state} | ${r.exists ? 'present' : 'absent'} |`)
        .join('\n');
    return `# Worksheet-Pack Coverage Report

_Generated by \`scripts/academy-worksheet-packs/validate-packs.mjs\`. Do not edit by hand._

## Totals

| Metric | Count |
| --- | ---: |
| Digitise-tier sources | ${t.digitiseSources} |
| Packs valid | ${t.packsValid} |
| Packs invalid | ${t.packsInvalid} |
| Packs missing | ${t.packsMissing} |
| Queued references | ${t.queuedReferences} |
| Paired audio media | ${t.audioMedia} |
| Total extracted items | ${t.totalItems} |
| Total review flags | ${t.totalReviewFlags} |

Answer-status distribution: \`${JSON.stringify(t.answerStatusTotals)}\`

## Per-pack

| Ch. | Slug | State | Items | Review flags | Status |
| ---: | --- | --- | ---: | ---: | --- |
${rows}

## Queued references (recorded, never reproduced)

| ID | Rights | State | Source |
| --- | --- | --- | --- |
${refs}

${c.parseErrors.length ? `## Parse errors\n\n${c.parseErrors.map((e) => `- \`${e.file}\`: ${e.error}`).join('\n')}\n` : ''}
`;
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
