import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BACKGROUND_FILE = 'background.js';
const MANIFEST_FILE = 'manifest.json';
const SCREENSHOT_BRIDGE_MARKER = 'yomu-extension-screenshot-bridge';
const GOOGLE_DRIVE_SYNC_BRIDGE_MARKER = 'yomu-google-drive-settings-sync-bridge';
const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

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
    return installGoogleDriveSettingsSyncBridgeSource(installExtensionScreenshotBridgeSource(hardened));
}

function installExtensionScreenshotBridgeSource(source) {
    if (source.includes(SCREENSHOT_BRIDGE_MARKER)) return source;
    return `${source}\n\n${extensionScreenshotBridgeSource()}\n`;
}

function installGoogleDriveSettingsSyncBridgeSource(source) {
    if (source.includes(GOOGLE_DRIVE_SYNC_BRIDGE_MARKER)) return source;
    return `${source}\n\n${googleDriveSettingsSyncBridgeSource()}\n`;
}

export function hardenExtensionManifest(manifest, options = {}) {
    const version = Number(manifest.manifest_version || 2);
    const googleOAuthClientId = options.googleOAuthClientId
        ?? process.env.YOMU_GOOGLE_OAUTH_CLIENT_ID
        ?? process.env.GOOGLE_OAUTH_CLIENT_ID
        ?? '';
    const permissions = uniqueArray([...(manifest.permissions ?? []), 'tabs', ...(googleOAuthClientId ? ['identity'] : [])]);
    const oauth2 = googleOAuthClientId
        ? {
            ...(manifest.oauth2 ?? {}),
            client_id: googleOAuthClientId,
            scopes: uniqueArray([...(manifest.oauth2?.scopes ?? []), GOOGLE_DRIVE_APPDATA_SCOPE]),
        }
        : manifest.oauth2;
    const withPermissions = {
        ...manifest,
        permissions,
        ...(oauth2 ? { oauth2 } : {}),
    };
    if (version >= 3) {
        return {
            ...withPermissions,
            host_permissions: uniqueArray([...(manifest.host_permissions ?? []), '<all_urls>']),
        };
    }
    return {
        ...withPermissions,
        permissions: uniqueArray([...withPermissions.permissions, '<all_urls>']),
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

function googleDriveSettingsSyncBridgeSource() {
    return `;(() => {
  // ${GOOGLE_DRIVE_SYNC_BRIDGE_MARKER}
  const MESSAGE_TYPE = 'yomu.googleDriveSettingsSync';
  const DRIVE_SCOPE = '${GOOGLE_DRIVE_APPDATA_SCOPE}';
  const SETTINGS_FILE_NAME = 'yomu-settings.json';
  const SETTINGS_MIME_TYPE = 'application/json';
  const api = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;
  if (!api?.runtime?.onMessage) return;
  const listener = (message, sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE) return undefined;
    handleGoogleDriveSettingsSyncMessage(message)
      .then(response => safeSend(sendResponse, response))
      .catch(error => safeSend(sendResponse, { ok: false, error: errorMessage(error) }));
    return true;
  };
  api.runtime.onMessage.addListener(listener);

  async function handleGoogleDriveSettingsSyncMessage(message) {
    ensureGoogleDriveOauthConfigured();
    if (message.command === 'upload') return await uploadSettingsSnapshot(message.snapshot);
    if (message.command === 'download') return await downloadSettingsSnapshot();
    throw new Error('Unknown Google Drive settings sync command.');
  }

  async function uploadSettingsSnapshot(value) {
    const snapshot = validSettingsSnapshot(value);
    const serialized = JSON.stringify(snapshot);
    const existing = await findSettingsFile();
    const file = existing
      ? await updateSettingsFile(existing.id, serialized)
      : await createSettingsFile(serialized);
    return {
      ok: true,
      metadata: {
        syncedAt: snapshot.syncedAt,
        fileId: file.id,
        modifiedTime: file.modifiedTime,
      },
    };
  }

  async function downloadSettingsSnapshot() {
    const file = await findSettingsFile();
    if (!file?.id) return { ok: true, snapshot: null };
    const response = await driveFetch('/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media');
    return { ok: true, snapshot: validSettingsSnapshot(await response.json()) };
  }

  async function findSettingsFile() {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      pageSize: '1',
      fields: 'files(id,name,modifiedTime,size)',
      q: "name = '" + SETTINGS_FILE_NAME.replace(/'/g, "\\\\'") + "'",
    });
    const response = await driveFetch('/drive/v3/files?' + params.toString());
    const body = await response.json();
    return Array.isArray(body.files) ? body.files[0] ?? null : null;
  }

  async function createSettingsFile(serialized) {
    const boundary = 'yomu_drive_sync_' + Math.random().toString(36).slice(2);
    const metadata = {
      name: SETTINGS_FILE_NAME,
      mimeType: SETTINGS_MIME_TYPE,
      parents: ['appDataFolder'],
    };
    const body = [
      '--' + boundary,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      '--' + boundary,
      'Content-Type: ' + SETTINGS_MIME_TYPE,
      '',
      serialized,
      '--' + boundary + '--',
      '',
    ].join('\\r\\n');
    const response = await driveFetch('/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    });
    return await response.json();
  }

  async function updateSettingsFile(fileId, serialized) {
    const response = await driveFetch('/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&fields=id,name,modifiedTime,size', {
      method: 'PATCH',
      headers: { 'Content-Type': SETTINGS_MIME_TYPE },
      body: serialized,
    });
    return await response.json();
  }

  async function driveFetch(path, options = {}, retry = true) {
    const token = await googleAuthToken();
    const response = await fetch('https://www.googleapis.com' + path, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: 'Bearer ' + token,
      },
    });
    if (response.status === 401 && retry) {
      await removeCachedAuthToken(token);
      return await driveFetch(path, options, false);
    }
    if (!response.ok) throw new Error(await driveErrorMessage(response));
    return response;
  }

  function googleAuthToken() {
    if (typeof api.identity?.getAuthToken !== 'function') {
      throw new Error('Google Drive OAuth is unavailable in this browser.');
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        const lastError = api.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message || 'Google Drive authorization failed.'));
          return;
        }
        const token = authTokenFromResult(result);
        if (token) resolve(token);
        else reject(new Error('Google Drive authorization did not return an access token.'));
      };
      const fail = error => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      try {
        const details = { interactive: true, scopes: [DRIVE_SCOPE] };
        const maybePromise = api.identity.getAuthToken(details, finish);
        if (isPromiseLike(maybePromise)) maybePromise.then(finish, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  async function removeCachedAuthToken(token) {
    if (!token || typeof api.identity?.removeCachedAuthToken !== 'function') return;
    try {
      const maybePromise = api.identity.removeCachedAuthToken({ token });
      if (isPromiseLike(maybePromise)) await maybePromise;
    } catch (_) {
      // A stale token removal failure should not mask the original retry path.
    }
  }

  function ensureGoogleDriveOauthConfigured() {
    const manifest = typeof api.runtime?.getManifest === 'function' ? api.runtime.getManifest() : {};
    const scopes = Array.isArray(manifest.oauth2?.scopes) ? manifest.oauth2.scopes : [];
    if (!manifest.oauth2?.client_id || !scopes.includes(DRIVE_SCOPE)) {
      throw new Error('Google Drive OAuth is not configured for this extension build.');
    }
  }

  function validSettingsSnapshot(value) {
    if (
      value
      && typeof value === 'object'
      && value.formatName === 'yomu-google-drive-settings-sync'
      && value.formatVersion === 1
      && typeof value.syncedAt === 'string'
      && value.settings
      && typeof value.settings === 'object'
    ) {
      return value;
    }
    throw new Error('Google Drive settings backup is not a Yomu settings backup.');
  }

  function authTokenFromResult(result) {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && typeof result.token === 'string') return result.token;
    return '';
  }

  async function driveErrorMessage(response) {
    const fallback = 'Google Drive request failed with HTTP ' + response.status + '.';
    try {
      const body = await response.json();
      return body?.error?.message || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeSend(sendResponse, response) {
    try { sendResponse(response); } catch (_) { /* response port closed */ }
  }

  function errorMessage(error) {
    return error?.message || String(error || 'Google Drive settings sync failed.');
  }

  function isPromiseLike(value) {
    return Boolean(value && typeof value.then === 'function');
  }
})();`;
}
