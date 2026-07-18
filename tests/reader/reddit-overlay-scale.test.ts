import { describe, expect, it, vi } from 'vitest';

import { applyRedditOverlayScale, isRedditHostname } from '../../src/reader/ui/reddit-overlay-scale';

describe('Reddit overlay scale isolation', () => {
    it('recognizes Reddit hosts without matching lookalikes', () => {
        expect(isRedditHostname('reddit.com')).toBe(true);
        expect(isRedditHostname('www.reddit.com')).toBe(true);
        expect(isRedditHostname('old.reddit.com')).toBe(true);
        expect(isRedditHostname('reddit.com.example.test')).toBe(false);
    });

    it('pins Reddit overlay zoom with inline priority', () => {
        const style = { removeProperty: vi.fn(), setProperty: vi.fn() };
        const element = { style } as unknown as HTMLElement;
        applyRedditOverlayScale(element, 'www.reddit.com');

        expect(style.setProperty).toHaveBeenCalledWith('zoom', '1', 'important');
        expect(style.removeProperty).not.toHaveBeenCalled();
    });

    it('leaves overlay sizing untouched on other sites', () => {
        const style = { removeProperty: vi.fn(), setProperty: vi.fn() };
        const element = { style } as unknown as HTMLElement;
        applyRedditOverlayScale(element, 'youtube.com');

        expect(style.removeProperty).not.toHaveBeenCalled();
        expect(style.setProperty).not.toHaveBeenCalled();
    });
});
