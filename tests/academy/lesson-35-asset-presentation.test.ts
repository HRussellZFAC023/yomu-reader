import { createHash } from 'node:crypto';
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

const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));

const SOURCE_VISUALS = {
    'l2-l10/moodle-chapter-23-1-toki-threshold-page-4.png': '948b81d988e549e8b51c5fcc94934eb1607fbe86097b6f4d154b63d4b07c36d6',
    'l2-l10/moodle-chapter-23-1-toki-threshold-page-5.png': '646ada214d1e57addc244e105a51957749edcecc897f654dedebb96ff698c187',
} as const;

afterEach(() => document.body.replaceChildren());

describe('Lesson 35 asset and presentation grounding', () => {
    it('resolves only l2-l10 to the approved station plate and source-backed name-only cast', () => {
        const runtime = createLessonStoryRuntime(PLAN);
        const entry = runtime.continuity('l2-l10')!;
        expect(entry).toMatchObject({
            classWeekId: 'l2plus-l09',
            hostId: 'christian',
            supportingIds: ['aakash'],
        });
        expect(lessonStoryPresentation(entry)).toMatchObject({
            originPlaceId: 'station',
            plate: 'station',
            castPresentation: 'name-only',
        });
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['location.station']).toMatchObject({
            status: 'approved',
            runtimeHomes: expect.arrayContaining(['lesson:l2-l10']),
            files: ACADEMY_ASSETS.locations.station,
        });
    });

    it('renders the responsive station plate and exact cast names without any likeness', async () => {
        const entry = createLessonStoryRuntime(PLAN).continuity('l2-l10')!;
        const presentation = lessonStoryPresentation(entry)!;
        const registration = getAuthoredWeekRegistration('l2-l10');
        const { week } = await validateCommittedAuthoredWeek(registration);
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: 'Christian',
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({
                    ...turn,
                    speakerName: turn.speakerId === 'christian' ? 'Christian' : 'Aakash',
                })),
            },
        });

        expect(screen.element.dataset.plate).toBe('station');
        expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain(ACADEMY_ASSETS.locations.station.wide);
        expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain(ACADEMY_ASSETS.locations.station.mobile);
        expect(screen.element.querySelector('.academy-authored-week-story-location')?.textContent)
            .toContain(entry.location.en);
        expect(screen.element.querySelector('.academy-authored-week-story-context')?.textContent)
            .toContain('Christian');
        expect(screen.element.querySelector('.academy-authored-week-story-context')?.textContent)
            .toContain('Aakash');
        expect(screen.element.querySelector('.academy-authored-week-host')).toBeNull();
        expect(screen.element.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        screen.dispose();
    });

    it('mounts both exact pages as lazy keyboard inspectors and conceals every derived answer', async () => {
        const chapter = await loadLessonActivityChapter('l2-l10', { lookup: async () => null });
        const host = document.createElement('main');
        const controller = createAcademyActivityRuntime().mount(chapter!.beats[0].activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.append(host);

        const visuals = [...host.querySelectorAll<HTMLElement>('[data-source-visual]')];
        expect(visuals.map(visual => visual.dataset.sourceVisual)).toEqual(
            Object.keys(SOURCE_VISUALS).map(file => `/academy/content/lessons/${file}`),
        );
        for (const visual of visuals) {
            const trigger = visual.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')!;
            const dialog = visual.querySelector<HTMLDialogElement>('[data-source-inspector]')!;
            expect(trigger.type).toBe('button');
            expect(trigger.tabIndex).toBe(0);
            expect(trigger.getAttribute('aria-label')).toContain('Inspect');
            expect(visual.querySelector<HTMLImageElement>('img')?.dataset.sourceSha256)
                .toBe(SOURCE_VISUALS[visual.dataset.sourceVisual!.replace('/academy/content/lessons/', '') as keyof typeof SOURCE_VISUALS]);
            expect(dialog.hasAttribute('open')).toBe(false);
            expect(dialog.querySelector('img')).toBeNull();
            trigger.focus();
            expect(document.activeElement).toBe(trigger);
            trigger.click();
            expect(dialog.hasAttribute('open')).toBe(true);
            expect(dialog.querySelectorAll('img')).toHaveLength(1);
            dialog.querySelector<HTMLButtonElement>('.academy-source-visual-close')!.click();
            expect(dialog.hasAttribute('open')).toBe(false);
        }
        const answerKey = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(answerKey.hidden).toBe(true);
        expect(answerKey.getAttribute('aria-hidden')).not.toBe('false');
        expect(host.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        expect(Object.entries(ACADEMY_ITEM_PRESENTATION_COVERAGE)
            .every(([id, item]) => item.presentation === (id === 'item.cafe-order-scene'
                ? 'inspectable-source-prop'
                : 'world-reward-prop'))).toBe(true);
        controller.dispose();
    });

    it('pins exact bytes, mirrors, offline paths, and station ledger homes', () => {
        const workers = [
            fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ];
        for (const [file, sha256] of Object.entries(SOURCE_VISUALS)) {
            const source = fs.readFileSync(path.resolve('public/academy/content/lessons', file));
            const hosted = fs.readFileSync(path.resolve('docs/public/academy/content/lessons', file));
            expect(createHash('sha256').update(source).digest('hex'), file).toBe(sha256);
            expect(hosted).toEqual(source);
            workers.forEach(worker => expect(worker).toContain(`'/academy/content/lessons/${file}'`));
        }
        workers.forEach(worker => {
            expect(worker).toContain("'/academy/content/lessons/037-l2-l10.json'");
            expect(worker).toContain(`'${ACADEMY_ASSETS.locations.station.wide}'`);
            expect(worker).toContain(`'${ACADEMY_ASSETS.locations.station.mobile}'`);
        });
        expect(ACADEMY_RUNTIME_ASSET_REGISTRY['location.station'].runtimeHomes).toContain('lesson:l2-l10');
        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ASSET-USAGE.json')))
            .toEqual(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json')));
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8'));
        expect(ledger.assets.find((asset: { id: string }) => asset.id === 'railway-station-day-commute').runtimeHome)
            .toContain('lesson:l2-l10');
    });
});
