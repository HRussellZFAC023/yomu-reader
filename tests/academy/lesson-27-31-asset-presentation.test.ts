import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonStoryRuntime, lessonStoryPresentation } from '../../src/academy/content/lesson-story-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { renderInspectableSourceVisual } from '../../src/academy/minigames/source-visual';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { validateCommittedAuthoredWeek } from './helpers/authored-week-package';
import { sha256File } from './helpers/hash-memo';

const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));

const LESSONS = [
    ['l2-l02', 'station', 'station', 'location.station'],
    ['l2-l03', 'home', 'home', 'location.home'],
    ['l2-l04', 'classroom', 'classroom', 'location.classroom'],
    ['l2-l05', 'station', 'station', 'location.station'],
    ['l2-l06', 'library', 'library', 'location.library'],
] as const;

const SOURCE_VISUALS = {
    'l2-l02/moodle-chapter-19-1-vocabulary-page-1.png': 'b9a76542879c20ac1e1519c4f2246bf3d16ca84e510e680e98119d41c40c3802',
    'l2-l02/moodle-chapter-19-listening-page-1.png': '70b5f991a2cc262205669d21901b2f945b5faf24e8ad41caa5134bb34f2a7414',
    'l2-l03/moodle-chapter-19-2-3-vocabulary-page-1.png': 'edaa7f991771ccda7ff2a2a00ebffb5418234df2e0cd536c059cce532f38119e',
    'l2-l03/moodle-chapter-19-2-tari-grammar-page-3.png': '20595904296d510ed9aab10a13148c8d0c9d85e27779a637ac9cb5949dccf738',
    'l2-l04/moodle-chapter-20-1-vocabulary-page-1.png': 'c0069c4fcc3b1d31df9badbb2f4532078b02d925e2c44303c5e50408e95819f2',
    'l2-l04/moodle-chapter-20-1-plain-style-verb-page-3.png': 'd8d0b2b0ff00c3e6801b4e02d97cde11382a201e85b0ea468b717a448cd9f38f',
    'l2-l05/moodle-chapter-20-2-vocabulary-page-1.png': '0981cc1579d4cde558ecec3f68dc385e72cc50a09fee38c7d54e36aa1edd6e5c',
    'l2-l05/moodle-chapter-20-listening-page-1.png': 'f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975',
    'l2-l05/moodle-chapter-20-conversation-page-1.png': 'ad13d146b8e82ad147870d90a1e47c0f8a43b96ac306e6bc869410dc616f2cb1',
    'l2-l06/moodle-chapter-21-1-vocabulary-page-1.png': 'a0137ffaab518de2a37d783c5c02c4efe8d719cbe2c8647e186e55e35a00a02f',
    'l2-l06/moodle-chapter-21-opinion-teaching-page-1.png': 'dc138ddbfe0ff40495511a961485f03767ffae7afada9e5886e922809a48dcdb',
    'l2-l06/moodle-chapter-21-opinion-task-page-2.png': '9c93bc53a77ebb3b3cf2a5013400240acfda5b856773c9d14c13be763c9627d9',
    'l2-l06/moodle-chapter-21-conversation-page-1.png': '7ea8c8ebe329839341b3fbcea6f374bdde694295e44e19fca698db5dc04207ad',
} as const;

afterEach(() => document.body.replaceChildren());

describe('Lessons 27-31 asset and presentation grounding', () => {
    it('resolves each world-authored lesson to its approved background and name-only cast gate', () => {
        const runtime = createLessonStoryRuntime(PLAN);
        for (const [packageId, originPlaceId, plate, assetId] of LESSONS) {
            const entry = runtime.continuity(packageId)!;
            const presentation = lessonStoryPresentation(entry)!;
            expect(presentation).toMatchObject({ originPlaceId, plate, castPresentation: 'name-only' });
            expect(ACADEMY_RUNTIME_ASSET_REGISTRY[assetId].status).toBe('approved');
            expect(ACADEMY_RUNTIME_ASSET_REGISTRY[assetId].files).toEqual(ACADEMY_ASSETS.locations[plate]);
        }
    });

    it('puts the approved origin plate and local location label on every real authored screen', async () => {
        const runtime = createLessonStoryRuntime(PLAN);
        for (const [packageId, originPlaceId, plate] of LESSONS) {
            const entry = runtime.continuity(packageId)!;
            const presentation = lessonStoryPresentation(entry)!;
            const registration = getAuthoredWeekRegistration(packageId);
            const { week } = await validateCommittedAuthoredWeek(registration);
            const screen = createAuthoredWeekScreen({
                language: 'en',
                week,
                storyContext: {
                    hostId: entry.hostId,
                    hostName: entry.hostId,
                    originPlaceId,
                    plate,
                    location: presentation.location,
                    setup: entry.setup,
                    callback: entry.callback.meaningNow,
                },
            });
            expect(screen.element.dataset.plate).toBe(plate);
            expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.getAttribute('src'))
                .toBe(ACADEMY_ASSETS.locations[plate].wide);
            expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.getAttribute('srcset'))
                .toBe(ACADEMY_ASSETS.locations[plate].mobile);
            expect(screen.element.querySelector('.academy-authored-week-story-location')?.textContent)
                .toContain(entry.location.en);
            expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
            screen.dispose();
        }
    });

    it('art-directs Lesson 28 mobile from the approved home source instead of claiming an unknown mobile file', async () => {
        const registration = getAuthoredWeekRegistration('l2-l03');
        const { week } = await validateCommittedAuthoredWeek(registration);
        const entry = createLessonStoryRuntime(PLAN).continuity('l2-l03')!;
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: entry.hostId,
                originPlaceId: 'home',
                plate: 'home',
                location: { ja: '家', en: 'Home' },
                setup: entry.setup,
                callback: entry.callback.meaningNow,
            },
        });
        const picture = screen.element.querySelector<HTMLElement>('.academy-background')!;
        expect(picture.dataset.mobilePresentation).toBe('art-directed-crop');
        expect(picture.dataset.mobileSourceVariant).toBe('wide');
        expect(picture.style.getPropertyValue('--academy-mobile-object-position')).toBe('62% center');
        expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toBe(ACADEMY_ASSETS.locations.home.wide);
        screen.dispose();
    });

    it('mounts every current source page as an inspectable control with answer support concealed', async () => {
        const runtime = createAcademyActivityRuntime();
        const renderedPaths: string[] = [];
        let renderedVisualCount = 0;
        for (const [packageId] of LESSONS) {
            const chapter = await loadLessonActivityChapter(packageId, { lookup: async () => null });
            expect(chapter).not.toBeNull();
            for (const beat of chapter!.beats) {
                const host = document.createElement('main');
                const controller = runtime.mount(beat.activity, {
                    language: 'en',
                    replace(view) { host.replaceChildren(view); },
                    announce() {},
                }, () => undefined);
                const visuals = [...host.querySelectorAll<HTMLElement>('[data-source-visual]')];
                expect(visuals.length, beat.id).toBeGreaterThan(0);
                renderedVisualCount += visuals.length;
                for (const visual of visuals) {
                    const url = visual.dataset.sourceVisual!;
                    renderedPaths.push(url);
                    expect(visual.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')).not.toBeNull();
                    expect(visual.querySelector<HTMLDialogElement>('[data-source-inspector]')?.hasAttribute('open')).toBe(false);
                    expect(visual.querySelector<HTMLImageElement>('img')?.dataset.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
                }
                for (const key of host.querySelectorAll<HTMLElement>('[data-answer-visibility="after-attempt"]')) {
                    expect(key.hidden, `${beat.id} exposed its answer key`).toBe(true);
                }
                expect(host.querySelector('[data-listening-support]')).toBeNull();
                controller.dispose();
            }
        }
        expect(renderedVisualCount).toBe(14);
        expect(new Set(renderedPaths)).toEqual(new Set(Object.keys(SOURCE_VISUALS)
            .map(file => `/academy/content/lessons/${file}`)));
    });

    it('opens and closes a source page from its keyboard-reachable trigger', () => {
        const figure = renderInspectableSourceVisual({
            title: 'Exact source page',
            page: 1,
            url: '/academy/content/lessons/l2-l02/moodle-chapter-19-listening-page-1.png',
            sha256: SOURCE_VISUALS['l2-l02/moodle-chapter-19-listening-page-1.png'],
            alt: { ja: '元資料のページ', en: 'Exact source page' },
        }, 'en', 'test-source');
        document.body.append(figure);
        const trigger = figure.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')!;
        const dialog = figure.querySelector<HTMLDialogElement>('dialog')!;
        expect(trigger.type).toBe('button');
        expect(trigger.getAttribute('aria-label')).toContain('Inspect');
        trigger.click();
        expect(dialog.hasAttribute('open')).toBe(true);
        dialog.querySelector<HTMLButtonElement>('.academy-source-visual-close')!.click();
        expect(dialog.hasAttribute('open')).toBe(false);
    });

    it('pins every exact source visual byte and all lesson presentation assets in the offline shell', () => {
        const worker = fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        const hostedWorker = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        for (const [file, sha256] of Object.entries(SOURCE_VISUALS)) {
            expect(sha256File(path.resolve('public/academy/content/lessons', file)), file).toBe(sha256);
            expect(worker).toContain(`'/academy/content/lessons/${file}'`);
            expect(hostedWorker).toContain(`'/academy/content/lessons/${file}'`);
        }
        for (const [, , plate] of LESSONS) {
            for (const asset of Object.values(ACADEMY_ASSETS.locations[plate])) {
                expect(worker).toContain(`'${asset}'`);
                expect(hostedWorker).toContain(`'${asset}'`);
            }
        }
        expect(worker).toContain("'/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3'");
        expect(hostedWorker).toContain("'/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3'");
        expect(worker).toContain("'/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3'");
        expect(hostedWorker).toContain("'/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3'");
    });
});
