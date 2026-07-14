import fs from 'node:fs';
import path from 'node:path';
import {
    CANONICAL_CLASS_WEEK_INDEX_SHA256,
    CANONICAL_CLASS_WEEK_IDS,
    validateClassWeekCastPlan,
    type ClassWeekCastPlan,
} from '../../src/academy/content/class-week-cast-plan';
import { ACADEMY_CAST, getAcademyCastMember } from '../../src/academy/domain/cast-registry';

const PLAN_PATH = path.resolve('public/academy/content/curriculum/class-week-cast.v1.json');

function planJson(): ClassWeekCastPlan {
    return JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')) as ClassWeekCastPlan;
}

function clonePlan(): ClassWeekCastPlan {
    return structuredClone(planJson());
}

describe('73-week classmate appearance plan', () => {
    it('covers the reviewed chronology without claiming the weeks are authored or playable', () => {
        const plan = validateClassWeekCastPlan(planJson());
        const syncScript = fs.readFileSync(path.resolve('scripts/sync-academy.cjs'), 'utf8');

        expect(plan.weeks).toHaveLength(73);
        expect(plan.weeks.map(week => week.weekId)).toEqual(CANONICAL_CLASS_WEEK_IDS);
        expect(plan.weeks.map(week => week.order)).toEqual([...Array(73).keys()]);
        expect(plan).toMatchObject({
            scope: 'appearance-planning',
            runtimeStatus: 'not-bound',
            authorshipStatus: 'planning-only',
            sourceIndex: {
                donor: 'academy-rebuild-20260711',
                file: 'public/academy/content/weeks/index.json',
                weekCount: 73,
                sha256: CANONICAL_CLASS_WEEK_INDEX_SHA256,
            },
        });
        expect(syncScript).toContain("['public/academy/content/curriculum', 'content/curriculum']");
    });

    it('uses source topics where they exist and records uncertainty instead of guessing at outline-only weeks', () => {
        const plan = validateClassWeekCastPlan(planJson());
        const sourceBacked = plan.weeks.filter(week => week.status === 'source-backed');
        const reviewRequired = plan.weeks.filter(week => week.status === 'review-required');

        expect(sourceBacked).toHaveLength(67);
        expect(sourceBacked.every(week => week.source.topicEvidence.length > 0)).toBe(true);
        expect(reviewRequired.map(week => week.weekId)).toEqual([
            'orientation', 'l1-kickoff', 'l1plus-kickoff',
            'l2plus-kickoff', 'l3-2-kickoff', 'l3plus-kickoff',
        ]);
        expect(reviewRequired.every(week => week.primary === null && week.supporting.length === 0)).toBe(true);
    });

    it('represents every documented classmate as a primary and supporting lesson participant', () => {
        const plan = validateClassWeekCastPlan(planJson());
        const documented = ACADEMY_CAST
            .filter(member => member.category === 'classmate' && member.eligibility.lessons)
            .map(member => member.id)
            .sort();
        const primaries = [...new Set(plan.weeks.flatMap(week => week.primary ? [week.primary.id] : []))].sort();
        const appearances = [...new Set(plan.weeks.flatMap(week => [
            ...(week.primary ? [week.primary.id] : []),
            ...week.supporting.map(member => member.id),
        ]))].sort();

        expect(primaries).toEqual(documented);
        expect(appearances).toEqual(documented);
        for (const week of plan.weeks) {
            for (const appearance of [week.primary, ...week.supporting].filter(Boolean)) {
                expect(appearance!.firstName).toBe(getAcademyCastMember(appearance!.id).firstName);
            }
        }
    });

    it('keeps story-only classmates out of fabricated lesson assignments', () => {
        const plan = validateClassWeekCastPlan(planJson());
        const appearances = plan.weeks.flatMap(week => [
            ...(week.primary ? [week.primary.id] : []),
            ...week.supporting.map(member => member.id),
        ]);

        expect(getAcademyCastMember('shaun')).toMatchObject({
            category: 'classmate',
            eligibility: { story: true, lessons: false },
        });
        expect(appearances).not.toContain('shaun');

        const storyOnly = clonePlan() as unknown as {
            weeks: Array<{
                status: string;
                primary: { id: string; firstName: string; matchedSpecialty: string } | null;
                learningSpecialties: string[];
            }>;
        };
        const assigned = storyOnly.weeks.find(week => week.status === 'source-backed' && week.primary)!;
        assigned.primary = { id: 'shaun', firstName: 'Shaun', matchedSpecialty: assigned.learningSpecialties[0]! };
        expect(() => validateClassWeekCastPlan(storyOnly)).toThrow(/story-only until lesson evidence exists/i);
    });

    it('rejects missing weeks, invented names, and cast outside a documented specialty', () => {
        const missingWeek = clonePlan() as unknown as { weeks: unknown[] };
        missingWeek.weeks.pop();
        expect(() => validateClassWeekCastPlan(missingWeek)).toThrow(/all 73 canonical weeks/i);

        const misspelled = clonePlan() as unknown as {
            weeks: Array<{ primary: { firstName: string } | null }>;
        };
        misspelled.weeks[2]!.primary!.firstName = 'Stacey';
        expect(() => validateClassWeekCastPlan(misspelled)).toThrow(/expected Stasi/i);

        const specialtyDrift = clonePlan() as unknown as {
            weeks: Array<{
                learningSpecialties: string[];
                primary: { matchedSpecialty: string } | null;
            }>;
        };
        specialtyDrift.weeks[2]!.learningSpecialties[0] = 'kanji';
        specialtyDrift.weeks[2]!.primary!.matchedSpecialty = 'kanji';
        expect(() => validateClassWeekCastPlan(specialtyDrift))
            .toThrow(/outside their documented learning specialties/i);
    });

    it('rejects a concentrated plan even when every individual reference is canonical', () => {
        const concentrated = clonePlan() as unknown as {
            weeks: Array<{
                status: string;
                learningSpecialties: string[];
                primary: { id: string; firstName: string; matchedSpecialty: string } | null;
            }>;
        };
        let replacements = 0;
        for (const week of concentrated.weeks) {
            if (week.status !== 'source-backed' || replacements >= 13) continue;
            week.primary = { id: 'aakash', firstName: 'Aakash', matchedSpecialty: 'directions' };
            const supportSpecialty = (week as unknown as { supporting: Array<{ matchedSpecialty: string }> })
                .supporting[0]!.matchedSpecialty;
            week.learningSpecialties = [...new Set(['directions', supportSpecialty])];
            replacements += 1;
        }
        expect(() => validateClassWeekCastPlan(concentrated)).toThrow(/consecutive|concentration/i);
    });

    it('contains no dialogue, private facts, or likeness claims', () => {
        const plan = planJson();
        const authoredFields = plan.weeks.flatMap(week => [
            ...Object.keys(week),
            ...(week.primary ? Object.keys(week.primary) : []),
            ...week.supporting.flatMap(appearance => Object.keys(appearance)),
        ]);
        // Source titles may legitimately name language topics such as nationality
        // or phone numbers. The appearance plan itself must not author private facts,
        // dialogue, or visual identity fields around those source records.
        expect(authoredFields.join('\n'))
            .not.toMatch(/dialogue|phone|employer|address|nationality|likeness|sprite|portrait/iu);
    });
});
