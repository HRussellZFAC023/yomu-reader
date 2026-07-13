import fs from 'node:fs';
import path from 'node:path';
import { loadClassWeekDeliveryCatalog } from '../../src/academy/content/class-week-delivery-catalog';
import {
    CANONICAL_CLASS_WEEK_IDS,
    type ClassWeekCastPlan,
} from '../../src/academy/content/class-week-cast-plan';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';

const PLAN_PATH = path.resolve('public/academy/content/curriculum/class-week-cast.v1.json');
const LESSON_ROOT = path.resolve('public/academy/content/lessons');
const LEDGER_PATH = path.resolve('public/academy/content/RESOURCE-LEDGER.json');
const LESSON_CONTENT_ROOT = '/academy/content/lessons/';

function planJson(): ClassWeekCastPlan {
    return JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')) as ClassWeekCastPlan;
}

function lessonFetcher(requests: string[] = []): typeof fetch {
    return (async input => {
        const url = String(input);
        requests.push(url);
        if (!url.startsWith(LESSON_CONTENT_ROOT)) return new Response(null, { status: 404 });
        const filename = url.slice(LESSON_CONTENT_ROOT.length);
        const filepath = path.join(LESSON_ROOT, filename);
        if (!fs.existsSync(filepath)) return new Response(null, { status: 404 });
        return new Response(fs.readFileSync(filepath), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;
}

describe('73-Week delivery catalog', () => {
    it('covers the canonical chronology exactly once and without order drift', async () => {
        const catalog = await loadClassWeekDeliveryCatalog(planJson(), lessonFetcher());

        expect(catalog.weeks).toHaveLength(73);
        expect(catalog.weeks.map(week => week.weekId)).toEqual(CANONICAL_CLASS_WEEK_IDS);
        expect(catalog.weeks.map(week => week.order)).toEqual([...Array(73).keys()]);
        expect(new Set(catalog.weeks.map(week => week.weekId)).size).toBe(73);
        for (const week of catalog.weeks) expect(catalog.get(week.weekId)).toBe(week);
    });

    it('keeps Lesson 0 review-blocked and every unregistered Week planning-only', async () => {
        const plan = planJson();
        const catalog = await loadClassWeekDeliveryCatalog(plan, lessonFetcher());

        expect(catalog.get('orientation')).toEqual({
            order: 0,
            weekId: 'orientation',
            state: 'review-blocked',
            lessonId: null,
        });
        expect(catalog.weeks.filter(week => week.state === 'review-blocked').map(week => week.weekId))
            .toEqual(['orientation']);
        expect(catalog.weeks.filter(week => week.state === 'planning-only')).toHaveLength(72);
        expect(catalog.weeks.filter(week => week.state === 'grounded-playable')).toHaveLength(0);
        expect(catalog.playableCount).toBe(0);

        const sourceBackedWeekIds = new Set(plan.weeks
            .filter(week => week.status === 'source-backed')
            .map(week => week.weekId));
        expect(catalog.weeks
            .filter(week => sourceBackedWeekIds.has(week.weekId))
            .every(week => week.state === 'planning-only'))
            .toBe(true);
    });

    it('audits only complete lesson registrations, never support shards', async () => {
        const requests: string[] = [];
        await loadClassWeekDeliveryCatalog(planJson(), lessonFetcher(requests));
        const completeLessons = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => entry.kind === 'lesson');
        const supportShards = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => entry.kind === 'support-shard');

        expect(requests).toEqual(completeLessons.map(entry => `${LESSON_CONTENT_ROOT}${entry.filename}`));
        for (const shard of supportShards) {
            expect(requests).not.toContain(`${LESSON_CONTENT_ROOT}${shard.filename}`);
        }
    });

    it('does not expose audit blockers, source references, or content filenames to Class', async () => {
        const catalog = await loadClassWeekDeliveryCatalog(planJson(), lessonFetcher());
        const learnerQueryData = JSON.stringify(catalog.weeks);

        expect(catalog.weeks.every(week => Object.keys(week).sort().join(',') === 'lessonId,order,state,weekId'))
            .toBe(true);
        expect(learnerQueryData)
            .not.toMatch(/blocker|sha256|filename|sourceQuestion|reviewReason|proofs|\.json/iu);
    });

    it('rejects duplicate or reordered plan identities before loading lesson content', async () => {
        const duplicate = structuredClone(planJson()) as unknown as {
            weeks: Array<{ weekId: string; order: number }>;
        };
        duplicate.weeks[1]!.weekId = duplicate.weeks[0]!.weekId;
        const duplicateFetcher = vi.fn(lessonFetcher());
        await expect(loadClassWeekDeliveryCatalog(duplicate, duplicateFetcher as typeof fetch))
            .rejects.toThrow(/canonical week index/i);
        expect(duplicateFetcher).not.toHaveBeenCalled();

        const reordered = structuredClone(planJson()) as unknown as {
            weeks: Array<{ weekId: string; order: number }>;
        };
        [reordered.weeks[1], reordered.weeks[2]] = [reordered.weeks[2]!, reordered.weeks[1]!];
        const reorderedFetcher = vi.fn(lessonFetcher());
        await expect(loadClassWeekDeliveryCatalog(reordered, reorderedFetcher as typeof fetch))
            .rejects.toThrow(/canonical week index/i);
        expect(reorderedFetcher).not.toHaveBeenCalled();
    });

    it('agrees exactly with the public resource-ledger playable count', async () => {
        const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) as {
            coverage: { classWeeksTotal: number; classWeeksPlayable: number };
        };
        const catalog = await loadClassWeekDeliveryCatalog(planJson(), lessonFetcher());

        expect(ledger.coverage.classWeeksTotal).toBe(catalog.weeks.length);
        expect(ledger.coverage.classWeeksPlayable).toBe(catalog.playableCount);
        expect(catalog.playableCount).toBe(0);
    });
});
