import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import type { AcademyStudyMountContext, AcademyStudyModule } from '../../src/academy/integration/study-module';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import { createAcademyShell } from '../../src/academy/ui/shell';

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('Academy Study route', () => {
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
            evidence: {} as never,
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
                updatedAt: 1,
            },
            projection,
            shell,
            go: vi.fn(async () => {}),
            back,
        })).resolves.toBe(true);

        expect(host.querySelector('[data-academy-screen="study"] [data-canonical-study-renderer]')).not.toBeNull();
        expect(mountedContext?.surface).toEqual({ id: 'academy', theme: 'living-paper' });
        expect(mountedContext?.countdown.snapshot().label).toBe('15:00');
        (host.querySelector('.academy-study-back') as HTMLButtonElement).click();
        expect(back).toHaveBeenCalledOnce();

        shell.replace(document.createElement('section'));
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
            evidence: {} as never,
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
                updatedAt: 1,
            },
            projection,
            shell,
            go: vi.fn(async () => {}),
            back: vi.fn(async () => {}),
        });

        await Promise.resolve();
        shell.replace(document.createElement('section'));
        finishMount({ dispose });
        await render;

        expect(dispose).toHaveBeenCalledOnce();
        expect(host.querySelector('[data-academy-screen="study"]')).toBeNull();
        shell.dispose();
    });
});
