#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createYomuPaths } from './lib/paths.mjs';

const require = createRequire(import.meta.url);
const {
    DIST_USERSCRIPT_PATH,
    GREASY_FORK_SIZE_LIMIT_BYTES,
    ROOT,
    byteLengthUtf8,
    formatCount,
} = require('./lib/userscript-build-utils.cjs');

const { artifactsRoot, moduleSizesPath } = createYomuPaths(import.meta.dirname);
const MODULE_SIZES_PATH = moduleSizesPath;
const PLAN_OUT = path.join(artifactsRoot, 'greasyfork-size-plan.json');
const TARGET_HEADROOM_BYTES = Number(process.env.YOMU_GREASYFORK_TARGET_HEADROOM_BYTES || 150_000);
const TARGET_CORE_BYTES = GREASY_FORK_SIZE_LIMIT_BYTES - TARGET_HEADROOM_BYTES;

const surfaces = [
    {
        id: 'settings-ui',
        label: 'Yomu Settings Surface',
        kind: 'greasyfork-library',
        patterns: [
            /^src\/reader\/settings-form\.ts$/,
            /^src\/reader\/settings-dialog-controller\.ts$/,
            /^src\/reader\/settings\/anki-mining-panel\.ts$/,
            /^src\/reader\/settings\/file-io\.ts$/,
            /^src\/reader\/settings\/form-controls\.ts$/,
            /^src\/reader\/settings\/form-data\.ts$/,
            /^src\/reader\/settings\/form-editors\.ts$/,
            /^src\/reader\/settings\/form-order\.ts$/,
            /^src\/reader\/settings\/form-read\.ts$/,
            /^src\/reader\/settings\/form-source-rows\.ts$/,
            /^src\/reader\/settings\/form-tags\.ts$/,
            /^src\/reader\/settings\/status-lines\.ts$/,
            /^src\/reader\/styles\/settings\.css$/,
        ],
    },
    {
        id: 'video-subtitles',
        label: 'Yomu Video',
        kind: 'greasyfork-library',
        patterns: [
            /^src\/reader\/subtitles\//,
            /^src\/reader\/youtube\.ts$/,
            /^src\/reader\/styles\/subtitles-/,
        ],
    },
    {
        id: 'anki',
        label: 'Yomu Anki',
        kind: 'greasyfork-library',
        patterns: [
            /^src\/reader\/anki\//,
            /^src\/reader\/settings\/field-mapping\.ts$/,
        ],
    },
    {
        id: 'ocr-manga',
        label: 'Yomu OCR/Manga',
        kind: 'greasyfork-library',
        patterns: [
            /^src\/reader\/ocr\//,
            /^src\/reader\/styles\/reader-words-ocr\.css$/,
        ],
    },
    {
        id: 'kanji-study',
        label: 'Yomu Kanji/Study',
        kind: 'greasyfork-library',
        patterns: [
            /^src\/reader\/kanji\//,
            /^src\/reader\/popup\/origin-graph\.ts$/,
            /^src\/reader\/study\//,
            /(^|\/)(kanjivg|rtk|origin-graph|jpdb-kanji)[^/]*\.(ts|css)$/,
        ],
    },
    {
        id: 'inert-data-pack',
        label: 'Yomu Inert Data Pack',
        kind: 'json-css-pack',
        patterns: [
            /^src\/reader\/i18n\.ts$/,
            /^src\/reader\/dictionary-source-labels\.ts$/,
        ],
    },
];

const distCode = readRequiredText(DIST_USERSCRIPT_PATH, 'Run npm run build before size planning.');
const moduleSnapshot = readJson(MODULE_SIZES_PATH, 'Run npm run size:modules before size planning.');
const exactUserscriptBytes = byteLengthUtf8(distCode);
const modules = normalizeModules(moduleSnapshot.modules);
const moduleTotalBytes = Number(moduleSnapshot.total) || modules.reduce((sum, module) => sum + module.bytes, 0);
const distOverheadBytes = exactUserscriptBytes - moduleTotalBytes;
const surfaceReports = surfaceBudgetRows(modules, exactUserscriptBytes);
const extractionBatch = recommendedExtractionBatch(surfaceReports, exactUserscriptBytes);

const plan = {
    generatedAt: new Date().toISOString(),
    policy: {
        greasyForkLimitBytes: GREASY_FORK_SIZE_LIMIT_BYTES,
        targetHeadroomBytes: TARGET_HEADROOM_BYTES,
        targetCoreBytes: TARGET_CORE_BYTES,
        executableCodeStrategy: 'readable self-contained scripts only; no minification, no whitespace compaction, no remote executable loader',
        approvedExecutableSplit: 'first-party Greasy Fork libraries only, added through package.json yomu.allowedRequireUrls after review',
    },
    current: {
        exactUserscriptBytes,
        moduleTotalBytes,
        distOverheadBytes,
        overLimitByBytes: Math.max(0, exactUserscriptBytes - GREASY_FORK_SIZE_LIMIT_BYTES),
        overTargetByBytes: Math.max(0, exactUserscriptBytes - TARGET_CORE_BYTES),
    },
    surfaces: surfaceReports,
    recommendedExtractionBatch: extractionBatch,
    notes: [
        `Module bytes are Vite module renderedLength values from ${path.relative(ROOT, MODULE_SIZES_PATH)}.`,
        'Remaining-core estimates subtract rendered module bytes from the exact readable userscript and keep all wrapper/shared overhead in core; this is a conservative planning estimate, not a substitute for actual companion builds.',
        'Greasy Fork library candidates must be readable first-party library scripts, not minified loaders, and must be explicitly allowlisted before @require is accepted.',
    ],
};

writePlan(plan);
printPlan(plan);

function readRequiredText(file, hint) {
    if (!existsSync(file)) fail(`${path.relative(ROOT, file)} is missing. ${hint}`);
    return readFileSync(file, 'utf8');
}

function readJson(file, hint) {
    if (!existsSync(file)) fail(`${path.relative(ROOT, file)} is missing. ${hint}`);
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        fail(`${path.relative(ROOT, file)} is not valid JSON: ${errorMessage(error)}`);
    }
}

function normalizeModules(value) {
    if (!Array.isArray(value)) fail(`${path.relative(ROOT, MODULE_SIZES_PATH)} is missing a modules array.`);
    return value
        .map(module => ({ id: String(module.id || ''), bytes: Number(module.bytes) || 0 }))
        .filter(module => module.id && module.bytes > 0);
}

function surfaceBudgetRows(modules, exactBytes) {
    const bySurface = new Map(surfaces.map(surface => [surface.id, {
        id: surface.id,
        label: surface.label,
        kind: surface.kind,
        moduleCount: 0,
        renderedBytes: 0,
        topModules: [],
    }]));

    for (const module of modules) {
        const surface = classifyModule(module.id);
        if (!surface) continue;
        const row = bySurface.get(surface.id);
        row.moduleCount += 1;
        row.renderedBytes += module.bytes;
        row.topModules.push(module);
    }

    return Array.from(bySurface.values())
        .map(row => ({
            ...row,
            remainingCoreBytesIfExtracted: Math.max(0, exactBytes - row.renderedBytes),
            clearsGreasyForkLimitAlone: exactBytes - row.renderedBytes <= GREASY_FORK_SIZE_LIMIT_BYTES,
            clearsTargetHeadroomAlone: exactBytes - row.renderedBytes <= TARGET_CORE_BYTES,
            topModules: row.topModules
                .sort((left, right) => right.bytes - left.bytes)
                .slice(0, 8),
        }))
        .sort((left, right) => right.renderedBytes - left.renderedBytes);
}

function classifyModule(id) {
    return surfaces.find(surface => surface.patterns.some(pattern => pattern.test(id)));
}

function recommendedExtractionBatch(rows, exactBytes) {
    let remaining = exactBytes;
    const selected = [];
    for (const row of rows.filter(row => row.renderedBytes > 0)) {
        if (remaining <= TARGET_CORE_BYTES) break;
        selected.push({
            id: row.id,
            label: row.label,
            kind: row.kind,
            renderedBytes: row.renderedBytes,
        });
        remaining -= row.renderedBytes;
    }
    return {
        surfaces: selected,
        estimatedRemainingCoreBytes: Math.max(0, remaining),
        clearsGreasyForkLimit: remaining <= GREASY_FORK_SIZE_LIMIT_BYTES,
        clearsTargetHeadroom: remaining <= TARGET_CORE_BYTES,
    };
}

function writePlan(plan) {
    mkdirSync(path.dirname(PLAN_OUT), { recursive: true });
    writeFileSync(PLAN_OUT, `${JSON.stringify(plan, null, 2)}\n`);
}

function printPlan(plan) {
    console.log('Greasy Fork split size plan');
    console.log('');
    console.log(`Readable userscript: ${formatCount(plan.current.exactUserscriptBytes)} bytes`);
    console.log(`Greasy Fork limit: ${formatCount(plan.policy.greasyForkLimitBytes)} bytes`);
    console.log(`Target core with headroom: ${formatCount(plan.policy.targetCoreBytes)} bytes`);
    console.log(`Current over limit: ${formatCount(plan.current.overLimitByBytes)} bytes`);
    console.log(`Current over target: ${formatCount(plan.current.overTargetByBytes)} bytes`);
    console.log(`Rendered module total: ${formatCount(plan.current.moduleTotalBytes)} bytes`);
    console.log(`Wrapper/shared overhead estimate: ${formatCount(plan.current.distOverheadBytes)} bytes`);
    console.log('');
    printSurfaceTable(plan.surfaces);
    console.log('');
    printRecommendedBatch(plan.recommendedExtractionBatch);
    console.log('');
    console.log(`Wrote ${path.relative(ROOT, PLAN_OUT)}`);
}

function printSurfaceTable(rows) {
    console.log('| planned surface | kind | modules | rendered | remaining core if extracted | clears 2 MB | clears target |');
    console.log('| --- | --- | ---: | ---: | ---: | --- | --- |');
    for (const row of rows) {
        console.log(`| ${row.label} | ${row.kind} | ${row.moduleCount} | ${formatCount(row.renderedBytes)} | ${formatCount(row.remainingCoreBytesIfExtracted)} | ${yesNo(row.clearsGreasyForkLimitAlone)} | ${yesNo(row.clearsTargetHeadroomAlone)} |`);
    }
}

function printRecommendedBatch(batch) {
    const labels = batch.surfaces.map(surface => surface.label).join(', ') || 'none';
    console.log(`Recommended first extraction batch: ${labels}`);
    console.log(`Estimated remaining core: ${formatCount(batch.estimatedRemainingCoreBytes)} bytes`);
    console.log(`Clears Greasy Fork limit: ${yesNo(batch.clearsGreasyForkLimit)}`);
    console.log(`Clears target headroom: ${yesNo(batch.clearsTargetHeadroom)}`);
}

function yesNo(value) {
    return value ? 'yes' : 'no';
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
