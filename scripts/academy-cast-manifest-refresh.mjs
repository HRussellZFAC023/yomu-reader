import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { refreshAcademyRuntimeArtPrecache } from './lib/academy-cast-offline-precache.mjs';
import { reconcileAcademyLessonCastBindings } from './lib/academy-cast-usage-bindings.mjs';

const manifestFile = path.resolve('src/academy/domain/cast-standardization-manifest.ts');
const rejectedRoot = path.resolve('artifacts/yomu-academy/cast-standardization/rejected');
// public/academy only: scripts/sync-academy.cjs regenerates
// docs/public/academy from it on every build:academy.
const usageFile = path.resolve('public/academy/art/ASSET-USAGE.json');

let source = fs.readFileSync(manifestFile, 'utf8');
const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));

const manifest = readJsonConstant(
    source,
    'ACADEMY_CAST_STANDARDIZATION_MANIFEST',
    ' as const satisfies readonly AcademyCastStandardizationSlot[];',
);
const existingRejected = readJsonConstant(
    source,
    'ACADEMY_CAST_STANDARDIZATION_REJECTED',
    ' as const;',
);
const summary = readJsonConstant(
    source,
    'ACADEMY_CAST_STANDARDIZATION_SUMMARY',
    ' as const;',
);
const runtimeAssets = readJsonConstant(
    source,
    'ACADEMY_CAST_STANDARDIZATION_RUNTIME_ASSETS',
    ' as const;',
);

for (const slot of manifest) {
    const publicFile = path.resolve('public', slot.assetPath.slice(1));
    assertFile(publicFile);

    const publicBytes = fs.readFileSync(publicFile);
    const metadata = await sharp(publicBytes).metadata();
    if (
        metadata.format !== 'webp'
        || !metadata.width
        || !metadata.height
        || metadata.channels !== 4
    ) {
        throw new Error(`Cast sprite is not transparent WebP: ${slot.assetPath}`);
    }
    const digest = sha256(publicBytes);
    slot.sha256 = digest;
    slot.qa.dimensions = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
    };

    const usageAsset = usage.assets.find(asset =>
        asset.deliveries?.some(delivery => delivery.path === slot.assetPath),
    );
    if (!usageAsset) {
        throw new Error(`ASSET-USAGE is missing cast slot: ${slot.assetPath}`);
    }
    for (const delivery of usageAsset.deliveries) {
        if (delivery.path === slot.assetPath) delivery.sha256 = digest;
    }
    if (usageAsset.source === 'manifest:src/academy/domain/cast-standardization-manifest.ts') {
        usageAsset.sourceSha256 = digest;
    }
}

const existingRejectedByPath = new Map(existingRejected.map(entry => [entry.path, entry]));
const rejected = fs.existsSync(rejectedRoot)
    ? walkFiles(rejectedRoot)
        .filter(file => file.endsWith('.png'))
        .map(file => path.relative(process.cwd(), file).split(path.sep).join('/'))
        .sort()
        .map(rejectedPath => {
            const bytes = fs.readFileSync(path.resolve(rejectedPath));
            const existing = existingRejectedByPath.get(rejectedPath);
            return {
                path: rejectedPath,
                sha256: sha256(bytes),
                reason: existing?.reason ?? rejectionReason(rejectedPath),
                retainedOutsideProduction: true,
            };
        })
    : existingRejected;

const refreshedSummary = {
    ...summary,
    rejectedPreQa: rejected.length,
};

source = replaceJsonConstant(
    source,
    'ACADEMY_CAST_STANDARDIZATION_MANIFEST',
    ' as const satisfies readonly AcademyCastStandardizationSlot[];',
    manifest,
);
source = replaceJsonConstant(
    source,
    'ACADEMY_CAST_STANDARDIZATION_REJECTED',
    ' as const;',
    rejected,
);
source = replaceJsonConstant(
    source,
    'ACADEMY_CAST_STANDARDIZATION_SUMMARY',
    ' as const;',
    refreshedSummary,
);

fs.writeFileSync(manifestFile, source);
reconcileAcademyLessonCastBindings(usage, manifest);
fs.writeFileSync(usageFile, `${JSON.stringify(usage, null, 2)}\n`);
await refreshAcademyRuntimeArtPrecache(process.cwd());
console.log(`Refreshed ${manifest.length} production cast slots and ${rejected.length} archived candidates.`);

function readJsonConstant(fileSource, name, suffix) {
    const marker = `export const ${name} = `;
    const start = fileSource.indexOf(marker);
    if (start < 0) throw new Error(`Missing constant: ${name}`);
    const jsonStart = start + marker.length;
    const jsonEnd = fileSource.indexOf(suffix, jsonStart);
    if (jsonEnd < 0) throw new Error(`Missing suffix for constant: ${name}`);
    return JSON.parse(fileSource.slice(jsonStart, jsonEnd));
}

function replaceJsonConstant(fileSource, name, suffix, value) {
    const marker = `export const ${name} = `;
    const start = fileSource.indexOf(marker);
    if (start < 0) throw new Error(`Missing constant: ${name}`);
    const jsonStart = start + marker.length;
    const jsonEnd = fileSource.indexOf(suffix, jsonStart);
    if (jsonEnd < 0) throw new Error(`Missing suffix for constant: ${name}`);
    return `${fileSource.slice(0, jsonStart)}${JSON.stringify(value)}${fileSource.slice(jsonEnd)}`;
}

function walkFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
    });
}

function assertFile(file) {
    if (!fs.existsSync(file)) throw new Error(`Missing cast file: ${file}`);
}

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function rejectionReason(rejectedPath) {
    if (rejectedPath.includes('/identity-mismatch-20260726/francis/')) {
        return 'Archived pre-correction Francis slot carried Tom identity.';
    }
    if (rejectedPath.includes('/identity-mismatch-20260726/mira/')) {
        return 'Archived pre-correction Mira slot carried Miller identity.';
    }
    if (rejectedPath.includes('/identity-mismatch-20260726/miller/')) {
        return 'Archived pre-correction Miller slot carried Mira identity.';
    }
    if (rejectedPath.includes('/identity-mismatch-20260726/tom/')) {
        return 'Archived superseded Tom candidate before identity and house-style correction.';
    }
    if (rejectedPath.includes('/style-superseded-20260727/tom/')) {
        return 'Archived superseded Tom sprite before the stronger hand-drawn house-style correction.';
    }
    if (rejectedPath.includes('/style-superseded-20260727/sam/')) {
        return 'Archived superseded Sam sprite whose haircut retained too much crown and side volume.';
    }
    if (rejectedPath.includes('/style-superseded-20260726/')) {
        return 'Archived superseded neutral portrait before cast house-style correction.';
    }
    return 'Archived rejected or superseded cast candidate outside production.';
}
