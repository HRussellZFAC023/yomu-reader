import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAuthoredWeekRegistration, loadAuthoredWeekPackage, type LoadedAuthoredWeekPackage } from '../../src/academy/content/lesson-content-registry';
import { createGroundedLessonResolver } from '../../src/academy/content/grounded-lesson-resolver';
import { createLessonNineWeeklyPlanBeat } from '../../src/academy/content/lesson-nine-weekly-plan';
import { createLessonNineteenOrderingFoodBeat } from '../../src/academy/content/lesson-nineteen-ordering-food';
import { createLessonNineteenListeningGridBeat } from '../../src/academy/content/lesson-nineteen-listening-grid';
import { loadLessonActivityChapter, loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { validateCommittedAuthoredWeek, committedAuthoredWeekFetcher } from './helpers/authored-week-package';

const PACKAGE_ID = 'l2-l24';

const REGISTRATION = getAuthoredWeekRegistration(PACKAGE_ID);

const PACKAGE_PATH = path.resolve('public/academy/content/lessons', REGISTRATION.filename);

describe('authored Academy package loader', () => {
    it('validates package 051 from the exact fetched bytes', async () => {
        const bytes = fs.readFileSync(PACKAGE_PATH);
        const requests: string[] = [];
        const loaded = await loadAuthoredWeekPackage(PACKAGE_ID, (async input => {
            requests.push(String(input));
            return new Response(bytes, {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch);

        expect(requests).toEqual(['/academy/content/lessons/051-l2-l24.json']);
        expect(loaded.week).toMatchObject({
            id: PACKAGE_ID,
            provenance: {
                packageId: PACKAGE_ID,
                source: {
                    path: '/academy/content/lessons/051-l2-l24.json',
                    sha256: REGISTRATION.expectedSha256,
                },
            },
        });
    });

    it('rejects a one-byte mutation even when the resulting JSON is still valid', async () => {
        const mutated = Buffer.concat([fs.readFileSync(PACKAGE_PATH), Buffer.from(' ')]);
        const fetcher = (async () => new Response(mutated, {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch;

        await expect(loadAuthoredWeekPackage(PACKAGE_ID, fetcher))
            .rejects.toThrow(/does not match its registered bytes/i);
    });

    it('ignores trusted-looking hash metadata and rejects the changed response bytes', async () => {
        const value = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8')) as Record<string, unknown>;
        const forged = JSON.stringify({ ...value, sha256: REGISTRATION.expectedSha256 });
        const fetcher = (async () => new Response(forged, {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-content-sha256': REGISTRATION.expectedSha256,
            },
        })) as typeof fetch;

        await expect(loadAuthoredWeekPackage(PACKAGE_ID, fetcher))
            .rejects.toThrow(/does not match its registered bytes/i);
    });
});

describe('grounded-lesson-resolver behavior', () => {
    const LESSON_ZERO = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

    describe('grounded lesson resolver', () => {
        it('re-audits the shipped bytes through the complete lesson registry', async () => {
            const requests: string[] = [];
            const resolver = createGroundedLessonResolver((async input => {
                requests.push(String(input));
                return new Response(fs.readFileSync(LESSON_ZERO), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }) as typeof fetch);

            const lesson = await resolver.resolve('lesson:foundation-00');
            expect(lesson).toMatchObject({ lessonId: 'lesson:foundation-00', status: 'review-blocked' });
            expect(requests).toEqual(['/academy/content/lessons/lesson-zero.v1.json']);
            await resolver.resolve('lesson:foundation-00');
            expect(requests).toHaveLength(1);
        });

        it('rejects an unregistered caller-named lesson before fetching content', async () => {
            const fetcher = vi.fn(async () => new Response('{}'));
            const resolver = createGroundedLessonResolver(fetcher as typeof fetch);

            await expect(resolver.resolve('lesson:forged')).rejects.toThrow(/unregistered complete academy lesson/i);
            expect(fetcher).not.toHaveBeenCalled();
        });

        it('rejects changed bytes even when the JSON still looks structurally valid', async () => {
            const value = JSON.parse(fs.readFileSync(LESSON_ZERO, 'utf8')) as Record<string, unknown>;
            const resolver = createGroundedLessonResolver((async () => new Response(JSON.stringify(value), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })) as typeof fetch);

            await expect(resolver.resolve('lesson:foundation-00')).rejects.toThrow(/registered bytes/i);
        });
    });
});

describe('lesson-nine-nineteen-materialization behavior', () => {
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
});
