import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import { projectStoryProgression } from '../../src/academy/domain/story-progression';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

describe('World Journal route', () => {
    it('revisits the exact class or story where Xingyu was encountered', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            {
                kind: 'profile-changed',
                profile: { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            },
            {
                kind: 'characters-encountered',
                encounterId: 'class-week:l1-l03',
                sceneId: 'scene:class-week:l1-l03',
                attendeeIds: ['xingyu'],
            },
            {
                kind: 'characters-encountered',
                encounterId: 'story:s1e04-welcome-frequency',
                sceneId: 'scene:story:s1e04-welcome-frequency',
                attendeeIds: ['xingyu'],
            },
        ]);
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const go = vi.fn(async () => undefined);
        const flow = createWorldFlow({ evidence: {} as never, pronunciation: {} as never, audio: {} as never });

        await flow.render('journal', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'journal',
                routeHistory: [{ route: 'class' }],
                presentationMode: 'story',
                updatedAt: 1,
            },
            projection: await record.snapshot(),
            shell,
            go,
            back: vi.fn(async () => undefined),
        });

        expect(current?.querySelector('[data-replay-stream="true"]')).toBeNull();

        current?.querySelector<HTMLButtonElement>('[data-character="xingyu"] button')?.click();
        const revisits = current?.querySelectorAll<HTMLButtonElement>('.academy-character-revisit');
        revisits?.[0]?.click();
        revisits?.[1]?.click();

        expect(go).toHaveBeenNthCalledWith(1, 'lesson-overview', { lessonId: 'authored-week:l1-l03' });
        expect(go).toHaveBeenNthCalledWith(2, 'story', { sectionId: 's1e04-welcome-frequency' });
    });

    it('projects Lessons 27-31 into met-character state and replays the exact package without plot writes', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            {
                kind: 'profile-changed',
                profile: { displayName: 'Learner', learningReason: 'Read with friends', portraitId: 'quality-2' },
            },
            ...([
                ['l2-l02', 'l2plus-l01', ['alex', 'jodi']],
                ['l2-l03', 'l2plus-l02', ['jodi', 'alex']],
                ['l2-l04', 'l2plus-l03', ['tom', 'francis']],
                ['l2-l05', 'l2plus-l04', ['alex', 'tom']],
                ['l2-l06', 'l2plus-l05', ['shin', 'sophie']],
            ] as const).flatMap(([packageId, classWeekId, attendeeIds]) => [
                {
                    kind: 'characters-encountered' as const,
                    encounterId: `class-week:${packageId}`,
                    sceneId: `scene:class-week:${classWeekId}`,
                    attendeeIds,
                },
                {
                    kind: 'scene-completed' as const,
                    sceneId: `scene:class-week:${classWeekId}`,
                },
            ]),
        ]);
        const projection = await record.snapshot();
        expect(Object.keys(projection.encounteredCharacters)).toEqual(expect.arrayContaining([
            'alex', 'jodi', 'tom', 'francis', 'shin', 'sophie',
        ]));
        expect(projection.completedScenes).toHaveLength(5);
        expect(projectStoryProgression(await record.history()).recordedChapterIds).toEqual([]);

        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const go = vi.fn(async () => undefined);
        const flow = createWorldFlow({ evidence: {} as never, pronunciation: {} as never, audio: {} as never });

        await flow.render('journal', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'journal',
                routeHistory: [{ route: 'class' }],
                presentationMode: 'story',
                updatedAt: 1,
            },
            projection,
            shell,
            go,
            back: vi.fn(async () => undefined),
        });
        current?.querySelector<HTMLButtonElement>('[data-character="shin"] button')?.click();
        current?.querySelector<HTMLButtonElement>('[data-encounter-id="class-week:l2-l06"]')?.click();

        expect(go).toHaveBeenCalledWith('lesson-overview', { lessonId: 'authored-week:l2-l06' });
    });

    it('keeps Rie and Aakash memory revisits on their established journal scenes', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            {
                kind: 'profile-changed',
                profile: { displayName: 'Learner', learningReason: 'Talk with friends', portraitId: 'quality-2' },
            },
            {
                kind: 'characters-encountered',
                encounterId: 'opening-rie-introduction',
                sceneId: 'scene:opening-rie-introduction',
                attendeeIds: ['rie'],
            },
            {
                kind: 'characters-encountered',
                encounterId: 'aakash-rainy-directions',
                sceneId: 'scene:aakash-rainy-directions',
                attendeeIds: ['aakash'],
            },
        ]);
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const flow = createWorldFlow({ evidence: {} as never, pronunciation: {} as never, audio: {} as never });
        const context = {
            language: 'en' as const,
            checkpoint: {
                schemaVersion: 2 as const,
                route: 'journal' as const,
                routeHistory: [{ route: 'class' as const }],
                presentationMode: 'story' as const,
                updatedAt: 1,
            },
            projection: await record.snapshot(),
            shell,
            go: vi.fn(async () => undefined),
            back: vi.fn(async () => undefined),
        };

        await flow.render('journal', context);
        current?.querySelector<HTMLButtonElement>('[data-character="rie"] button')?.click();
        current?.querySelector<HTMLButtonElement>('.academy-character-revisit')?.click();
        expect(current?.classList.contains('academy-memory-screen')).toBe(true);

        await flow.render('journal', context);
        current?.querySelector<HTMLButtonElement>('[data-character="aakash"] button')?.click();
        current?.querySelector<HTMLButtonElement>('.academy-character-revisit')?.click();
        expect(current?.classList.contains('academy-aakash-memory-screen')).toBe(true);
    });

    it('unlocks only characters recorded by a scene-level opening-story encounter', async () => {
        const record = createLearnerRecord();
        await record.recordMany([
            {
                kind: 'profile-changed',
                profile: { displayName: 'Learner', learningReason: 'Read with friends', portraitId: 'quality-2' },
            },
            {
                kind: 'characters-encountered',
                encounterId: 'story:s1e01-the-blank-atlas:scene:blank-atlas:mission-text',
                sceneId: 'scene:blank-atlas:mission-text',
                attendeeIds: ['sophie', 'ruparna'],
            },
        ]);
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const go = vi.fn(async () => undefined);
        const flow = createWorldFlow({ evidence: {} as never, pronunciation: {} as never, audio: {} as never });

        await flow.render('journal', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'journal',
                routeHistory: [{ route: 'story' }],
                presentationMode: 'story',
                updatedAt: 1,
            },
            projection: await record.snapshot(),
            shell,
            go,
            back: vi.fn(async () => undefined),
        });

        expect(current?.querySelector<HTMLElement>('[data-character="sophie"]')?.dataset.unlocked).toBe('true');
        expect(current?.querySelector<HTMLElement>('[data-character="ruparna"]')?.dataset.unlocked).toBe('true');
        expect(current?.querySelector<HTMLElement>('[data-character="xingyu"]')?.dataset.unlocked).toBe('false');
        current?.querySelector<HTMLButtonElement>('[data-character="sophie"] button')?.click();
        current?.querySelector<HTMLButtonElement>('.academy-character-revisit')?.click();
        expect(go).toHaveBeenCalledWith('story', { sectionId: 's1e01-the-blank-atlas' });
    });
});
