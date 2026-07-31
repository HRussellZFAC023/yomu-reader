import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('userscript ambient GM bindings', () => {
    it('enumerates storage and bridge values when GM_listValues is ambient-only', () => {
        // Build and execute outside jsdom: esbuild rejects jsdom's Uint8Array
        // realm, and a Function parameter models Tampermonkey's ambient binding
        // without creating globalThis.GM_listValues.
        const proof = `
            import { build } from 'esbuild';
            import { JSDOM } from 'jsdom';
            const storageResult = await build({
                entryPoints: ['src/reader/app/storage.ts'],
                bundle: true,
                write: false,
                format: 'iife',
                globalName: 'YomuStorageTest',
                platform: 'browser',
                target: 'es2022',
                logLevel: 'silent',
            });
            const values = new Map([['yomu:ambient-only-proof', true]]);
            const webStorage = {
                get length() { return 0; },
                key: () => null,
                getItem: () => null,
                setItem: () => undefined,
                removeItem: () => undefined,
            };
            delete globalThis.GM_listValues;
            delete globalThis.GM_addValueChangeListener;
            delete globalThis.GM_removeValueChangeListener;
            let valueListener;
            let removedListenerId;
            const load = new Function(
                'GM_getValue',
                'GM_deleteValue',
                'GM_listValues',
                'GM_addValueChangeListener',
                'GM_removeValueChangeListener',
                'localStorage',
                'sessionStorage',
                'window',
                storageResult.outputFiles[0].text + '\\nreturn YomuStorageTest;',
            );
            const storage = load(
                (key, fallback) => values.has(key) ? values.get(key) : fallback,
                key => { values.delete(key); },
                () => [...values.keys()],
                (_key, listener) => { valueListener = listener; return 41; },
                listenerId => { removedListenerId = listenerId; },
                webStorage,
                webStorage,
                { addEventListener: () => undefined, removeEventListener: () => undefined },
            );
            await storage.clearManagedStoredValues();
            if (values.size !== 0) throw new Error('ambient GM_listValues was not used');
            if (Object.hasOwn(globalThis, 'GM_listValues')) throw new Error('proof polluted globalThis');
            const received = [];
            const unsubscribe = storage.subscribeToStoredValueChanges('yomu:ambient-listener-proof', value => received.push(value));
            values.set('yomu:ambient-listener-proof', { alive: true });
            valueListener('yomu:ambient-listener-proof', undefined, { alive: true }, true);
            await new Promise(resolve => setTimeout(resolve, 0));
            unsubscribe();
            if (JSON.stringify(received) !== JSON.stringify([{ alive: true }])) {
                throw new Error('ambient value-change listener was not used');
            }
            if (removedListenerId !== 41) throw new Error('ambient value-change listener was not removed');
            if (Object.hasOwn(globalThis, 'GM_addValueChangeListener')
                || Object.hasOwn(globalThis, 'GM_removeValueChangeListener')) {
                throw new Error('listener proof polluted globalThis');
            }

            const bridgeResult = await build({
                entryPoints: ['src/reader/userscript/storage-bridge.ts'],
                bundle: true,
                write: false,
                format: 'iife',
                globalName: 'YomuStorageBridgeTest',
                platform: 'browser',
                target: 'es2022',
                logLevel: 'silent',
            });
            const bridgeValues = new Map([
                ['yomu:ambient-only-proof', true],
                ['foreign-key', true],
            ]);
            const dom = new JSDOM('<!doctype html><html><body></body></html>', {
                url: 'https://yomureader.com/',
            });
            const loadBridge = new Function(
                'GM_getValue',
                'GM_setValue',
                'GM_deleteValue',
                'GM_listValues',
                'window',
                'document',
                'location',
                'HTMLElement',
                'Event',
                'CustomEvent',
                bridgeResult.outputFiles[0].text + '\\nreturn YomuStorageBridgeTest;',
            );
            const bridgeApi = loadBridge(
                (key, fallback) => bridgeValues.has(key) ? bridgeValues.get(key) : fallback,
                (key, value) => { bridgeValues.set(key, value); },
                key => { bridgeValues.delete(key); },
                () => [...bridgeValues.keys()],
                dom.window,
                dom.window.document,
                dom.window.location,
                dom.window.HTMLElement,
                dom.window.Event,
                dom.window.CustomEvent,
            );
            bridgeApi.installUserscriptGmStorageBridge();
            const bridge = bridgeApi.getUserscriptGmStorage();
            if (!bridge) throw new Error('bridge did not install');
            const keys = await bridge.listValues();
            bridgeApi.uninstallUserscriptGmStorageBridge();
            dom.window.close();
            if (keys.join(',') !== 'yomu:ambient-only-proof') {
                throw new Error('ambient bridge list mismatch: ' + JSON.stringify(keys));
            }
            if (Object.hasOwn(globalThis, 'GM_listValues')) throw new Error('bridge proof polluted globalThis');
            process.stdout.write('ambient-only enumeration, listeners, and bridge passed');
        `;

        const output = execFileSync(process.execPath, ['--input-type=module', '-e', proof], {
            cwd: process.cwd(),
            encoding: 'utf8',
        });

        expect(output).toContain('ambient-only enumeration, listeners, and bridge passed');
    });
});
