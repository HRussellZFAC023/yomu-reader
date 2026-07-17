import {
    ACADEMY_RUNTIME_ASSET_REGISTRY,
    type AcademyRuntimeAssetId,
    type AcademyRuntimeAssetRecord,
} from '../assets';
import { ACADEMY_CAST, type AcademyCastMemberId } from './cast-registry';

export const SPRITE_ANGLES = ['left-three-quarter', 'front-near-front', 'right-three-quarter'] as const;
export type SpriteAngle = typeof SPRITE_ANGLES[number];

export const SPRITE_EXPRESSIONS = [
    'neutral',
    'happy',
    'encouraging-listening',
    'surprised-shocked',
    'sad-vulnerable',
    'determined',
    'comedic',
] as const;
export type SpriteExpression = typeof SPRITE_EXPRESSIONS[number];
export type SpriteAssetStatus = 'approved' | 'review-candidate' | 'missing';
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
    readonly status: 'review-candidate';
    readonly assetPath: SpriteRasterPath;
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
    steve: ['phone held close while reading a family message', 'relaxed older posture with phone and pocket notebook', 'glasses lowered as he offers a careful reply'],
    tom2: ['tall half-turn with one hand in a coat pocket', 'quiet centered stance holding a closed notebook', 'shoulder angled away while a small clue card is revealed'],
    felix: ['curly-haired lean following a paper cat trail', 'glasses adjusted above a paper cat held at chest', 'longer curls outlined over a crouched cat-counting pose'],
    shaun: ['jacket hooked from two fingers at the side', 'quiet stance with hands resting in jacket pockets', 'jacket swung over one shoulder in departure'],
    nanako: ['sketchbook opened across a low angled arm', 'pencil and sketchbook aligned at midline', 'sketchbook turned outward to reveal a draft'],
    mira: ['library book nested against a curved forearm', 'still reading posture with book held open', 'bookmark lifted while the book closes'],
    miller: ['appointment book held vertically at one hip', 'crisp centered stance with the book closed', 'appointment book opened beneath a measured pointing hand'],
    tawapon: ['satchel strap held beside a raised volunteer hand', 'bright centered stance with the satchel at one side', 'half-turn offering the satchel forward'],
    mary: ['travel diary tucked beneath one elbow', 'open stance with the diary held at midline', 'one heel lifted while the diary opens outward'],
    takeshi: ['folded timetable raised beside a forward lean', 'competitive centered stance with the timetable lowered', 'timetable extended from a slight side turn'],
} as const satisfies Record<AcademySpriteCastMemberId, readonly [string, string, string]>;

type RasterBackedCoverage = Exclude<SpriteAssetCoverage, { readonly status: 'missing' }>;

const RASTER_COVERAGE: Partial<Record<
    AcademySpriteCastMemberId,
    Readonly<Partial<Record<SpriteAngle, Readonly<Partial<Record<SpriteExpression, RasterBackedCoverage>>>>>>
>> = {
    rie: {
        'left-three-quarter': {
            determined: {
                status: 'approved',
                assetPath: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.determined-left'].files.default,
                approvedAssetId: 'character.rie.determined-left',
            },
        },
        'front-near-front': {
            neutral: {
                status: 'approved',
                assetPath: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.neutral'].files.default,
                approvedAssetId: 'character.rie.neutral',
            },
            happy: { status: 'review-candidate', assetPath: '/academy/art/characters/rie/rie__happy__halfbody__v001.png' },
            'encouraging-listening': { status: 'review-candidate', assetPath: '/academy/art/characters/rie/rie__encouraging__halfbody__v001.png' },
            'sad-vulnerable': {
                status: 'approved',
                assetPath: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.sad-vulnerable-front'].files.default,
                approvedAssetId: 'character.rie.sad-vulnerable-front',
            },
        },
        'right-three-quarter': {
            comedic: {
                status: 'approved',
                assetPath: ACADEMY_RUNTIME_ASSET_REGISTRY['character.rie.comedic-right'].files.default,
                approvedAssetId: 'character.rie.comedic-right',
            },
        },
    },
    aakash: { 'front-near-front': {
        neutral: {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/aakash/aakash__neutral__halfbody__v001.png',
        },
    } },
    peter: {
        'left-three-quarter': { neutral: {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/peter/peter__thoughtful__left-three-quarter__halfbody__v001.png',
        } },
        'front-near-front': { neutral: {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/peter/peter__neutral__halfbody__v002.png',
        } },
        'right-three-quarter': { 'encouraging-listening': {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/peter/peter__encouraging__right-three-quarter__halfbody__v001.png',
        } },
    },
    felix: {
        'left-three-quarter': { happy: {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/felix/felix__happy__left-three-quarter__halfbody__v001.png',
        } },
        'front-near-front': { neutral: {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/felix/felix__neutral__halfbody__v001.png',
        } },
        'right-three-quarter': { 'surprised-shocked': {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/felix/felix__surprised__right-three-quarter__halfbody__v001.png',
        } },
    },
    shaun: { 'front-near-front': {
        neutral: {
            status: 'review-candidate',
            assetPath: '/academy/art/characters/shaun/shaun__neutral__halfbody__v001.png',
        },
    } },
    sophie: {
        'left-three-quarter': { determined: {
            status: 'approved',
            assetPath: ACADEMY_RUNTIME_ASSET_REGISTRY['character.sophie.determined-left'].files.default,
            approvedAssetId: 'character.sophie.determined-left',
        } },
        'front-near-front': { 'encouraging-listening': {
            status: 'approved',
            assetPath: ACADEMY_RUNTIME_ASSET_REGISTRY['character.sophie.encouraging-front'].files.default,
            approvedAssetId: 'character.sophie.encouraging-front',
        } },
        'right-three-quarter': { neutral: {
            status: 'approved',
            assetPath: ACADEMY_RUNTIME_ASSET_REGISTRY['character.sophie.neutral-right'].files.default,
            approvedAssetId: 'character.sophie.neutral-right',
        } },
    },
};

const UNMAPPED_RASTERS: Partial<Record<AcademySpriteCastMemberId, readonly UnmappedSpriteRaster[]>> = {
    rie: [
        {
            label: 'repair',
            status: 'review-candidate',
            assetPath: '/academy/art/characters/rie/rie__repair__halfbody__v001.png',
            note: 'Repair is not one of the seven required expression labels and cannot satisfy a coverage cell without review.',
        },
        {
            label: 'thinking',
            status: 'review-candidate',
            assetPath: '/academy/art/characters/rie/rie__thinking__halfbody__v001.png',
            note: 'Thinking is recovered review art outside the required expression vocabulary.',
        },
    ],
};

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
    }
    return issues;
}
