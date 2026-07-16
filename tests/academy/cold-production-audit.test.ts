import fs from 'node:fs';
import path from 'node:path';
import {
    assertNoColdProduction,
    auditAuthoredActivityContracts,
    auditColdProductionSequence,
    type AcademyLearningSequenceContract,
} from '../../src/academy/content/cold-production-audit';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';

const LESSON_DIRECTORY = path.resolve('public/academy/content/lessons');

// Existing debt, not an exemption from the curriculum contract. The exact set
// makes any added cold-production surface fail until it has a real sequence.
const KNOWN_AUTHORED_WEEK_COLD_PRODUCTION = [
    'authored:l1-l11/l11-869c-q1-1',
    'authored:l1-l11/l11-869c-q1-2',
    'authored:l1-l11/l11-dfec-q1-1',
    'authored:l1-l11/l11-dfec-q1-2',
    'authored:l1-l11/l11-dfec-q1-3',
    'authored:l1-l11/l11-dfec-q5-3',
    'authored:l1-l12/l12-donna-q1-1',
    'authored:l1-l12/l12-donna-q1-3',
    'authored:l1-l12/l12-donna-q1-5',
    'authored:l1-l12/l12-like-q1-1',
    'authored:l1-l12/l12-like-q1-2',
    'authored:l1-l12/l12-like-q1-5',
    'authored:l1-l12/l12-like-q2-2',
    'authored:l1-l12/l12-like-q2-3',
    'authored:l1-l13/l13-ability-q1-1',
    'authored:l1-l13/l13-ability-q2-1',
    'authored:l1-l13/l13-ability-q2-2',
    'authored:l1-l13/l13-ability-q2-4',
    'authored:l1-l13/l13-skill-q1-1',
    'authored:l1-l13/l13-skill-q1-2',
    'authored:l1-l13/l13-skill-q1-3',
    'authored:l1-l13/l13-skill-q1-4',
    'authored:l1-l14/l14-have-q2-1',
    'authored:l1-l14/l14-have-q2-4',
    'authored:l1-l14/l14-have-q2-5',
    'authored:l1-l14/l14-kara-q1-1',
    'authored:l1-l14/l14-kara-q1-3',
    'authored:l1-l14/l14-why-q7-1',
    'authored:l1-l14/l14-why-q7-3',
    'authored:l1-l14/l14-why-q7-4',
    'authored:l2-l02/ex-l2-l02-experience-cloze',
    'authored:l2-l02/ex-l2-l02-past-form',
    'authored:l2-l03/ex-l2-l03-change-i',
    'authored:l2-l03/ex-l2-l03-tari-form',
    'authored:l2-l04/ex-l2-l04-plain-negative',
    'authored:l2-l04/ex-l2-l04-plain-past-negative',
    'authored:l2-l04/ex-l2-l04-plain-present',
    'authored:l2-l05/ex-l2-l05-plain-na',
    'authored:l2-l05/ex-l2-l05-plain-noun-negative',
    'authored:l2-l06/ex-l2-l06-opinion-na',
    'authored:l2-l06/ex-l2-l06-opinion-past',
    'authored:l2-l07/ex-l2-l07-quote-particle',
    'authored:l2-l07/ex-l2-l07-report-past',
    'authored:l2-l08/ex-l2-l08-modifier-no',
    'authored:l2-l08/ex-l2-l08-modifier-past',
    'authored:l2-l09/ex-l08-grammar-toki',
    'authored:l2-l12/ex-l01-nagara',
    'authored:l2-l14/ex-l03-review-sequence',
    'authored:l2-l14/ex-l03-rewrite',
    'authored:l2-l15/ex-teshimau-transform',
    'authored:l2-l16/ex-l05-rewrite',
    'authored:l2-l17/ex-l06-prepare',
    'authored:l2-l18/ex-l07-request',
    'authored:l2-l19/ex-pre-vol-godan',
    'authored:l2-l20/ex-l08-intention',
    'authored:l2-l21/ex-l09-changed',
    'authored:l2-l25/ex-review',
    'authored:l2-l26/ex-review',
    'authored:l2-l27/ex-review',
    'authored:l2-l28/ex-review',
    'authored:l2-l29/ex-review',
    'authored:l2-l30/ex-review',
    'authored:l2-l31/ex-review',
    'authored:l2-l32/ex-review',
    'authored:l2-l33/ex-review',
    'authored:l2-l34/ex-review',
] as const;

describe('cold-production curriculum audit', () => {
    it('requires context, explicit teaching, and post-teaching guided practice', () => {
        const cold: AcademyLearningSequenceContract = {
            id: 'sequence:test-cold',
            steps: [
                { id: 'step:test-context', kind: 'context', conceptIds: ['concept:test'] },
                { id: 'activity:test-production', kind: 'assessed-production', conceptIds: ['concept:test'] },
                { id: 'step:test-late-teaching', kind: 'instruction', conceptIds: ['concept:test'] },
            ],
        };

        expect(auditColdProductionSequence(cold)).toEqual([{
            sequenceId: 'sequence:test-cold',
            activityId: 'activity:test-production',
            conceptId: 'concept:test',
            missing: ['explicit-instruction', 'guided-practice'],
        }]);
        expect(() => assertNoColdProduction(cold)).toThrow(/Cold production.*activity:test-production/s);
    });

    it('accepts an ordered teaching-to-production sequence', () => {
        const ready: AcademyLearningSequenceContract = {
            id: 'sequence:test-ready',
            steps: [
                { id: 'step:test-context', kind: 'context', conceptIds: ['concept:test'] },
                { id: 'step:test-teaching', kind: 'instruction', conceptIds: ['concept:test'] },
                { id: 'activity:test-guided', kind: 'guided-practice', conceptIds: ['concept:test'] },
                { id: 'activity:test-production', kind: 'assessed-production', conceptIds: ['concept:test'] },
            ],
        };

        expect(auditColdProductionSequence(ready)).toEqual([]);
        expect(() => assertNoColdProduction(ready)).not.toThrow();
    });

    it('freezes the known authored-week production debt and catches any new match', () => {
        const weeks = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => entry.kind === 'authored-week');
        const issues = weeks.flatMap(week => {
            const value = JSON.parse(fs.readFileSync(path.join(LESSON_DIRECTORY, week.filename), 'utf8'));
            const adapted = week.validate(value);
            return auditAuthoredActivityContracts(`authored-week:${week.packageId}`, adapted.activities);
        });
        const activityIds = issues.map(issue => issue.activityId).sort();
        const affectedPackages = new Set(activityIds.map(id => id.slice('authored:'.length).split('/')[0]));

        expect(activityIds).toEqual([...KNOWN_AUTHORED_WEEK_COLD_PRODUCTION]);
        expect(affectedPackages.size).toBe(31);
        expect(issues.every(issue =>
            JSON.stringify(issue.missing) === JSON.stringify([
                'context',
                'explicit-instruction',
                'guided-practice',
            ]))).toBe(true);
    });
});
