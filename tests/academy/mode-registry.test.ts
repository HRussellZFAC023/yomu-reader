import modeRegistryData from '../../public/academy/content/practice-modes.v1.json';
import { isContentEligibleForMode, validateModeRegistry } from '../../src/academy/domain/mode-registry';

describe('Academy practice mode registry', () => {
    it('maps every learner-facing Kotoba mechanic with bilingual learning and accessibility contracts', () => {
        const registry = validateModeRegistry(modeRegistryData);
        expect(registry.modes).toHaveLength(14);
        expect(registry.modes.every(mode => mode.teaches.en && mode.teaches.ja)).toBe(true);
        expect(registry.modes.every(mode => mode.learnerAction.en && mode.feedbackAndRepair.ja)).toBe(true);
        expect(registry.modes.every(mode => mode.accessibility.keyboard && mode.accessibility.touch && mode.accessibility.screenReader)).toBe(true);
        expect(registry.modes.every(mode => mode.evidenceKinds[0] === 'learning-evidence-recorded')).toBe(true);
        expect(registry.modes.find(mode => mode.id === 'inferno-pressure')).toMatchObject({
            optIn: true,
            recommendationEligible: false,
            accessibility: { timeLimit: 'optional' },
        });
        expect(registry.answerSupportContract).toMatchObject({
            englishUiPreCommit: {
                assessedJapanese: 'hidden',
                transcripts: 'hidden',
                translations: 'hidden',
                definitions: 'hidden',
                exampleGlosses: 'hidden',
                modelAnswers: 'hidden',
            },
            earnedHintPolicy: 'explicit-after-attempt',
            preCommitChoiceStyle: 'neutral',
            evidenceRequires: 'learner-commitment',
            animatedReactions: 'presentation-only',
        });
    });

    it('accepts cleared Soya content across journeys but excludes secure full-mock forms', () => {
        const registry = validateModeRegistry(modeRegistryData);
        const mixed = registry.modes.find(mode => mode.id === 'mixed-range')!;
        expect(isContentEligibleForMode(mixed, {
            journey: 'exam-season',
            auditStatus: 'cleared',
            exposure: 'published-assessment',
        })).toBe(true);
        expect(isContentEligibleForMode(mixed, {
            journey: 'exam-season',
            auditStatus: 'cleared',
            exposure: 'secure-assessment',
        })).toBe(false);
        expect(isContentEligibleForMode(mixed, {
            journey: 'lesson',
            auditStatus: 'candidate',
            exposure: 'practice-cleared',
        })).toBe(false);
    });

    it('rejects dishonest inferno defaults', () => {
        const copy = structuredClone(modeRegistryData);
        const inferno = copy.modes.find(mode => mode.id === 'inferno-pressure')!;
        inferno.optIn = false;
        expect(() => validateModeRegistry(copy)).toThrow('Inferno');
    });

    it('rejects answer support that leaks a transcript before commitment', () => {
        const copy = structuredClone(modeRegistryData);
        copy.answerSupportContract.englishUiPreCommit.transcripts = 'visible' as 'hidden';
        expect(() => validateModeRegistry(copy)).toThrow('transcripts must stay hidden');
    });
});
