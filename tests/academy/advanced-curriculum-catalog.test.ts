import {
    ADVANCED_CURRICULUM,
    advancedCurriculumForBand,
    advancedLessonId,
    advancedPackageIdFromLessonId,
    isAdvancedLessonId,
    resolveAdvancedCurriculumEntry,
} from '../../src/academy/content/advanced-curriculum';

describe('advanced curriculum catalog', () => {
    it('contains every completed N3, N2, and N1 package in registry order', () => {
        expect(ADVANCED_CURRICULUM.map(entry => entry.id)).toEqual([
            'n3-source-opening-01',
            'n3-source-opening-02',
            'n3-source-opening-03',
            'n3-mock-listening-01-action',
            'n3-mock-listening-02-point',
            'n3-mock-listening-03-overview',
            'n3-mock-listening-04-expression',
            'n3-mock-listening-05-response',
            'n3-n4-sleep-bridge-01',
            'n3-pet-housing-01',
            'n2-home-life-opening-01-apartment-moving',
            'n2-home-life-opening-02-ppoi',
            'n2-home-life-opening-03-coupon',
            'n2-home-life-opening-04-reader',
            'n2-home-life-opening-05-listening',
            'n2-extensive-reading-01',
            'n2-policy-scope-01',
            'n1-opening-sequence-01',
            'n1-sound-discrimination-01',
            'n1-contrast-inference-01',
            'advanced-immersion-n3-n1-01',
        ]);
        expect(ADVANCED_CURRICULUM.map(entry => entry.activity.id)).toHaveLength(21);
        expect(new Set(ADVANCED_CURRICULUM.map(entry => entry.activity.id)).size).toBe(21);
    });

    it('keeps localized presentation metadata beside each ActivityModel', () => {
        for (const entry of ADVANCED_CURRICULUM) {
            expect(entry.title.en).not.toBe('');
            expect(entry.title.ja).not.toBe('');
            expect(entry.summary.en).not.toBe('');
            expect(entry.summary.ja).not.toBe('');
            expect(entry.location.en).not.toBe('');
            expect(entry.location.ja).not.toBe('');
            expect(entry.host.id).not.toBe('');
            expect(entry.host.name).not.toBe('');
            expect(entry.host.localizedName.en).not.toBe('');
            expect(entry.host.localizedName.ja).not.toBe('');
            expect(entry.activity.kind).toMatch(/^academy-/);
        }
    });

    it('filters the continuation catalog by advanced band', () => {
        expect(advancedCurriculumForBand()).toHaveLength(21);
        expect(advancedCurriculumForBand('n3')).toHaveLength(10);
        expect(advancedCurriculumForBand('n2')).toHaveLength(7);
        expect(advancedCurriculumForBand('n1')).toHaveLength(4);
        expect(advancedCurriculumForBand('n4')).toHaveLength(0);
        expect(advancedCurriculumForBand('n2').every(entry => entry.band === 'n2')).toBe(true);
    });

    it('round-trips only known advanced package lesson IDs', () => {
        for (const entry of ADVANCED_CURRICULUM) {
            const lessonId = advancedLessonId(entry.id);
            expect(lessonId).toBe(entry.lessonId);
            expect(advancedPackageIdFromLessonId(lessonId)).toBe(entry.id);
            expect(isAdvancedLessonId(lessonId)).toBe(true);
            expect(resolveAdvancedCurriculumEntry(entry.id)).toBe(entry);
            expect(resolveAdvancedCurriculumEntry(lessonId)).toBe(entry);
        }
        expect(advancedPackageIdFromLessonId('l1-l01')).toBeUndefined();
        expect(advancedPackageIdFromLessonId('advanced:n3-no-such-package')).toBeUndefined();
        expect(isAdvancedLessonId('advanced:')).toBe(false);
    });
});
