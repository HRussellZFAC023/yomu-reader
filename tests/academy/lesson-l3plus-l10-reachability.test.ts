import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    CANONICAL_CLASS_WEEK_IDS,
    validateClassWeekCastPlan,
    type ClassWeekCastPlan,
} from '../../src/academy/content/class-week-cast-plan';
import {
    LESSON_ACTIVITY_CHAPTER_PACKAGES,
    loadReachableLessonActivityChapter,
} from '../../src/academy/content/lesson-activity-catalog';
import {
    getAuthoredWeekRegistration,
    loadAuthoredWeekPackage,
} from '../../src/academy/content/lesson-content-registry';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const PACKAGE_FILENAME = '063-l2-l36.json';
const PACKAGE_SHA256 = 'e5ed449ecb4c21edfb318db581c604788cd76b206617cae455dbfca2e81dbb0d';
const ARCHIVE_SHA256 = '57ca13bfffee06933f2dc4ee47d9b3ce168fd6d37475c12e0e7f243c9658265';
const PUBLIC_PACKAGE_PATH = path.resolve('public/academy/content/lessons', PACKAGE_FILENAME);
const DOCS_PACKAGE_PATH = path.resolve('docs/public/academy/content/lessons', PACKAGE_FILENAME);

type LessonTenPackage = {
    id: string;
    order: number;
    identity: { moduleId: number; sourceOrdering: { canonicalClassOrder: number } };
    sourceCoverage: {
        archiveModuleId: number;
        projectedPageCount: number;
        archiveSha256: string;
        pages: Array<{ url: string; sha256: string }>;
        audio: {
            status: string;
            tracks: Array<{ label: string; worksheetQuestion: number; url: string; payloadSha256: string }>;
        };
    };
    mapping: { canonicalClassWeekId: string; canonicalClassOrder: number };
    provenance: { activityDelivery: { kind: string; beatIds: string[] } };
};

function packageJson(): LessonTenPackage {
    return JSON.parse(readFileSync(PUBLIC_PACKAGE_PATH, 'utf8')) as LessonTenPackage;
}

describe('Level 3+ Lesson 10 reachability', () => {
    afterEach(() => document.body.replaceChildren());

    it('registers the immutable module 8870527 package on canonical week l3plus-l10', async () => {
        const registration = getAuthoredWeekRegistration('l2-l36');
        expect(registration).toMatchObject({
            filename: PACKAGE_FILENAME,
            packageId: 'l2-l36',
            classWeekId: 'l3plus-l10',
            expectedSha256: PACKAGE_SHA256,
        });

        const loaded = await loadAuthoredWeekPackage('l2-l36', (async () =>
            new Response(readFileSync(PUBLIC_PACKAGE_PATH), { status: 200 })) as typeof fetch);
        expect(loaded.week).toMatchObject({
            id: 'l2-l36',
            activities: [],
            provenance: {
                packageId: 'l2-l36',
                packageProvenance: {
                    activityDelivery: {
                        kind: 'registered-direct-chapter',
                        beatIds: ['youni-goal-workshop', 'younarimasu-change-workshop'],
                    },
                },
            },
        });
        expect(loaded.week.preAssessment).toHaveLength(1);
        expect(LESSON_ACTIVITY_CHAPTER_PACKAGES).toContain('l2-l36');
    });

    it('places Lesson 10 immediately after Lesson 9 and before Kanji 7', () => {
        const plan = validateClassWeekCastPlan(JSON.parse(
            readFileSync(path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'), 'utf8'),
        ) as ClassWeekCastPlan);
        const lessonTenIndex = CANONICAL_CLASS_WEEK_IDS.indexOf('l3plus-l10');

        expect(CANONICAL_CLASS_WEEK_IDS.slice(lessonTenIndex - 1, lessonTenIndex + 2)).toEqual([
            'l3plus-l09',
            'l3plus-l10',
            'l3plus-kanji-7',
        ]);
        expect(plan.weeks.slice(lessonTenIndex - 1, lessonTenIndex + 2).map(week => [week.order, week.weekId]))
            .toEqual([
                [71, 'l3plus-l09'],
                [72, 'l3plus-l10'],
                [73, 'l3plus-kanji-7'],
            ]);
        expect(plan.weeks[lessonTenIndex]).toMatchObject({
            source: {
                donor: 'moodle-reachability-20260719',
                file: 'public/academy/content/lessons/063-l2-l36.json',
                sha256: PACKAGE_SHA256,
            },
            status: 'source-backed',
        });
    });

    it('keeps both existing l2-l36 source beats reachable in order', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l36', { lookup: async () => null });

        expect(chapter?.beats.map(beat => beat.id)).toEqual([
            'youni-goal-workshop',
            'younarimasu-change-workshop',
        ]);
        expect(chapter?.beats.map(beat => (
            beat.activity as { readonly provenance?: { readonly packageId?: string } }
        ).provenance?.packageId)).toEqual([
            'l2-l36',
            'l2-l36',
        ]);
    });

    it('opens an extension-backed authored week without adding a duplicate JSON activity', async () => {
        const loaded = await loadAuthoredWeekPackage('l2-l36', (async () =>
            new Response(readFileSync(PUBLIC_PACKAGE_PATH), { status: 200 })) as typeof fetch);
        const mount = vi.fn((host: HTMLElement) => {
            host.dataset.lessonTenExtension = 'mounted';
            return { focus: vi.fn(), dispose: vi.fn() };
        });
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week: loaded.week,
            extension: { activityCount: 2, mount },
        });
        document.body.append(screen.element);

        expect(screen.element.dataset.lessonPhase).toBe('teaching');
        screen.element.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')!.click();
        expect(screen.element.dataset.lessonPhase).toBe('extension');
        expect(screen.element.querySelector('[data-lesson-ten-extension="mounted"]')).not.toBeNull();
        expect(mount).toHaveBeenCalledOnce();
        expect(screen.currentActivityId).toBeNull();
        screen.dispose();
    });

    it('pins byte-identical package mirrors, all nineteen pages, and B-5/B-6 provenance', () => {
        const lesson = packageJson();

        expect(sha256File(PUBLIC_PACKAGE_PATH)).toBe(PACKAGE_SHA256);
        expect(filesHaveSameContent(PUBLIC_PACKAGE_PATH, DOCS_PACKAGE_PATH)).toBe(true);
        expect(lesson).toMatchObject({
            id: 'l2-l36',
            order: 63,
            identity: { moduleId: 8870527, sourceOrdering: { canonicalClassOrder: 72 } },
            sourceCoverage: {
                archiveModuleId: 8870527,
                projectedPageCount: 19,
                archiveSha256: ARCHIVE_SHA256,
            },
            mapping: { canonicalClassWeekId: 'l3plus-l10', canonicalClassOrder: 72 },
        });
        expect(lesson.sourceCoverage.pages).toHaveLength(19);
        for (const page of lesson.sourceCoverage.pages) {
            const filename = path.basename(page.url);
            const publicAsset = path.resolve('public/academy/content/lessons/l2-l36', filename);
            const docsAsset = path.resolve('docs/public/academy/content/lessons/l2-l36', filename);
            expect(sha256File(publicAsset), filename).toBe(page.sha256);
            expect(filesHaveSameContent(publicAsset, docsAsset), filename).toBe(true);
        }
        expect(lesson.sourceCoverage.audio).toMatchObject({
            status: 'worksheet-numbered-audio-pairing',
            tracks: [
                expect.objectContaining({ label: 'CD B-5', worksheetQuestion: 1 }),
                expect.objectContaining({ label: 'CD B-6', worksheetQuestion: 2 }),
            ],
        });
        for (const track of lesson.sourceCoverage.audio.tracks) {
            const filename = path.basename(track.url);
            const publicAsset = path.resolve('public/academy/content/lessons/l2-l36', filename);
            const docsAsset = path.resolve('docs/public/academy/content/lessons/l2-l36', filename);
            expect(sha256File(publicAsset), filename).toBe(track.payloadSha256);
            expect(filesHaveSameContent(publicAsset, docsAsset), filename).toBe(true);
        }
    });
});
