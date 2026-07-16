import {
    getAcademyCastMember,
    type AcademyCastMemberId,
} from './cast-registry';

export type AcademyLearningSpecialty =
    | 'ambiguity'
    | 'art'
    | 'casual-chat'
    | 'casual-speech'
    | 'city-language'
    | 'clarification'
    | 'comparison'
    | 'description'
    | 'directions'
    | 'evidence'
    | 'experience'
    | 'feedback'
    | 'formal-plans'
    | 'games'
    | 'grammar'
    | 'independent-study'
    | 'inference'
    | 'instructions'
    | 'invitations'
    | 'kanji'
    | 'keigo'
    | 'listening'
    | 'lived-memory'
    | 'media'
    | 'menus'
    | 'nature'
    | 'nuance'
    | 'observation'
    | 'offers'
    | 'opinions'
    | 'personal-expression'
    | 'planning'
    | 'pronunciation'
    | 'questions'
    | 'reading'
    | 'register'
    | 'repair'
    | 'restaurants'
    | 'review'
    | 'routines'
    | 'sound'
    | 'speaking-confidence'
    | 'subtitles'
    | 'technology'
    | 'tools'
    | 'travel'
    | 'work-language'
    | 'writing';

/**
 * Learning homes taken from the reviewed cast dossier. This is deliberately
 * about lesson fit, not personality inference or visual identity.
 */
export const ACADEMY_CAST_SPECIALTIES = {
    rie: ['repair', 'register', 'feedback'],
    henry: ['tools', 'independent-study'],
    aakash: ['directions', 'city-language'],
    alex: ['travel', 'experience', 'formal-plans'],
    tom: ['kanji', 'games', 'casual-speech'],
    sam: ['invitations', 'routines'],
    francis: ['media', 'opinions'],
    shin: ['kanji', 'menus', 'nuance'],
    jodi: ['lived-memory', 'comparison'],
    christian: ['routines', 'instructions'],
    jenny: ['offers', 'description', 'work-language'],
    robert: ['restaurants', 'invitations', 'keigo'],
    mika: ['clarification', 'pronunciation', 'speaking-confidence'],
    sophie: ['grammar', 'evidence', 'reading'],
    xingyu: ['sound', 'listening', 'casual-chat'],
    angel: ['planning', 'technology', 'writing'],
    stasi: ['art', 'personal-expression'],
    ruparna: ['subtitles', 'inference', 'ambiguity'],
    rose: ['nature', 'work-language', 'lived-memory'],
    peter: ['review', 'questions', 'observation'],
    felix: ['nature', 'description', 'personal-expression'],
} as const satisfies Partial<Record<AcademyCastMemberId, readonly AcademyLearningSpecialty[]>>;

function specialtiesFor(id: AcademyCastMemberId): readonly AcademyLearningSpecialty[] {
    const specialties: Partial<Record<AcademyCastMemberId, readonly AcademyLearningSpecialty[]>>
        = ACADEMY_CAST_SPECIALTIES;
    return specialties[id] ?? [];
}

export interface AuthoredCastReference {
    readonly id: string;
    /** Include when authored content carries a visible Latin-name label. */
    readonly firstName?: string;
}

export interface AuthoredCastUnit {
    readonly id: string;
    readonly cast: readonly AuthoredCastReference[];
    readonly requiredSpecialties?: readonly AcademyLearningSpecialty[];
}

export type AuthoredCastIssueCode =
    | 'unknown-cast-id'
    | 'cast-name-mismatch'
    | 'cast-not-lesson-eligible'
    | 'cast-specialty-gap'
    | 'cast-variety'
    | 'cast-concentration';

export interface AuthoredCastIssue {
    readonly code: AuthoredCastIssueCode;
    readonly unitId?: string;
    readonly characterId?: string;
    readonly message: string;
}

export interface AuthoredCastPolicy {
    readonly minimumUnitsForRotation: number;
    readonly minimumDistinctPeers: number;
    readonly dominantGroupSize: number;
    readonly maximumDominantAppearanceShare: number;
    readonly maximumIndividualUnitShare: number;
}

const DEFAULT_AUTHORED_CAST_POLICY: AuthoredCastPolicy = Object.freeze({
    minimumUnitsForRotation: 3,
    minimumDistinctPeers: 4,
    dominantGroupSize: 2,
    maximumDominantAppearanceShare: 0.6,
    maximumIndividualUnitShare: 0.67,
});

/**
 * Audits externally-authored lesson metadata before it reaches a scene. Teacher
 * recurrence is expected, so rotation health measures lesson-eligible peers.
 */
export function auditAuthoredCastUsage(
    units: readonly AuthoredCastUnit[],
    policy: AuthoredCastPolicy = DEFAULT_AUTHORED_CAST_POLICY,
): readonly AuthoredCastIssue[] {
    const issues: AuthoredCastIssue[] = [];
    const peerUnits = new Map<string, Set<string>>();

    for (const unit of units) {
        const resolved = new Map<string, ReturnType<typeof getAcademyCastMember>>();
        for (const reference of unit.cast) {
            let member: ReturnType<typeof getAcademyCastMember>;
            try {
                member = getAcademyCastMember(reference.id);
            } catch {
                issues.push({
                    code: 'unknown-cast-id',
                    unitId: unit.id,
                    characterId: reference.id,
                    message: `${unit.id} references unknown Academy cast id ${reference.id}.`,
                });
                continue;
            }
            resolved.set(member.id, member);
            if (reference.firstName !== undefined && reference.firstName !== member.firstName) {
                issues.push({
                    code: 'cast-name-mismatch',
                    unitId: unit.id,
                    characterId: member.id,
                    message: `${unit.id} names ${member.id} as ${reference.firstName}; expected ${member.firstName}.`,
                });
            }
            if (!member.eligibility.lessons) {
                issues.push({
                    code: 'cast-not-lesson-eligible',
                    unitId: unit.id,
                    characterId: member.id,
                    message: `${member.firstName} is not eligible for authored lessons.`,
                });
            }
            if (member.category !== 'teacher') {
                const appearances = peerUnits.get(member.id) ?? new Set<string>();
                appearances.add(unit.id);
                peerUnits.set(member.id, appearances);
            }
        }

        const specialties = new Set(
            [...resolved.keys()].flatMap(id => [...specialtiesFor(id as AcademyCastMemberId)]),
        );
        for (const required of unit.requiredSpecialties ?? []) {
            if (!specialties.has(required)) {
                issues.push({
                    code: 'cast-specialty-gap',
                    unitId: unit.id,
                    message: `${unit.id} has no host with the documented ${required} learning specialty.`,
                });
            }
        }
    }

    if (units.length < policy.minimumUnitsForRotation) return issues;

    const appearances = [...peerUnits.values()].map(unitIds => unitIds.size).sort((left, right) => right - left);
    const totalAppearances = appearances.reduce((total, count) => total + count, 0);
    if (peerUnits.size < policy.minimumDistinctPeers) {
        issues.push({
            code: 'cast-variety',
            message: `${units.length} authored units use only ${peerUnits.size} distinct peers; expected at least ${policy.minimumDistinctPeers}.`,
        });
    }
    if (totalAppearances > 0) {
        const dominantAppearances = appearances
            .slice(0, policy.dominantGroupSize)
            .reduce((total, count) => total + count, 0);
        if (dominantAppearances / totalAppearances > policy.maximumDominantAppearanceShare) {
            issues.push({
                code: 'cast-concentration',
                message: `The most-used ${policy.dominantGroupSize} peers account for too much authored lesson exposure.`,
            });
        }
        const mostUsed = appearances[0] ?? 0;
        if (mostUsed / units.length > policy.maximumIndividualUnitShare) {
            issues.push({
                code: 'cast-concentration',
                message: 'One peer appears in too many authored lesson units.',
            });
        }
    }
    return issues;
}

export function assertHealthyAuthoredCastUsage(
    units: readonly AuthoredCastUnit[],
    policy?: AuthoredCastPolicy,
): void {
    const issues = auditAuthoredCastUsage(units, policy);
    if (issues.length) throw new TypeError(issues.map(issue => issue.message).join(' '));
}
