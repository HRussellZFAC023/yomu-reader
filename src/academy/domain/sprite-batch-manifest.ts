import manifestData from '../../../public/academy/art/SPRITE-BATCH-MANIFEST.json';
import { ACADEMY_CAST, type AcademyCastMemberId, type CastCategory } from './cast-registry';
import {
    SPRITE_ANGLES,
    SPRITE_EXPRESSIONS,
    type SpriteAngle,
    type SpriteExpression,
    type SpriteRasterPath,
} from './sprite-performance-contract';

export type SpriteBatchAssetStatus =
    | 'approved-runtime-neutral'
    | 'approved-neutral-with-unapproved-expression-candidates'
    | 'approved-performance-trio-with-unapproved-legacy-expression-candidates'
    | 'approved-glasses-primary-trio-with-compatible-and-review-legacy'
    | 'approved-glasses-primary-performance-family'
    | 'unapproved-neutral-candidate'
    | 'unapproved-performance-candidates'
    | 'rejected-only-removed'
    | 'missing';

export type SpriteReferenceKind =
    | 'character-dossier'
    | 'class-photo-set'
    | 'dedicated-likeness-reference'
    | 'owner-written-brief'
    | 'private-reference-ledger'
    | 'approved-sprite'
    | 'asset-ledger'
    | 'cast-registry'
    | 'private-likeness-reference'
    | 'textbook-character-brief';

export interface SpriteSourceReference {
    readonly id: string;
    readonly kind: SpriteReferenceKind;
    readonly locator: string;
    readonly use: 'likeness' | 'likeness-only' | 'style' | 'status-evidence' | 'written-identity-only';
    readonly gate: 'approved' | 'owner-match-required' | 'owner-confirmation-required' | 'reference-only' | 'review-preview-only';
}

export interface SpriteGenerationPriority {
    readonly tier: 0 | 1 | 2 | 3;
    readonly rank: number;
    readonly rationale: string;
    readonly blockedBy: readonly string[];
}

export type SpriteCoverageSlotId = `${AcademyCastMemberId}.${SpriteAngle}.${SpriteExpression}.v${number}`;
export type SpriteCoverageSlotReadiness =
    | 'ready-from-approved-likeness-reference'
    | 'approved-and-bound'
    | 'blocked-pending-approved-neutral';
export type SpriteCoverageRuntimeHome = `${
    'dialogue' | 'journal' | 'lesson-feedback' | 'scene' | 'unlock'
}:${string}`;

export interface SpriteCoverageBatchSlot {
    readonly slotId: SpriteCoverageSlotId;
    readonly castId: AcademyCastMemberId;
    readonly angle: SpriteAngle;
    readonly expression: SpriteExpression;
    readonly readiness: SpriteCoverageSlotReadiness;
    readonly likenessReferenceIds: readonly string[];
    readonly constraintReferenceIds: readonly string[];
    readonly generationBrief: string;
    readonly plannedAssetPath: SpriteRasterPath;
    readonly intendedRuntimeHomes: readonly [SpriteCoverageRuntimeHome, ...SpriteCoverageRuntimeHome[]];
    readonly blockedBy: readonly string[];
}

export interface SpriteCoverageBatch {
    readonly batchId: 'academy-sprite-coverage-2026-07-b01';
    readonly status: 'partially-delivered-with-held-likeness-slots';
    readonly generatedAssetStatus: 'review-candidate-only';
    readonly runtimeRegistrationGate: 'owner-likeness-and-equal-stage-cast-approval';
    readonly outputStandard: {
        readonly width: 1536;
        readonly height: 2048;
        readonly format: 'transparent-rgba';
        readonly workflow: 'flat-chroma-then-alpha';
        readonly crop: 'head-through-upper-thigh-half-body';
    };
    readonly slots: readonly SpriteCoverageBatchSlot[];
}

export interface SpriteBatchCharacter {
    readonly id: AcademyCastMemberId;
    readonly firstName: string;
    readonly category: CastCategory;
    readonly basePose: string;
    readonly angles: readonly SpriteAngle[];
    readonly expressionSet: readonly SpriteExpression[];
    readonly outfitConstraints: readonly string[];
    readonly propConstraints: readonly string[];
    readonly sourceReferences: readonly SpriteSourceReference[];
    readonly currentAsset: {
        readonly status: SpriteBatchAssetStatus;
        readonly paths: readonly string[];
        readonly note: string;
    };
    readonly generationPriority: SpriteGenerationPriority;
}

export interface SpriteBatchManifest {
    readonly schemaVersion: 2;
    readonly manifestId: 'academy-current-cast-sprite-batch';
    readonly approvalPolicy: {
        readonly generationDoesNotApprove: true;
        readonly bindOnlyApprovedAssets: true;
        readonly rejectedAssetsAreNeverReferences: true;
        readonly xingyuRejectedLikenessPolicy: 'do-not-bind-do-not-reference-regenerate-from-verified-owner-match';
    };
    readonly requiredAngles: readonly SpriteAngle[];
    readonly requiredExpressions: readonly SpriteExpression[];
    readonly characters: readonly SpriteBatchCharacter[];
    readonly nextCoverageBatch: SpriteCoverageBatch;
}

export interface SpriteBatchManifestIssue {
    readonly code:
        | 'schema'
        | 'cast-coverage'
        | 'cast-identity'
        | 'angle-coverage'
        | 'expression-coverage'
        | 'duplicate-base-pose'
        | 'missing-constraints'
        | 'missing-source-reference'
        | 'invalid-priority'
        | 'unsafe-xingyu-reference'
        | 'batch-schema'
        | 'batch-slot-identity'
        | 'batch-slot-coverage'
        | 'batch-reference-gate'
        | 'batch-output'
        | 'batch-runtime-home'
        | 'batch-duplicate';
    readonly message: string;
}

export const ACADEMY_SPRITE_BATCH_MANIFEST = manifestData as unknown as SpriteBatchManifest;

function sameOrderedValues<T>(actual: readonly T[], expected: readonly T[]): boolean {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateSpriteBatchManifest(manifest: SpriteBatchManifest): readonly SpriteBatchManifestIssue[] {
    const issues: SpriteBatchManifestIssue[] = [];
    if (manifest.schemaVersion !== 2 || manifest.manifestId !== 'academy-current-cast-sprite-batch') {
        issues.push({ code: 'schema', message: 'Sprite batch manifest schema identity is invalid.' });
    }
    if (!sameOrderedValues(manifest.requiredAngles, SPRITE_ANGLES)
        || !sameOrderedValues(manifest.requiredExpressions, SPRITE_EXPRESSIONS)) {
        issues.push({ code: 'schema', message: 'Manifest requirements must match the sprite performance contract.' });
    }

    const expectedIds = ACADEMY_CAST.map(member => member.id);
    const actualIds = manifest.characters.map(member => member.id);
    if (!sameOrderedValues(actualIds, expectedIds) || new Set(actualIds).size !== expectedIds.length) {
        issues.push({ code: 'cast-coverage', message: 'Manifest must cover the canonical Academy cast exactly once and in registry order.' });
    }

    const castById = new Map(ACADEMY_CAST.map(member => [member.id, member]));
    const poseOwners = new Map<string, string>();
    const priorityRanks = new Set<number>();
    for (const character of manifest.characters) {
        const castMember = castById.get(character.id);
        const preferredName = castMember && 'preferredName' in castMember ? castMember.preferredName : undefined;
        const allowedNames = castMember ? [castMember.firstName, preferredName].filter(Boolean) : [];
        if (!castMember || !allowedNames.includes(character.firstName) || castMember.category !== character.category) {
            issues.push({ code: 'cast-identity', message: `${character.id} does not match the canonical cast registry.` });
        }
        if (!sameOrderedValues(character.angles, SPRITE_ANGLES)) {
            issues.push({ code: 'angle-coverage', message: `${character.id} must carry every required angle in contract order.` });
        }
        if (!sameOrderedValues(character.expressionSet, SPRITE_EXPRESSIONS)) {
            issues.push({ code: 'expression-coverage', message: `${character.id} must carry the complete performance expression set.` });
        }

        const normalizedPose = character.basePose.trim().toLocaleLowerCase();
        const poseOwner = poseOwners.get(normalizedPose);
        if (!normalizedPose || poseOwner) {
            issues.push({
                code: 'duplicate-base-pose',
                message: poseOwner
                    ? `${character.id} duplicates ${poseOwner}'s base pose.`
                    : `${character.id} has no base pose.`,
            });
        } else {
            poseOwners.set(normalizedPose, character.id);
        }
        if (!character.outfitConstraints.length || !character.propConstraints.length) {
            issues.push({ code: 'missing-constraints', message: `${character.id} needs outfit and prop constraints.` });
        }
        if (!character.sourceReferences.length) {
            issues.push({ code: 'missing-source-reference', message: `${character.id} needs at least one traceable source reference.` });
        }
        if (priorityRanks.has(character.generationPriority.rank)) {
            issues.push({ code: 'invalid-priority', message: `Generation rank ${character.generationPriority.rank} is duplicated.` });
        }
        priorityRanks.add(character.generationPriority.rank);
    }

    const xingyu = manifest.characters.find(character => character.id === 'xingyu');
    const serializedXingyuReferences = JSON.stringify(xingyu?.sourceReferences ?? []);
    if (!xingyu
        || xingyu.currentAsset.status !== 'rejected-only-removed'
        || xingyu.currentAsset.paths.length !== 0
        || manifest.approvalPolicy.xingyuRejectedLikenessPolicy !== 'do-not-bind-do-not-reference-regenerate-from-verified-owner-match'
        || /xingyu__neutral|xingyu-neutral-halfbody|generated_images/i.test(serializedXingyuReferences)) {
        issues.push({ code: 'unsafe-xingyu-reference', message: 'Xingyu must exclude the rejected likeness from assets and generation references.' });
    }

    validateNextCoverageBatch(manifest, issues);
    return issues;
}

function validateNextCoverageBatch(
    manifest: SpriteBatchManifest,
    issues: SpriteBatchManifestIssue[],
): void {
    const batch = manifest.nextCoverageBatch;
    if (batch.batchId !== 'academy-sprite-coverage-2026-07-b01'
        || batch.status !== 'partially-delivered-with-held-likeness-slots'
        || batch.generatedAssetStatus !== 'review-candidate-only'
        || batch.runtimeRegistrationGate !== 'owner-likeness-and-equal-stage-cast-approval') {
        issues.push({ code: 'batch-schema', message: 'Next coverage batch policy identity is invalid.' });
    }
    if (batch.outputStandard.width !== 1536
        || batch.outputStandard.height !== 2048
        || batch.outputStandard.format !== 'transparent-rgba'
        || batch.outputStandard.workflow !== 'flat-chroma-then-alpha'
        || batch.outputStandard.crop !== 'head-through-upper-thigh-half-body') {
        issues.push({ code: 'batch-output', message: 'Next coverage batch must use the locked sprite output standard.' });
    }

    const characters = new Map(manifest.characters.map(character => [character.id, character]));
    const slotIds = new Set<string>();
    const outputPaths = new Set<string>();
    const currentPaths = new Set(manifest.characters.flatMap(character => character.currentAsset.paths));
    const slotsByCast = new Map<AcademyCastMemberId, SpriteCoverageBatchSlot[]>();
    for (const slot of batch.slots) {
        const character = characters.get(slot.castId);
        if (!character
            || slot.slotId !== `${slot.castId}.${slot.angle}.${slot.expression}.v1`
            || !SPRITE_ANGLES.includes(slot.angle)
            || !SPRITE_EXPRESSIONS.includes(slot.expression)) {
            issues.push({ code: 'batch-slot-identity', message: `${slot.slotId} has an invalid cast, angle, expression, or version identity.` });
        }
        if (slotIds.has(slot.slotId) || outputPaths.has(slot.plannedAssetPath)) {
            issues.push({ code: 'batch-duplicate', message: `${slot.slotId} duplicates a slot ID or planned output path.` });
        }
        slotIds.add(slot.slotId);
        outputPaths.add(slot.plannedAssetPath);

        const expectedBase = `/academy/art/characters/${slot.castId}/${slot.castId}__${slot.expression}`;
        const expectedPathPrefixes = [`${expectedBase}__${slot.angle}__halfbody__`, `${expectedBase}-glasses__${slot.angle}__halfbody__`];
        const outputIsCurrent = currentPaths.has(slot.plannedAssetPath);
        if (!expectedPathPrefixes.some(prefix => slot.plannedAssetPath.startsWith(prefix))
            || !slot.plannedAssetPath.endsWith('.png')
            || (slot.readiness === 'approved-and-bound' ? !outputIsCurrent : outputIsCurrent)
            || slot.generationBrief.trim().length < 500
            || !/transparent RGBA/i.test(slot.generationBrief)) {
            issues.push({ code: 'batch-output', message: `${slot.slotId} has an invalid brief or planned output path.` });
        }
        if (!slot.intendedRuntimeHomes.length
            || slot.intendedRuntimeHomes.some(home => !/^(dialogue|journal|lesson-feedback|scene|unlock):[^:]+$/.test(home))) {
            issues.push({ code: 'batch-runtime-home', message: `${slot.slotId} needs at least one valid intended runtime home.` });
        }

        const referencesById = new Map(character?.sourceReferences.map(reference => [reference.id, reference]) ?? []);
        const approvedLikenessReferences = slot.likenessReferenceIds.map(id => referencesById.get(id));
        const constraintReferences = slot.constraintReferenceIds.map(id => referencesById.get(id));
        const constraintsAreApprovedWrittenIdentity = constraintReferences.every(reference =>
            reference?.use === 'written-identity-only' && reference.gate === 'approved');
        if (slot.readiness === 'ready-from-approved-likeness-reference' || slot.readiness === 'approved-and-bound') {
            if (!approvedLikenessReferences.length
                || approvedLikenessReferences.some(reference => reference?.use !== 'likeness' || reference.gate !== 'approved')
                || slot.blockedBy.length) {
                issues.push({ code: 'batch-reference-gate', message: `${slot.slotId} is ready without exclusively approved likeness references.` });
            }
        } else if (slot.readiness === 'blocked-pending-approved-neutral') {
            if (slot.likenessReferenceIds.length || !slot.blockedBy.length) {
                issues.push({ code: 'batch-reference-gate', message: `${slot.slotId} must remain held without likeness inputs until a neutral is approved.` });
            }
        } else {
            issues.push({ code: 'batch-schema', message: `${slot.slotId} has an invalid readiness state.` });
        }
        if (!constraintsAreApprovedWrittenIdentity) {
            issues.push({ code: 'batch-reference-gate', message: `${slot.slotId} has a constraint reference that is not approved written identity.` });
        }
        slotsByCast.set(slot.castId, [...(slotsByCast.get(slot.castId) ?? []), slot]);
    }

    const requiredBatchCast = ['rie', 'peter', 'felix'] as const;
    if (batch.slots.length !== requiredBatchCast.length * SPRITE_ANGLES.length
        || [...slotsByCast.keys()].some(castId => !requiredBatchCast.includes(castId as typeof requiredBatchCast[number]))) {
        issues.push({ code: 'batch-slot-coverage', message: 'Next coverage batch must contain only three slots each for Rie, Peter, and Felix.' });
    }
    for (const castId of requiredBatchCast) {
        const slots = slotsByCast.get(castId) ?? [];
        if (slots.length !== SPRITE_ANGLES.length
            || !sameOrderedValues(slots.map(slot => slot.angle), SPRITE_ANGLES)
            || new Set(slots.map(slot => slot.expression)).size !== slots.length) {
            issues.push({ code: 'batch-slot-coverage', message: `${castId} needs all three angles with three distinct expressions in contract order.` });
        }
    }
}

export function assertValidSpriteBatchManifest(manifest: SpriteBatchManifest = ACADEMY_SPRITE_BATCH_MANIFEST): void {
    const issues = validateSpriteBatchManifest(manifest);
    if (issues.length) throw new TypeError(issues.map(issue => issue.message).join(' '));
}
