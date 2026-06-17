import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BACKGROUND_FILE = 'background.js';
const MANIFEST_FILE = 'manifest.json';
const SCREENSHOT_BRIDGE_MARKER = 'yomu-extension-screenshot-bridge';

const UNSAFE_EXTENSION_EVENT_PATTERNS = [
    [/\bapi\.tabs\.onRemoved\.addListener\(/g, 'api.tabs?.onRemoved?.addListener?.('],
    [/\bapi\.tabs\.onRemoved\.removeListener\(/g, 'api.tabs?.onRemoved?.removeListener?.('],
    [/\bchrome\.tabs\.onRemoved\.addListener\(/g, 'chrome.tabs?.onRemoved?.addListener?.('],
    [/\bchrome\.tabs\.onRemoved\.removeListener\(/g, 'chrome.tabs?.onRemoved?.removeListener?.('],
    [/\bbrowser\.tabs\.onRemoved\.addListener\(/g, 'browser.tabs?.onRemoved?.addListener?.('],
    [/\bbrowser\.tabs\.onRemoved\.removeListener\(/g, 'browser.tabs?.onRemoved?.removeListener?.('],
];

export function hardenExtensionBackgroundSource(source) {
    const hardened = UNSAFE_EXTENSION_EVENT_PATTERNS.reduce(
        (current, [pattern, replacement]) => current.replace(pattern, replacement),
        source,
    );
    return installExtensionScreenshotBridgeSource(hardened);
}

export function installExtensionScreenshotBridgeSource(source) {
    if (source.includes(SCREENSHOT_BRIDGE_MARKER)) return source;
    return `${source}\n\n${extensionScreenshotBridgeSource()}\n`;
}

export function hardenExtensionManifest(manifest) {
    const version = Number(manifest.manifest_version || 2);
    const permissions = uniqueArray([...(manifest.permissions ?? []), 'tabs']);
    if (version >= 3) {
        return {
            ...manifest,
            permissions,
            host_permissions: uniqueArray([...(manifest.host_permissions ?? []), '<all_urls>']),
        };
    }
    return {
        ...manifest,
        permissions: uniqueArray([...permissions, '<all_urls>']),
    };
}

export async function hardenGeneratedExtensionBackgrounds(root) {
    const files = await collectBackgroundFiles(root);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const hardened = hardenExtensionBackgroundSource(source);
        if (hardened !== source) await writeFile(file, hardened);
    }
    await hardenGeneratedExtensionManifests(root);
    return files;
}

async function hardenGeneratedExtensionManifests(root) {
    const files = await collectManifestFiles(root);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const manifest = JSON.parse(source);
        const hardened = hardenExtensionManifest(manifest);
        const output = `${JSON.stringify(hardened, null, 2)}\n`;
        if (output !== source) await writeFile(file, output);
    }
}

async function collectBackgroundFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectBackgroundFiles(file));
        } else if (entry.isFile() && entry.name === BACKGROUND_FILE) {
            files.push(file);
        }
    }
    return files;
}

async function collectManifestFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectManifestFiles(file));
        } else if (entry.isFile() && entry.name === MANIFEST_FILE) {
            files.push(file);
        }
    }
    return files;
}

function uniqueArray(values) {
    return [...new Set(values.filter(Boolean))];
}

function extensionScreenshotBridgeSource() {
    return `;(() => {
  // ${SCREENSHOT_BRIDGE_MARKER}
  const MESSAGE_TYPE = 'yomu.captureVisibleTab';
  const api = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;
  if (!api?.runtime?.onMessage || !api?.tabs?.captureVisibleTab) return;
  const listener = (message, sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE) return undefined;
    const quality = Math.max(1, Math.min(100, Math.round(Number(message.quality) || 88)));
    const format = message.format === 'png' ? 'png' : 'jpeg';
    const options = { format, quality };
    const tabWindowId = sender?.tab?.windowId;
    const send = response => {
      try { sendResponse(response); } catch (_) { /* response port closed */ }
    };
    const fail = error => send({ ok: false, error: error?.message || String(error || 'capture failed') });
    try {
      if (typeof browser !== 'undefined' && api === browser) {
        const args = tabWindowId == null ? [options] : [tabWindowId, options];
        api.tabs.captureVisibleTab(...args).then(dataUrl => send({ ok: true, dataUrl }), fail);
      } else {
        const done = dataUrl => {
          const lastError = api.runtime?.lastError;
          if (lastError) fail(lastError);
          else send({ ok: true, dataUrl });
        };
        if (tabWindowId == null) api.tabs.captureVisibleTab(options, done);
        else api.tabs.captureVisibleTab(tabWindowId, options, done);
      }
    } catch (error) {
      fail(error);
    }
    return true;
  };
  api.runtime.onMessage.addListener(listener);
})();`;
}
