import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AudioDirectorEvent, AudioSettings } from '../../src/academy/audio/types';
import type { AcademyShell } from '../../src/academy/ui/shell';

describe('World Story voice route', () => {
    it('instantiates the exact Chapter 1 voice catalog and opening score from the production Story route', async () => {
        const catalog = { schema: 'yomu-academy.story-voice-playback.v1', entries: [] };
        const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(catalog), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        const audioEvents = new Set<(event: AudioDirectorEvent) => void>();
        const settings: AudioSettings = {
            muted: false,
            volumes: { music: 0.7, ambience: 0.6, lesson: 0.8, sfx: 0.8 },
        };
        const audio = {
            state: 'ready' as const,
            settings,
            setTheme: vi.fn(async () => undefined),
            beginExternalLesson: vi.fn(() => vi.fn()),
            playSfx: vi.fn(),
            onEvent(listener: (event: AudioDirectorEvent) => void) {
                audioEvents.add(listener);
                return () => audioEvents.delete(listener);
            },
        };
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: audio as never,
        });

        await flow.render('story', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'story',
                routeHistory: [{ route: 'campus' }],
                presentationMode: 'story',
                sectionId: 's1e01-the-blank-atlas',
                selectedBand: 'n5',
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go: vi.fn(async () => undefined),
            back: vi.fn(async () => undefined),
        });

        await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith(
            '/academy/audio/story-voice-playback.json',
            { credentials: 'same-origin' },
        ));
        expect(audio.setTheme).toHaveBeenCalledWith('opening.invitation');
        expect(audioEvents.size).toBe(1);
        expect(current?.querySelector('.academy-vn-voice-replay')).not.toBeNull();

        current?.dispatchEvent(new Event('academy:dispose'));
        expect(audioEvents.size).toBe(0);
    });
});
