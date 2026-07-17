import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS, ACADEMY_RUNTIME_ASSET_REGISTRY, type AcademyPlateId } from '../../src/academy/assets';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { createLessonThirtySevenNagaraWorkshopBeat } from '../../src/academy/content/lesson-thirty-seven-nagara-workshop';
import { createLessonThirtyEightShiReasonChainBeat } from '../../src/academy/content/lesson-thirty-eight-shi-reason-chain';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonStoryRuntime, lessonStoryPresentation } from '../../src/academy/content/lesson-story-runtime';
import type { ActivityModel } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { validateCommittedAuthoredWeek } from './helpers/authored-week-package';

const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));

const LESSONS = [
    {
        ordinal: 37,
        packageId: 'l2-l12',
        packageFile: '039-l2-l12.json',
        classWeekId: 'l3-2-l01',
        hostId: 'christian',
        hostName: 'Christian',
        supportingId: 'xingyu',
        supportingName: 'Xingyu',
        originPlaceId: 'home',
        plate: 'writingStudio' as AcademyPlateId,
        assetId: 'location.writing-studio' as const,
        createBeat: createLessonThirtySevenNagaraWorkshopBeat,
        visuals: {
            'moodle-chapter-28-1-nagara-page-1.png': 'a0e5167eafeacd2316aa60681c14d4de5da5eb8970b3198f335d441d8b3f088f',
            'moodle-chapter-28-1-nagara-page-2.png': 'c21841db30455c7bd40b0a8b05382d53e17e857b3d9518e830b88887a18dd241',
        },
    },
    {
        ordinal: 38,
        packageId: 'l2-l13',
        packageFile: '040-l2-l13.json',
        classWeekId: 'l3-2-l02',
        hostId: 'francis',
        hostName: 'Francis',
        supportingId: 'sam',
        supportingName: 'Sam',
        originPlaceId: 'restaurant',
        plate: 'cafe' as AcademyPlateId,
        assetId: 'location.cafe' as const,
        createBeat: createLessonThirtyEightShiReasonChainBeat,
        visuals: {
            'moodle-chapter-28-2-shi-page-1.png': '4327dd0ab969ee7b0cb96673ae4d3d3cc497d76da2e4461bec2883e07b991f5d',
            'moodle-chapter-28-2-shi-page-2.png': '5295e4d4ec26ab038abd880747cb0f46daba60cda3c0cc8ac1ce25fd62b95cc2',
        },
    },
] as const;

afterEach(() => document.body.replaceChildren());

describe('Lessons 37-38 asset and presentation grounding', () => {
    it.each(LESSONS)('authorizes $packageId to its exact name-only cast and approved responsive plate', lesson => {
        const entry = createLessonStoryRuntime(PLAN).continuity(lesson.packageId)!;
        expect(entry).toMatchObject({
            classWeekId: lesson.classWeekId,
            hostId: lesson.hostId,
            supportingIds: [lesson.supportingId],
            presentation: 'name-only',
            world: { originPlaceId: lesson.originPlaceId },
        });
        expect(lessonStoryPresentation(entry)).toMatchObject({
            originPlaceId: lesson.originPlaceId,
            plate: lesson.plate,
            castPresentation: 'name-only',
        });
        const asset = ACADEMY_RUNTIME_ASSET_REGISTRY[lesson.assetId];
        expect(asset).toMatchObject({
            status: 'approved',
            runtimeHomes: expect.arrayContaining([`lesson:${lesson.packageId}`]),
            files: ACADEMY_ASSETS.locations[lesson.plate],
        });
        expect(asset.files.mobile).not.toBe(asset.files.wide);
    });

    it.each(LESSONS)('renders $packageId with responsive art and no cast likeness or item art', async lesson => {
        const entry = createLessonStoryRuntime(PLAN).continuity(lesson.packageId)!;
        const presentation = lessonStoryPresentation(entry)!;
        const registration = getAuthoredWeekRegistration(lesson.packageId);
        const { week } = await validateCommittedAuthoredWeek(registration);
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: lesson.hostName,
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({
                    ...turn,
                    speakerName: turn.speakerId === lesson.hostId ? lesson.hostName : lesson.supportingName,
                })),
            },
        });

        expect(screen.element.dataset.plate).toBe(lesson.plate);
        expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain(ACADEMY_ASSETS.locations[lesson.plate].wide);
        expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain(ACADEMY_ASSETS.locations[lesson.plate].mobile);
        const story = screen.element.querySelector('.academy-authored-week-story-context')?.textContent;
        expect(story).toContain(lesson.hostName);
        expect(story).toContain(lesson.supportingName);
        expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
        expect(screen.element.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        screen.dispose();
    });

    it.each(LESSONS)('mounts $packageId exact pages as lazy keyboard inspectors and conceals answers', lesson => {
        const host = document.createElement('main');
        const activity = lesson.createBeat().activity as ActivityModel;
        const controller = createAcademyActivityRuntime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.append(host);

        const visuals = [...host.querySelectorAll<HTMLElement>('[data-source-visual]')];
        expect(visuals).toHaveLength(2);
        expect(visuals.map(visual => path.basename(visual.dataset.sourceVisual!)))
            .toEqual(Object.keys(lesson.visuals));
        visuals.forEach(visual => {
            const filename = path.basename(visual.dataset.sourceVisual!);
            const expectedSha = lesson.visuals[filename as keyof typeof lesson.visuals];
            const trigger = visual.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')!;
            const thumbnail = trigger.querySelector<HTMLImageElement>('img')!;
            const dialog = visual.querySelector<HTMLDialogElement>('[data-source-inspector]')!;
            expect(visual.dataset.sourceSha256).toBe(expectedSha);
            expect(thumbnail.dataset.sourceSha256).toBe(expectedSha);
            expect(trigger.type).toBe('button');
            expect(trigger.getAttribute('aria-label')).toContain('Inspect');
            expect(dialog.querySelector('img')).toBeNull();
            trigger.focus();
            expect(document.activeElement).toBe(trigger);
            trigger.click();
            expect(dialog.hasAttribute('open')).toBe(true);
            expect(dialog.querySelector<HTMLImageElement>('img')?.loading).toBe('lazy');
            dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
            expect(dialog.hasAttribute('open')).toBe(false);
        });
        const answerKey = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(answerKey.hidden).toBe(true);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        controller.dispose();
    });

    it.each(LESSONS)('pins $packageId source bytes, mirrors, offline paths, and generated registry ownership', lesson => {
        for (const [filename, sha256] of Object.entries(lesson.visuals)) {
            const source = fs.readFileSync(path.resolve('public/academy/content/lessons', lesson.packageId, filename));
            const hosted = fs.readFileSync(path.resolve('docs/public/academy/content/lessons', lesson.packageId, filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(sha256);
            expect(hosted).toEqual(source);
        }
        expect(fs.readFileSync(path.resolve('docs/public/academy/content/lessons', lesson.packageFile)))
            .toEqual(fs.readFileSync(path.resolve('public/academy/content/lessons', lesson.packageFile)));

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = fs.readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain(`'/academy/content/lessons/${lesson.packageFile}'`);
            Object.keys(lesson.visuals).forEach(filename => {
                expect(worker).toContain(`'/academy/content/lessons/${lesson.packageId}/${filename}'`);
            });
            Object.values(ACADEMY_ASSETS.locations[lesson.plate]).forEach(asset => {
                expect(worker).toContain(`'${asset}'`);
            });
        }

        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ASSET-USAGE.json')))
            .toEqual(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json')));
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8'));
        expect(ledger.assets.find((asset: { id: string }) => asset.id === assetLedgerId(lesson.assetId)).runtimeHome)
            .toContain(`lesson:${lesson.packageId}`);
        const registry = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ACADEMY-ASSET-REGISTRY.json'), 'utf8'));
        expect(registry.lessons.find((entry: { ordinal: number }) => entry.ordinal === lesson.ordinal)).toMatchObject({
            packageId: lesson.packageId,
            plateAssetId: lesson.assetId,
            orphanStatus: 'active-runtime',
            responsiveVariants: { status: 'complete-distinct-pair' },
            missingPurposefulAssets: [],
        });
        expect(registry.missingPurposefulAssets.some((gap: { scope: string }) => gap.scope === `lesson:${lesson.ordinal}`)).toBe(false);
    });
});

function assetLedgerId(assetId: 'location.writing-studio' | 'location.cafe'): string {
    return assetId === 'location.writing-studio' ? 'writing-studio-rain-night' : 'cafe-night-rain';
}
