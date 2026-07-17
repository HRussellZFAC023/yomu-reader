import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';
import {
    ACADEMY_SPRITE_BATCH_MANIFEST,
    assertValidSpriteBatchManifest,
    validateSpriteBatchManifest,
    type SpriteBatchManifest,
} from '../../src/academy/domain/sprite-batch-manifest';
import { SPRITE_ANGLES, SPRITE_EXPRESSIONS } from '../../src/academy/domain/sprite-performance-contract';

describe('Academy sprite batch manifest', () => {
    it('matches its public documentation copy and covers the complete canonical cast', () => {
        const publicPath = path.resolve('public/academy/art/SPRITE-BATCH-MANIFEST.json');
        const docsPath = path.resolve('docs/public/academy/art/SPRITE-BATCH-MANIFEST.json');

        expect(fs.readFileSync(docsPath, 'utf8')).toBe(fs.readFileSync(publicPath, 'utf8'));
        expect(ACADEMY_SPRITE_BATCH_MANIFEST.characters.map(character => character.id))
            .toEqual(ACADEMY_CAST.map(character => character.id));
        expect(() => assertValidSpriteBatchManifest()).not.toThrow();
        expect(validateSpriteBatchManifest(ACADEMY_SPRITE_BATCH_MANIFEST)).toEqual([]);
    });

    it('gives each character the full performance matrix and a unique base pose', () => {
        const poses = ACADEMY_SPRITE_BATCH_MANIFEST.characters.map(character => character.basePose.trim().toLowerCase());

        expect(new Set(poses).size).toBe(ACADEMY_CAST.length);
        for (const character of ACADEMY_SPRITE_BATCH_MANIFEST.characters) {
            expect(character.angles).toEqual(SPRITE_ANGLES);
            expect(character.expressionSet).toEqual(SPRITE_EXPRESSIONS);
            expect(character.outfitConstraints.length).toBeGreaterThan(0);
            expect(character.propConstraints.length).toBeGreaterThan(0);
            expect(character.sourceReferences.length).toBeGreaterThan(0);
        }
    });

    it('preserves the owner constraints for Felix and Peter', () => {
        const felix = ACADEMY_SPRITE_BATCH_MANIFEST.characters.find(character => character.id === 'felix');
        const peter = ACADEMY_SPRITE_BATCH_MANIFEST.characters.find(character => character.id === 'peter');

        expect(JSON.stringify(felix)).toMatch(/glasses/i);
        expect(JSON.stringify(felix)).toMatch(/curly dark-blond to light-brown hair/i);
        expect(JSON.stringify(felix)).toMatch(/cats/i);
        expect(JSON.stringify(peter)).toMatch(/about 26/i);
        expect(JSON.stringify(peter)).toMatch(/remaining hair visibly lighter/i);
    });

    it('records current asset state without approving review candidates', () => {
        const status = Object.fromEntries(ACADEMY_SPRITE_BATCH_MANIFEST.characters.map(character => [
            character.id,
            character.currentAsset.status,
        ]));

        expect(status.rie).toBe('approved-glasses-primary-trio-with-compatible-and-review-legacy');
        expect(status.aakash).toBe('unapproved-neutral-candidate');
        expect(status.peter).toBe('unapproved-performance-candidates');
        expect(status.felix).toBe('unapproved-performance-candidates');
        expect(status.shaun).toBe('unapproved-neutral-candidate');
        expect(status.sophie).toBe('approved-performance-trio');
        expect(ACADEMY_SPRITE_BATCH_MANIFEST.characters.find(character => character.id === 'sophie')?.currentAsset.paths)
            .toHaveLength(3);
        expect(ACADEMY_SPRITE_BATCH_MANIFEST.characters.find(character => character.id === 'sophie')?.currentAsset.paths
            .every(assetPath => assetPath.endsWith('__v003.png'))).toBe(true);
        expect(ACADEMY_SPRITE_BATCH_MANIFEST.approvalPolicy).toMatchObject({
            generationDoesNotApprove: true,
            bindOnlyApprovedAssets: true,
            rejectedAssetsAreNeverReferences: true,
        });
    });

    it('keeps the recovered Rie thinking preview in the offline manifest without approving it', () => {
        const rie = ACADEMY_SPRITE_BATCH_MANIFEST.characters.find(character => character.id === 'rie');

        expect(rie?.currentAsset).toMatchObject({
            status: 'approved-glasses-primary-trio-with-compatible-and-review-legacy',
            paths: expect.arrayContaining(['/academy/art/characters/rie/rie__thinking__halfbody__v001.png']),
        });
        expect(rie?.currentAsset.note).toMatch(/thinking remain unapproved review candidates/i);
    });

    it('prepares an exact three-angle coverage batch without treating generation as approval', () => {
        const batch = ACADEMY_SPRITE_BATCH_MANIFEST.nextCoverageBatch;

        expect(batch).toMatchObject({
            status: 'partially-delivered-with-held-likeness-slots',
            generatedAssetStatus: 'review-candidate-only',
            runtimeRegistrationGate: 'owner-likeness-and-equal-stage-cast-approval',
            outputStandard: {
                width: 1536,
                height: 2048,
                format: 'transparent-rgba',
                workflow: 'flat-chroma-then-alpha',
                crop: 'head-through-upper-thigh-half-body',
            },
        });
        expect(batch.slots).toHaveLength(9);
        expect(new Set(batch.slots.map(slot => slot.slotId)).size).toBe(batch.slots.length);
        expect(new Set(batch.slots.map(slot => slot.plannedAssetPath)).size).toBe(batch.slots.length);

        for (const castId of ['rie', 'peter', 'felix'] as const) {
            const slots = batch.slots.filter(slot => slot.castId === castId);
            expect(slots.map(slot => slot.angle)).toEqual(SPRITE_ANGLES);
            expect(new Set(slots.map(slot => slot.expression)).size).toBe(3);
            expect(slots.every(slot => slot.generationBrief.length > 500)).toBe(true);
            expect(slots.every(slot => slot.intendedRuntimeHomes.length > 1)).toBe(true);
            expect(slots.every(slot => slot.intendedRuntimeHomes.some(home => home.startsWith('journal:')))).toBe(true);
        }
    });

    it('makes only approved-reference Rie slots generation-ready', () => {
        const batch = ACADEMY_SPRITE_BATCH_MANIFEST.nextCoverageBatch;
        const ready = batch.slots.filter(slot => slot.readiness === 'approved-and-bound');
        const rie = ACADEMY_SPRITE_BATCH_MANIFEST.characters.find(character => character.id === 'rie')!;
        const references = new Map(rie.sourceReferences.map(reference => [reference.id, reference]));

        expect(ready.map(slot => slot.castId)).toEqual(['rie', 'rie', 'rie']);
        expect(ready.every(slot => rie.currentAsset.paths.includes(slot.plannedAssetPath))).toBe(true);
        for (const slot of ready) {
            expect(slot.likenessReferenceIds.length).toBeGreaterThan(0);
            expect(slot.blockedBy).toEqual([]);
            for (const id of slot.likenessReferenceIds) {
                expect(references.get(id)).toMatchObject({ use: 'likeness', gate: 'approved' });
            }
        }
    });

    it('fully briefs Peter and Felix while holding every likeness-dependent slot', () => {
        const held = ACADEMY_SPRITE_BATCH_MANIFEST.nextCoverageBatch.slots
            .filter(slot => slot.castId === 'peter' || slot.castId === 'felix');
        const serialized = JSON.stringify(held);

        expect(held).toHaveLength(6);
        expect(held.every(slot => slot.readiness === 'blocked-pending-approved-neutral')).toBe(true);
        expect(held.every(slot => slot.likenessReferenceIds.length === 0)).toBe(true);
        expect(held.every(slot => slot.constraintReferenceIds.length === 1)).toBe(true);
        expect(held.every(slot => slot.blockedBy.length === 1)).toBe(true);
        expect(serialized).not.toMatch(/peter__(neutral|thoughtful|encouraging)|felix__(neutral|happy|surprised)/i);
        expect(serialized).toMatch(/about 26/i);
        expect(serialized).toMatch(/lighter/i);
        expect(serialized).toMatch(/longer curly dark-blond to light-brown hair/i);
        expect(serialized).toMatch(/do not use any current (Peter|Felix) review-candidate raster as a reference/i);
    });

    it('keeps the rejected Xingyu likeness out of assets and generation references', () => {
        const xingyu = ACADEMY_SPRITE_BATCH_MANIFEST.characters.find(character => character.id === 'xingyu');

        expect(xingyu?.currentAsset).toMatchObject({ status: 'rejected-only-removed', paths: [] });
        expect(xingyu?.currentAsset.note).toContain('No audited standalone candidate is defensible');
        expect(xingyu?.generationPriority.blockedBy).toEqual(expect.arrayContaining([
            expect.stringContaining('No historical standalone Xingyu asset passed'),
            expect.stringContaining("Owner must verify Xingyu's exact class-photo crops"),
        ]));
        expect(JSON.stringify(xingyu?.sourceReferences)).not.toMatch(/xingyu__neutral|xingyu-neutral-halfbody|generated_images/i);
        expect(ACADEMY_SPRITE_BATCH_MANIFEST.approvalPolicy.xingyuRejectedLikenessPolicy)
            .toBe('do-not-bind-do-not-reference-regenerate-from-verified-owner-match');
    });

    it('rejects duplicate pose templates and unsafe Xingyu references', () => {
        const duplicatePose = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        const unsafeXingyu = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        (duplicatePose.characters as unknown as Array<{ basePose: string }>)[1].basePose
            = duplicatePose.characters[0].basePose;
        const xingyu = unsafeXingyu.characters.find(character => character.id === 'xingyu');
        (xingyu?.sourceReferences as unknown as Array<{ locator: string }>)
            .push({ locator: 'generated_images/xingyu__neutral.png' });

        expect(validateSpriteBatchManifest(duplicatePose)).toContainEqual(expect.objectContaining({
            code: 'duplicate-base-pose',
        }));
        expect(validateSpriteBatchManifest(unsafeXingyu)).toContainEqual(expect.objectContaining({
            code: 'unsafe-xingyu-reference',
        }));
    });

    it('rejects attempts to bypass coverage-batch likeness, output, and runtime-home gates', () => {
        const falseReady = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        const candidateAsReference = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        const candidateAsConstraint = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        const invalidReadiness = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        const duplicateOutput = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        const missingHome = structuredClone(ACADEMY_SPRITE_BATCH_MANIFEST) as SpriteBatchManifest;
        const peterReady = falseReady.nextCoverageBatch.slots.find(slot => slot.castId === 'peter')!;
        Object.assign(peterReady, {
            readiness: 'ready-from-approved-likeness-reference',
            likenessReferenceIds: ['peter-owner-correction'],
            blockedBy: [],
        });
        const heldPeter = candidateAsReference.nextCoverageBatch.slots.find(slot => slot.castId === 'peter')!;
        Object.assign(heldPeter, { likenessReferenceIds: ['peter-asset-status'] });
        const constrainedPeter = candidateAsConstraint.nextCoverageBatch.slots.find(slot => slot.castId === 'peter')!;
        Object.assign(constrainedPeter, { constraintReferenceIds: ['peter-asset-status'] });
        Object.assign(invalidReadiness.nextCoverageBatch.slots[0], { readiness: 'approved' });
        Object.assign(duplicateOutput.nextCoverageBatch.slots[1], {
            plannedAssetPath: duplicateOutput.nextCoverageBatch.slots[0].plannedAssetPath,
        });
        Object.assign(missingHome.nextCoverageBatch.slots[0], { intendedRuntimeHomes: [] });

        expect(validateSpriteBatchManifest(falseReady)).toContainEqual(expect.objectContaining({ code: 'batch-reference-gate' }));
        expect(validateSpriteBatchManifest(candidateAsReference)).toContainEqual(expect.objectContaining({ code: 'batch-reference-gate' }));
        expect(validateSpriteBatchManifest(candidateAsConstraint)).toContainEqual(expect.objectContaining({ code: 'batch-reference-gate' }));
        expect(validateSpriteBatchManifest(invalidReadiness)).toContainEqual(expect.objectContaining({ code: 'batch-schema' }));
        expect(validateSpriteBatchManifest(duplicateOutput)).toContainEqual(expect.objectContaining({ code: 'batch-duplicate' }));
        expect(validateSpriteBatchManifest(missingHome)).toContainEqual(expect.objectContaining({ code: 'batch-runtime-home' }));
    });
});
