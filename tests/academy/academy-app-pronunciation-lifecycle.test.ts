import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcademyApp } from '../../src/academy/app';
import type { AudioDirector } from '../../src/academy/audio/director';
import type { PronunciationService } from '../../src/academy/integration/yomu-bridge';

afterEach(() => document.body.replaceChildren());

describe('Academy app pronunciation lifecycle', () => {
    it('disposes pronunciation before audio and tears the app down only once', () => {
        const calls: string[] = [];
        const pronunciation: PronunciationService = {
            play: vi.fn(async () => ({ dispose: vi.fn() })),
            dispose: vi.fn(() => { calls.push('pronunciation'); }),
        };
        const audio = {
            settings: {
                muted: false,
                volumes: { music: 0.7, ambience: 0.6, lesson: 0.65, sfx: 0.8 },
            },
            dispose: vi.fn(() => { calls.push('audio'); }),
        } as unknown as AudioDirector;
        const host = document.createElement('main');
        document.body.append(host);
        const app = new AcademyApp(host, { pronunciation, audio });

        app.dispose();
        app.dispose();

        expect(calls).toEqual(['pronunciation', 'audio']);
        expect(pronunciation.dispose).toHaveBeenCalledOnce();
        expect(audio.dispose).toHaveBeenCalledOnce();
    });
});
