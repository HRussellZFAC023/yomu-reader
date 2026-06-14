import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerYomuCompanion, yomuImageOcrController } from '../../src/reader/companions/registry';

const companionDescriptor = () => Object.getOwnPropertyDescriptor(globalThis, '__yomuCompanions');

describe('companion registry', () => {
    const originalDescriptor = companionDescriptor();

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        if (originalDescriptor) {
            Object.defineProperty(globalThis, '__yomuCompanions', originalDescriptor);
        } else {
            delete (globalThis as typeof globalThis & { __yomuCompanions?: unknown }).__yomuCompanions;
        }
    });

    it('keeps a sandbox registry when Firefox rejects cross-compartment assignment', () => {
        const Controller = class TestOcrController {};
        Object.defineProperty(globalThis, '__yomuCompanions', {
            configurable: true,
            get: () => undefined,
            set: () => { throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper'); },
        });

        expect(() => registerYomuCompanion('ocr', { ImageOcrController: Controller as never })).not.toThrow();

        expect(yomuImageOcrController()).toBe(Controller);
    });

    it('does not require defining a page-global registry when XrayWrapper rejects every write path', () => {
        const Controller = class TestOcrController {};
        Object.defineProperty(globalThis, '__yomuCompanions', {
            configurable: true,
            get: () => undefined,
            set: () => { throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper'); },
        });
        const defineProperty = vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
            if (target === globalThis && key === '__yomuCompanions') {
                throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper');
            }
            if (!target || (typeof target !== 'object' && typeof target !== 'function')) return target;
            Reflect.defineProperty(target, key, descriptor);
            return target;
        });

        expect(() => registerYomuCompanion('ocr', { ImageOcrController: Controller as never })).not.toThrow();

        expect(defineProperty).toHaveBeenCalled();
        expect(yomuImageOcrController()).toBe(Controller);
    });
});
