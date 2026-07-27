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
    readonly preferredName?: string;
    readonly category: CastCategory;
    readonly visualEvidence: VisualEvidenceStatus;
    readonly eligibility: CastEligibility;
    readonly nameEvidence?: 'owner-named';
    readonly teacherSalutation?: Readonly<{ en: 'Rie-sensei'; ja: 'りえ先生' }>;
    readonly visualBrief?: string;
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
    ['angel', 'Onke'],
    ['stasi', 'Stasi'],
    ['ruparna', 'Ruparna'],
    ['rose', 'Rose'],
    ['peter', 'Peter'],
] as const;

const REAL_CLASS_MEMBERS = REAL_CLASS_NAMES.map(([id, firstName]) => {
    const likenessApproved =
        id === 'sophie' ||
        id === 'aakash' ||
        id === 'xingyu' ||
        id === 'mika' ||
        id === 'jenny' ||
        id === 'sam' ||
        id === 'ruparna';
    return {
        id,
        firstName,
        ...(id === 'angel' ? { preferredName: 'Onke' } : {}),
        ...(id === 'sam' ? {
            visualBrief: 'Relaxed athletic White man with a very close-cropped chestnut crew cut and minimal crown or side volume.',
        } : {}),
        category: 'classmate' as const,
        visualEvidence: likenessApproved ? 'approved' as const : 'candidate-needs-owner' as const,
        eligibility: likenessApproved
            ? { story: true, lessons: true, likenessRuntime: true } as const
            : ELIGIBLE_WITH_PENDING_LIKENESS,
    };
});

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
        id: 'felix',
        firstName: 'Felix',
        category: 'classmate',
        visualEvidence: 'candidate-needs-owner',
        eligibility: ELIGIBLE_WITH_PENDING_LIKENESS,
        nameEvidence: 'owner-named',
        visualBrief: 'White; glasses; longer curly dark-blond to light-brown hair; likes cats.',
    },
    {
        id: 'shaun',
        firstName: 'Shaun',
        category: 'classmate',
        visualEvidence: 'reference-confirmed-neutral-pending',
        eligibility: { story: true, lessons: false, likenessRuntime: false },
        nameEvidence: 'owner-named',
    },
    {
        id: 'tom2',
        firstName: 'Tom',
        category: 'classmate',
        visualEvidence: 'reference-confirmed-neutral-pending',
        eligibility: { story: true, lessons: true, likenessRuntime: false },
        nameEvidence: 'owner-named',
        visualBrief: 'Tall; average build; dark-brown hair; reserved and a little mysterious.',
    },
    {
        id: 'steve',
        firstName: 'Steve',
        category: 'classmate',
        visualEvidence: 'approved',
        eligibility: { story: true, lessons: true, likenessRuntime: true },
        nameEvidence: 'owner-named',
        visualBrief: 'Older man; married to a Japanese wife; learning to write naturally in family group chats with his bilingual children.',
    },
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
        visualEvidence: 'approved',
        eligibility: { story: true, lessons: true, likenessRuntime: true },
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

export function displayAcademyCastName(id: string, language: 'en' | 'ja'): string {
    const member = getAcademyCastMember(id);
    if (member.category === 'teacher') return member.teacherSalutation?.[language] ?? member.firstName;
    return `${member.preferredName ?? member.firstName}-san`;
}

export type AcademyCastPortraitUse = 'story-runtime' | 'journal-review-preview';

/**
 * Likeness approval remains a hard story-scene gate. A named journal may show
 * a reference-backed review candidate without making that candidate eligible
 * for dialogue scenes, expressions, or lesson art.
 */
export function canRenderAcademyCastPortrait(id: string, use: AcademyCastPortraitUse): boolean {
    const member = getAcademyCastMember(id);
    if (!member.eligibility.story) return false;
    if (use === 'story-runtime') return member.eligibility.likenessRuntime;
    return member.visualEvidence !== 'missing';
}

export function validateAcademyCastReference(reference: Readonly<{ id: string; firstName: string }>): AcademyCastMember {
    const member = getAcademyCastMember(reference.id);
    if (reference.firstName !== member.firstName) {
        throw new TypeError(`Academy cast name mismatch for ${reference.id}: expected ${member.firstName}.`);
    }
    return member;
}
