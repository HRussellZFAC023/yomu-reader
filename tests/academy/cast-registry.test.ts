import {
    ACADEMY_CAST,
    canRenderAcademyCastPortrait,
    displayAcademyCastName,
    getAcademyCastMember,
    isAcademyCastMemberId,
    validateAcademyCastReference,
} from '../../src/academy/domain/cast-registry';

describe('Academy canonical cast registry', () => {
    it('contains only the named canonical ensemble and retained textbook legends', () => {
        expect(ACADEMY_CAST.map(member => [member.id, member.firstName])).toEqual([
            ['rie', 'Rie'],
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
            ['felix', 'Felix'],
            ['shaun', 'Shaun'],
            ['tom2', 'Tom'],
            ['steve', 'Steve'],
            ['nanako', 'Nanako'],
            ['mira', 'Mira'],
            ['miller', 'Miller'],
            ['tawapon', 'Tawapon'],
            ['mary', 'Mary'],
            ['takeshi', 'Takeshi'],
        ]);

        expect(getAcademyCastMember('aakash').firstName).toBe('Aakash');
        expect(ACADEMY_CAST.some(member => member.id === ('pho' as string))).toBe(false);
        expect(ACADEMY_CAST.some(member => /unknown|unidentified|contact/i.test(member.id))).toBe(false);
    });

    it('keeps ids unique while allowing distinct classmates to share a first name', () => {
        expect(new Set(ACADEMY_CAST.map(member => member.id)).size).toBe(ACADEMY_CAST.length);
        expect(ACADEMY_CAST.filter(member => member.firstName === 'Tom').map(member => member.id))
            .toEqual(['tom', 'tom2']);
        expect(ACADEMY_CAST.every(member => Object.keys(member).every(key =>
            ['id', 'firstName', 'preferredName', 'category', 'visualEvidence', 'eligibility', 'teacherSalutation', 'nameEvidence', 'visualBrief'].includes(key),
        ))).toBe(true);
        expect(validateAcademyCastReference({ id: 'aakash', firstName: 'Aakash' }).id).toBe('aakash');
        expect(() => validateAcademyCastReference({ id: 'aakash', firstName: 'Akash' })).toThrow('expected Aakash');
        expect(() => getAcademyCastMember('pho')).toThrow('Unknown Academy cast id');
        expect(isAcademyCastMemberId('rie')).toBe(true);
        expect(isAcademyCastMemberId('unidentified-contact')).toBe(false);
    });

    it('keeps the legacy Angel id while exposing Onke as the canonical visible name', () => {
        expect(getAcademyCastMember('angel')).toMatchObject({
            id: 'angel',
            firstName: 'Onke',
        });
        expect(displayAcademyCastName('angel', 'en')).toBe('Onke-san');
        expect(validateAcademyCastReference({ id: 'angel', firstName: 'Onke' }).id).toBe('angel');
        expect(() => validateAcademyCastReference({ id: 'angel', firstName: 'Angel' }))
            .toThrow('expected Onke');
    });

    it('keeps approved and pending likenesses explicit', () => {
        expect(getAcademyCastMember('aakash')).toMatchObject({
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(canRenderAcademyCastPortrait('aakash', 'story-runtime')).toBe(true);
        expect(getAcademyCastMember('sophie')).toMatchObject({
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(canRenderAcademyCastPortrait('sophie', 'story-runtime')).toBe(true);
        expect(getAcademyCastMember('xingyu')).toMatchObject({
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(canRenderAcademyCastPortrait('xingyu', 'story-runtime')).toBe(true);
        expect(getAcademyCastMember('ruparna')).toMatchObject({
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(canRenderAcademyCastPortrait('ruparna', 'story-runtime')).toBe(true);
        expect(getAcademyCastMember('sam')).toMatchObject({
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(canRenderAcademyCastPortrait('sam', 'story-runtime')).toBe(true);
        expect(getAcademyCastMember('shaun')).toMatchObject({
            firstName: 'Shaun',
            category: 'classmate',
            visualEvidence: 'reference-confirmed-neutral-pending',
            nameEvidence: 'owner-named',
            eligibility: { story: true, lessons: false, likenessRuntime: false },
        });
        expect(getAcademyCastMember('nanako')).toMatchObject({
            firstName: 'Nanako',
            category: 'extended-member',
            visualEvidence: 'candidate-needs-owner',
            eligibility: { story: true, lessons: true, likenessRuntime: false },
        });
        expect(getAcademyCastMember('mira')).toMatchObject({
            firstName: 'Mira',
            category: 'extended-member',
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(canRenderAcademyCastPortrait('shaun', 'journal-review-preview')).toBe(true);
        expect(canRenderAcademyCastPortrait('shaun', 'story-runtime')).toBe(false);
        expect(canRenderAcademyCastPortrait('peter', 'story-runtime')).toBe(true);
        expect(getAcademyCastMember('peter')).toMatchObject({
            firstName: 'Peter',
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(getAcademyCastMember('steve')).toMatchObject({
            firstName: 'Steve',
            category: 'classmate',
            visualEvidence: 'approved',
            eligibility: { story: true, lessons: true, likenessRuntime: true },
        });
        expect(getAcademyCastMember('tom2')).toMatchObject({
            firstName: 'Tom',
            category: 'classmate',
            visualEvidence: 'reference-confirmed-neutral-pending',
            eligibility: { story: true, lessons: true, likenessRuntime: false },
        });
    });

    it('never stores guessed kana aliases', () => {
        expect(ACADEMY_CAST.every(member => !('kanaAlias' in member))).toBe(true);
        expect(getAcademyCastMember('rie').teacherSalutation).toEqual({
            en: 'Rie-sensei',
            ja: 'りえ先生',
        });
        expect(ACADEMY_CAST.filter(member => member.id !== 'rie').every(member => !('teacherSalutation' in member))).toBe(true);
    });

    it('uses one honorific policy for teachers and classmates', () => {
        expect(displayAcademyCastName('rie', 'en')).toBe('Rie-sensei');
        expect(displayAcademyCastName('rie', 'ja')).toBe('りえ先生');
        expect(displayAcademyCastName('aakash', 'en')).toBe('Aakash-san');
        expect(displayAcademyCastName('xingyu', 'ja')).toBe('Xingyu-san');
        expect(displayAcademyCastName('angel', 'en')).toBe('Onke-san');
    });
});
