import { afterEach, describe, expect, it, vi } from 'vitest';

import { FloatingButtonController } from '../../src/reader/ui/floating-button';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { stubFloatingButtonActions } from './jpdb/fixtures';

// A bottom transcript sheet hides the puck only while the puck rests where the
// sheet goes. A learner who moved it up out of the way keeps the puck, and with
// it power, OCR and Settings, while the transcript is open.
function puckRest(position: { puckPositionX?: number; puckPositionY?: number }): string | undefined {
    const controller = new FloatingButtonController();
    controller.install({ ...DEFAULT_SETTINGS, showFloatingButton: true, ...position }, vi.fn(), stubFloatingButtonActions());
    try {
        return document.querySelector<HTMLElement>('.jpdb-reader-fab')?.dataset.puckRest;
    } finally {
        controller.destroy();
    }
}

describe('where the puck rests', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('rests at the bottom until the learner places it', () => {
        expect(puckRest({})).toBe('bottom');
    });

    it('follows a placed puck into the top or bottom half of the window', () => {
        expect(window.innerHeight).toBeGreaterThan(200);
        expect(puckRest({ puckPositionX: 20, puckPositionY: 24 })).toBe('top');
        expect(puckRest({ puckPositionX: 20, puckPositionY: window.innerHeight - 80 })).toBe('bottom');
    });
});
