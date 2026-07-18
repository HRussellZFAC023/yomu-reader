import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_LESSON_ASSET_BINDINGS,
    ACADEMY_RUNTIME_ASSET_REGISTRY,
} from '../../src/academy/assets';
import { sha256File } from './helpers/hash-memo';

interface LedgerAsset {
    readonly id: string;
    readonly verdict: string;
    readonly runtimeHome?: readonly string[];
}

interface LessonInventoryBinding {
    readonly packageId: string;
    readonly sourceSceneReference: string;
    readonly sourceSceneReferenceState: string;
    readonly approvedScene: { readonly assetId: string; readonly verdict: string };
    readonly requiredCastSources: {
        readonly lessonScene: readonly string[];
        readonly storyContinuity: readonly string[];
    };
    readonly approvedCast: Readonly<Record<string, { readonly assetId: string; readonly verdict: string }>>;
    readonly reviewOnlyCast: Readonly<Record<string, { readonly assetId: string; readonly verdict: string }>>;
    readonly unboundNoApprovedAsset: readonly string[];
    readonly items: readonly { readonly assetId: string; readonly verdict: string }[];
    readonly sourceMedia: readonly {
        readonly path: string;
        readonly sha256: string;
        readonly present: boolean;
        readonly mirrored: boolean;
        readonly actualSha256: string;
        readonly mirrorSha256: string;
    }[];
    readonly placeholderPortraitsAuthorized: boolean;
}

const usage = JSON.parse(fs.readFileSync('public/academy/art/ASSET-USAGE.json', 'utf8')) as {
    assets: LedgerAsset[];
    lessonBindings: readonly { packageId: string }[];
};
const inventory = JSON.parse(fs.readFileSync('docs/academy/recovery/ASSET-INVENTORY.json', 'utf8')) as {
    lessonBindings: LessonInventoryBinding[];
};
const binding = ACADEMY_LESSON_ASSET_BINDINGS['l1-l01'];

function digest(file: string) {
    return sha256File(file);
}

describe('l1-l01 approved asset binding', () => {
    it('binds the approved classroom, Rie performance, classroom prop, and exact source worksheet', () => {
        expect(binding).toEqual({
            sceneAssetId: 'location.classroom',
            sourceSceneReference: 'academy/art/scenes/classroom-first-evening-wide.webp',
            approvedCastAssetIds: { rie: 'character.rie.neutral-glasses' },
            reviewOnlyCastCandidates: { aakash: 'character.aakash.neutral' },
            itemAssetIds: ['item.classroom-belongings'],
            sourceMedia: [{
                purpose: 'source-homework-worksheet',
                path: '/academy/content/lessons/l1-l01/moodle-hw-chapter-1-1-greeting-page-1.png',
                sha256: '26fc7617addb2af8f85678b0e5dacf30518eeadfb030dbbb3d27dd2f54948100',
            }],
        });
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY[binding.sceneAssetId].runtimeHomes).toContain('lesson:l1-l01');
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY[binding.approvedCastAssetIds.rie].runtimeHomes).toContain('lesson:l1-l01:host');
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY[binding.itemAssetIds[0]].runtimeHomes).toContain('lesson:l1-l01:classroom-language-prop');
    });

    it('keeps every unresolved likeness explicit and never promotes a preview or placeholder portrait', () => {
        const record = inventory.lessonBindings.find(entry => entry.packageId === 'l1-l01');
        expect(record).toMatchObject({
            sourceSceneReference: 'academy/art/scenes/classroom-first-evening-wide.webp',
            sourceSceneReferenceState: 'missing-source-reference-with-approved-registry-binding',
            approvedScene: { assetId: 'classroom-evening-lamplit', verdict: 'approved-runtime' },
            approvedCast: { rie: { assetId: 'rie-neutral-glasses-front-near-front-halfbody-v001', verdict: 'approved-runtime' } },
            reviewOnlyCast: { aakash: { assetId: 'aakash-neutral-halfbody-v001', verdict: 'approved-runtime-preview' } },
            unboundNoApprovedAsset: ['henry', 'jenny', 'mika', 'stasi', 'tom'],
            items: [{ assetId: 'classroom-belongings-v001', verdict: 'approved-runtime' }],
            placeholderPortraitsAuthorized: false,
        });
        expect(record?.requiredCastSources).toEqual({
            lessonScene: ['rie', 'henry', 'aakash', 'jenny', 'tom'],
            storyContinuity: ['stasi', 'mika'],
        });
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['character.aakash.neutral'].status).toBe('review-preview');
        expect(Object.values(binding.approvedCastAssetIds)).not.toContain('character.aakash.neutral');
        expect(fs.existsSync(path.resolve('public', binding.sourceSceneReference))).toBe(false);
    });

    it('keeps the source worksheet present, mirrored, and byte-identical to its recorded provenance', () => {
        const media = inventory.lessonBindings.find(entry => entry.packageId === 'l1-l01')?.sourceMedia[0];
        expect(media).toMatchObject({ present: true, mirrored: true });
        const publicFile = path.resolve('public', binding.sourceMedia[0].path.slice(1));
        const docsFile = path.resolve('docs/public', binding.sourceMedia[0].path.slice(1));
        expect(digest(publicFile)).toBe(binding.sourceMedia[0].sha256);
        expect(digest(docsFile)).toBe(binding.sourceMedia[0].sha256);
        expect(usage.lessonBindings).toContainEqual(expect.objectContaining({ packageId: 'l1-l01' }));
    });

    it('keeps typed runtime homes in lockstep with the public ledger', () => {
        const ledgerById = new Map(usage.assets.map(asset => [asset.id, asset]));
        expect(ledgerById.get('rie-neutral-glasses-front-near-front-halfbody-v001')?.runtimeHome)
            .toEqual(ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.neutral-glasses'].runtimeHomes);
        expect(ledgerById.get('classroom-evening-lamplit')?.runtimeHome)
            .toEqual(ACADEMY_RUNTIME_ASSET_REGISTRY['location.classroom'].runtimeHomes);
        expect(ledgerById.get('classroom-belongings-v001')?.runtimeHome)
            .toEqual(ACADEMY_RUNTIME_ASSET_REGISTRY['item.classroom-belongings'].runtimeHomes);
    });
});
