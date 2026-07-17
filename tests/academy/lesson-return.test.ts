import fs from 'node:fs';
import path from 'node:path';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { createLessonStoryRuntime } from '../../src/academy/content/lesson-story-runtime';
import { worldRouteForPlace } from '../../src/academy/domain/world-locations';
import { lessonCompletionReturn } from '../../src/academy/routing/lesson-return';
import type { AcademyRouteFrame } from '../../src/academy/routing/route-history';

describe('Lesson completion return', () => {
    it('chooses the latest real place rather than the Class intermediary', () => {
        expect(lessonCompletionReturn({
            routeHistory: [{ route: 'campus' }, { route: 'ramen' }, { route: 'class' }],
        })).toEqual({ route: 'ramen' });
    });

    it('keeps a generic world place exact on return', () => {
        expect(lessonCompletionReturn({
            routeHistory: [
                { route: 'street' },
                { route: 'world', worldPlace: 'museum' },
                { route: 'class' },
            ],
        })).toEqual({ route: 'world', worldPlace: 'museum' });
    });

    it('returns a completed Week 1 to Classroom without reopening the completed Week', () => {
        expect(lessonCompletionReturn({
            routeHistory: [
                { route: 'class', selectedBand: 'n5' },
                {
                    route: 'classroom',
                    selectedBand: 'n5',
                    lessonId: 'authored-week:l1-l01',
                    sectionId: 'activity',
                },
            ],
        })).toEqual({ route: 'classroom', selectedBand: 'n5' });
    });

    it('keeps journal and optional story replay returns separate from the Class path', () => {
        expect(lessonCompletionReturn({
            routeHistory: [{ route: 'journal' }, { route: 'class' }],
        })).toEqual({ route: 'journal' });
        expect(lessonCompletionReturn({
            routeHistory: [{ route: 'story', sectionId: 's1e18-the-memory-card-museum' }, { route: 'class' }],
        })).toEqual({ route: 'story', sectionId: 's1e18-the-memory-card-museum' });
    });

    it('returns Lessons 27-31 to the exact world route that originated each lesson', () => {
        const plan = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
            'utf8',
        )));
        const runtime = createLessonStoryRuntime(plan);

        for (const packageId of ['l2-l02', 'l2-l03', 'l2-l04', 'l2-l05', 'l2-l06']) {
            const place = runtime.continuity(packageId)?.world?.originPlaceId;
            expect(place).toBeDefined();
            const route = worldRouteForPlace(place!);
            const origin: AcademyRouteFrame = route === 'world' ? { route, worldPlace: place } : { route };
            expect(lessonCompletionReturn({ routeHistory: [origin, { route: 'class' }] })).toEqual(origin);
        }
    });

    it('returns l2-l07 to its recorded place without requiring story-continuity metadata', () => {
        expect(lessonCompletionReturn({
            routeHistory: [{ route: 'station' }, { route: 'class' }],
        })).toEqual({ route: 'station' });
    });

    it('falls back to Class when no current place led into the lesson', () => {
        expect(lessonCompletionReturn({ routeHistory: [{ route: 'profile-sync' }] })).toEqual({ route: 'class' });
    });
});
