import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_ASSETS,
    ACADEMY_ITEM_PRESENTATION_COVERAGE,
    ACADEMY_RUNTIME_ASSET_REGISTRY,
} from '../../src/academy/assets';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonStoryRuntime, lessonStoryPresentation } from '../../src/academy/content/lesson-story-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { validateCommittedAuthoredWeek } from './helpers/authored-week-package';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));

const LESSONS = [
    ['l2-l07', 'ramen', 'ramen', 'location.ramen', 'francis', 'xingyu'],
    ['l2-l08', 'park', 'park', 'location.park', 'jenny', 'stasi'],
    ['l2-l09', 'lab', 'languageLab', 'location.language-lab', 'francis', 'sophie'],
] as const;

const SOURCE_VISUALS = {
    'l2-l07/moodle-chapter-21-deshou-teaching-task-page-1.png': '68cdcf841810f4738474a813fd60eafbfdd5e384da0d0e10fcaf987f552c05a9',
    'l2-l08/moodle-chapter-22-1-clause-rail-page-1.png': '36a073904a47724326460931351b7a5e9c66c60a502e085fd26fb2f64e29c642',
    'l2-l09/moodle-chapter-22-2-particle-mixer-page-1.png': '5257d4151ac5111057e4ffe7a227e208adc5bd0b8ca4c5532687266b0a8df406',
    'l2-l09/moodle-chapter-22-2-particle-mixer-page-3.png': '3084a14e5136c6ee654d0d984ed11697f7bf757833f99354aa2f7f03159efea6',
    'l2-l09/moodle-chapter-22-conversation-page-1.png': 'b28a169dac64414fd20e35345e9f5f4e8f5d4261c1a78b396f35542de9c12105',
} as const;

afterEach(() => document.body.replaceChildren());

describe('Lessons 32-34 asset and presentation grounding', () => {
    it('resolves approved responsive plates and the source-backed name-only rosters', () => {
        const runtime = createLessonStoryRuntime(PLAN);
        for (const [packageId, originPlaceId, plate, assetId, hostId, supportId] of LESSONS) {
            const entry = runtime.continuity(packageId)!;
            const presentation = lessonStoryPresentation(entry)!;
            expect(entry).toMatchObject({ hostId, supportingIds: [supportId] });
            expect(presentation).toMatchObject({ originPlaceId, plate, castPresentation: 'name-only' });
            expect(ACADEMY_RUNTIME_ASSET_REGISTRY[assetId]).toMatchObject({
                status: 'approved',
                runtimeHomes: expect.arrayContaining([`lesson:${packageId}`]),
                files: ACADEMY_ASSETS.locations[plate],
            });
        }
    });

    it('puts each approved plate and local location label on the real authored screen without a likeness', async () => {
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
                    dialogue: entry.dialogue?.map(turn => ({ ...turn, speakerName: turn.speakerId })),
                },
            });
            expect(screen.element.dataset.plate).toBe(plate);
            expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.src)
                .toContain(ACADEMY_ASSETS.locations[plate].wide);
            expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
                .toContain(ACADEMY_ASSETS.locations[plate].mobile);
            expect(screen.element.querySelector('.academy-authored-week-story-location')?.textContent)
                .toContain(entry.location.en);
            expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
            expect(screen.element.querySelector('img[src*="/characters/"]')).toBeNull();
            screen.dispose();
        }
    });

    it('mounts every exact source page as a lazy inspector while concealing answers and unrelated art', async () => {
        const runtime = createAcademyActivityRuntime();
        const renderedPaths: string[] = [];
        for (const [packageId] of LESSONS) {
            const chapter = await loadLessonActivityChapter(packageId, { lookup: async () => null });
            expect(chapter?.beats.length).toBeGreaterThan(0);
            const packageRenderedPaths: string[] = [];
            for (const beat of chapter!.beats) {
                const host = document.createElement('main');
                const controller = runtime.mount(beat.activity, {
                    language: 'en',
                    replace(view) { host.replaceChildren(view); },
                    announce() {},
                }, () => undefined);
                const visuals = [...host.querySelectorAll<HTMLElement>('[data-source-visual]')];
                for (const visual of visuals) {
                    renderedPaths.push(visual.dataset.sourceVisual!);
                    packageRenderedPaths.push(visual.dataset.sourceVisual!);
                    const trigger = visual.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')!;
                    const dialog = visual.querySelector<HTMLDialogElement>('[data-source-inspector]')!;
                    expect(trigger.type).toBe('button');
                    expect(trigger.getAttribute('aria-label')).toContain('Inspect');
                    expect(visual.querySelector<HTMLImageElement>('img')?.dataset.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
                    expect(dialog.hasAttribute('open')).toBe(false);
                    expect(dialog.querySelector('img')).toBeNull();
                    trigger.click();
                    expect(dialog.hasAttribute('open')).toBe(true);
                    expect(dialog.querySelectorAll('img')).toHaveLength(1);
                    dialog.querySelector<HTMLButtonElement>('.academy-source-visual-close')!.click();
                    expect(dialog.hasAttribute('open')).toBe(false);
                }
                for (const key of host.querySelectorAll<HTMLElement>('[data-answer-visibility="after-attempt"]')) {
                    expect(key.hidden, `${packageId} exposed a derived answer`).toBe(true);
                }
                expect(host.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
                controller.dispose();
            }
            expect(new Set(packageRenderedPaths).size).toBe(packageId === 'l2-l09' ? 3 : 1);
        }
        expect(new Set(renderedPaths)).toEqual(new Set(Object.keys(SOURCE_VISUALS)
            .map(file => `/academy/content/lessons/${file}`)));
        expect(Object.entries(ACADEMY_ITEM_PRESENTATION_COVERAGE)
            .every(([id, entry]) => entry.presentation === (id === 'item.cafe-order-scene'
                ? 'inspectable-source-prop'
                : 'world-reward-prop'))).toBe(true);
    });

    it('pins the source bytes, responsive plates, mirrors, offline shell, and art-ledger homes', () => {
        const workers = [
            fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ];
        for (const [file, sha256] of Object.entries(SOURCE_VISUALS)) {
            const source = fs.readFileSync(path.resolve('public/academy/content/lessons', file));
            const hosted = fs.readFileSync(path.resolve('docs/public/academy/content/lessons', file));
            expect(sha256File(path.resolve('public/academy/content/lessons', file)), file).toBe(sha256);
            expect(hosted).toEqual(source);
            workers.forEach(worker => expect(worker).toContain(`'/academy/content/lessons/${file}'`));
        }
        for (const [packageId, , plate] of LESSONS) {
            Object.values(ACADEMY_ASSETS.locations[plate]).forEach(asset => {
                workers.forEach(worker => expect(worker).toContain(`'${asset}'`));
            });
            expect(ACADEMY_RUNTIME_ASSET_REGISTRY[`location.${plate === 'languageLab' ? 'language-lab' : plate}`]
                .runtimeHomes).toContain(`lesson:${packageId}`);
        }
        expect(filesHaveSameContent(path.resolve('docs/public/academy/art/ASSET-USAGE.json'), path.resolve('public/academy/art/ASSET-USAGE.json'))).toBe(true);
    });
});
