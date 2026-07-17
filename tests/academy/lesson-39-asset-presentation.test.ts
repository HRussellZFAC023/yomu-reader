import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonStoryRuntime, lessonStoryPresentation } from '../../src/academy/content/lesson-story-runtime';
import { createLessonThirtyNineStateInspectionBeat } from '../../src/academy/content/lesson-thirty-nine-state-inspection';
import type { ActivityModel } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { validateCommittedAuthoredWeek } from './helpers/authored-week-package';

const PACKAGE_ID = 'l2-l14';
const PACKAGE_FILE = '041-l2-l14.json';
const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));
const SOURCE_VISUALS = {
    'moodle-chapter-29-1-states-page-1.png': '2e2caf0281d4fded34bbe048ea394bbd68587c65368dcfcb24fc5aa51b3668de',
    'moodle-chapter-29-1-states-page-2.png': 'b96eb554de5fe31948496e2584883a77d1a0312ae8a1ba40754fb773b00d7127',
    'moodle-chapter-29-1-states-page-3.png': '7e96bf07343e125e13aa037620067d968cb6ae4577b3ba575e61b0ba6481225f',
    'moodle-chapter-29-1-states-page-4.png': '6ece5c49c000519585b15a5d3510b8b2943f4c4832199b15642af475f0fadcd9',
} as const;

afterEach(() => document.body.replaceChildren());

describe('Lesson 39 asset and presentation grounding', () => {
    it('authorizes the exact name-only cast and approved responsive language-lab plate', () => {
        const entry = createLessonStoryRuntime(PLAN).continuity(PACKAGE_ID)!;
        expect(entry).toMatchObject({
            classWeekId: 'l3-2-l03',
            hostId: 'jenny',
            supportingIds: ['angel'],
            presentation: 'name-only',
            world: { originPlaceId: 'lab' },
        });
        expect(lessonStoryPresentation(entry)).toMatchObject({
            originPlaceId: 'lab',
            plate: 'languageLab',
            castPresentation: 'name-only',
        });
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['location.language-lab']).toMatchObject({
            status: 'approved',
            runtimeHomes: expect.arrayContaining(['lesson:l2-l14']),
            files: ACADEMY_ASSETS.locations.languageLab,
        });
        expect(ACADEMY_ASSETS.locations.languageLab.mobile)
            .not.toBe(ACADEMY_ASSETS.locations.languageLab.wide);
    });

    it('renders responsive scene art with Jenny and Angel named but no cast likeness or item art', async () => {
        const entry = createLessonStoryRuntime(PLAN).continuity(PACKAGE_ID)!;
        const presentation = lessonStoryPresentation(entry)!;
        const registration = getAuthoredWeekRegistration(PACKAGE_ID);
        const { week } = await validateCommittedAuthoredWeek(registration);
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: 'Jenny',
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({
                    ...turn,
                    speakerName: turn.speakerId === 'jenny' ? 'Jenny' : 'Angel',
                })),
            },
        });

        expect(screen.element.dataset.plate).toBe('languageLab');
        expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain(ACADEMY_ASSETS.locations.languageLab.wide);
        expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain(ACADEMY_ASSETS.locations.languageLab.mobile);
        expect(screen.element.querySelector('.academy-authored-week-story-context')?.textContent)
            .toContain('Jenny');
        expect(screen.element.querySelector('.academy-authored-week-story-context')?.textContent)
            .toContain('Angel');
        expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
        expect(screen.element.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        screen.dispose();
    });

    it('mounts exactly four lazy keyboard inspectors and conceals every derived answer', () => {
        const host = document.createElement('main');
        const activity = createLessonThirtyNineStateInspectionBeat().activity as ActivityModel;
        const controller = createAcademyActivityRuntime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.append(host);

        const visuals = [...host.querySelectorAll<HTMLElement>('[data-source-visual]')];
        expect(visuals).toHaveLength(4);
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

    it('pins source bytes, mirrors, offline homes, and generated Lesson 39 ownership', () => {
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
            Object.values(ACADEMY_ASSETS.locations.languageLab).forEach(asset => {
                expect(worker).toContain(`'${asset}'`);
            });
        }

        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ASSET-USAGE.json')))
            .toEqual(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json')));
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8'));
        expect(ledger.assets.find((asset: { id: string }) => asset.id === 'language-lab-evening-listening').runtimeHome)
            .toContain('lesson:l2-l14');
        const registry = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ACADEMY-ASSET-REGISTRY.json'), 'utf8'));
        expect(registry.lessons.find((entry: { ordinal: number }) => entry.ordinal === 39)).toMatchObject({
            packageId: PACKAGE_ID,
            plateAssetId: 'location.language-lab',
            orphanStatus: 'active-runtime',
            responsiveVariants: { status: 'complete-distinct-pair' },
            missingPurposefulAssets: [],
        });
        expect(registry.missingPurposefulAssets.some((gap: { scope: string }) => gap.scope === 'lesson:39'))
            .toBe(false);
    });
});
