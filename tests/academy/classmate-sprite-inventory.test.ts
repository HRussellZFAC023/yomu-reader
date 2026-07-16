import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';
import { SPRITE_ANGLES, SPRITE_EXPRESSIONS } from '../../src/academy/domain/sprite-performance-contract';

interface InventoryAsset {
    path: string;
    coverageStatus: 'approved' | 'review-candidate' | 'off-matrix';
    decision: 'keep' | 'replace' | 'delete';
    angle: string | null;
    expression: string | null;
}

interface InventoryCharacter {
    id: string;
    basePose: string;
    progress: {
        approved: number;
        reviewCandidates: number;
        missing: number;
        deliveredPercent: number;
        approvedPercent: number;
    };
    currentAssets: InventoryAsset[];
    requiredVariants: Array<{ angle: string; expression: string; status: string; path: string | null }>;
    missingVariants: Array<{ angle: string; expression: string; status: 'missing'; path: null; plannedPath: string }>;
    historicalAssetIds: string[];
}

interface SpriteInventory {
    target: { characters: number; angles: string[]; expressions: string[]; slotsPerCharacter: number; totalSlots: number };
    summary: {
        approved: number;
        reviewCandidates: number;
        missing: number;
        currentPhysicalRasters: number;
        currentOffMatrixRasters: number;
        historicalUniqueRasters: number;
        historicalOccurrences: number;
    };
    migrations: Array<{ character: string; from: string; to: string; decision: string; runtimeReferencesAfterMigration: string[] }>;
    characters: InventoryCharacter[];
    historicalAssets: Array<{ id: string; characters: string[]; decision: 'keep' | 'replace' | 'delete'; occurrences: unknown[] }>;
}

const publicPath = path.resolve('public/academy/art/CLASSMATE-SPRITE-INVENTORY.json');
const docsPath = path.resolve('docs/public/academy/art/CLASSMATE-SPRITE-INVENTORY.json');
const inventory = JSON.parse(fs.readFileSync(publicPath, 'utf8')) as SpriteInventory;

describe('Academy cast-wide sprite migration inventory', () => {
    it('defines the complete 28 by 3 by 7 target without inventing missing art', () => {
        expect(inventory.target).toEqual({
            characters: ACADEMY_CAST.length,
            angles: SPRITE_ANGLES,
            expressions: SPRITE_EXPRESSIONS,
            slotsPerCharacter: 21,
            totalSlots: 588,
        });
        expect(inventory.characters.map(character => character.id)).toEqual(ACADEMY_CAST.map(character => character.id));
        expect(new Set(inventory.characters.map(character => character.basePose.trim().toLowerCase())).size)
            .toBe(ACADEMY_CAST.length);

        for (const character of inventory.characters) {
            expect(character.requiredVariants).toHaveLength(21);
            expect(character.missingVariants).toHaveLength(character.progress.missing);
            expect(character.requiredVariants.filter(variant => variant.status === 'approved')).toHaveLength(character.progress.approved);
            expect(character.requiredVariants.filter(variant => variant.status === 'review-candidate'))
                .toHaveLength(character.progress.reviewCandidates);
            for (const missing of character.missingVariants) {
                expect(missing).toMatchObject({ status: 'missing', path: null });
                expect(fs.existsSync(path.resolve('public', missing.plannedPath.slice(1)))).toBe(false);
            }
        }
        expect(inventory.summary).toMatchObject({ approved: 7, reviewCandidates: 10, missing: 571 });
        expect(inventory.summary.approved + inventory.summary.reviewCandidates + inventory.summary.missing).toBe(588);
    });

    it('accounts for every physical current raster exactly once and leaves no sprite orphan', () => {
        const physical = fs.readdirSync(path.resolve('public/academy/art/characters'), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .flatMap(entry => fs.readdirSync(path.resolve('public/academy/art/characters', entry.name))
                .filter(file => file.endsWith('.png'))
                .map(file => `/academy/art/characters/${entry.name}/${file}`))
            .sort();
        const registered = inventory.characters.flatMap(character => character.currentAssets.map(asset => asset.path)).sort();

        expect(registered).toEqual(physical);
        expect(new Set(registered).size).toBe(registered.length);
        expect(inventory.summary.currentPhysicalRasters).toBe(physical.length);
        expect(inventory.characters.flatMap(character => character.currentAssets)
            .every(asset => asset.decision === 'keep')).toBe(true);
    });

    it('covers every canonical historical sprite candidate and occurrence from older worktrees', () => {
        const recovery = JSON.parse(fs.readFileSync(path.resolve('docs/academy/recovery/ASSET-CARRYOVER.json'), 'utf8')) as {
            assets: Array<{ id: string; assetType: string; characters: string[]; occurrences: unknown[] }>;
        };
        const castIds = new Set<string>(ACADEMY_CAST.map(character => character.id));
        const expected = recovery.assets
            .filter(asset => asset.assetType === 'character-sprite' && asset.characters.some(character => castIds.has(character)))
            .map(asset => asset.id)
            .sort();
        const expectedOccurrences = recovery.assets
            .filter(asset => expected.includes(asset.id))
            .reduce((total, asset) => total + asset.occurrences.length, 0);

        expect(inventory.historicalAssets.map(asset => asset.id).sort()).toEqual(expected);
        expect(inventory.summary.historicalUniqueRasters).toBe(expected.length);
        expect(inventory.summary.historicalOccurrences).toBe(expectedOccurrences);
        for (const character of inventory.characters) {
            expect(character.historicalAssetIds.every(id => expected.includes(id))).toBe(true);
        }
    });

    it('registers Sophie P0 while keeping the other eighteen cells missing', () => {
        const sophie = inventory.characters.find(character => character.id === 'sophie')!;

        expect(sophie.progress).toEqual({ approved: 3, reviewCandidates: 0, missing: 18, deliveredPercent: 14.29, approvedPercent: 14.29 });
        expect(sophie.currentAssets.map(asset => [asset.angle, asset.expression])).toEqual([
            ['right-three-quarter', 'neutral'],
            ['left-three-quarter', 'determined'],
            ['front-near-front', 'encouraging-listening'],
        ]);
        expect(sophie.currentAssets.every(asset => asset.path.endsWith('__v003.png'))).toBe(true);
        expect(sophie.currentAssets.every(asset => asset.coverageStatus === 'approved')).toBe(true);
    });

    it('removes deprecated learner-facing Sophie art and the redundant per-character inventory', () => {
        const migration = inventory.migrations.find(entry => entry.character === 'sophie')!;

        expect(migration).toMatchObject({ decision: 'delete' });
        expect(migration.runtimeReferencesAfterMigration).toEqual([]);
        expect(fs.existsSync(path.resolve('public', migration.from.slice(1)))).toBe(false);
        expect(fs.existsSync(path.resolve('public/academy/art/characters/sophie/inventory.json'))).toBe(false);
        expect(fs.existsSync(path.resolve('docs/public/academy/art/characters/sophie/inventory.json'))).toBe(false);
        expect(inventory.characters.flatMap(character => character.currentAssets.map(asset => asset.path)))
            .not.toContain(migration.from);
    });

    it('keeps the public inventory and documentation mirror byte-identical', () => {
        expect(fs.readFileSync(docsPath)).toEqual(fs.readFileSync(publicPath));
    });
});
