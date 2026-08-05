#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { refreshAcademyRuntimeArtPrecache } from './lib/academy-cast-offline-precache.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const specFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repoRoot, 'docs/academy/art/STORY-ART-PROMOTIONS.json');
const manifestFile = path.join(repoRoot, 'src/academy/domain/story-art-manifest.ts');
// public/academy only: scripts/sync-academy.cjs regenerates
// docs/public/academy from it on every build:academy, so mirroring here writes
// bytes the next sync throws away.
const usageFile = path.join(repoRoot, 'public/academy/art/ASSET-USAGE.json');
const storyRoot = path.join(repoRoot, 'src/academy/content/story-sources');

const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
if (!Array.isArray(spec.promotions)) throw new TypeError('Story-art spec requires promotions.');

const authored = loadAuthoredNodes();
const bindings = {};
const runtimeAssets = {};
const coverage = {};
const ledgerAssets = [];

for (const promotion of spec.promotions) {
    const authoredNode = authored.get(promotion.nodeId);
    if (!authoredNode) throw new Error(`Unknown story node: ${promotion.nodeId}`);
    if (authoredNode.chapterId !== promotion.chapterId || authoredNode.sceneId !== promotion.sceneId) {
        throw new Error(`${promotion.nodeId} is assigned to the wrong chapter or scene.`);
    }
    if (authoredNode.cueId !== promotion.cueId) {
        throw new Error(`${promotion.nodeId} cue drifted: expected ${authoredNode.cueId}.`);
    }
    if (!promotion.qa?.inspected || promotion.qa?.verdict !== 'pass') {
        throw new Error(`${promotion.assetId} has not passed visual inspection.`);
    }

    const files = {};
    const deliveries = [];
    for (const variant of ['wide', 'mobile']) {
        const deliveryPath = promotion[variant];
        if (!deliveryPath.startsWith('/academy/art/events/') || !deliveryPath.endsWith('.webp')) {
            throw new Error(`${promotion.assetId} has an invalid ${variant} delivery.`);
        }
        const publicFile = path.join(repoRoot, 'public', deliveryPath.slice(1));
        if (!fs.existsSync(publicFile)) throw new Error(`Missing story art: ${deliveryPath}`);
        const metadata = await sharp(publicFile).metadata();
        const expected = variant === 'wide'
            ? { width: 1600, height: 900 }
            : { width: 900, height: 1600 };
        if (metadata.width !== expected.width || metadata.height !== expected.height) {
            throw new Error(`${deliveryPath} must be ${expected.width}x${expected.height}.`);
        }
        const digest = sha256(fs.readFileSync(publicFile));
        files[variant] = deliveryPath;
        deliveries.push({ path: deliveryPath, sha256: digest });
    }

    bindings[promotion.nodeId] = {
        assetId: promotion.assetId,
        sceneId: promotion.sceneId,
        nodeId: promotion.nodeId,
        cueId: promotion.cueId,
        ...files,
    };
    runtimeAssets[promotion.assetId] = {
        kind: 'event-art',
        status: 'approved',
        runtimeHomes: [promotion.nodeId, promotion.sceneId],
        provenance: 'regenerated-house-style',
        files,
    };
    coverage[promotion.assetId] = {
        purpose: 'story-event',
        primaryUse: promotion.nodeId,
    };
    ledgerAssets.push({
        id: promotion.assetId.replaceAll('.', '-'),
        source: 'manifest:docs/academy/art/STORY-ART-PROMOTIONS.json',
        sourceSha256: sha256(Buffer.from(deliveries.map(delivery => delivery.sha256).join(':'))),
        provenance: 'regenerated-house-style',
        verdict: 'approved-runtime',
        runtimeHome: [promotion.nodeId, promotion.sceneId],
        reviewHome: ['story-art-promotions', promotion.cueId],
        usage: {
            runtime: [promotion.nodeId, promotion.sceneId],
            review: ['story-art-promotions'],
        },
        orphan: 'active-runtime',
        deliveries,
        status: 'node-bound, art-directed responsive story event',
    });
}

assertUnique(Object.keys(bindings), 'story node');
assertUnique(spec.promotions.map(promotion => promotion.assetId), 'story asset id');
assertUnique(
    ledgerAssets.flatMap(asset => asset.deliveries.map(delivery => delivery.path)),
    'story delivery',
);

fs.writeFileSync(manifestFile, renderManifest(bindings, runtimeAssets, coverage));

const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
usage.assets = usage.assets.filter(asset =>
    asset.source !== 'manifest:docs/academy/art/STORY-ART-PROMOTIONS.json',
);
usage.assets.push(...ledgerAssets);
usage.assets.sort((left, right) => left.id.localeCompare(right.id));
recountUsage(usage);
fs.writeFileSync(usageFile, `${JSON.stringify(usage, null, 2)}\n`);
await refreshAcademyRuntimeArtPrecache(repoRoot);

console.log(`Promoted ${spec.promotions.length} node-bound story art states.`);

function loadAuthoredNodes() {
    const nodes = new Map();
    for (const file of fs.readdirSync(storyRoot).filter(name => name.endsWith('.v2.json'))) {
        const chapter = JSON.parse(fs.readFileSync(path.join(storyRoot, file), 'utf8'));
        for (const scene of chapter.scenes ?? []) {
            for (const node of scene.nodes ?? []) {
                if (nodes.has(node.id)) throw new Error(`Duplicate authored story node: ${node.id}`);
                nodes.set(node.id, {
                    chapterId: chapter.id,
                    sceneId: scene.id,
                    cueId: node.cueId ?? null,
                });
            }
        }
    }
    return nodes;
}

function renderManifest(bindings, runtimeAssets, coverage) {
    return `export interface AcademyStoryArtBinding {
    readonly assetId: string;
    readonly sceneId: string;
    readonly nodeId: string;
    readonly cueId: string;
    readonly wide: \`/academy/art/events/\${string}.webp\`;
    readonly mobile: \`/academy/art/events/\${string}.webp\`;
}

/**
 * Generated by npm run academy:art:story:promote. Every entry has passed
 * viewport QA and resolves to an authored story node before reaching runtime.
 */
export const ACADEMY_STORY_ART_BY_NODE = ${JSON.stringify(bindings, null, 4)} as const satisfies Readonly<Record<string, AcademyStoryArtBinding>>;

export const ACADEMY_STORY_ART_RUNTIME_ASSETS = ${JSON.stringify(runtimeAssets, null, 4)} as const;

export const ACADEMY_STORY_ART_COVERAGE = ${JSON.stringify(coverage, null, 4)} as const;
`;
}

function recountUsage(usage) {
    const runtimeAssets = usage.assets.filter(asset =>
        asset.verdict?.startsWith('approved-runtime')
        || asset.verdict === 'review-candidate/runtime-preview',
    );
    usage.counts.runtimeAssetHomes = runtimeAssets.filter(asset =>
        (asset.deliveries ?? []).some(delivery => !delivery.path.endsWith('.json')),
    ).length;
    usage.counts.runtimeFiles = runtimeAssets
        .flatMap(asset => asset.deliveries ?? [])
        .filter(delivery => !delivery.path.endsWith('.json'))
        .length;
}

function assertUnique(values, label) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length) throw new Error(`Duplicate ${label}: ${[...new Set(duplicates)].join(', ')}`);
}

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}
