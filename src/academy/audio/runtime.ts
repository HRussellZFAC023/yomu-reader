import { BrowserMediaBus } from './browser-media';
import { BrowserSfxPlayback } from './browser-sfx';
import { AudioDirector } from './director';
import { AUTHORIZED_AUDIO_CATALOG, AUTHORIZED_SFX_SOURCES } from './manifest';

/**
 * Complete app integration hook for the owner-approved, session-protected
 * Academy soundtrack and SFX. Keeping construction here prevents screens
 * from owning media elements or bypassing AudioDirector.
 */
export function createAuthorizedAcademyAudioDirector(storage: Storage | null = null): AudioDirector {
    return new AudioDirector({
        catalog: AUTHORIZED_AUDIO_CATALOG,
        music: new BrowserMediaBus(),
        ambience: new BrowserMediaBus(),
        lesson: new BrowserMediaBus(),
        sfx: new BrowserSfxPlayback(AUTHORIZED_SFX_SOURCES),
        storage,
        releaseMode: true,
    });
}
