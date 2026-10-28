import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountNewTabStudySurface, NewTabRuntime } from '../../src/reader/newtab/runtime';
import { createStudySessionClock } from '../../src/reader/newtab/session-clock';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('embedded Study initialization ownership', () => {
    it('destroys a runtime whose initialization rejects before a disposer can be returned', async () => {
        const host = document.createElement('section');
        host.textContent = 'partially mounted';
        document.body.append(host);
        const error = new Error('initialization failed');
        vi.spyOn(NewTabRuntime.prototype, 'init').mockRejectedValueOnce(error);
        const destroy = vi.spyOn(NewTabRuntime.prototype, 'destroy');
        const clock = createStudySessionClock();
        try {
            await expect(mountNewTabStudySurface(host, { language: 'en', sessionClock: clock })).rejects.toBe(error);
            expect(destroy).toHaveBeenCalledOnce();
            expect(host.childElementCount).toBe(0);
            expect(host.textContent).toBe('');
        } finally { clock.dispose(); }
    });

    it('keeps successful teardown with the returned disposer', async () => {
        const host = document.createElement('section');
        vi.spyOn(NewTabRuntime.prototype, 'init').mockResolvedValueOnce();
        const destroy = vi.spyOn(NewTabRuntime.prototype, 'destroy');
        const clock = createStudySessionClock();
        try {
            const lifetime = await mountNewTabStudySurface(host, { language: 'ja', sessionClock: clock });
            expect(destroy).not.toHaveBeenCalled();
            lifetime.dispose();
            lifetime.dispose();
            expect(destroy).toHaveBeenCalledOnce();
        } finally { clock.dispose(); }
    });
});
