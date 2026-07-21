import fs from 'node:fs';
import path from 'node:path';
import { N3_MOCK_LISTENING_PACKAGES } from '../../src/academy/content/n3-mock-listening/package';
import { resolveAdvancedCurriculumEntry } from '../../src/academy/content/advanced-curriculum';
import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import type { AcademyCheckpoint, AcademyCheckpointUpdate, AcademyRoute } from '../../src/academy/persistence/indexeddb';
import { createLessonFlow } from '../../src/academy/routing/lesson-flow';
import type { AcademyRouteContext } from '../../src/academy/routing/types';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

const PLAN_PATH = path.resolve('public/academy/content/curriculum/class-week-cast.v1.json');
const LESSON_ROOT = path.resolve('public/academy/content/lessons');

function shell(): AcademyShell & { current?: HTMLElement } {
    const value = {
        screen: document.createElement('main'),
        current: undefined as HTMLElement | undefined,
        replace(view: HTMLElement) { value.current = view; },
        setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
        setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
    };
    return value;
}

describe('N3 mock-listening learner rail integration', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async input => {
            const url = String(input);
            const lessonMatch = url.match(/\/content\/lessons\/([^/]+\.json)$/u);
            const filePath = url.endsWith('/content/curriculum/class-week-cast.v1.json')
                ? PLAN_PATH
                : lessonMatch ? path.join(LESSON_ROOT, lessonMatch[1]) : null;
            if (!filePath) return new Response(null, { status: 404 });
            return new Response(fs.readFileSync(filePath), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }));
    });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('clicks Class into every package intro and exact advanced activity without a Lesson 0 fallback', async () => {
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'entry:n3',
            at: 1,
            kind: 'curriculum-entry-chosen',
            route: 'manual-band',
            band: 'n3',
        }]);

        for (const [index, packageRecord] of N3_MOCK_LISTENING_PACKAGES.entries()) {
            const classShell = shell();
            const navigations: Array<readonly [AcademyRoute, AcademyCheckpointUpdate | undefined]> = [];
            const go: AcademyRouteContext['go'] = async (route, update) => {
                navigations.push([route, update]);
            };
            await createWorldFlow({
                evidence: {
                    history: vi.fn(async () => []),
                    dueReviews: vi.fn(async () => []),
                } as never,
                pronunciation: {} as never,
                audio: {} as never,
            }).render('class', {
                language: 'en',
                checkpoint: {
                    schemaVersion: 2,
                    route: 'class',
                    routeHistory: [],
                    presentationMode: 'course',
                    selectedBand: 'n3',
                    updatedAt: 1,
                },
                projection,
                shell: classShell,
                go,
                back: vi.fn(async () => undefined),
            });

            const stop = classShell.current?.querySelector<HTMLElement>(`[data-package-id="${packageRecord.id}"]`);
            expect(stop, packageRecord.id).not.toBeNull();
            expect(stop?.dataset.railState).toBe(index === 0 ? 'recommended' : 'gated');
            stop?.querySelector<HTMLButtonElement>('button')?.click();
            const navigation = navigations.at(-1);
            expect(navigation?.[0]).toBe('source-activity');
            expect(navigation?.[1]).toMatchObject({
                selectedBand: 'n3',
                lessonId: `advanced:${packageRecord.id}`,
                activityId: packageRecord.activity.id,
            });
            expect(navigation?.[1]?.activityId).not.toBeUndefined();
            expect(navigation?.[1]?.lessonId).not.toBe('lesson:foundation-00');
            expect(Boolean(navigation?.[1]?.placementOverride)).toBe(index > 0);

            const lessonShell = shell();
            const checkpoint: AcademyCheckpoint = {
                schemaVersion: 2,
                route: 'source-activity',
                routeHistory: [{ route: 'class', selectedBand: 'n3' }],
                presentationMode: 'course',
                selectedBand: 'n3',
                lessonId: `advanced:${packageRecord.id}`,
                activityId: packageRecord.activity.id,
                ...(index > 0 ? { placementOverride: true } : {}),
                updatedAt: 2,
            };
            const context: AcademyRouteContext = {
                language: 'en',
                checkpoint,
                projection,
                shell: lessonShell,
                go: vi.fn(async () => undefined),
                back: vi.fn(async () => undefined),
            };
            await createLessonFlow({
                evidence: { recordActivity: vi.fn(async () => undefined) } as never,
                pronunciation: { async play() { return { dispose() {} }; } },
                kanjiWriting: {} as never,
            }).render('source-activity', context);

            expect(lessonShell.current?.dataset.academyScreen).toBe('advanced-lesson');
            expect(lessonShell.current?.dataset.advancedPackageId).toBe(packageRecord.id);
            expect(lessonShell.current?.textContent).toContain(resolveAdvancedCurriculumEntry(packageRecord.id).summary.en);
            lessonShell.current?.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')?.click();
            expect(lessonShell.current?.querySelector('[data-activity-stage="teaching"]')).not.toBeNull();
            expect(lessonShell.current?.querySelector('[data-activity-id]')).toBeNull();
            lessonShell.current?.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')?.click();
            expect(lessonShell.current?.querySelector<HTMLElement>('[data-activity-id]')?.dataset.activityId)
                .toBe(packageRecord.activity.id);
        }
    });
});
