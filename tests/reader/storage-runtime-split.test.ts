import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    registerStorageRuntimeApi,
    storageRuntimeApi,
    type StorageRuntimeApi,
} from '../../src/reader/app/storage-runtime-bridge';
import {
    gmPrivateStorageGet,
    gmStorageGet,
    managedSessionStorage,
} from '../../src/reader/app/storage-runtime-facade';
import * as lookupLinkFacade from '../../src/reader/settings/lookup-links-companion';
import * as lookupLinkImplementation from '../../src/reader/settings/lookup-links';

const STORAGE_RUNTIME_API_SLOT = Symbol.for('yomu.storage-runtime-api.v1');
const originalStorageSlot = Object.getOwnPropertyDescriptor(globalThis, STORAGE_RUNTIME_API_SLOT);
const originalCompanionRegistry = Object.getOwnPropertyDescriptor(globalThis, '__yomuCompanions');
const repoRoot = path.resolve(import.meta.dirname, '..', '..');

describe('aggregate runtime storage split', () => {
    beforeEach(() => {
        Reflect.deleteProperty(globalThis, STORAGE_RUNTIME_API_SLOT);
    });

    afterEach(() => {
        Reflect.deleteProperty(globalThis, STORAGE_RUNTIME_API_SLOT);
        if (originalStorageSlot) Object.defineProperty(globalThis, STORAGE_RUNTIME_API_SLOT, originalStorageSlot);
    });

    it('delegates public and private storage calls through one non-enumerable realm slot', async () => {
        const get = vi.fn(async (_key: string, fallback: unknown) => fallback);
        const privateGet = vi.fn(async () => 'secret');
        const sessionGet = vi.fn(() => 'session-value');
        registerStorageRuntimeApi({
            gmStorageGet: get,
            gmPrivateStorageGet: privateGet,
            assertManagedStateMutationAllowed: vi.fn(),
            managedLocalStorage: storageFacade(),
            managedSessionStorage: storageFacade(sessionGet),
        } as unknown as StorageRuntimeApi);

        await expect(gmStorageGet('ordinary', 4)).resolves.toBe(4);
        await expect(gmPrivateStorageGet('yomu:private:token', '')).resolves.toBe('secret');
        expect(managedSessionStorage.getItem('yomu:test')).toBe('session-value');
        expect(get).toHaveBeenCalledWith('ordinary', 4);
        expect(privateGet).toHaveBeenCalledWith('yomu:private:token', '');
        expect(Object.getOwnPropertyDescriptor(globalThis, STORAGE_RUNTIME_API_SLOT)).toMatchObject({
            enumerable: false,
        });
        expect((globalThis as typeof globalThis & { __yomuCompanions?: Record<string, unknown> })
            .__yomuCompanions?.storage).toBeUndefined();
    });

    it('fails closed until core installs the authoritative implementation', () => {
        expect(() => storageRuntimeApi()).toThrow('authoritative Yomu storage runtime is not installed');
        expect(() => managedSessionStorage.getItem('yomu:test')).toThrow(
            'authoritative Yomu storage runtime is not installed',
        );
    });

    it('keeps the bridge out of the page-cloned companion registry', () => {
        const bridge = readFileSync(
            path.join(repoRoot, 'src/reader/app/storage-runtime-bridge.ts'),
            'utf8',
        );
        expect(bridge).toContain("Symbol.for('yomu.storage-runtime-api.v1')");
        expect(bridge).not.toContain('__yomuCompanions');
        expect(bridge).not.toContain('cloneInto');
        expect(bridge).not.toMatch(/\bwindow\b/u);
    });

    it('aliases storage only for the aggregate runtime build', () => {
        const config = readFileSync(
            path.join(repoRoot, 'config/vite/greasyfork-library.config.ts'),
            'utf8',
        );
        expect(config).toContain("library.id === 'runtime'");
        expect(config).toContain("'storage-runtime-facade.ts'");
        expect(config).toContain("'../app/storage': runtimeStorageFacade");
        expect(config).toContain("'../../app/storage': runtimeStorageFacade");
        expect(config).toContain("'./storage': runtimeStorageFacade");
    });
});

describe('lookup-link catalogue split', () => {
    afterEach(() => {
        if (originalCompanionRegistry) {
            Object.defineProperty(globalThis, '__yomuCompanions', originalCompanionRegistry);
        } else {
            Reflect.deleteProperty(globalThis, '__yomuCompanions');
        }
    });

    it('preserves the real companion catalogue behind the core facade', () => {
        installLookupLinkCompanion(lookupLinkImplementation);
        expect(lookupLinkFacade.targetLookupSiteIds()).toEqual(lookupLinkImplementation.targetLookupSiteIds());
        expect(lookupLinkFacade.targetLookupLinks('en')).toEqual(lookupLinkImplementation.targetLookupLinks('en'));
        expect(lookupLinkFacade.missingLookupComponents('grc')).toEqual(
            lookupLinkImplementation.missingLookupComponents('grc'),
        );
    });

    it('degrades to an empty catalogue when the runtime companion is absent', () => {
        installLookupLinkCompanion(undefined);
        expect(lookupLinkFacade.hasTargetLookupSites('en')).toBe(false);
        expect(lookupLinkFacade.targetLookupSiteIds()).toEqual([]);
        expect(lookupLinkFacade.isTargetLookupLinkId('wiktionary-en')).toBe(false);
        expect(lookupLinkFacade.targetLookupSites('en')).toEqual([]);
        expect(lookupLinkFacade.targetLookupLinks('en')).toEqual([]);
        expect(lookupLinkFacade.lookupSiteComponents('en', 'wiktionary-en')).toEqual([]);
        expect(lookupLinkFacade.missingLookupComponents('en')).toEqual([]);
    });

    it('routes the split core away from the duplicated catalogue module', () => {
        const config = readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8');
        expect(config).toContain("alias['./lookup-links']");
        expect(config).toContain("'lookup-links-companion.ts'");
    });
});

function storageFacade(
    getItem: (key: string) => string | null = vi.fn(() => null),
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    return {
        getItem,
        setItem: vi.fn(),
        removeItem: vi.fn(),
    };
}

function installLookupLinkCompanion(lookupLinks: typeof lookupLinkImplementation | undefined): void {
    Object.defineProperty(globalThis, '__yomuCompanions', {
        configurable: true,
        value: lookupLinks ? { settings: { lookupLinks } } : {},
        writable: true,
    });
}
