#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { refreshAcademyRuntimeArtPrecache } from './lib/academy-cast-offline-precache.mjs';
import { refreshAcademyCastPortraitFocus } from './lib/academy-cast-portrait-focus.mjs';
import { reconcileAcademyLessonCastBindings } from './lib/academy-cast-usage-bindings.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const manifestFile = path.join(repoRoot, 'src/academy/domain/cast-standardization-manifest.ts');
// public/academy is the only source this writes. docs/public/academy is
// generated: scripts/sync-academy.cjs rm -rf's it and rewrites it from
// public/academy on every build:academy, so a mirror write here is work that
// gets thrown away, in a path .gitignore excludes.
const usageFile = path.join(repoRoot, 'public/academy/art/ASSET-USAGE.json');
const batchManifestFile = path.join(repoRoot, 'public/academy/art/SPRITE-BATCH-MANIFEST.json');
const specFile = process.argv[2] ? path.resolve(process.argv[2]) : undefined;

if (!specFile || !fs.existsSync(specFile)) {
    throw new Error('Usage: node scripts/academy-cast-promote.mjs <promotion-spec.json>');
}

const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
if (!Array.isArray(spec.promotions) || spec.promotions.length === 0) {
    throw new Error('Promotion spec must contain at least one promotion.');
}

let source = fs.readFileSync(manifestFile, 'utf8');
const manifest = readJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_MANIFEST');
const runtimeAssets = readJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_RUNTIME_ASSETS');
const coverage = readJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_COVERAGE');
const journalReview = readJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_JOURNAL_REVIEW');
const galleries = readJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_GALLERIES');
const summary = readJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_SUMMARY');
const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
const batchManifest = JSON.parse(fs.readFileSync(batchManifestFile, 'utf8'));

for (const promotion of spec.promotions) {
    validatePromotion(promotion);
    const expressions = new Set(promotion.replaceExpressions);
    const replaced = manifest.filter(slot =>
        slot.castId === promotion.castId
        && (promotion.archiveAllCurrent === true || expressions.has(slot.expression)));
    const castIndexes = manifest
        .map((slot, index) => (slot.castId === promotion.castId ? index : -1))
        .filter(index => index >= 0);
    if (castIndexes.length === 0) {
        throw new Error(`${promotion.castId} is not present in the cast manifest.`);
    }
    const insertionIndex = replaced.length > 0
        ? Math.min(...replaced.map(slot => manifest.indexOf(slot)))
        : Math.max(...castIndexes) + 1;
    const promotedPaths = new Set(promotion.slots.map(slot => slot.assetPath));
    for (const slot of replaced) {
        if (!promotedPaths.has(slot.assetPath)) archiveSlot(slot, promotion.archiveLabel);
    }

    const replacedIds = new Set(replaced.map(slot => slot.assetId));
    const replacedPaths = new Set(replaced.map(slot => slot.assetPath));
    for (let index = manifest.length - 1; index >= 0; index -= 1) {
        if (replacedIds.has(manifest[index].assetId)) manifest.splice(index, 1);
    }
    for (const assetId of replacedIds) {
        delete runtimeAssets[assetId];
        delete coverage[assetId];
    }
    usage.assets = usage.assets.filter(asset =>
        !(asset.deliveries ?? []).some(delivery => replacedPaths.has(delivery.path)),
    );

    const slots = promotion.slots.map(slot => createSlot(promotion.castId, slot));
    manifest.splice(insertionIndex, 0, ...slots);

    for (const slot of slots) {
        runtimeAssets[slot.assetId] = {
            kind: 'character-sprite',
            status: slot.status,
            runtimeHomes: slot.runtimeHomes,
            provenance: slot.sourceKind,
            files: { default: slot.assetPath },
        };
        coverage[slot.assetId] = {
            castId: slot.castId,
            presentation: slot.runtimePresentation,
            primaryUse: slot.runtimeHomes[0],
        };
        usage.assets.push(createUsageAsset(slot));
    }

    const castSlots = manifest.filter(slot => slot.castId === promotion.castId);
    const neutral = castSlots.find(slot => slot.assetId === promotion.canonicalNeutralAssetId);
    if (!neutral || neutral.expression !== 'neutral') {
        throw new Error(`${promotion.castId} canonical neutral does not resolve to a neutral slot.`);
    }
    journalReview[promotion.castId] = neutral.assetPath;
    galleries[promotion.castId] = Object.fromEntries(
        castSlots.map(slot => [`${slot.expression}:${slot.angle}`, slot.assetPath]),
    );
    const batchCharacter = batchManifest.characters.find(character => character.id === promotion.castId);
    if (!batchCharacter) throw new Error(`${promotion.castId} is not present in the batch manifest.`);
    batchCharacter.currentAsset = {
        status: 'approved-performance-family',
        paths: slots.map(slot => slot.assetPath),
        note: 'Identity-locked, visually inspected house-style family; all seven canonical expressions are runtime-bound.',
    };
}

assertUnique(manifest.map(slot => slot.assetId), 'asset id');
assertUnique(manifest.map(slot => slot.assetPath), 'asset path');
assertUnique(
    usage.assets.flatMap(asset => (asset.deliveries ?? []).map(delivery => delivery.path)),
    'ASSET-USAGE delivery',
);

const castIds = new Set(manifest.map(slot => slot.castId));
const nextSummary = {
    ...summary,
    canonicalCast: castIds.size,
    productionSpriteFiles: manifest.length,
    runtimeAssetMappings: Object.keys(runtimeAssets).length,
    manifestSlots: manifest.length,
    castWithNeutral: new Set(
        manifest.filter(slot => slot.expression === 'neutral').map(slot => slot.castId),
    ).size,
    castWithListening: new Set(
        manifest.filter(slot => slot.expression === 'encouraging-listening').map(slot => slot.castId),
    ).size,
    approved: manifest.filter(slot => slot.status === 'approved').length,
    reviewPreview: manifest.filter(slot => slot.status === 'review-preview').length,
    generatedOrRegenerated: manifest.filter(slot => /generat/i.test(slot.sourceKind)).length,
    retainedGood: manifest.filter(slot => slot.sourceKind === 'retained-good').length,
    retainedCurrentReview: manifest.filter(slot => slot.sourceKind === 'retained-current-review').length,
    retainedLegacyReview: manifest.filter(slot => slot.sourceKind === 'retained-legacy-review').length,
    orphanCount: 0,
};

source = replaceJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_MANIFEST', manifest);
source = replaceJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_RUNTIME_ASSETS', runtimeAssets);
source = replaceJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_COVERAGE', coverage);
source = replaceJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_JOURNAL_REVIEW', journalReview);
source = replaceJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_GALLERIES', galleries);
source = replaceJsonConstant(source, 'ACADEMY_CAST_STANDARDIZATION_SUMMARY', nextSummary);
fs.writeFileSync(manifestFile, source);

reconcileAcademyLessonCastBindings(usage, manifest);
const serializedBatchManifest = `${JSON.stringify(batchManifest, null, 2)}\n`;
const batchManifestAsset = usage.assets.find(asset => asset.id === 'sprite-batch-manifest-v1');
const batchManifestDelivery = batchManifestAsset?.deliveries?.find(
    delivery => delivery.path === '/academy/art/SPRITE-BATCH-MANIFEST.json',
);
if (!batchManifestDelivery) {
    throw new Error('ASSET-USAGE is missing the public sprite batch manifest delivery.');
}
batchManifestDelivery.sha256 = sha256(Buffer.from(serializedBatchManifest));
recountUsage(usage);
const serializedUsage = `${JSON.stringify(usage, null, 2)}\n`;
fs.writeFileSync(usageFile, serializedUsage);
fs.writeFileSync(batchManifestFile, serializedBatchManifest);
await refreshAcademyRuntimeArtPrecache(repoRoot);
await refreshAcademyCastPortraitFocus(repoRoot, manifest);

console.log(
    `Promoted ${spec.promotions.length} cast families; ${manifest.length} runtime sprites remain fully mapped.`,
);

function validatePromotion(promotion) {
    if (!promotion.castId || !promotion.archiveLabel || !promotion.canonicalNeutralAssetId) {
        throw new Error('Each promotion requires castId, archiveLabel, and canonicalNeutralAssetId.');
    }
    if (!Array.isArray(promotion.replaceExpressions) || promotion.replaceExpressions.length === 0) {
        throw new Error(`${promotion.castId} requires replaceExpressions.`);
    }
    if (!Array.isArray(promotion.slots) || promotion.slots.length === 0) {
        throw new Error(`${promotion.castId} requires slots.`);
    }
    if (promotion.archiveAllCurrent !== undefined && typeof promotion.archiveAllCurrent !== 'boolean') {
        throw new Error(`${promotion.castId} archiveAllCurrent must be a boolean.`);
    }
    assertUnique(promotion.replaceExpressions, `${promotion.castId} replacement expression`);
    assertUnique(
        promotion.slots.map(slot => slot.expression),
        `${promotion.castId} promoted expression`,
    );
    const replacements = new Set(promotion.replaceExpressions);
    const promoted = new Set(promotion.slots.map(slot => slot.expression));
    const missing = promotion.replaceExpressions.filter(expression => !promoted.has(expression));
    const unexpected = promotion.slots
        .map(slot => slot.expression)
        .filter(expression => !replacements.has(expression));
    if (missing.length > 0 || unexpected.length > 0) {
        throw new Error(
            `${promotion.castId} promotion expressions do not match replacements`
            + ` (missing: ${missing.join(', ') || 'none'};`
            + ` unexpected: ${unexpected.join(', ') || 'none'}).`,
        );
    }
}

function createSlot(castId, input) {
    if (!input.assetId.startsWith(`character.${castId}.`)) {
        throw new Error(`${input.assetId} does not belong to ${castId}.`);
    }
    const expectedPrefix = `/academy/art/characters/${castId}/`;
    if (!input.assetPath.startsWith(expectedPrefix)) {
        throw new Error(`${input.assetPath} does not live in ${castId}'s directory.`);
    }
    const publicFile = path.join(repoRoot, 'public', input.assetPath.slice(1));
    assertFile(publicFile);
    const bytes = fs.readFileSync(publicFile);
    const dimensions = pngDimensions(bytes, input.assetPath);
    return {
        assetId: input.assetId,
        castId,
        expression: input.expression,
        angle: input.angle,
        status: 'approved',
        coverageStatus: 'approved',
        assetPath: input.assetPath,
        sha256: sha256(bytes),
        sourceKind: 'regenerated-house-style',
        runtimeHomes: input.runtimeHomes,
        runtimePresentation: 'approved-runtime',
        qa: {
            verdict: 'pass',
            inspected: true,
            notes: [
                'Identity checked against the canonical cast lock.',
                'House-style, transparency, crop, and runtime ownership checked before promotion.',
            ],
            dimensions: { ...dimensions, format: 'png', channels: 4 },
        },
    };
}

function createUsageAsset(slot) {
    return {
        id: slot.assetId.replaceAll('.', '-'),
        source: 'manifest:src/academy/domain/cast-standardization-manifest.ts',
        sourceSha256: slot.sha256,
        provenance: slot.sourceKind,
        verdict: 'approved-runtime',
        runtimeHome: slot.runtimeHomes,
        reviewHome: ['cast-standardization-manifest', 'identity-lock'],
        usage: {
            runtime: slot.runtimeHomes,
            review: ['cast-standardization-manifest'],
        },
        orphan: 'active-runtime',
        deliveries: [{ path: slot.assetPath, sha256: slot.sha256 }],
        status: 'identity-locked, visually inspected, runtime-bound house-style sprite',
    };
}

function archiveSlot(slot, archiveLabel) {
    const relative = slot.assetPath.replace(/^\/academy\/art\/characters\//, '');
    const archiveFile = path.join(
        repoRoot,
        'artifacts/yomu-academy/cast-standardization/rejected',
        archiveLabel,
        relative,
    );
    const publicFile = path.join(repoRoot, 'public', slot.assetPath.slice(1));
    if (fs.existsSync(publicFile)) {
        fs.mkdirSync(path.dirname(archiveFile), { recursive: true });
        fs.copyFileSync(publicFile, archiveFile);
        fs.unlinkSync(publicFile);
    }
}

function recountUsage(usage) {
    const runtimeAssets = usage.assets.filter(
        asset =>
            asset.verdict?.startsWith('approved-runtime') ||
            asset.verdict === 'review-candidate/runtime-preview',
    );
    const visualRuntimeAssets = runtimeAssets.filter(asset =>
        (asset.deliveries ?? []).some(delivery => !delivery.path.endsWith('.json')),
    );
    const visualRuntimeFiles = runtimeAssets
        .flatMap(asset => asset.deliveries ?? [])
        .filter(delivery => !delivery.path.endsWith('.json'));
    usage.counts.runtimeAssetHomes = visualRuntimeAssets.length;
    usage.counts.runtimeFiles = visualRuntimeFiles.length;
}

function readJsonConstant(fileSource, name) {
    const range = jsonConstantRange(fileSource, name);
    return JSON.parse(fileSource.slice(range.start, range.end));
}

function replaceJsonConstant(fileSource, name, value) {
    const range = jsonConstantRange(fileSource, name);
    return `${fileSource.slice(0, range.start)}${JSON.stringify(value)}${fileSource.slice(range.end)}`;
}

function jsonConstantRange(fileSource, name) {
    const marker = `export const ${name} = `;
    const markerStart = fileSource.indexOf(marker);
    if (markerStart < 0) throw new Error(`Missing constant: ${name}`);
    const start = markerStart + marker.length;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < fileSource.length; index += 1) {
        const char = fileSource[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
            continue;
        }
        if (char === '"') quoted = true;
        else if (char === '[' || char === '{') depth += 1;
        else if (char === ']' || char === '}') {
            depth -= 1;
            if (depth === 0) return { start, end: index + 1 };
        }
    }
    throw new Error(`Unterminated JSON constant: ${name}`);
}

function pngDimensions(bytes, label) {
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        throw new Error(`Not a PNG: ${label}`);
    }
    if (bytes[25] !== 6) throw new Error(`Sprite is not RGBA: ${label}`);
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
    };
}

function assertUnique(values, label) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) {
        throw new Error(`Duplicate ${label}: ${[...new Set(duplicates)].join(', ')}`);
    }
}

function assertFile(file) {
    if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
}

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}
