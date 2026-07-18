import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
    buildAcademyAssetInventory,
    OUTPUT_PATH,
    serializeAcademyAssetInventory,
    validateAcademyAssetInventory,
// @ts-expect-error The audit is an intentionally standalone Node ESM script.
} from '../../scripts/academy-asset-audit.mjs';
import { sha256File } from './helpers/hash-memo';

interface InventoryAsset {
    readonly id: string;
    readonly path: string;
    readonly state: 'active' | 'orphaned' | 'deprecated';
    readonly present: boolean;
    readonly runtimeAuthorized: boolean;
    readonly runtimeHomes: readonly string[];
    readonly replacementPath?: string | null;
    readonly noDeletionPerformedByAudit?: boolean;
}

interface AssetInventory {
    readonly counts: {
        readonly currentRasterFiles: number;
        readonly currentRasterFilesAccountedFor: number;
        readonly active: number;
        readonly orphaned: number;
        readonly deprecated: number;
        readonly deprecatedPresent: number;
        readonly missingExpressionVariants: number;
        readonly expressionMatrixSlots: number;
        readonly approvedExpressionVariants: number;
        readonly reviewCandidateExpressionVariants: number;
        readonly deliveredMatrixExpressionVariants: number;
        readonly offMatrixDeliveredSprites: number;
    };
    readonly assets: {
        readonly active: readonly InventoryAsset[];
        readonly orphaned: readonly InventoryAsset[];
        readonly deprecated: readonly InventoryAsset[];
    };
    readonly expressionCoverage: {
        readonly offMatrixDelivered: ReadonlyArray<{ path: string; currentState: string; countsTowardExpressionMatrix: boolean }>;
        readonly missingVariants: ReadonlyArray<{
            character: string;
            angle: string;
            expression: string;
            plannedPath: string;
            state: 'missing-expression-variant';
        }>;
    };
    readonly noFilesDeletedByAudit: boolean;
}

const inventory = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')) as AssetInventory;

function currentRasterHashes() {
    const root = path.resolve('public/academy/art');
    const files: string[] = [];
    const walk = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (/\.(?:jpe?g|png|webp)$/iu.test(entry.name)) files.push(file);
        }
    };
    walk(root);
    return Object.fromEntries(files.sort().map(file => [
        path.relative(root, file),
        // Memoized on (mtime, size): a file the audit rewrote re-hashes for real,
        // an untouched 73MB art tree stops being hashed three times per run.
        sha256File(file),
    ]));
}

describe('Academy active, orphaned, deprecated, and missing asset inventory', () => {
    it('is the canonical source-derived inventory and passes the read-only CLI audit', () => {
        expect(fs.readFileSync(OUTPUT_PATH, 'utf8')).toBe(serializeAcademyAssetInventory());
        expect(validateAcademyAssetInventory(buildAcademyAssetInventory())).toEqual([]);

        const before = currentRasterHashes();
        expect(execFileSync(process.execPath, ['scripts/academy-asset-audit.mjs', 'validate'], { encoding: 'utf8' }))
            .toContain('102 active, 9 orphaned, 9 deprecated, 607 missing expression variants');
        expect(currentRasterHashes()).toEqual(before);
    });

    it('accounts for every current raster exactly once without conflating authorization and presence', () => {
        expect(inventory.counts).toMatchObject({
            currentRasterFiles: 111,
            currentRasterFilesAccountedFor: 111,
            active: 102,
            orphaned: 9,
            deprecated: 9,
            deprecatedPresent: 0,
        });
        expect(inventory.assets.active.every(asset => asset.present && asset.runtimeAuthorized && asset.runtimeHomes.length > 0)).toBe(true);
        expect(inventory.assets.orphaned.every(asset => asset.present && !asset.runtimeAuthorized && asset.runtimeHomes.length === 0)).toBe(true);
        expect(inventory.assets.deprecated.every(asset => !asset.runtimeAuthorized && asset.runtimeHomes.length === 0)).toBe(true);
        expect(new Set([
            ...inventory.assets.active,
            ...inventory.assets.orphaned,
            ...inventory.assets.deprecated.filter(asset => asset.present),
        ].map(asset => asset.path)).size).toBe(111);
    });

    it('keeps the recovered Aakash expression family and the Rie thinking sprite orphaned as the off-matrix deliveries', () => {
        const offMatrixEntries = [
            ['aakash-sprite-concerned-left-three-quarter-halfbody-v005', '/academy/art/characters/aakash/aakash__sprite__concerned__left-three-quarter__halfbody__v005.png'],
            ['aakash-sprite-determined-left-three-quarter-v005', '/academy/art/characters/aakash/aakash__sprite__determined__left-three-quarter__v005.png'],
            ['aakash-sprite-embarrassed-front-near-front-halfbody-v005', '/academy/art/characters/aakash/aakash__sprite__embarrassed__front-near-front__halfbody__v005.png'],
            ['aakash-sprite-happy-right-three-quarter-v005', '/academy/art/characters/aakash/aakash__sprite__happy__right-three-quarter__v005.png'],
            ['aakash-sprite-laughing-left-three-quarter-halfbody-v005', '/academy/art/characters/aakash/aakash__sprite__laughing__left-three-quarter__halfbody__v005.png'],
            ['aakash-sprite-listening-right-three-quarter-v005', '/academy/art/characters/aakash/aakash__sprite__listening__right-three-quarter__v005.png'],
            ['aakash-sprite-surprised-right-three-quarter-halfbody-v005', '/academy/art/characters/aakash/aakash__sprite__surprised__right-three-quarter__halfbody__v005.png'],
            ['aakash-sprite-thoughtful-front-near-front-v005', '/academy/art/characters/aakash/aakash__sprite__thoughtful__front-near-front__v005.png'],
            ['rie-thinking-halfbody-v001', '/academy/art/characters/rie/rie__thinking__halfbody__v001.png'],
        ] as const;

        expect(inventory.assets.orphaned).toEqual(offMatrixEntries.map(([id, assetPath]) => expect.objectContaining({
            id,
            path: assetPath,
            state: 'orphaned',
            runtimeAuthorized: false,
        })));
        expect(inventory.expressionCoverage.offMatrixDelivered).toEqual(offMatrixEntries.map(([, assetPath]) => expect.objectContaining({
            path: assetPath,
            currentState: 'orphaned',
            countsTowardExpressionMatrix: false,
        })));
    });

    it('retains absent rejected and superseded sprites as non-destructive deprecation records', () => {
        expect(inventory.noFilesDeletedByAudit).toBe(true);
        expect(inventory.assets.deprecated).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'xingyu-neutral-halfbody-v001',
                path: '/academy/art/characters/xingyu/xingyu__neutral__halfbody__v001.png',
                state: 'deprecated',
                present: false,
                noDeletionPerformedByAudit: true,
            }),
            expect.objectContaining({
                id: 'sophie-flat-v002-to-painted-v003',
                path: '/academy/art/characters/sophie/sophie__neutral__halfbody__v002.png',
                replacementPath: '/academy/art/characters/sophie/sophie__bookshop-neutral__halfbody__v003.png',
                present: false,
                noDeletionPerformedByAudit: true,
            }),
        ]));
    });

    it('lists every missing matrix expression variant without treating off-matrix sprites as coverage', () => {
        expect(inventory.counts).toMatchObject({
            expressionMatrixSlots: 630,
            approvedExpressionVariants: 12,
            reviewCandidateExpressionVariants: 11,
            deliveredMatrixExpressionVariants: 23,
            missingExpressionVariants: 607,
            offMatrixDeliveredSprites: 9,
        });
        expect(inventory.expressionCoverage.missingVariants).toHaveLength(607);
        expect(new Set(inventory.expressionCoverage.missingVariants.map(variant => variant.plannedPath)).size).toBe(607);
        expect(inventory.expressionCoverage.missingVariants).toContainEqual({
            character: 'xingyu',
            angle: 'front-near-front',
            expression: 'neutral',
            plannedPath: '/academy/art/characters/xingyu/xingyu__neutral__front-near-front__halfbody__v001.png',
            state: 'missing-expression-variant',
            present: false,
            sourceLedger: 'public/academy/art/CLASSMATE-SPRITE-INVENTORY.json',
        });
        expect(inventory.expressionCoverage.missingVariants.every(variant =>
            !fs.existsSync(path.resolve('public', variant.plannedPath.slice(1))))).toBe(true);
    });
});
