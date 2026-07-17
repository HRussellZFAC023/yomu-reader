import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import axe from 'axe-core';
import { ACADEMY_ASSETS, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { createLessonFortyOnePreparedStateAuditBeat } from '../../src/academy/content/lesson-forty-one-prepared-state-audit';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonStoryRuntime, lessonStoryPresentation } from '../../src/academy/content/lesson-story-runtime';
import type { ActivityModel } from '../../src/academy/domain/activity-runtime';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';
import { validateCommittedAuthoredWeek } from './helpers/authored-week-package';

const PACKAGE_ID = 'l2-l16';
const PACKAGE_FILE = '043-l2-l16.json';
const SOURCE_VISUALS = {
    'moodle-chapter-30-1-tearu-1-page-1.png': '5d9c9a9e3a2b241eb3a31ff96855f2ce24e0987dd6a1c5b5f632226b181d535c',
    'moodle-chapter-30-1-tearu-1-page-2.png': 'b8786e398c80109f92caa5fd9cf9ec129348f1ff541005d5e592f4b7a21a9cd6',
    'moodle-chapter-30-1-tearu-2-page-1.png': 'ddc590cf0270e321e98b933ccc2972798367051343e3ca221f88bcfc5dcc430f',
    'moodle-chapter-30-1-tearu-2-page-2.png': '9f98114f963287be60c3ab2074af0823c229d078cff290fc15a0c0008853016f',
    'moodle-chapter-30-1-tearu-2-page-3.png': 'e44924a1d24809feaa577fb59c0ca90b64fded5743fba2d3ede3457a4b78529d',
    'moodle-chapter-30-information-gap-page-1.png': 'db345d3097b5e664a19d1274c3c0eda961f6406ac6ac9536614518c45de86556',
} as const;
const PLAN = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'),
    'utf8',
)));

afterEach(() => document.body.replaceChildren());

describe('Lesson 41 asset and presentation grounding', () => {
    it('owns the approved responsive classroom plate and exact name-only roster', async () => {
        const entry = createLessonStoryRuntime(PLAN).continuity(PACKAGE_ID)!;
        expect(entry).toMatchObject({
            classWeekId: 'l3-2-l05',
            hostId: 'angel',
            supportingIds: ['christian'],
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
            runtimeHomes: expect.arrayContaining(['lesson:l2-l16']),
            files: ACADEMY_ASSETS.locations.classroom,
        });
        expect(ACADEMY_ASSETS.locations.classroom.mobile).not.toBe(ACADEMY_ASSETS.locations.classroom.wide);

        const registration = getAuthoredWeekRegistration(PACKAGE_ID);
        const { week } = await validateCommittedAuthoredWeek(registration);
        const presentation = lessonStoryPresentation(entry)!;
        const screen = createAuthoredWeekScreen({
            language: 'en',
            week,
            storyContext: {
                hostId: entry.hostId,
                hostName: 'Onke',
                originPlaceId: presentation.originPlaceId,
                plate: presentation.plate,
                location: presentation.location,
                setup: entry.setup,
                callback: entry.callback.meaningNow,
                dialogue: entry.dialogue?.map(turn => ({
                    ...turn,
                    speakerName: turn.speakerId === 'angel' ? 'Onke' : 'Christian',
                })),
            },
        });
        expect(screen.element.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain(ACADEMY_ASSETS.locations.classroom.wide);
        expect(screen.element.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain(ACADEMY_ASSETS.locations.classroom.mobile);
        expect(screen.element.textContent).toContain('Onke');
        expect(screen.element.textContent).toContain('Christian');
        expect(screen.element.querySelector('img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        screen.dispose();
    });

    it('renders six lazy keyboard source inspectors responsively without exposing answers', async () => {
        const host = document.createElement('main');
        host.setAttribute('aria-label', 'Lesson 41 prepared-state activity');
        document.body.append(host);
        const controller = createAcademyActivityRuntime().mount(
            createLessonFortyOnePreparedStateAuditBeat().activity as ActivityModel,
            { language: 'en', replace(view) { host.replaceChildren(view); }, announce() {} },
            () => undefined,
        );

        const visuals = [...host.querySelectorAll<HTMLElement>('[data-source-visual]')];
        expect(visuals).toHaveLength(6);
        expect(visuals.map(visual => path.basename(visual.dataset.sourceVisual!))).toEqual(Object.keys(SOURCE_VISUALS));
        for (const visual of visuals) {
            const filename = path.basename(visual.dataset.sourceVisual!) as keyof typeof SOURCE_VISUALS;
            const trigger = visual.querySelector<HTMLButtonElement>('.academy-source-visual-trigger')!;
            const dialog = visual.querySelector<HTMLDialogElement>('[data-source-inspector]')!;
            expect(visual.dataset.sourceSha256).toBe(SOURCE_VISUALS[filename]);
            expect(trigger.querySelector<HTMLImageElement>('img')?.loading).toBe('lazy');
            expect(trigger.getAttribute('aria-label')).toContain('Inspect');
            expect(dialog.querySelector('img')).toBeNull();
            trigger.focus();
            trigger.click();
            expect(dialog.hasAttribute('open')).toBe(true);
            expect(dialog.querySelector<HTMLImageElement>('img')?.loading).toBe('lazy');
            dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
            expect(dialog.hasAttribute('open')).toBe(false);
        }
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        expect(host.querySelector('audio, img[src*="/characters/"], img[src*="/items/"]')).toBeNull();
        const sourceCss = fs.readFileSync(path.resolve('src/academy/minigames/source-visual.css'), 'utf8');
        expect(sourceCss).toContain('@media (max-width: 620px)');
        expect(sourceCss).toContain('width: calc(100vw - 12px)');

        const results = await axe.run(host, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map(violation => violation.id)).toEqual([]);
        controller.dispose();
    });

    it('pins source ownership, mirrors, offline delivery, and generated registry ownership', () => {
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
        }
        expect(fs.readFileSync(path.resolve('docs/public/academy/art/ASSET-USAGE.json')))
            .toEqual(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json')));
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8'));
        expect(ledger.assets.find((asset: { id: string }) => asset.id === 'classroom-evening-lamplit').runtimeHome)
            .toContain('lesson:l2-l16');
        const registry = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ACADEMY-ASSET-REGISTRY.json'), 'utf8'));
        expect(registry.lessons.find((entry: { ordinal: number }) => entry.ordinal === 41)).toMatchObject({
            packageId: PACKAGE_ID,
            plateAssetId: 'location.classroom',
            orphanStatus: 'active-runtime',
            responsiveVariants: { status: 'complete-distinct-pair' },
            missingPurposefulAssets: [],
        });
        expect(registry.missingPurposefulAssets.some((gap: { scope: string }) => gap.scope === 'lesson:41')).toBe(false);
    });
});
