import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { createLessonFortyCompletionRepairBeat } from '../../src/academy/content/lesson-forty-completion-repair';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonStoryRuntime, lessonStoryPresentation } from '../../src/academy/content/lesson-story-runtime';
import type { ActivityModel } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';

const PACKAGE_ID = 'l2-l15';
const PACKAGE_FILE = '042-l2-l15.json';
const SOURCE_PAYLOAD_SHA256 = 'c41e4dd83224a8c29a3e6eb07e7e7955a086e3fccbf4a93a5260efaedcf4e3b8';
const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));
const SOURCE_VISUALS = {
    'moodle-chapter-29-2-completion-repair-page-1.png': '740c85dcc650f67e4fa84afccba19eea993e72730fdac67372daa8604299940b',
    'moodle-chapter-29-2-completion-repair-page-2.png': 'fc529706b6821d2629b213f7269306b971c5a40c1491cc9e382814fe3d183a39',
    'moodle-chapter-29-2-completion-repair-page-3.png': 'a126ab62a102564bb6f8d1ff807da6853009c860dc25be5434ec773afffb6983',
    'moodle-chapter-29-2-completion-repair-page-4.png': '966e692b4e190de0d319635e84c536c1d4c2f1f1e983b36934271c3670692b98',
    'moodle-chapter-29-2-completion-repair-page-5.png': '6f2aa526c4ff763da9fdf2773a090cfb06d860283ac35a5f046371b36b36e743',
} as const;

afterEach(() => document.body.replaceChildren());

describe('Lesson 40 asset and presentation grounding', () => {
    it('authorizes the exact name-only roster and approved responsive classroom plate', () => {
        const entry = createLessonStoryRuntime(PLAN).continuity(PACKAGE_ID)!;
        expect(entry).toMatchObject({
            classWeekId: 'l3-2-l04',
            hostId: 'alex',
            supportingIds: ['jodi'],
            presentation: 'name-only',
            world: { originPlaceId: 'classroom' },
        });
        expect(lessonStoryPresentation(entry)).toMatchObject({
            originPlaceId: 'classroom',
            plate: 'classroom',
            castPresentation: 'name-only',
        });
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['location.classroom']).toMatchObject({
            status: 'approved',
            runtimeHomes: expect.arrayContaining(['lesson:l2-l15']),
            files: ACADEMY_ASSETS.locations.classroom,
        });
        expect(ACADEMY_ASSETS.locations.classroom.mobile)
            .not.toBe(ACADEMY_ASSETS.locations.classroom.wide);
    });

    it('renders responsive scene art with Alex and Jodi named but no cast likeness or item art', () => {
        const entry = createLessonStoryRuntime(PLAN).continuity(PACKAGE_ID)!;
        const presentation = lessonStoryPresentation(entry)!;
        const registration = getAuthoredWeekRegistration(PACKAGE_ID);
        const week = registration.validate(JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/lessons', registration.filename),
            'utf8',
        )));
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: 'Alex',
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({
                    ...turn,
                    speakerName: turn.speakerId === 'alex' ? 'Alex' : 'Jodi',
                })),
            },
        });

        expect(screen.element.dataset.plate).toBe('classroom');
        expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain(ACADEMY_ASSETS.locations.classroom.wide);
        expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain(ACADEMY_ASSETS.locations.classroom.mobile);
        const story = screen.element.querySelector('.academy-authored-week-story-context')?.textContent;
        expect(story).toContain('Alex');
        expect(story).toContain('Jodi');
        expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
        expect(screen.element.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        screen.dispose();
    });

    it('mounts exactly five lazy keyboard inspectors and conceals every derived answer', () => {
        const host = document.createElement('main');
        const activity = createLessonFortyCompletionRepairBeat().activity as ActivityModel;
        const controller = createAcademyActivityRuntime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.append(host);

        const visuals = [...host.querySelectorAll<HTMLElement>('[data-source-visual]')];
        expect(visuals).toHaveLength(5);
        expect(visuals.map(visual => path.basename(visual.dataset.sourceVisual!)))
            .toEqual(Object.keys(SOURCE_VISUALS));
        visuals.forEach(visual => {
            const filename = path.basename(visual.dataset.sourceVisual!) as keyof typeof SOURCE_VISUALS;
            const trigger = visual.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')!;
            const thumbnail = trigger.querySelector<HTMLImageElement>('img')!;
            const dialog = visual.querySelector<HTMLDialogElement>('[data-source-inspector]')!;
            expect(visual.dataset.sourceSha256).toBe(SOURCE_VISUALS[filename]);
            expect(thumbnail.dataset.sourceSha256).toBe(SOURCE_VISUALS[filename]);
            expect(thumbnail.loading).toBe('lazy');
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

    it('pins the unique five-page source, mirrors, offline homes, and generated Lesson 40 ownership', () => {
        const packageFiles = fs.readdirSync(path.resolve('public/academy/content/lessons'))
            .filter(filename => filename.endsWith('.json'));
        const owners = packageFiles.flatMap(filename => {
            const lesson = JSON.parse(fs.readFileSync(
                path.resolve('public/academy/content/lessons', filename),
                'utf8',
            )) as { id?: string; sourceCoverage?: { members?: Array<{ payloadSha256?: string }> } };
            return lesson.sourceCoverage?.members?.some(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256)
                ? [{ filename, id: lesson.id }]
                : [];
        });
        expect(owners).toEqual([{ filename: PACKAGE_FILE, id: PACKAGE_ID }]);

        for (const [filename, sha256] of Object.entries(SOURCE_VISUALS)) {
            const source = fs.readFileSync(path.resolve('public/academy/content/lessons', PACKAGE_ID, filename));
            const hosted = fs.readFileSync(path.resolve('docs/public/academy/content/lessons', PACKAGE_ID, filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(sha256);
            expect(hosted).toEqual(source);
        }
        expect(fs.readFileSync(path.resolve('docs/public/academy/content/lessons', PACKAGE_FILE)))
            .toEqual(fs.readFileSync(path.resolve('public/academy/content/lessons', PACKAGE_FILE)));

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = fs.readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain(`'/academy/content/lessons/${PACKAGE_FILE}'`);
            Object.keys(SOURCE_VISUALS).forEach(filename => {
                expect(worker).toContain(`'/academy/content/lessons/${PACKAGE_ID}/${filename}'`);
            });
            Object.values(ACADEMY_ASSETS.locations.classroom).forEach(asset => {
                expect(worker).toContain(`'${asset}'`);
            });
        }

        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ASSET-USAGE.json')))
            .toEqual(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json')));
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8'));
        expect(ledger.assets.find((asset: { id: string }) => asset.id === 'classroom-evening-lamplit').runtimeHome)
            .toContain('lesson:l2-l15');
        const registry = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ACADEMY-ASSET-REGISTRY.json'), 'utf8'));
        expect(registry.lessons.find((entry: { ordinal: number }) => entry.ordinal === 40)).toMatchObject({
            packageId: PACKAGE_ID,
            plateAssetId: 'location.classroom',
            orphanStatus: 'active-runtime',
            responsiveVariants: { status: 'complete-distinct-pair' },
            missingPurposefulAssets: [],
        });
        expect(registry.missingPurposefulAssets.some((gap: { scope: string }) => gap.scope === 'lesson:40'))
            .toBe(false);
    });
});
