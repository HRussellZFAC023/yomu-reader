import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonNineWeeklyPlanBeat } from '../../src/academy/content/lesson-nine-weekly-plan';
import { createLessonNineteenOrderingFoodBeat } from '../../src/academy/content/lesson-nineteen-ordering-food';
import { createLessonNineteenListeningGridBeat } from '../../src/academy/content/lesson-nineteen-listening-grid';
import { loadLessonActivityChapter, loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { getAuthoredWeekRegistration, loadAuthoredWeekPackage, type LoadedAuthoredWeekPackage } from '../../src/academy/content/lesson-content-registry';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { validateCommittedAuthoredWeek, committedAuthoredWeekFetcher } from './helpers/authored-week-package';

const ids = ['l1-l09', 'l1-l19'] as const;
const factories = [
    { id: 'l1-l09', create: createLessonNineWeeklyPlanBeat },
    { id: 'l1-l19', create: createLessonNineteenOrderingFoodBeat },
    { id: 'l1-l19', create: createLessonNineteenListeningGridBeat },
];
const loaded = new Map<string, LoadedAuthoredWeekPackage>();
const writing = { lookup: async () => null };
beforeAll(async () => {
    for (const id of [...ids, 'l1-l20']) loaded.set(id, await validateCommittedAuthoredWeek(getAuthoredWeekRegistration(id)));
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('Lesson 9 and 19 package materialization', () => {
    it.each(ids)('%s reuses supplied data without fetching and standalone loads exactly once', async id => {
        const unavailable = vi.fn(async () => { throw new Error('Offline'); });
        vi.stubGlobal('fetch', unavailable);
        const supplied = await loadLessonActivityChapter(id, writing, loaded.get(id));
        expect(unavailable).not.toHaveBeenCalled();
        const fetcher = vi.fn(committedAuthoredWeekFetcher(getAuthoredWeekRegistration(id)));
        vi.stubGlobal('fetch', fetcher);
        const standalone = await loadLessonActivityChapter(id, writing);
        expect(standalone).toEqual(supplied);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(supplied?.beats).toHaveLength(id === 'l1-l19' ? 2 : 1);
    });

    it.each(factories)('$id factory rejects another package, wrong revision and missing source evidence', ({ id, create }) => {
        const value = loaded.get(id)!;
        expect(() => create(loaded.get('l1-l20')!)).toThrow('validated');
        expect(() => create({ ...value, week: { ...value.week, provenance: { ...value.week.provenance, source: { ...value.week.provenance.source, sha256: '0'.repeat(64) } } } })).toThrow('validated');
        const source = structuredClone(value.value) as { identity: { moduleId: number }; sourceCoverage: { members: unknown[] }; genkiInteractiveActivities: unknown[]; provenance: { sourceMappings: unknown[] } };
        source.identity.moduleId = 0;
        expect(() => create({ ...value, value: source })).toThrow('identity');
        const missingSources = structuredClone(value.value) as typeof source;
        missingSources.sourceCoverage.members = [];
        expect(() => create({ ...value, value: missingSources })).toThrow();
        if (id === 'l1-l09') {
            const missingGenki = structuredClone(value.value) as typeof source;
            missingGenki.genkiInteractiveActivities = [];
            expect(() => create({ ...value, value: missingGenki })).toThrow('Genki');
        }
    });

    it('keeps ordering-food Minna evidence mandatory', () => {
        const pkg = loaded.get('l1-l19')!;
        const value = structuredClone(pkg.value) as { provenance: { sourceMappings: unknown[] } };
        value.provenance.sourceMappings = [];
        expect(() => createLessonNineteenOrderingFoodBeat({ ...pkg, value })).toThrow('Minna');
    });

    it.each(ids)('%s rejects altered bytes and keeps optional failure separate from core lessons', async id => {
        const registration = getAuthoredWeekRegistration(id);
        const bytes = readFileSync(path.resolve('public/academy/content/lessons', registration.filename));
        vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.concat([bytes, Buffer.from(' ')]), { headers: { 'x-content-sha256': registration.expectedSha256 } })));
        await expect(loadAuthoredWeekPackage(id)).rejects.toThrow('registered bytes');
        await expect(loadLessonActivityChapter(id, writing)).rejects.toThrow('registered bytes');
        expect(await loadReachableLessonActivityChapter(id, writing)).toBeNull();
        const bad = { ...loaded.get(id)!, value: { id: 'wrong' } };
        expect(await loadReachableLessonActivityChapter(id, writing, bad)).toBeNull();
        const screen = createAuthoredWeekScreen({ language: 'en', week: loaded.get(id)!.week });
        document.body.append(screen.element);
        expect(screen.element.dataset.academyScreen).toBe('authored-week');
        screen.dispose();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
        await expect(loadLessonActivityChapter(id, writing)).rejects.toThrow('503');
        expect(await loadReachableLessonActivityChapter(id, writing)).toBeNull();
    });
});
