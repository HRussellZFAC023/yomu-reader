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
        vi.resetModules();
        academy.dispose.mockClear();
        academy.start.mockClear();
        document.body.innerHTML = '<main id="yomu-academy"></main>';
        delete document.documentElement.dataset.yomuHosted;
        document.getElementById('jpdb-reader-installed-runtime')?.remove();
    });

    afterEach(() => {
        window.dispatchEvent(pageHideEvent(false));
        document.body.replaceChildren();
        document.getElementById('jpdb-reader-installed-runtime')?.remove();
        delete document.documentElement.dataset.yomuHosted;
        delete window.__yomuAcademy;
    });

    it('survives bfcache pagehide and disposes on a later real unload', async () => {
        await import('../../src/academy/entrypoint');

        expect(document.documentElement.dataset.yomuHosted).toBe('');

        window.dispatchEvent(pageHideEvent(true));
        expect(academy.dispose).not.toHaveBeenCalled();

        window.dispatchEvent(pageHideEvent(false));
        expect(academy.dispose).toHaveBeenCalledTimes(1);

        window.dispatchEvent(pageHideEvent(false));
        expect(academy.dispose).toHaveBeenCalledTimes(1);
    });

    it('leaves installed Academy ownership unmarked for the page fallback', async () => {
        const marker = document.createElement('meta');
        marker.id = 'jpdb-reader-installed-runtime';
        document.head.append(marker);

        await import('../../src/academy/entrypoint');

        expect(document.documentElement.dataset.yomuHosted).toBeUndefined();
        expect(academy.start).toHaveBeenCalledTimes(1);
    });
});

function pageHideEvent(persisted: boolean): PageTransitionEvent {
    return new PageTransitionEvent('pagehide', { persisted });
}
