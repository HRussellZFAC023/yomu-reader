import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as tokenTextRendering from '../../src/reader/dom/token-text-rendering';
import * as localYomuDeck from '../../src/reader/srs/local-yomu-deck';
import * as handleDrag from '../../src/reader/popup/handle-drag';
import * as settings from '../../src/reader/settings';
import type { JPDBToken } from '../../src/reader/app/types';
import {
    aggregateRuntimeModules,
    registerAggregateRuntimeModules,
} from '../../src/reader/companions/aggregate-runtime-modules';

const AGGREGATE_RUNTIME_MODULES_SLOT = Symbol.for('yomu.aggregate-runtime-modules.v1');
const originalRuntimeSlot = Object.getOwnPropertyDescriptor(globalThis, AGGREGATE_RUNTIME_MODULES_SLOT);
const repoRoot = path.resolve(import.meta.dirname, '..', '..');

// Production reaches these facades through string-valued Vite aliases. Keep the
// contract test on that same opaque runtime seam: a literal import here would
// manufacture a test-only static edge that the split browser build does not have.
function importRuntimeFacade<T>(directory: string, moduleName: string): Promise<T> {
    const specifier = ['..', '..', 'src', 'reader', directory, moduleName].join('/');
    return import(specifier) as Promise<T>;
}

describe('aggregate runtime implementation sharing', () => {
    beforeEach(() => {
        registerAggregateRuntimeModules({ settings, tokenTextRendering, localYomuDeck, handleDrag });
    });

    afterEach(() => {
        if (originalRuntimeSlot) {
            Object.defineProperty(globalThis, AGGREGATE_RUNTIME_MODULES_SLOT, originalRuntimeSlot);
        } else {
            Reflect.deleteProperty(globalThis, AGGREGATE_RUNTIME_MODULES_SLOT);
        }
    });

    it('publishes the exact implementations through one sandbox-only Module interface', () => {
        const modules = aggregateRuntimeModules();

        expect(modules.settings).toBe(settings);
        expect(modules.tokenTextRendering).toBe(tokenTextRendering);
        expect(modules.localYomuDeck).toBe(localYomuDeck);
        expect(modules.handleDrag).toBe(handleDrag);
        expect(Object.getOwnPropertyDescriptor(globalThis, AGGREGATE_RUNTIME_MODULES_SLOT)).toMatchObject({
            enumerable: false,
        });
    });

    it('fails closed when the required aggregate runtime did not register its Modules', () => {
        Reflect.deleteProperty(globalThis, AGGREGATE_RUNTIME_MODULES_SLOT);

        expect(() => aggregateRuntimeModules()).toThrow('aggregate runtime Modules are not installed');
    });

    it('keeps the internal seam out of the page-cloned companion registry', () => {
        const bridge = readFileSync(
            path.join(repoRoot, 'src/reader/companions/aggregate-runtime-modules.ts'),
            'utf8',
        );
        expect({
            usesSandboxSlot: bridge.includes("Symbol.for('yomu.aggregate-runtime-modules.v1')"),
            mentionsPublicRegistry: bridge.includes('__yomuCompanions'),
            clonesIntoPage: bridge.includes('cloneInto'),
            usesWindowRealm: /\bwindow\b/u.test(bridge),
        }).toEqual({
            usesSandboxSlot: true,
            mentionsPublicRegistry: false,
            clonesIntoPage: false,
            usesWindowRealm: false,
        });
    });

    it('registers the implementation once and aliases only the split core', () => {
        const aggregateEntry = readFileSync(
            path.join(repoRoot, 'src/reader/companions/runtime.ts'),
            'utf8',
        );
        const viteConfig = readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8');

        expect(aggregateEntry.trimEnd()).toMatch(/import '.\/register-aggregate-runtime-modules';$/u);
        for (const facade of [
            'index-companion.ts',
            'token-text-rendering-companion.ts',
            'local-yomu-deck-companion.ts',
            'handle-drag-companion.ts',
        ]) expect(viteConfig).toContain(facade);
        expect(viteConfig).toContain("alias['./token-text-rendering']");
        expect(viteConfig).toContain("alias['../dom/token-text-rendering']");
        expect(viteConfig).toContain("alias['./local-yomu-deck']");
        expect(viteConfig).toContain("alias['./handle-drag']");
        expect(viteConfig).toContain("alias['../popup/handle-drag']");
        expect(viteConfig).toContain("alias['../settings/index']");
    });

    it('keeps every facade bound to the runtime implementation, not a second copy', async () => {
        const settingsFacade = await importRuntimeFacade<typeof settings>(
            'settings',
            'index-companion',
        );
        const tokenFacade = await importRuntimeFacade<typeof tokenTextRendering>(
            'dom',
            'token-text-rendering-companion',
        );
        const deckFacade = await importRuntimeFacade<typeof localYomuDeck>(
            'srs',
            'local-yomu-deck-companion',
        );
        const dragFacade = await importRuntimeFacade<typeof handleDrag>(
            'popup',
            'handle-drag-companion',
        );

        expect(settingsFacade.normalizeReaderSettings).toBe(settings.normalizeReaderSettings);
        expect(settingsFacade.saveSettings).toBe(settings.saveSettings);
        expect(tokenFacade.renderRuby).toBe(tokenTextRendering.renderRuby);
        expect(tokenFacade.inferredInflectedSurfaceRubies)
            .toBe(tokenTextRendering.inferredInflectedSurfaceRubies);
        expect(tokenFacade.renderDetachedReadings).not.toBe(tokenTextRendering.renderDetachedReadings);
        expect(tokenFacade.kanjiNavigationForElement).toBe(tokenTextRendering.kanjiNavigationForElement);
        const representativeToken = {
            card: { language: 'ja' },
            start: 0,
            end: 1,
            length: 1,
            rubies: [{ text: 'しょく', start: 0, end: 1, length: 1 }],
            pitchClass: '',
        } as JPDBToken;
        const navigation = { enabled: true, label: 'Show kanji' };
        expect(tokenFacade.renderDetachedReadings('食', representativeToken, navigation))
            .toBe(tokenTextRendering.renderDetachedReadings('食', representativeToken, navigation));
        expect(deckFacade.normalizeStoredYomuSrsDeck).toBe(localYomuDeck.normalizeStoredYomuSrsDeck);
        expect(deckFacade.mergeStoredYomuSrsDecks).toBe(localYomuDeck.mergeStoredYomuSrsDecks);
        expect(dragFacade.createHandleDragController).toBe(handleDrag.createHandleDragController);
        expect(dragFacade.addViewportChangeListeners).toBe(handleDrag.addViewportChangeListeners);
    });
});
