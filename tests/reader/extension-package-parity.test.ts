// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { compilerStorageBackgroundFixture } from './helpers/compiler-storage-background';
import {
    assertExtensionReleasePackageParity,
    assertShippedSettingsAuthorityRuntime,
    hardenCompilerDurableStorage,
    hardenExtensionBackgroundSource,
    PACKAGED_STUDY_STORAGE_RUNTIME_FILE,
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
} from '../../scripts/lib/extension-runtime-hardening.mjs';

async function writeFixtureTree(root: string, files: Record<string, Uint8Array>): Promise<void> {
    for (const [file, bytes] of Object.entries(files)) {
        const destination = path.join(root, file);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
    }
}

function parityFixtureFiles(target: string): Record<string, Uint8Array> {
    return {
        'manifest.json': strToU8(JSON.stringify({ version: '1.9.3' })),
        'background.js': strToU8(`${target} background`),
        'content.js': strToU8(`${target} content`),
        [PACKAGED_STUDY_STORAGE_RUNTIME_FILE]: strToU8(`${target} storage runtime`),
        'newtab/index.html': strToU8(`<script src="./study-storage-runtime.js"></script>${target}`),
        ...(target === 'firefox' ? {
            'gm-runtime.js': strToU8('firefox gm runtime'),
        } : {}),
    };
}

function shippedRuntimeFixture(target: string): Record<string, Uint8Array> {
    const launcher = [
        "void 'yomu.openPackagedStudySettings';",
        "void 'yomu-packaged-study-settings-launcher:v1';",
    ].join('\n');
    const durableRuntime = hardenCompilerDurableStorage(`(() => {
  const api = globalThis.browser || globalThis.chrome;
  const values = Object.create(null);
  const listeners = new Map();
  const yomuDurableMutationQueues = new Map();
  let valuesHydrated = false;
  function gmMessage(type, payload) {
    return api.runtime.sendMessage({ channel: 'userscript-compiler', type, payload }).then(response => {
      if (response?.error) throw new Error(response.error);
      return response;
    });
  }
  function notifyValueListeners(name, oldValue, newValue, remote) {
    for (const listener of listeners.values()) {
      if (listener.name === name) listener.callback(name, oldValue, newValue, Boolean(remote));
    }
  }
  function yomuQueueDurableMutation(name, mutation) {
    const previous = yomuDurableMutationQueues.get(name) || Promise.resolve();
    const current = previous.then(mutation, mutation);
    yomuDurableMutationQueues.set(name, current);
    return current.finally(() => {
      if (yomuDurableMutationQueues.get(name) === current) yomuDurableMutationQueues.delete(name);
    });
  }
  function GM_getValue(name, defaultValue) {
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : defaultValue;
  }
  function GM_listValues() { return Object.keys(values); }
  function GM_setValue(name, value) {
    // yomu-extension-durable-storage-runtime:v2
    return yomuQueueDurableMutation(name, () => gmMessage('GM_setValue', { name, value }).then(() => {
      const oldValue = values[name];
      values[name] = value;
      notifyValueListeners(name, oldValue, value, false);
    }));
  }
  function GM_deleteValue(name) {
    return yomuQueueDurableMutation(name, () => gmMessage('GM_deleteValue', { name }).then(() => {
      const oldValue = values[name];
      delete values[name];
      notifyValueListeners(name, oldValue, undefined, false);
    }));
  }
  function GM_addValueChangeListener(name, callback) {
    const id = listeners.size + 1;
    listeners.set(id, { name, callback });
    return id;
  }
  const GM = {
    getValue: GM_getValue,
    listValues: GM_listValues,
    setValue: GM_setValue,
    deleteValue: GM_deleteValue,
  };
  Object.assign(globalThis, { GM, GM_getValue, GM_setValue, GM_deleteValue, GM_addValueChangeListener });
  const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  });
  globalThis.__USC_READY = yomuValuesReady;
})();`);
    const gatedContent = `Promise.resolve(globalThis.__USC_READY).then(() => {
${launcher}
});`;
    const combinedContent = `${durableRuntime}
${gatedContent}`;
    return {
        'manifest.json': strToU8(JSON.stringify({ version: '1.9.3' })),
        'background.js': strToU8(hardenExtensionBackgroundSource(compilerStorageBackgroundFixture(), { target })),
        'content.js': strToU8(target === 'firefox' ? gatedContent : combinedContent),
        [PACKAGED_STUDY_STORAGE_RUNTIME_FILE]: strToU8([
            '// yomu-extension-study-storage-runtime',
            'globalThis.__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__ = true;',
        ].join('\n')),
        'newtab/index.html': strToU8('<script src="./study-storage-runtime.js"></script>'),
        'newtab/version.json': strToU8(JSON.stringify({ buildId: '1.9.3-deadbeef' })),
        ...(target === 'firefox' ? { 'gm-runtime.js': strToU8(durableRuntime) } : {}),
    };
}

describe('extension package parity', () => {
    it('requires nested Study runtime and HTML parity in Chrome, Firefox, and Safari releases', async () => {
        const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'yomu-extension-parity-'));
        try {
            const targets = {
                chrome: parityFixtureFiles('chrome'),
                firefox: parityFixtureFiles('firefox'),
                safari: parityFixtureFiles('safari'),
            };
            for (const [target, files] of Object.entries(targets)) {
                await writeFixtureTree(path.join(fixtureRoot, 'packages', 'extension', target), files);
            }
            for (const [target, archiveName] of [
                ['chrome', 'yomureader.com-chrome.zip'],
                ['firefox', 'yomureader.com-firefox.xpi'],
            ] as const) {
                const archiveDirectory = path.join(fixtureRoot, 'release', target);
                await mkdir(archiveDirectory, { recursive: true });
                const archive = zipSync(targets[target]);
                expect(Object.keys(unzipSync(archive))).toContain(PACKAGED_STUDY_STORAGE_RUNTIME_FILE);
                await writeFile(path.join(archiveDirectory, archiveName), archive);
            }
            await writeFixtureTree(
                path.join(fixtureRoot, 'release', 'safari', 'yomureader.com-safari-web-extension'),
                targets.safari,
            );

            await expect(assertExtensionReleasePackageParity(fixtureRoot)).resolves.toBeUndefined();

            await writeFile(
                path.join(fixtureRoot, 'release', 'chrome', 'yomureader.com-chrome.zip'),
                zipSync({
                    ...targets.chrome,
                    [PACKAGED_STUDY_STORAGE_RUNTIME_FILE]: strToU8('wrong runtime'),
                }),
            );
            await expect(assertExtensionReleasePackageParity(fixtureRoot)).rejects.toThrow(
                'chrome newtab/study-storage-runtime.js differs',
            );
        } finally {
            await rm(fixtureRoot, { recursive: true, force: true });
        }
    });

    it('binds release acceptance to shipped launcher, adapter, durable runtime, and version bytes', async () => {
        for (const target of ['chrome', 'firefox', 'safari']) {
            const entries = shippedRuntimeFixture(target);
            await expect(assertShippedSettingsAuthorityRuntime(entries, target, '1.9.3')).resolves.toBeUndefined();
        }

        const staleFirefox = shippedRuntimeFixture('firefox');
        staleFirefox['background.js'] = strToU8('stale background');
        await expect(assertShippedSettingsAuthorityRuntime(staleFirefox, 'firefox', '1.9.3'))
            .rejects.toThrow(/settings background bridge is missing/);

        const swallowedFirefoxReadiness = shippedRuntimeFixture('firefox');
        swallowedFirefoxReadiness['content.js'] = strToU8(
            new TextDecoder().decode(swallowedFirefoxReadiness['content.js']).replace(
                'Promise.resolve(globalThis.__USC_READY).then(() => {',
                'Promise.resolve(globalThis.__USC_READY).catch(() => {}).then(() => {',
            ),
        );
        await expect(assertShippedSettingsAuthorityRuntime(swallowedFirefoxReadiness, 'firefox', '1.9.3'))
            .rejects.toThrow(/strict userscript readiness gate is missing/);

        const staleAdapter = shippedRuntimeFixture('chrome');
        staleAdapter[PACKAGED_STUDY_STORAGE_RUNTIME_FILE] = strToU8('placeholder');
        await expect(assertShippedSettingsAuthorityRuntime(staleAdapter, 'chrome', '1.9.3'))
            .rejects.toThrow(/packaged Study storage adapter marker is missing/);

        const wrongVersion = shippedRuntimeFixture('safari');
        await expect(assertShippedSettingsAuthorityRuntime(wrongVersion, 'safari', '1.9.2'))
            .rejects.toThrow(/manifest version.*does not match 1\.9\.2/);

        const swallowedMutation = shippedRuntimeFixture('chrome');
        swallowedMutation['content.js'] = strToU8(new TextDecoder().decode(swallowedMutation['content.js']).replace(
            'Promise.resolve(globalThis.__USC_READY).then(() => {',
            `globalThis.GM_setValue = async () => undefined;
globalThis.GM_deleteValue = async () => undefined;
Promise.resolve(globalThis.__USC_READY).then(() => {`,
        ));
        await expect(assertShippedSettingsAuthorityRuntime(swallowedMutation, 'chrome', '1.9.3'))
            .rejects.toThrow(/rejected durable GM set resolved successfully/);

        const swallowedHydration = shippedRuntimeFixture('chrome');
        swallowedHydration['content.js'] = strToU8(new TextDecoder().decode(swallowedHydration['content.js'])
            .replace(`const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  });`, `const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  }, () => {
    valuesHydrated = true;
  });`));
        await expect(assertShippedSettingsAuthorityRuntime(swallowedHydration, 'chrome', '1.9.3'))
            .rejects.toThrow(/strict storage hydration gate is missing/);
    });

    it('rejects a packaged read cache even when durable-write markers remain', async () => {
        const entries = shippedRuntimeFixture('firefox');
        entries['gm-runtime.js'] = strToU8(new TextDecoder().decode(entries['gm-runtime.js'])
            .replace('getValue: yomuReadStoredValue,', 'getValue: GM_getValue,'));
        await expect(assertShippedSettingsAuthorityRuntime(entries, 'firefox', '1.9.3'))
            .rejects.toThrow(/authoritative read used hydration cache/);
    });

    it('rejects a packaged acknowledgement coupled to recipient completion', async () => {
        const entries = shippedRuntimeFixture('firefox');
        entries['background.js'] = strToU8(new TextDecoder().decode(entries['background.js'])
            .replace('void Promise.resolve(api.tabs.sendMessage', 'await Promise.resolve(api.tabs.sendMessage'));
        await expect(assertShippedSettingsAuthorityRuntime(entries, 'firefox', '1.9.3'))
            .rejects.toThrow(/set acknowledgement waits for a recipient/);
    });

    it('does not let an earlier set notification stand in for a missing delete notification', async () => {
        const entries = shippedRuntimeFixture('firefox');
        entries['background.js'] = strToU8(new TextDecoder().decode(entries['background.js'])
            .replace('await broadcastValueChange(payload.name, oldValue, undefined, sender);', ''));
        await expect(assertShippedSettingsAuthorityRuntime(entries, 'firefox', '1.9.3'))
            .rejects.toThrow(/delete acknowledged before discovery and dispatch|delete notifications were not dispatched/);
    });

    it('rejects acknowledgement before notification dispatch has started', async () => {
        const entries = shippedRuntimeFixture('firefox');
        entries['background.js'] = strToU8(new TextDecoder().decode(entries['background.js'])
            .replace('await broadcastValueChange(payload.name, oldValue, payload.value, sender);', 'void broadcastValueChange(payload.name, oldValue, payload.value, sender);'));
        await expect(assertShippedSettingsAuthorityRuntime(entries, 'firefox', '1.9.3'))
            .rejects.toThrow(/set acknowledged before discovery and dispatch/);
    });

    it.each(['read', 'enumeration'])('rejects a packaged %s fallback after successful hydration', async kind => {
        const entries = shippedRuntimeFixture('firefox');
        const source = new TextDecoder().decode(entries['gm-runtime.js']);
        entries['gm-runtime.js'] = strToU8(kind === 'read'
            ? source.replace('return response.value;\n    });', 'return response.value;\n    }).catch(() => values[name]);')
            : source.replace('return response.keys;\n    });', 'return response.keys;\n    }).catch(() => Object.keys(values));'));
        await expect(assertShippedSettingsAuthorityRuntime(entries, 'firefox', '1.9.3'))
            .rejects.toThrow(/failed authoritative .* fell back/);
    });

    it('accepts generated non-durable GM helpers that intentionally ignore auxiliary failures', async () => {
        const entries = shippedRuntimeFixture('chrome');
        const content = new TextDecoder().decode(entries['content.js']);
        entries['content.js'] = strToU8(content.replace(
            "  const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {",
            `  function GM_xmlhttpRequest() {
    return {
      abort() {
        gmMessage('GM_abortRequest', { id: 'generated-request' }).catch(() => {});
      }
    };
  }
  function GM_notification(details) {
    return gmMessage('GM_notification', { details }).catch(() => {});
  }
  const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {`,
        ));

        await expect(assertShippedSettingsAuthorityRuntime(entries, 'chrome', '1.9.3'))
            .resolves.toBeUndefined();
    });
});
