import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerYomuCompanion, yomuImageOcrController } from '../../src/reader/companions/registry';

const companionDescriptor = () => Object.getOwnPropertyDescriptor(globalThis, '__yomuCompanions');

describe('companion registry', () => {
    const originalDescriptor = companionDescriptor();

    afterEach(() => {
        vi.unstubAllGlobals();
        if (originalDescriptor) {
            Object.defineProperty(globalThis, '__yomuCompanions', originalDescriptor);
        } else {
            delete (globalThis as typeof globalThis & { __yomuCompanions?: unknown }).__yomuCompanions;
        }
    });

    it('falls back to defining a cloned registry when Firefox rejects cross-compartment assignment', () => {
        const Controller = class TestOcrController {};
        const cloned = { ocr: { ImageOcrController: Controller } };
        const cloneInto = vi.fn(() => cloned);
        vi.stubGlobal('cloneInto', cloneInto);
        Object.defineProperty(globalThis, '__yomuCompanions', {
            configurable: true,
            get: () => undefined,
            set: () => { throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper'); },
        });

        expect(() => registerYomuCompanion('ocr', { ImageOcrController: Controller as never })).not.toThrow();

        expect(cloneInto).toHaveBeenCalledWith(expect.any(Object), window, { cloneFunctions: true, wrapReflectors: true });
        expect(yomuImageOcrController()).toBe(Controller);
    });
});
