import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const academy = vi.hoisted(() => ({
    dispose: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/academy/app', () => ({
    AcademyApp: class {
        dispose = academy.dispose;
        start = academy.start;
    },
}));

vi.mock('../../src/academy/integration/yomu-runtime', () => ({
    initYomuReaderRuntime: vi.fn(),
}));

describe('Academy entrypoint lifecycle', () => {
    beforeEach(() => {
        academy.dispose.mockClear();
        academy.start.mockClear();
        document.body.innerHTML = '<main id="yomu-academy"></main>';
    });

    afterEach(() => {
        window.dispatchEvent(pageHideEvent(false));
        document.body.replaceChildren();
        delete window.__yomuAcademy;
    });

    it('survives bfcache pagehide and disposes on a later real unload', async () => {
        await import('../../src/academy/entrypoint');

        window.dispatchEvent(pageHideEvent(true));
        expect(academy.dispose).not.toHaveBeenCalled();

        window.dispatchEvent(pageHideEvent(false));
        expect(academy.dispose).toHaveBeenCalledTimes(1);

        window.dispatchEvent(pageHideEvent(false));
        expect(academy.dispose).toHaveBeenCalledTimes(1);
    });
});

function pageHideEvent(persisted: boolean): PageTransitionEvent {
    return new PageTransitionEvent('pagehide', { persisted });
}
