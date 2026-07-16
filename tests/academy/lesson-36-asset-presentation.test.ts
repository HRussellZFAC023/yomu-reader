import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonStoryRuntime, lessonStoryPresentation } from '../../src/academy/content/lesson-story-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';

const SOURCE_VISUAL = {
    file: 'l2-l11/moodle-new-chapter-23-1-toki-page-1.png',
    url: '/academy/content/lessons/l2-l11/moodle-new-chapter-23-1-toki-page-1.png',
    sha256: 'ad277c6188de6603a9cd2fcb3ba33263dd12ddf88340f9c3b79c71bc585fd890',
} as const;

const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));

afterEach(() => document.body.replaceChildren());

describe('Lesson 36 asset and presentation grounding', () => {
    it('binds only the source-backed Angel and Alex owner to the approved station plate', () => {
        const entry = createLessonStoryRuntime(PLAN).continuity('l2-l11')!;
        expect(entry).toMatchObject({
            classWeekId: 'l2plus-l10',
            hostId: 'angel',
            supportingIds: ['alex'],
            presentation: 'name-only',
            world: { originPlaceId: 'station' },
        });
        expect(lessonStoryPresentation(entry)).toMatchObject({
            originPlaceId: 'station',
            plate: 'station',
            castPresentation: 'name-only',
        });
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['location.station']).toMatchObject({
            status: 'approved',
            runtimeHomes: expect.arrayContaining(['lesson:l2-l11']),
            files: ACADEMY_ASSETS.locations.station,
        });
    });

    it('renders distinct responsive station files and exact cast names without likeness or item art', () => {
        const entry = createLessonStoryRuntime(PLAN).continuity('l2-l11')!;
        const presentation = lessonStoryPresentation(entry)!;
        const registration = getAuthoredWeekRegistration('l2-l11');
        const week = registration.validate(JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/lessons', registration.filename),
            'utf8',
        )));
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: 'Angel',
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({
                    ...turn,
                    speakerName: turn.speakerId === 'angel' ? 'Angel' : 'Alex',
                })),
            },
        });

        expect(ACADEMY_ASSETS.locations.station.mobile).not.toBe(ACADEMY_ASSETS.locations.station.wide);
        expect(screen.element.dataset.plate).toBe('station');
        expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain(ACADEMY_ASSETS.locations.station.wide);
        expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain(ACADEMY_ASSETS.locations.station.mobile);
        const storyText = screen.element.querySelector('.academy-authored-week-story-context')?.textContent;
        expect(storyText).toContain('Angel');
        expect(storyText).toContain('Alex');
        expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
        expect(screen.element.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        screen.dispose();
    });

    it('mounts the exact page as a lazy keyboard inspector with accessible labels and concealed answers', async () => {
        const chapter = await loadLessonActivityChapter('l2-l11', { lookup: async () => null });
        const host = document.createElement('main');
        const controller = createAcademyActivityRuntime().mount(chapter!.beats[0].activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.append(host);

        const visual = host.querySelector<HTMLElement>('[data-source-visual]')!;
        const trigger = visual.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')!;
        const thumbnail = trigger.querySelector<HTMLImageElement>('img')!;
        const dialog = visual.querySelector<HTMLDialogElement>('[data-source-inspector]')!;
        expect(visual.dataset.sourceVisual).toBe(SOURCE_VISUAL.url);
        expect(visual.dataset.sourceSha256).toBe(SOURCE_VISUAL.sha256);
        expect(thumbnail.dataset.sourceSha256).toBe(SOURCE_VISUAL.sha256);
        expect(thumbnail.alt).toContain('page 1');
        expect(trigger.type).toBe('button');
        expect(trigger.tabIndex).toBe(0);
        expect(trigger.getAttribute('aria-label')).toContain('Inspect');
        expect(dialog.getAttribute('aria-label')).toContain('p.1');
        expect(dialog.querySelector('.academy-source-visual-close')?.classList).toContain('academy-button-secondary');
        expect(dialog.hasAttribute('open')).toBe(false);
        expect(dialog.querySelector('img')).toBeNull();

        trigger.focus();
        expect(document.activeElement).toBe(trigger);
        trigger.click();
        const fullSize = dialog.querySelector<HTMLImageElement>('img')!;
        expect(dialog.hasAttribute('open')).toBe(true);
        expect(fullSize.loading).toBe('lazy');
        expect(fullSize.alt).toBe(thumbnail.alt);
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        expect(dialog.hasAttribute('open')).toBe(false);

        const answerKey = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(answerKey.hidden).toBe(true);
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        controller.dispose();
    });

    it('pins source and station bytes, mirrors, offline homes, and a zero-gap registry record', () => {
        const source = fs.readFileSync(path.resolve('public/academy/content/lessons', SOURCE_VISUAL.file));
        const hosted = fs.readFileSync(path.resolve('docs/public/academy/content/lessons', SOURCE_VISUAL.file));
        expect(createHash('sha256').update(source).digest('hex')).toBe(SOURCE_VISUAL.sha256);
        expect(hosted).toEqual(source);

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = fs.readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/038-l2-l11.json'");
            expect(worker).toContain(`'${SOURCE_VISUAL.url}'`);
            expect(worker).toContain(`'${ACADEMY_ASSETS.locations.station.wide}'`);
            expect(worker).toContain(`'${ACADEMY_ASSETS.locations.station.mobile}'`);
        }

        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ASSET-USAGE.json')))
            .toEqual(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json')));
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8'));
        expect(ledger.assets.find((asset: { id: string }) => asset.id === 'railway-station-day-commute').runtimeHome)
            .toContain('lesson:l2-l11');
        const registry = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ACADEMY-ASSET-REGISTRY.json'), 'utf8'));
        expect(registry.lessons.find((lesson: { ordinal: number }) => lesson.ordinal === 36)).toMatchObject({
            packageId: 'l2-l11',
            plateAssetId: 'location.station',
            orphanStatus: 'active-runtime',
            responsiveVariants: { status: 'complete-distinct-pair' },
            missingPurposefulAssets: [],
        });
        expect(registry.missingPurposefulAssets.some((gap: { scope: string }) => gap.scope === 'lesson:36')).toBe(false);
    });
});
