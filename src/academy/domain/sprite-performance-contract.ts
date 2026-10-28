import {
    ACADEMY_RUNTIME_ASSET_REGISTRY,
    type AcademyRuntimeAssetId,
    type AcademyRuntimeAssetRecord,
} from '../assets';
import { ACADEMY_CAST, type AcademyCastMemberId } from './cast-registry';
import { REQUIRED_CAST_PERFORMANCES } from './cast-identity-locks';
import { ACADEMY_CAST_STANDARDIZATION_MANIFEST } from './cast-standardization-manifest';

export const SPRITE_ANGLES = ['left-three-quarter', 'front-near-front', 'right-three-quarter'] as const;
export type SpriteAngle = typeof SPRITE_ANGLES[number];

export const SPRITE_EXPRESSIONS = REQUIRED_CAST_PERFORMANCES;
export type SpriteExpression = typeof SPRITE_EXPRESSIONS[number];
export type SpriteRasterPath = `/academy/art/characters/${string}`;

export type SpriteAssetCoverage =
    | Readonly<{
        status: 'approved';
        assetPath: SpriteRasterPath;
        approvedAssetId: AcademyRuntimeAssetId;
    }>
    | Readonly<{
        status: 'review-candidate';
        assetPath: SpriteRasterPath;
    }>
    | Readonly<{
        status: 'missing';
    }>;

export type AcademySpriteCastMemberId = AcademyCastMemberId;

export interface SpritePoseContract {
    readonly angle: SpriteAngle;
    readonly silhouette: string;
    readonly expressions: Readonly<Record<SpriteExpression, SpriteAssetCoverage>>;
}

export interface UnmappedSpriteRaster {
    readonly label: string;
    readonly status: 'approved' | 'review-candidate';
    readonly assetPath: SpriteRasterPath;
    readonly approvedAssetId?: AcademyRuntimeAssetId;
    readonly note: string;
}

export interface SpriteCoverageCounts {
    readonly approved: number;
    readonly reviewCandidates: number;
    readonly missing: number;
}

export interface CastSpritePerformanceContract {
    readonly castId: AcademySpriteCastMemberId;
    readonly likenessBrief?: string;
    readonly referencePolicy?: 'owner-rejected-old-image-do-not-reference';
    readonly poses: readonly SpritePoseContract[];
    readonly unmappedRasters: readonly UnmappedSpriteRaster[];
    readonly coverage: SpriteCoverageCounts;
}

export interface SpritePerformanceValidationIssue {
    readonly code:
        | 'cast-coverage'
        | 'angle-coverage'
        | 'expression-coverage'
        | 'duplicate-silhouette'
        | 'asset-evidence'
        | 'coverage-summary';
    readonly message: string;
}

const SILHOUETTES = {
    rie: ['open lesson-book held low', 'one hand calmly marking the board', 'both palms offering a patient explanation'],
    henry: ['shoulder dipped over a pocket notebook', 'upright with pencil paused at chin', 'notebook extended to compare answers'],
    aakash: ['map tucked under arm with an outward point', 'raincoat open and hands ready to explain', 'umbrella resting over one shoulder'],
    alex: ['loose lean with flashcard fan at hip', 'square stance presenting one selected card', 'half-turn gathering scattered cards'],
    tom: ['elbows tucked around a steaming mug', 'relaxed stance with mug held at chest', 'one-handed wave while balancing the mug'],
    sam: ['satchel strap gripped in a forward lean', 'feet planted with satchel behind one heel', 'looking back while pulling the satchel close'],
    francis: ['music folder opened toward the class', 'conductor-like hand raised at sternum', 'folder closed beneath an emphatic arm'],
    shin: ['tablet angled outward beneath a bent wrist', 'compact posture with stylus held upright', 'stylus tracing a broad arc beside the tablet'],
    jodi: ['camera lowered after catching a moment', 'camera strap framed by hands at waist', 'camera lifted as the body pivots away'],
    christian: ['sleeves rolled with one forearm braced', 'broad steady stance holding a workbook', 'workbook tucked away under a raised elbow'],
    jenny: ['index cards hugged against one shoulder', 'careful centered stack held in both hands', 'cards spread into a quick playful fan'],
    robert: ['chair-back lean with folded worksheet', 'long upright line with worksheet at side', 'weight shifted while smoothing the worksheet'],
    mika: ['soft crouch beside a misplaced clue', 'hands loosely linked in attentive stillness', 'small step forward offering the found clue'],
    sophie: ['scarf tail swept behind a pointing hand', 'balanced stance pinning a note to the scarf', 'scarf gathered close during a thoughtful turn'],
    xingyu: ['headphones held away from one ear', 'headphones resting at collar with tapping fingers', 'rhythm marked by one lifted hand'],
    angel: ['poster tube angled across the body', 'poster unfurled in a clean vertical line', 'poster tube raised like a comic telescope'],
    stasi: ['garden gloves clasped behind the back', 'watering can hanging beside a straight posture', 'watering can tipped toward an unseen planter'],
    ruparna: ['recipe notebook balanced on one palm', 'apron-front stance with pencil poised', 'spice tin lifted beside the recipe notebook'],
    rose: ['flower press hugged beneath one elbow', 'pressed leaf displayed between careful fingers', 'flower press opened into a wide layered shape'],
    peter: ['question cards fanned beneath a thoughtful lean', 'about-26 profile upright with one question card raised', 'light-haired head turn with cards tucked under arm'],
    felix: ['curly-haired lean following a paper cat trail', 'glasses adjusted above a paper cat held at chest', 'longer curls outlined over a crouched cat-counting pose'],
    shaun: ['jacket hooked from two fingers at the side', 'quiet stance with hands resting in jacket pockets', 'jacket swung over one shoulder in departure'],
    tom2: ['notebook half-open beside a guarded turn', 'open notebook balanced beneath an inviting palm', 'black notebook held low in a reserved three-quarter stance'],
    steve: ['practice card squared beside a focused phone check', 'smartphone and blank kana card held in a steady learning stance', 'phone lowered beneath an easy family-chat thumbs-up'],
    nanako: ['sketchbook opened across a low angled arm', 'pencil and sketchbook aligned at midline', 'sketchbook turned outward to reveal a draft'],
    mira: ['library book nested against a curved forearm', 'still reading posture with book held open', 'bookmark lifted while the book closes'],
    miller: ['appointment book held vertically at one hip', 'crisp centered stance with the book closed', 'appointment book opened beneath a measured pointing hand'],
    tawapon: ['satchel strap held beside a raised volunteer hand', 'bright centered stance with the satchel at one side', 'half-turn offering the satchel forward'],
    mary: ['travel diary tucked beneath one elbow', 'open stance with the diary held at midline', 'one heel lifted while the diary opens outward'],
    takeshi: ['folded timetable raised beside a forward lean', 'competitive centered stance with the timetable lowered', 'timetable extended from a slight side turn'],
} as const satisfies Record<AcademySpriteCastMemberId, readonly [string, string, string]>;

type RasterBackedCoverage = Exclude<SpriteAssetCoverage, { readonly status: 'missing' }>;

type RasterCoverageMap = Partial<Record<
    AcademySpriteCastMemberId,
    Partial<Record<SpriteAngle, Partial<Record<SpriteExpression, RasterBackedCoverage>>>>
>>;

const RASTER_COVERAGE: RasterCoverageMap = {};
const UNMAPPED_RASTERS: Partial<Record<AcademySpriteCastMemberId, UnmappedSpriteRaster[]>> = {};

for (const slot of ACADEMY_CAST_STANDARDIZATION_MANIFEST) {
    if (!isSpriteExpression(slot.expression) || !isSpriteAngle(slot.angle)) {
        const extras = UNMAPPED_RASTERS[slot.castId] ??= [];
        extras.push({
            label: `${slot.expression}:${slot.angle}`,
            status: slot.status === 'approved' ? 'approved' : 'review-candidate',
            assetPath: slot.assetPath as SpriteRasterPath,
            ...(slot.status === 'approved'
                ? { approvedAssetId: slot.assetId as AcademyRuntimeAssetId }
                : {}),
            note: 'Useful expression outside the seven core production performances.',
        });
        continue;
    }
    const expression = slot.expression;
    const angle = slot.angle;
    const castCoverage = RASTER_COVERAGE[slot.castId] ??= {};
    const angleCoverage = castCoverage[angle] ??= {};
    if (angleCoverage[expression]) {
        const extras = UNMAPPED_RASTERS[slot.castId] ??= [];
        extras.push({
            label: `${slot.expression}:${slot.angle}:alternate`,
            status: slot.status === 'approved' ? 'approved' : 'review-candidate',
            assetPath: slot.assetPath as SpriteRasterPath,
            ...(slot.status === 'approved'
                ? { approvedAssetId: slot.assetId as AcademyRuntimeAssetId }
                : {}),
            note: 'Alternate raster retained outside the one-image-per-performance matrix.',
        });
        continue;
    }
    angleCoverage[expression] = slot.status === 'approved'
        ? {
            status: 'approved',
            assetPath: slot.assetPath as SpriteRasterPath,
            approvedAssetId: slot.assetId as AcademyRuntimeAssetId,
        }
        : {
            status: 'review-candidate',
            assetPath: slot.assetPath as SpriteRasterPath,
        };
}

function isSpriteExpression(value: string): value is SpriteExpression {
    return (SPRITE_EXPRESSIONS as readonly string[]).includes(value);
}

function isSpriteAngle(value: string): value is SpriteAngle {
    return (SPRITE_ANGLES as readonly string[]).includes(value);
}

function expressionCoverage(
    castId: AcademySpriteCastMemberId,
    angle: SpriteAngle,
): Record<SpriteExpression, SpriteAssetCoverage> {
    const rasters = RASTER_COVERAGE[castId]?.[angle] ?? {};
    return Object.fromEntries(SPRITE_EXPRESSIONS.map(expression => [
        expression,
        rasters[expression] ?? { status: 'missing' },
    ])) as Record<SpriteExpression, SpriteAssetCoverage>;
}

function missingExpressionCoverage(): Record<SpriteExpression, SpriteAssetCoverage> {
    return Object.fromEntries(
        SPRITE_EXPRESSIONS.map(expression => [expression, { status: 'missing' }]),
    ) as Record<SpriteExpression, SpriteAssetCoverage>;
}

function summarizeCoverage(poses: readonly SpritePoseContract[]): SpriteCoverageCounts {
    const statuses = poses.flatMap(pose => Object.values(pose.expressions).map(expression => expression.status));
    return {
        approved: statuses.filter(status => status === 'approved').length,
        reviewCandidates: statuses.filter(status => status === 'review-candidate').length,
        missing: statuses.filter(status => status === 'missing').length,
    };
}

function contractFor(castId: AcademySpriteCastMemberId): CastSpritePerformanceContract {
    const poses = SPRITE_ANGLES.map((angle, index) => ({
        angle,
        silhouette: SILHOUETTES[castId][index],
        expressions: RASTER_COVERAGE[castId]?.[angle]
            ? expressionCoverage(castId, angle)
            : missingExpressionCoverage(),
    }));
    const coverage = summarizeCoverage(poses);
    const unmappedRasters = UNMAPPED_RASTERS[castId] ?? [];

    if (castId === 'peter') {
        return { castId, likenessBrief: 'About 26, with lighter remaining hair.', poses, unmappedRasters, coverage };
    }
    if (castId === 'felix') {
        return {
            castId,
            likenessBrief: 'White, glasses, longer curly dark-blond to light-brown hair; likes cats.',
            poses,
            unmappedRasters,
            coverage,
        };
    }
    if (castId === 'xingyu') {
        return { castId, referencePolicy: 'owner-rejected-old-image-do-not-reference', poses, unmappedRasters, coverage };
    }
    return { castId, poses, unmappedRasters, coverage };
}

export const ACADEMY_SPRITE_PERFORMANCE_CONTRACT = Object.fromEntries(
    ACADEMY_CAST.map(member => [member.id, contractFor(member.id as AcademySpriteCastMemberId)]),
) as Readonly<Record<AcademySpriteCastMemberId, CastSpritePerformanceContract>>;

export const ACADEMY_SPRITE_COVERAGE_SUMMARY = Object.freeze(
    Object.values(ACADEMY_SPRITE_PERFORMANCE_CONTRACT).reduce<SpriteCoverageCounts>((total, member) => ({
        approved: total.approved + member.coverage.approved,
        reviewCandidates: total.reviewCandidates + member.coverage.reviewCandidates,
        missing: total.missing + member.coverage.missing,
    }), { approved: 0, reviewCandidates: 0, missing: 0 }),
);

function registrationHasPath(registration: AcademyRuntimeAssetRecord, assetPath: string): boolean {
    return Object.values(registration.files).some(candidate => candidate === assetPath);
}

export function validateSpritePerformanceContract(
    contract: Readonly<Record<string, CastSpritePerformanceContract>>,
): readonly SpritePerformanceValidationIssue[] {
    const issues: SpritePerformanceValidationIssue[] = [];
    const expectedIds = new Set(ACADEMY_CAST.map(member => member.id));
    const actualIds = new Set(Object.keys(contract));

    if (expectedIds.size !== actualIds.size || [...expectedIds].some(id => !actualIds.has(id))) {
        issues.push({ code: 'cast-coverage', message: 'Contract must cover every Academy cast member exactly once.' });
    }

    const silhouetteOwners = new Map<string, string>();
    for (const [castId, member] of Object.entries(contract)) {
        const angles = new Set(member.poses.map(pose => pose.angle));
        if (SPRITE_ANGLES.some(angle => !angles.has(angle)) || angles.size !== SPRITE_ANGLES.length) {
            issues.push({ code: 'angle-coverage', message: `${castId} must have exactly one pose for every required angle.` });
        }

        for (const pose of member.poses) {
            if (Object.keys(pose.expressions).length !== SPRITE_EXPRESSIONS.length
                || SPRITE_EXPRESSIONS.some(expression => !(expression in pose.expressions))) {
                issues.push({ code: 'expression-coverage', message: `${castId}/${pose.angle} is missing a required expression status.` });
            }
            for (const [expression, evidence] of Object.entries(pose.expressions)) {
                if (evidence.status === 'missing') continue;
                if (!evidence.assetPath.startsWith('/academy/art/characters/')) {
                    issues.push({ code: 'asset-evidence', message: `${castId}/${pose.angle}/${expression} has an invalid raster path.` });
                    continue;
                }
                if (evidence.status === 'approved') {
                    const registration = ACADEMY_RUNTIME_ASSET_REGISTRY[evidence.approvedAssetId];
                    if (registration.status !== 'approved' || !registrationHasPath(registration, evidence.assetPath)) {
                        issues.push({ code: 'asset-evidence', message: `${castId}/${pose.angle}/${expression} is not backed by its approved runtime registration.` });
                    }
                } else {
                    const approvedRegistration = Object.values(ACADEMY_RUNTIME_ASSET_REGISTRY).find(registration =>
                        registration.status === 'approved' && registrationHasPath(registration, evidence.assetPath));
                    if (approvedRegistration) {
                        issues.push({ code: 'asset-evidence', message: `${castId}/${pose.angle}/${expression} understates an approved raster as review-only.` });
                    }
                }
            }
            const normalized = pose.silhouette.trim().toLocaleLowerCase();
            const owner = silhouetteOwners.get(normalized);
            if (owner) {
                issues.push({ code: 'duplicate-silhouette', message: `${castId}/${pose.angle} duplicates silhouette ${owner}.` });
            } else {
                silhouetteOwners.set(normalized, `${castId}/${pose.angle}`);
            }
        }
        const actualCoverage = summarizeCoverage(member.poses);
        if (JSON.stringify(actualCoverage) !== JSON.stringify(member.coverage)) {
            issues.push({ code: 'coverage-summary', message: `${castId} coverage counts do not match its expression cells.` });
        }
        for (const raster of member.unmappedRasters) {
            if (raster.status !== 'approved') continue;
            const registration = raster.approvedAssetId
                ? ACADEMY_RUNTIME_ASSET_REGISTRY[raster.approvedAssetId]
                : undefined;
            if (!registration || registration.status !== 'approved'
                || !registrationHasPath(registration, raster.assetPath)) {
                issues.push({
                    code: 'asset-evidence',
                    message: `${castId}/${raster.label} extra raster is not backed by its approved runtime registration.`,
                });
            }
        }
    }
    return issues;
}
