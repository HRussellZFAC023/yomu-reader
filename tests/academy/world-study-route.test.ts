import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import { createLibraryVocabularySheet, libraryStudyVocabulary } from '../../src/academy/content/library-vocabulary-sheet';
import type { AcademyStudyMountContext, AcademyStudyModule } from '../../src/academy/integration/study-module';
import { createWorldFlow, currentLibraryPackageId } from '../../src/academy/routing/world-flow';
import { createAcademyShell } from '../../src/academy/ui/shell';
import { createLessonTwoSourceVocabularyActivities } from '../../src/academy/content/lesson-two-profile-board';
import { readFileSync } from 'node:fs';

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('Academy Study route', () => {
    it('persists the Library introduction in place before opening its normal screen', async () => {
        const host = document.createElement('div');
        document.body.append(host);
        const shell = createAcademyShell(host, {
            language: 'en', onLanguage() {}, onMute() {}, onNavigate() {}, onPresentationMode() {},
        });
        const save = vi.fn(async () => {});
        const go = vi.fn(async () => {});
        const flow = createWorldFlow({
            evidence: { dueReviews: vi.fn(async () => []) } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });

        await flow.render('review', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2, route: 'review', routeHistory: [{ route: 'campus' }],
                presentationMode: 'course', updatedAt: 1,
            },
            projection: await createLearnerRecord().snapshot(),
            shell,
            go,
            save,
            back: vi.fn(async () => {}),
        });

        host.querySelector<HTMLButtonElement>('.academy-library-dialogue-continue')?.click();
        await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ seenIntroductions: ['place:library'] }));
        await vi.waitFor(() => expect(host.querySelector('.academy-library-desk')).not.toBeNull());
        expect(go).not.toHaveBeenCalled();
        shell.dispose();
    });

    it('mounts the canonical Study surface and returns through route history', async () => {
        vi.useFakeTimers();
        const dispose = vi.fn();
        let mountedContext: AcademyStudyMountContext | undefined;
        const study: AcademyStudyModule = {
            mount(host, context) {
                mountedContext = context;
                const canonical = document.createElement('article');
                canonical.dataset.canonicalStudyRenderer = '';
                host.append(canonical);
                return { dispose };
            },
        };
        const host = document.createElement('div');
        document.body.append(host);
        const back = vi.fn(async () => {});
        const go = vi.fn(async () => {});
        const shell = createAcademyShell(host, {
            language: 'en',
            onLanguage() {},
            onMute() {},
            onNavigate() {},
            onPresentationMode() {},
        });
        const projection = await createLearnerRecord().snapshot();
        const seedVocabularyPrerequisite = vi.fn(async () => {});
        const flow = createWorldFlow({
            study,
            evidence: { dueReviews: vi.fn(async () => [{
                id: '駅:えき', expression: '駅', reading: 'えき', meaning: 'station', dueAt: 0, provenance: { lesson: 'week-1' },
            }]), seedVocabularyPrerequisite } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });

        await expect(flow.render('review', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'review',
                routeHistory: [{ route: 'campus' }],
                presentationMode: 'course',
                seenIntroductions: ['place:library'],
                updatedAt: 1,
            },
            projection,
            shell,
            go,
            back,
        })).resolves.toBe(true);

        expect(host.querySelector('[data-academy-screen="study"]')).toBeNull();
        (host.querySelector('.academy-library-sheet-button') as HTMLButtonElement).click();
        (host.querySelector('.academy-vocabulary-sheet-start') as HTMLButtonElement).click();
        for (let tick = 0; tick < 6; tick++) await Promise.resolve();
        expect(host.querySelector('[data-academy-screen="study"] [data-canonical-study-renderer]')).not.toBeNull();
        expect(seedVocabularyPrerequisite).toHaveBeenCalledOnce();
        expect(seedVocabularyPrerequisite).toHaveBeenCalledWith(
            'authored-week:l1-l01',
            expect.arrayContaining([expect.objectContaining({ reason: 'new-learning' })]),
        );
        expect(mountedContext?.surface).toEqual({ id: 'academy', theme: 'living-paper' });
        expect(mountedContext?.sessionVocabulary).toEqual(libraryStudyVocabulary(createLibraryVocabularySheet()));
        expect(mountedContext?.countdown.snapshot().label).toBe('15:00');
        (host.querySelector('.academy-study-back') as HTMLButtonElement).click();
        expect(back).toHaveBeenCalledOnce();
        expect(go).not.toHaveBeenCalled();

        shell.replace(document.createElement('section'));
        await vi.runAllTicks();
        expect(dispose).toHaveBeenCalledOnce();
        shell.dispose();
    });

    it('disposes a Study mount that resolves after the learner has already left', async () => {
        vi.useFakeTimers();
        const dispose = vi.fn();
        let finishMount!: (value: { dispose(): void }) => void;
        const study: AcademyStudyModule = {
            mount: () => new Promise(resolve => { finishMount = resolve; }),
        };
        const host = document.createElement('div');
        document.body.append(host);
        const shell = createAcademyShell(host, {
            language: 'en',
            onLanguage() {},
            onMute() {},
            onNavigate() {},
            onPresentationMode() {},
        });
        const projection = await createLearnerRecord().snapshot();
        const flow = createWorldFlow({
            study,
            evidence: { dueReviews: vi.fn(async () => []), seedVocabularyPrerequisite: vi.fn(async () => {}) } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });
        const render = flow.render('review', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'review',
                routeHistory: [],
                presentationMode: 'story',
                seenIntroductions: ['place:library'],
                updatedAt: 1,
            },
            projection,
            shell,
            go: vi.fn(async () => {}),
            back: vi.fn(async () => {}),
        });

        for (let tick = 0; tick < 6; tick++) await Promise.resolve();
        (host.querySelector('.academy-library-sheet-button') as HTMLButtonElement).click();
        (host.querySelector('.academy-vocabulary-sheet-start') as HTMLButtonElement).click();
        for (let tick = 0; tick < 8 && !finishMount; tick++) await Promise.resolve();
        expect(finishMount).toBeTypeOf('function');
        shell.replace(document.createElement('section'));
        finishMount({ dispose });
        await render;
        for (let tick = 0; tick < 6; tick++) await Promise.resolve();

        expect(dispose).toHaveBeenCalledOnce();
        expect(host.querySelector('[data-academy-screen="study"]')).toBeNull();
        shell.dispose();
    });

    it('uses the explicitly revisited lesson for the Library sheet and Study syllabus', async () => {
        let mountedContext: AcademyStudyMountContext | undefined;
        const host = document.createElement('div');
        document.body.append(host);
        const shell = createAcademyShell(host, {
            language: 'en', onLanguage() {}, onMute() {}, onNavigate() {}, onPresentationMode() {},
        });
        const seedVocabularyPrerequisite = vi.fn(async () => {});
        const flow = createWorldFlow({
            study: { mount: (_host, context) => { mountedContext = context; return { dispose() {} }; } },
            evidence: { dueReviews: vi.fn(async () => []), seedVocabularyPrerequisite } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });

        await flow.render('review', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2, route: 'review', routeHistory: [], presentationMode: 'course',
                lessonId: 'authored-week:l1-l02', seenIntroductions: ['place:library'], updatedAt: 1,
            },
            projection: await createLearnerRecord().snapshot(),
            shell,
            go: vi.fn(async () => {}),
            back: vi.fn(async () => {}),
        });

        expect(host.querySelector<HTMLElement>('.academy-library-screen')?.dataset.lessonId).toBe('l1-l02');
        (host.querySelector('.academy-library-sheet-button') as HTMLButtonElement).click();
        (host.querySelector('.academy-vocabulary-sheet-start') as HTMLButtonElement).click();
        for (let tick = 0; tick < 6; tick++) await Promise.resolve();
        expect(mountedContext?.sessionVocabulary?.map(item => item.id)).toEqual(
            createLessonTwoSourceVocabularyActivities().map(row => row.id),
        );
        expect(seedVocabularyPrerequisite).toHaveBeenCalledWith(
            'authored-week:l1-l02',
            expect.any(Array),
        );
        expect(mountedContext?.sessionVocabulary?.every(item => !('dueAt' in item))).toBe(true);
        shell.dispose();
    });

    it('selects the learner current registered lesson with the class-path ordering policy', () => {
        const plan = JSON.parse(readFileSync('public/academy/content/curriculum/class-week-cast.v1.json', 'utf8')) as {
            weeks: Array<{ weekId: string; order: number }>;
        };

        expect(currentLibraryPackageId(plan.weeks, 'n5')).toBe('l1-l11');
        expect(currentLibraryPackageId(plan.weeks, 'n4')).toBe('l2-l02');
        expect(currentLibraryPackageId(plan.weeks, 'n3')).toBe('l2-l12');
    });
});
