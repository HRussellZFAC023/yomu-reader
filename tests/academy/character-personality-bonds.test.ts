import {
    ACADEMY_BOND_CHARACTER_IDS,
    ACADEMY_CHARACTER_BOND_CATALOG,
    getAcademyCharacterBondProfile,
} from '../../src/academy/domain/character-personality-bonds';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';

describe('Academy character personality and bond catalog', () => {
    it('covers the teacher and every current classmate exactly once', () => {
        const registeredIds: string[] = ACADEMY_CAST
            .filter(member => member.category === 'teacher' || member.category === 'classmate')
            .map(member => member.id);
        const registeredIdSet = new Set(registeredIds);
        const expectedIds = [
            ...registeredIds,
            ...(['steve', 'tom2'] as const).filter(id => !registeredIdSet.has(id)),
        ];

        expect([...ACADEMY_BOND_CHARACTER_IDS].sort()).toEqual([...expectedIds].sort());
        expect(ACADEMY_CHARACTER_BOND_CATALOG.map(entry => entry.characterId))
            .toEqual(ACADEMY_BOND_CHARACTER_IDS);
        expect(new Set(ACADEMY_BOND_CHARACTER_IDS).size).toBe(ACADEMY_BOND_CHARACTER_IDS.length);
    });

    it('gives every character a distinct production voice and a complete ten-stage progression', () => {
        const voiceFingerprints = new Set<string>();
        for (const entry of ACADEMY_CHARACTER_BOND_CATALOG) {
            expect(entry.desire.length).toBeGreaterThan(20);
            expect(entry.contradiction.length).toBeGreaterThan(20);
            expect(entry.recurringBit.length).toBeGreaterThan(20);
            expect(entry.learningRole.specialties.length).toBeGreaterThan(0);
            expect(entry.learningRole.activityPattern.length).toBeGreaterThan(20);
            expect(entry.learningRole.learnerBenefit.length).toBeGreaterThan(20);

            const voice = Object.values(entry.voice);
            expect(voice.every(value => value.length > 20)).toBe(true);
            const fingerprint = voice.join('|');
            expect(voiceFingerprints.has(fingerprint)).toBe(false);
            voiceFingerprints.add(fingerprint);

            expect(entry.bondArc).toHaveLength(10);
            expect(entry.bondArc.map(stage => stage.stage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            expect(entry.bondArc.map(stage => stage.phase)).toEqual([
                'encounter',
                'shared-task',
                'competence',
                'ritual',
                'friction',
                'boundary',
                'repair',
                'trust',
                'reciprocity',
                'open-future',
            ]);
            expect(new Set(entry.bondArc.map(stage => stage.title)).size).toBe(10);
            expect(entry.bondArc.every(stage =>
                stage.relationshipTurn.length > 20 && stage.learningUse.length > 20,
            )).toBe(true);
        }
    });

    it('keeps Onke on the legacy Angel id and disambiguates the two Toms', () => {
        expect(getAcademyCharacterBondProfile('angel')).toMatchObject({
            characterId: 'angel',
            displayName: 'Onke-san',
        });
        expect(getAcademyCharacterBondProfile('tom')).toMatchObject({
            displayName: 'Tom-san',
            disambiguation: 'The original class Tom',
        });
        expect(getAcademyCharacterBondProfile('tom2')).toMatchObject({
            displayName: 'Tom-san',
            disambiguation: 'The later-arriving, taller Tom',
        });
    });

    it('records the approved Rie, Steve, and Tom2 foundations without turning fiction into biography', () => {
        const rie = getAcademyCharacterBondProfile('rie');
        expect(rie.privacy.approvedFacts.join(' ')).toMatch(/ceramics/u);
        expect(rie.privacy.approvedFacts.join(' ')).toMatch(/pottery classes/u);
        expect(rie.privacy.approvedFacts.join(' ')).toMatch(/glasses/u);
        expect(rie.privacy.approvedFacts.join(' ')).toMatch(/Japan House museum and restaurant/u);

        const steve = getAcademyCharacterBondProfile('steve');
        expect(steve.privacy.approvedFacts.join(' ')).toMatch(/Japanese wife/u);
        expect(steve.privacy.approvedFacts.join(' ')).toMatch(/bilingual children/u);
        expect(steve.privacy.approvedFacts.join(' ')).toMatch(/family group chats/u);
        expect(steve.learningRole.specialties).toEqual(expect.arrayContaining(['casual-chat', 'writing']));

        const tom2 = getAcademyCharacterBondProfile('tom2');
        expect(tom2.privacy.approvedFacts.join(' ')).toMatch(/tall/u);
        expect(tom2.privacy.approvedFacts.join(' ')).toMatch(/average build/u);
        expect(tom2.privacy.approvedFacts.join(' ')).toMatch(/dark-brown hair/u);
        expect(tom2.desire).toMatch(/known through chosen actions/u);
    });

    it('makes fictionalization and consent limits explicit for every profile', () => {
        for (const entry of ACADEMY_CHARACTER_BOND_CATALOG) {
            expect(entry.privacy.portrayal).toBe('privacy-safe-fictionalized-composite');
            expect(entry.privacy.approvedFacts.length).toBeGreaterThan(0);
            expect(entry.privacy.prohibitedInferences.length).toBeGreaterThan(0);
            expect(entry.privacy.prohibitedInferences.join(' ')).toMatch(/real|romance|private|unapproved/u);
        }
        expect(getAcademyCharacterBondProfile('shaun').privacy.approvedFacts.join(' '))
            .toMatch(/deliberately light/u);
    });
});
