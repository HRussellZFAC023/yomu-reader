// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    ACADEMY_ASSESSMENT_PACKAGES,
    resolveAcademyAssessmentPackage,
} from '../../src/academy/assessment/registry';
import {
    JLPT_BANDS_ASCENDING,
    SOYA_JLPT_ASSESSMENT,
    SOYA_JLPT_ASSESSMENT_ID,
    scoreSoyaJlptAssessment,
    soyaJlptItemsForBand,
} from '../../src/academy/assessment/soya-jlpt-assessment';
import {
    JAPANESE_LIBRARY_JLPT_QUARANTINE,
    SOYA_JLPT_ASSESSMENT_SOURCE_POLICY,
    SOYA_JLPT_AUDIO_QUARANTINE,
    SOYA_JLPT_PACKAGED_AUDIO,
    SOYA_JLPT_SOURCE_CROSSWALK,
    resolveJapaneseLibraryJlptCandidate,
    sourceRecordForSoyaJlptItem,
    validateSoyaJlptAssessmentCrosswalk,
} from '../../src/academy/assessment/soya-jlpt-crosswalk';
import { ORIENTATION_MOCK_ITEMS } from '../../src/academy/placement/orientation';

describe('Soya JLPT assessment package', () => {
    it('registers a complete N5-N1 bank with two items per receptive skill', () => {
        expect(SOYA_JLPT_ASSESSMENT.items).toHaveLength(30);
        expect(JLPT_BANDS_ASCENDING).toEqual(['n5', 'n4', 'n3', 'n2', 'n1']);
        for (const band of JLPT_BANDS_ASCENDING) {
            const items = soyaJlptItemsForBand(band);
            expect(items).toHaveLength(6);
            for (const skill of ['language-knowledge', 'reading', 'listening'] as const) {
                expect(items.filter(item => item.skill === skill), `${band} ${skill}`).toHaveLength(2);
            }
        }
        expect(() => validateSoyaJlptAssessmentCrosswalk(ORIENTATION_MOCK_ITEMS)).not.toThrow();
    });

    it('crosswalks every playable item to an exact permitted Soya snapshot source', () => {
        expect(SOYA_JLPT_SOURCE_CROSSWALK).toHaveLength(12);
        expect(SOYA_JLPT_ASSESSMENT_SOURCE_POLICY).toEqual({
            sourceScope: 'soya-research',
            corpusRole: 'enrichment',
            answerGate: 'after-attempt',
            sequenceAuthority: null,
            mayAdvanceMoodleChronology: false,
        });
        for (const item of ORIENTATION_MOCK_ITEMS) {
            const source = sourceRecordForSoyaJlptItem(item.referenceId);
            expect(source, item.referenceId).toMatchObject({
                band: item.band,
                relativePath: item.provenance.sourceFile,
                sha256: item.provenance.sourceFileSha256,
                snapshotRoot: 'references/soya-research/extracted-src-all',
            });
            expect(item.provenance).toMatchObject({ sourceScope: 'soya-research', answerGate: 'after-attempt' });
        }
    });

    it('matches local Soya snapshot bytes when the permitted research corpus is present', () => {
        const repositoryParent = path.resolve(process.cwd(), '../..');
        const present = SOYA_JLPT_SOURCE_CROSSWALK.filter(record => fs.existsSync(path.join(
            repositoryParent,
            record.snapshotRoot,
            record.relativePath,
        )));
        if (!present.length) return;
        expect(present).toHaveLength(SOYA_JLPT_SOURCE_CROSSWALK.length);
        for (const record of present) {
            const bytes = fs.readFileSync(path.join(repositoryParent, record.snapshotRoot, record.relativePath));
            expect(createHash('sha256').update(bytes).digest('hex'), record.id).toBe(record.sha256);
        }
    });

    it('plays only byte-verified packaged recordings and quarantines unregistered source audio', () => {
        expect(SOYA_JLPT_PACKAGED_AUDIO.map(record => record.itemReferenceId)).toEqual([
            'n5_mock1_l_04',
            'n5_mock1_l_11',
        ]);
        expect(SOYA_JLPT_PACKAGED_AUDIO.map(record => {
            const item = ORIENTATION_MOCK_ITEMS.find(candidate => candidate.referenceId === record.itemReferenceId)!;
            return SOYA_JLPT_ASSESSMENT.resolveAudio(item);
        })).toEqual([
            {
                kind: 'source-recording',
                url: '/academy/content/listening/media/academy-listening-da546db7dbceaf3ea.mp3',
                sha256: 'da546db7dbceaf3eafbe21f69767f2c954d831817fe3f3307c7deb24be12c664',
            },
            {
                kind: 'source-recording',
                url: '/academy/content/listening/media/academy-listening-32c6d0a7692f3d5a.mp3',
                sha256: '32c6d0a7692f3d5aec633c615f2c1b727deda0859e5f492fd3f444b56f029ac8',
            },
        ]);
        expect(SOYA_JLPT_AUDIO_QUARANTINE).toHaveLength(6);
        for (const record of SOYA_JLPT_AUDIO_QUARANTINE) {
            const item = ORIENTATION_MOCK_ITEMS.find(candidate => candidate.referenceId === record.itemReferenceId)!;
            expect(item.audio?.runtimeDelivery).toBe('browser-speech-synthesis');
            expect(SOYA_JLPT_ASSESSMENT.resolveAudio(item)).toMatchObject({ kind: 'browser-speech' });
        }
        expect(() => SOYA_JLPT_ASSESSMENT.resolveAudio({
            ...ORIENTATION_MOCK_ITEMS[0]!,
            id: 'foreign-assessment-item',
        })).toThrow(/Unknown Soya JLPT assessment item/);
    });

    it('keeps Japanese-library listening candidates privacy-safe and unplayable', () => {
        expect(JAPANESE_LIBRARY_JLPT_QUARANTINE.map(record => record.band)).toEqual(['n3', 'n2', 'n1']);
        for (const record of JAPANESE_LIBRARY_JLPT_QUARANTINE) {
            expect(record.state).toBe('quarantined');
            expect(record.gaps).toEqual([
                'rights-review-required',
                'item-region-unverified',
                'transcript-audio-pairing-unverified',
            ]);
            expect(JSON.stringify(record)).not.toMatch(/(?:https?:|[\\/]|\.[a-z0-9]{2,5}|[a-f0-9]{64})/iu);
            expect(resolveJapaneseLibraryJlptCandidate(record.id)).toEqual({ status: 'quarantined', record });
            expect(ORIENTATION_MOCK_ITEMS.some(item => item.referenceId === record.id)).toBe(false);
        }
        expect(resolveJapaneseLibraryJlptCandidate('not-a-library-candidate')).toBeUndefined();
    });

    it.each([
        ['n5', 'n5'],
        ['n4', 'n4'],
        ['n3', 'n3'],
        ['n2', 'n2'],
        ['n1', 'n1'],
    ] as const)('recommends %s from a contiguous mastered frontier', (through, expected) => {
        const result = scoreSoyaJlptAssessment(correctResponsesThrough(through));
        expect(result.recommendationStatus).toBe('recommendation');
        expect(result.recommendationReason).toBe('mastery-frontier');
        expect(result.recommendedBand).toBe(expected);
        expect(result.bandDiagnostics[through].mastered).toBe(true);
    });

    it('does not leapfrog a lower-band gap even when a higher band is passed', () => {
        const responses = {
            ...correctResponsesFor('n5'),
            ...incorrectResponsesFor('n4'),
            ...correctResponsesFor('n3'),
        };
        const result = scoreSoyaJlptAssessment(responses);
        expect(result.bandDiagnostics.n5.mastered).toBe(true);
        expect(result.bandDiagnostics.n4.mastered).toBe(false);
        expect(result.bandDiagnostics.n3.mastered).toBe(true);
        expect(result.recommendedBand).toBe('n5');
    });

    it('requires both the overall threshold and evidence in every receptive skill', () => {
        const n5 = soyaJlptItemsForBand('n5');
        const fourCorrectWithoutListening = Object.fromEntries(n5.map(item => [
            item.id,
            item.options.find(option => item.skill === 'listening' ? !option.correct : option.correct)!.id,
        ]));
        const result = scoreSoyaJlptAssessment(fourCorrectWithoutListening);
        expect(result.bandDiagnostics.n5).toMatchObject({ attempted: 6, correct: 4, score: 4 / 6, mastered: false });
        expect(result.bandDiagnostics.n5.skills.listening).toMatchObject({ attempted: 2, correct: 0, score: 0 });
        expect(result).toMatchObject({ recommendationReason: 'n5-support-start', recommendedBand: 'n5' });
    });

    it('recommends an N5 support start after complete weak evidence', () => {
        const result = scoreSoyaJlptAssessment(incorrectResponsesFor('n5'));
        expect(result).toMatchObject({
            recommendationStatus: 'recommendation',
            recommendationReason: 'n5-support-start',
            recommendedBand: 'n5',
            attempted: 6,
            correct: 0,
            available: 30,
        });
        expect(result.bandDiagnostics.n5.skills.listening).toMatchObject({ attempted: 2, correct: 0, score: 0 });
    });

    it('withholds a recommendation for incomplete or invalid N5 evidence', () => {
        const first = soyaJlptItemsForBand('n5')[0]!;
        const incomplete = scoreSoyaJlptAssessment({
            [first.id]: first.options.find(option => option.correct)!.id,
        });
        expect(incomplete).toMatchObject({
            recommendationStatus: 'insufficient-evidence',
            recommendationReason: 'incomplete-n5-evidence',
            recommendedBand: null,
            attempted: 1,
        });

        const invalid = scoreSoyaJlptAssessment(Object.fromEntries(
            soyaJlptItemsForBand('n5').map(item => [item.id, 'not-a-source-choice']),
        ));
        expect(invalid).toMatchObject({ recommendationStatus: 'insufficient-evidence', attempted: 0, correct: 0 });
    });

    it('preserves story chronology and exposes the package through the assessment registry', () => {
        const result = scoreSoyaJlptAssessment(correctResponsesThrough('n1'));
        expect(result.storyContinuity).toEqual({
            mode: 'preserve',
            preserveChronology: true,
            markScenesSeen: false,
            alterRelationships: false,
            curriculumEffect: 'starting-recommendation-only',
        });
        expect(result.caveat).toMatch(/Not an official JLPT score/);
        expect(ACADEMY_ASSESSMENT_PACKAGES).toEqual([SOYA_JLPT_ASSESSMENT]);
        expect(resolveAcademyAssessmentPackage(SOYA_JLPT_ASSESSMENT_ID)).toBe(SOYA_JLPT_ASSESSMENT);
        expect(() => resolveAcademyAssessmentPackage('unknown')).toThrow(/Unknown Academy assessment package/);
    });
});

function correctResponsesThrough(through: (typeof JLPT_BANDS_ASCENDING)[number]): Record<string, string> {
    const last = JLPT_BANDS_ASCENDING.indexOf(through);
    return Object.assign({}, ...JLPT_BANDS_ASCENDING.slice(0, last + 1).map(correctResponsesFor));
}

function correctResponsesFor(band: (typeof JLPT_BANDS_ASCENDING)[number]): Record<string, string> {
    return Object.fromEntries(soyaJlptItemsForBand(band).map(item => [
        item.id,
        item.options.find(option => option.correct)!.id,
    ]));
}

function incorrectResponsesFor(band: (typeof JLPT_BANDS_ASCENDING)[number]): Record<string, string> {
    return Object.fromEntries(soyaJlptItemsForBand(band).map(item => [
        item.id,
        item.options.find(option => !option.correct)!.id,
    ]));
}
