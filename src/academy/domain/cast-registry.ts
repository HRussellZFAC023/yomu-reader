export type CastCategory = 'teacher' | 'classmate' | 'extended-member' | 'textbook-legend';
export type VisualEvidenceStatus =
    | 'approved'
    | 'candidate-needs-owner'
    | 'reference-confirmed-neutral-pending'
    | 'missing';

export interface CastEligibility {
    readonly story: boolean;
    readonly lessons: boolean;
    readonly likenessRuntime: boolean;
}

export interface AcademyCastMember {
    readonly id: string;
    readonly firstName: string;
    readonly category: CastCategory;
    readonly visualEvidence: VisualEvidenceStatus;
    readonly eligibility: CastEligibility;
    readonly teacherSalutation?: Readonly<{ en: 'Rie-sensei'; ja: 'りえ先生' }>;
}

const ELIGIBLE_WITH_PENDING_LIKENESS = {
    story: true,
    lessons: true,
    likenessRuntime: false,
} as const;

const REAL_CLASS_NAMES = [
    ['henry', 'Henry'],
    ['aakash', 'Aakash'],
    ['alex', 'Alex'],
    ['tom', 'Tom'],
    ['sam', 'Sam'],
    ['francis', 'Francis'],
    ['shin', 'Shin'],
    ['jodi', 'Jodi'],
    ['christian', 'Christian'],
    ['jenny', 'Jenny'],
    ['robert', 'Robert'],
    ['mika', 'Mika'],
    ['sophie', 'Sophie'],
    ['xingyu', 'Xingyu'],
    ['angel', 'Angel'],
    ['stasi', 'Stasi'],
    ['ruparna', 'Ruparna'],
    ['rose', 'Rose'],
    ['peter', 'Peter'],
] as const;

const REAL_CLASS_MEMBERS = REAL_CLASS_NAMES.map(([id, firstName]) => ({
    id,
    firstName,
    category: 'classmate' as const,
    visualEvidence: 'candidate-needs-owner' as const,
    eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
}));

/**
 * Canonical first-name-only Academy cast.
 *
 * Identity and lesson eligibility are independent from likeness approval. Callers
 * must check `eligibility.likenessRuntime` before rendering a named portrait.
 */
export const ACADEMY_CAST = [
    {
        id: 'rie',
        firstName: 'Rie',
        category: 'teacher',
        visualEvidence: 'approved',
        eligibility: { story: true, lessons: true, likenessRuntime: true },
        teacherSalutation: { en: 'Rie-sensei', ja: 'りえ先生' },
    },
    ...REAL_CLASS_MEMBERS,
    {
        id: 'nanako',
        firstName: 'Nanako',
        category: 'extended-member',
        visualEvidence: 'candidate-needs-owner',
        eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
    },
    {
        id: 'mira',
        firstName: 'Mira',
        category: 'extended-member',
        visualEvidence: 'reference-confirmed-neutral-pending',
        eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
    },
    {
        id: 'miller',
        firstName: 'Miller',
        category: 'textbook-legend',
        visualEvidence: 'missing',
        eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
    },
    {
        id: 'tawapon',
        firstName: 'Tawapon',
        category: 'textbook-legend',
        visualEvidence: 'missing',
        eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
    },
    {
        id: 'mary',
        firstName: 'Mary',
        category: 'textbook-legend',
        visualEvidence: 'missing',
        eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
    },
    {
        id: 'takeshi',
        firstName: 'Takeshi',
        category: 'textbook-legend',
        visualEvidence: 'missing',
        eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
    },
] as const satisfies readonly AcademyCastMember[];

export type AcademyCastMemberId = typeof ACADEMY_CAST[number]['id'];

const CAST_BY_ID: ReadonlyMap<string, AcademyCastMember> = new Map(
    ACADEMY_CAST.map(member => [member.id, member]),
);

export function isAcademyCastMemberId(id: string): id is AcademyCastMemberId {
    return CAST_BY_ID.has(id);
}

export function getAcademyCastMember(id: string): AcademyCastMember {
    const member = CAST_BY_ID.get(id);
    if (!member) throw new TypeError(`Unknown Academy cast id: ${id}.`);
    return member;
}

export function validateAcademyCastReference(reference: Readonly<{ id: string; firstName: string }>): AcademyCastMember {
    const member = getAcademyCastMember(reference.id);
    if (reference.firstName !== member.firstName) {
        throw new TypeError(`Academy cast name mismatch for ${reference.id}: expected ${member.firstName}.`);
    }
    return member;
}
