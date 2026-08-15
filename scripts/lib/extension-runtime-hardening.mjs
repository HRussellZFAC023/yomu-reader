import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import {
    extensionStoragePrefixFromBackgroundSource,
    hardenCompilerRuntimeMessageChannel,
    installExtensionDictionaryBackgroundSource,
} from './extension-dictionary-background.mjs';

const BACKGROUND_FILE = 'background.js';
const CONTENT_FILE = 'content.js';
const CONTENT_RUNTIME_FILE = 'gm-runtime.js';
export const PACKAGED_STUDY_STORAGE_RUNTIME_FILE = 'newtab/study-storage-runtime.js';
const POPUP_FILE = 'popup.js';
const MANIFEST_FILE = 'manifest.json';
const READER_CSS_FILE = 'yomu.css';
const RUNTIME_CATALOG_FILE = 'runtime-catalog.json';
const THIRD_PARTY_NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';
const PROJECT_ARCHIVE_FILE = 'yomureader.com-extension-project.zip';
const SCREENSHOT_BRIDGE_MARKER = 'yomu-extension-screenshot-bridge';
const PACKAGED_STUDY_SETTINGS_BRIDGE_MARKER = 'yomu-packaged-study-settings-bridge';
const PACKAGED_STUDY_SETTINGS_LAUNCHER_PROTOCOL = 'yomu-packaged-study-settings-launcher:v1';
const GOOGLE_DRIVE_SYNC_BRIDGE_MARKER = 'yomu-google-drive-settings-sync-bridge';
const PACKAGED_READER_CSS_MARKER = 'yomu-extension-packaged-reader-css';
const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const EXTENSION_STUDY_STORAGE_MARKER = 'yomu-extension-study-storage-runtime';
const COMPILER_DURABLE_STORAGE_MARKER = 'yomu-extension-durable-storage-runtime:v2';
const LEGACY_COMPILER_DURABLE_STORAGE_MARKER = 'yomu-extension-durable-storage-runtime:v1';
const COMPILER_CATALOG_VALUES_READY_LEGACY = `const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  }, () => {
    valuesHydrated = true;
  });`;
const COMPILER_CATALOG_VALUES_READY_STRICT = `const yomuValuesReady = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  });`;
const RELEASE_ARCHIVE_TARGETS = new Set(['chrome', 'firefox']);

// addons.mozilla.org refuses to parse any file over 5 MB and reports
// FILE_TOO_LARGE as a hard lint error, so a Firefox content.js above this never
// reaches review. Chrome has no equivalent ceiling.
const AMO_FILE_SIZE_LIMIT = 5 * 1024 * 1024;
// The compiler nests the whole userscript in `then(() => { try { ... } })` and
// indents every line of it by four spaces (its indent() is a plain per-line
// prefix). Across ~107k lines that is ~429 KB of leading whitespace — on its own
// enough to push content.js past the AMO ceiling. These anchors bracket exactly
// the region it indented, so removing four spaces per line is its exact inverse.
const CONTENT_BODY_PREFIX = 'Promise.resolve(globalThis.__USC_READY).then(() => {\n  try {\n';
const CONTENT_BODY_SUFFIX = "\n  } catch (error) {\n    console.error('Userscript failed:', error);\n  }\n});";

const UNSAFE_EXTENSION_EVENT_PATTERNS = [
    [/\bapi\.tabs\.onRemoved\.addListener\(/g, 'api.tabs?.onRemoved?.addListener?.('],
    [/\bapi\.tabs\.onRemoved\.removeListener\(/g, 'api.tabs?.onRemoved?.removeListener?.('],
    [/\bchrome\.tabs\.onRemoved\.addListener\(/g, 'chrome.tabs?.onRemoved?.addListener?.('],
    [/\bchrome\.tabs\.onRemoved\.removeListener\(/g, 'chrome.tabs?.onRemoved?.removeListener?.('],
    [/\bbrowser\.tabs\.onRemoved\.addListener\(/g, 'browser.tabs?.onRemoved?.addListener?.('],
    [/\bbrowser\.tabs\.onRemoved\.removeListener\(/g, 'browser.tabs?.onRemoved?.removeListener?.('],
];

export function deterministicExtensionTimestamp(sourceDateEpoch, gitCommitEpoch) {
    const explicitEpoch = String(sourceDateEpoch ?? '').trim();
    const fallbackEpoch = String(gitCommitEpoch ?? '').trim();
    const epoch = explicitEpoch || fallbackEpoch;
    if (!/^\d+$/.test(epoch)) {
        throw new Error('Extension build timestamp requires SOURCE_DATE_EPOCH or a Git commit epoch in whole seconds.');
    }
    const milliseconds = Number(epoch) * 1000;
    if (!Number.isSafeInteger(milliseconds)) {
        throw new Error('Extension build timestamp is outside JavaScript safe integer range.');
    }
    return new Date(milliseconds).toISOString();
}

export function hardenExtensionBackgroundSource(source, options = {}) {
    const guarded = UNSAFE_EXTENSION_EVENT_PATTERNS.reduce(
        (current, [pattern, replacement]) => current.replace(pattern, replacement),
        source,
    );
    const withCompilerChannelGuard = hardenCompilerRuntimeMessageChannel(guarded);
    const withScreenshotBridge = installExtensionScreenshotBridgeSource(withCompilerChannelGuard);
    const withPackagedStudySettings = options.target === 'firefox'
        ? installPackagedStudySettingsBridgeSource(withScreenshotBridge)
        : withScreenshotBridge;
    const withSettingsSync = options.target === 'chrome' && options.googleOAuthClientId
        ? installGoogleDriveSettingsSyncBridgeSource(withPackagedStudySettings)
        : withPackagedStudySettings;
    return installExtensionDictionaryBackgroundSource(withSettingsSync, options.dictionaryBackgroundSource);
}

export function hardenExtensionContentSource(source) {
    if (source.includes(PACKAGED_READER_CSS_MARKER)) {
        return installRuntimeCatalogPreload(hardenCompilerDurableStorage(source));
    }
    let hardened = source.replace(
        "else if (key === 'innerHTML') element.innerHTML = value;",
        "else if (key === 'innerHTML') element.textContent = String(value ?? '');",
    ).replace(
        /(function GM_getResourceURL\(name\) \{\s*)/,
        `$1\n    // ${PACKAGED_READER_CSS_MARKER}\n    if (name === "yomuCss") return api?.runtime?.getURL?.("${READER_CSS_FILE}") || "${READER_CSS_FILE}";\n`,
    );
    if (hardened === source) {
        throw new Error('Generated content.js no longer exposes the expected GM_getResourceURL resource bridge.');
    }

    const localReaderCssExpression = `(globalThis.browser || globalThis.chrome)?.runtime?.getURL?.("${READER_CSS_FILE}") || "${READER_CSS_FILE}"`;
    const legacyFallbackDeclaration =
        /const READER_CSS_RESOURCE_URL = `https:\/\/raw\.githubusercontent\.com\/HRussellZFAC023\/yomu-reader\/main\/dist\/yomu\.css\?v=\$\{[^`]+\}`;/;
    const hostedFallbackDeclaration =
        /const READER_CSS_HOSTED_FALLBACK_URL = `https:\/\/yomureader\.com\/yomu\.css\?v=\$\{[^`]+\}`;/;
    const rawFallbackDeclaration =
        /const READER_CSS_RAW_FALLBACK_URL = `https:\/\/raw\.githubusercontent\.com\/HRussellZFAC023\/yomu-reader\/main\/dist\/yomu\.css\?v=\$\{[^`]+\}`;/;
    const hasHostedFallback = hostedFallbackDeclaration.test(hardened);
    const hasRawFallback = rawFallbackDeclaration.test(hardened);
    let packagedFallbackConstant;

    if (hasHostedFallback || hasRawFallback) {
        if (!hasHostedFallback || !hasRawFallback) {
            throw new Error('Generated content.js contains only part of the expected reader CSS fallback chain.');
        }
        hardened = hardened
            .replace(
                hostedFallbackDeclaration,
                `const READER_CSS_HOSTED_FALLBACK_URL = ${localReaderCssExpression};`,
            )
            .replace(
                rawFallbackDeclaration,
                `const READER_CSS_RAW_FALLBACK_URL = ${localReaderCssExpression};`,
            );
        packagedFallbackConstant = 'READER_CSS_RAW_FALLBACK_URL';
    } else if (legacyFallbackDeclaration.test(hardened)) {
        hardened = hardened.replace(
            legacyFallbackDeclaration,
            `const READER_CSS_RESOURCE_URL = ${localReaderCssExpression};`,
        );
        packagedFallbackConstant = 'READER_CSS_RESOURCE_URL';
    } else {
        throw new Error('Generated content.js no longer contains the expected reader CSS fallback URL declaration.');
    }

    hardened = hardened.replace(
        /https:\/\/yomureader\.com\/yomu(?:\.[a-f0-9]+)?\.css(?:\?v=[^#"'`\s]+)?(?:#sha256=[^"'`\s]+)?/gi,
        READER_CSS_FILE,
    );
    const fallbackFunctionDeclaration =
        /function readerCssFallbackUrls\(href = safeLocationHref\(\)\) \{[\s\S]*?\n\s*\}/;
    if (!fallbackFunctionDeclaration.test(hardened)) {
        throw new Error('Generated content.js no longer contains the expected reader CSS fallback function.');
    }
    hardened = hardened.replace(
        fallbackFunctionDeclaration,
        `function readerCssFallbackUrls(href = safeLocationHref()) {\n      void href;\n      return [${packagedFallbackConstant}];\n    }`,
    );
    return installRuntimeCatalogPreload(hardenCompilerDurableStorage(hardened));
}

export function hardenCompilerDurableStorage(source) {
    if (source.includes(COMPILER_DURABLE_STORAGE_MARKER)) return source;
    if (source.includes(LEGACY_COMPILER_DURABLE_STORAGE_MARKER)) {
        throw new Error('Generated content.js contains the retired optimistic durable-storage runtime. Rebuild it from compiler output.');
    }
    if (!source.includes('function GM_setValue(name, value)')) return source;
    let hardened = source;
    hardened = replaceGeneratedContractOnce(hardened, `  function GM_getValue(name, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    if (valuesHydrated) return defaultValue;
    return gmMessage('GM_getValue', { name, defaultValue }).then(response => {
      values[name] = response?.value;
      return response?.value;
    }, () => defaultValue);
  }`, `  function GM_getValue(name, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    if (valuesHydrated) return defaultValue;
    return gmMessage('GM_getValue', { name, defaultValue }).then(response => {
      values[name] = response?.value;
      return response?.value;
    });
  }`, 'GM_getValue failure handling');
    hardened = replaceGeneratedContractOnce(hardened, `  let listenerSeq = 0;`, `  let listenerSeq = 0;
  const yomuDurableMutationQueues = new Map();

  function yomuQueueDurableMutation(name, mutation) {
    const previous = yomuDurableMutationQueues.get(name) || Promise.resolve();
    const current = previous.then(mutation, mutation);
    yomuDurableMutationQueues.set(name, current);
    return current.finally(() => {
      if (yomuDurableMutationQueues.get(name) === current) yomuDurableMutationQueues.delete(name);
    });
  }`, 'GM durable mutation queue');
    hardened = replaceGeneratedContractOnce(hardened, `  function GM_setValue(name, value) {
    const oldValue = values[name];
    values[name] = value;
    notifyValueListeners(name, oldValue, value, false);
    return gmMessage('GM_setValue', { name, value }).catch(() => {});
  }`, `  function GM_setValue(name, value) {
    // ${COMPILER_DURABLE_STORAGE_MARKER}
    return yomuQueueDurableMutation(name, () => gmMessage('GM_setValue', { name, value }).then(() => {
      const oldValue = values[name];
      values[name] = value;
      notifyValueListeners(name, oldValue, value, false);
    }));
  }`, 'GM_setValue durable failure handling');
    hardened = replaceGeneratedContractOnce(hardened, `  function GM_deleteValue(name) {
    const oldValue = values[name];
    delete values[name];
    notifyValueListeners(name, oldValue, undefined, false);
    return gmMessage('GM_deleteValue', { name }).catch(() => {});
  }`, `  function GM_deleteValue(name) {
    return yomuQueueDurableMutation(name, () => gmMessage('GM_deleteValue', { name }).then(() => {
      const oldValue = values[name];
      delete values[name];
      notifyValueListeners(name, oldValue, undefined, false);
    }));
  }`, 'GM_deleteValue durable failure handling');
    return replaceGeneratedContractOnce(
        hardened,
        'Promise.resolve(globalThis.__USC_READY).catch(() => {}).then(() => {',
        'Promise.resolve(globalThis.__USC_READY).then(() => {',
        'userscript readiness failure handling',
    );
}

function replaceGeneratedContractOnce(source, expected, replacement, label) {
    const occurrences = source.split(expected).length - 1;
    if (occurrences !== 1) {
        throw new Error(`Generated content.js must contain exactly one ${label} contract; found ${occurrences}.`);
    }
    return source.replace(expected, replacement);
}

function installRuntimeCatalogPreload(source) {
    if (source.includes('yomu-extension-runtime-catalog')) {
        return hardenInstalledRuntimeCatalogPreload(source);
    }
    const ready = /globalThis\.__USC_READY = gmMessage\('GM_getAllValues', \{\}\)\.then\(response => \{\s*Object\.assign\(values, response\?\.values \|\| \{\}\);\s*valuesHydrated = true;\s*\}, \(\) => \{\s*valuesHydrated = true;\s*\}\);/;
    if (!ready.test(source)) return source;
    return source.replace(ready, `${COMPILER_CATALOG_VALUES_READY_STRICT}
  // yomu-extension-runtime-catalog
  const yomuCatalogReady = fetch(api.runtime.getURL('${RUNTIME_CATALOG_FILE}'))
    .then(response => {
      if (!response.ok) throw new Error('Packaged dictionary catalog request failed: ' + response.status);
      return response.json();
    })
    .then(catalog => {
      globalThis.__YOMU_RUNTIME_DICTIONARY_CATALOG__ = catalog;
    });
  globalThis.__USC_READY = Promise.all([yomuValuesReady, yomuCatalogReady]);`);
}

function hardenInstalledRuntimeCatalogPreload(source) {
    const strictOccurrences = source.split(COMPILER_CATALOG_VALUES_READY_STRICT).length - 1;
    const legacyOccurrences = source.split(COMPILER_CATALOG_VALUES_READY_LEGACY).length - 1;
    if (strictOccurrences === 1 && legacyOccurrences === 0) return source;
    if (strictOccurrences !== 0) {
        throw new Error(
            `Generated content.js contains an ambiguous catalog storage hydration contract; found ${strictOccurrences} strict and ${legacyOccurrences} legacy.`,
        );
    }
    return replaceGeneratedContractOnce(
        source,
        COMPILER_CATALOG_VALUES_READY_LEGACY,
        COMPILER_CATALOG_VALUES_READY_STRICT,
        'catalog storage hydration failure handling',
    );
}

/**
 * Storage-only adapter for the packaged Study page. The compiler injects its
 * GM facade only into content scripts, so Study previously fell back to an
 * unprefixed browser.storage.local namespace. Keep this adapter deliberately
 * small: writes await the real extension API and reject on failure, while
 * storage.onChanged provides the same logical-key notifications to an already
 * open Study page without an in-memory hydration cache.
 */
export function extensionStudyStorageRuntimeSource(storagePrefix) {
    if (typeof storagePrefix !== 'string' || !storagePrefix) {
        throw new Error('Packaged Study storage requires the compiler storage prefix.');
    }
    return `// ${EXTENSION_STUDY_STORAGE_MARKER}\n(() => {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  if (!api?.storage?.onChanged?.addListener || !api?.runtime?.sendMessage) {
    throw new Error('Packaged Study storage API is unavailable.');
  }
  const prefix = ${JSON.stringify(storagePrefix)};
  const channel = 'userscript-compiler';
  const listeners = new Map();
  let nextListenerId = 1;
  const message = (type, payload = {}) => api.runtime.sendMessage({ channel, type, payload })
    .then(response => {
      if (!response || typeof response !== 'object') {
        throw new Error('Packaged Study storage background did not respond.');
      }
      if (response?.error) throw new Error(response.error);
      return response;
    });

  globalThis.__YOMU_EXTENSION_STORAGE_PREFIX__ = prefix;
  globalThis.__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__ = true;
  globalThis.GM_getValue = async (key, fallback) => {
    const response = await message('GM_getValue', { name: String(key), defaultValue: fallback });
    return response?.value;
  };
  globalThis.GM_setValue = async (key, value) => {
    await message('GM_setValue', { name: String(key), value });
  };
  globalThis.GM_deleteValue = async key => {
    await message('GM_deleteValue', { name: String(key) });
  };
  globalThis.GM_listValues = async () => {
    const response = await message('GM_listValues');
    return response?.keys || [];
  };
  globalThis.GM_addValueChangeListener = (key, listener) => {
    const id = nextListenerId++;
    listeners.set(id, { key: String(key), listener });
    return id;
  };
  globalThis.GM_removeValueChangeListener = id => {
    listeners.delete(id);
  };
  api?.storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const [storedKey, change] of Object.entries(changes || {})) {
      if (!storedKey.startsWith(prefix)) continue;
      const key = storedKey.slice(prefix.length);
      for (const { key: watchedKey, listener } of listeners.values()) {
        if (watchedKey === key) listener(key, change?.oldValue, change?.newValue, true);
      }
    }
  });
})();\n`;
}

export function hardenExtensionPopupSource(source, options = {}) {
    if (options.target !== 'safari') return source;
    const injectablePattern = 'return /^https?:|^file:/i.test(url);';
    if (!source.includes(injectablePattern)) {
        if (source.includes('return /^https?:/i.test(url);')) return source;
        throw new Error('Generated Safari popup.js no longer contains the expected injectable-tab URL guard.');
    }
    return source.replace(injectablePattern, 'return /^https?:/i.test(url);');
}

function installExtensionScreenshotBridgeSource(source) {
    if (source.includes(SCREENSHOT_BRIDGE_MARKER)) return source;
    return `${source}\n\n${extensionScreenshotBridgeSource()}\n`;
}

function installPackagedStudySettingsBridgeSource(source) {
    if (source.includes(PACKAGED_STUDY_SETTINGS_BRIDGE_MARKER)) return source;
    return `${source}\n\n${packagedStudySettingsBridgeSource()}\n`;
}

function installGoogleDriveSettingsSyncBridgeSource(source) {
    if (source.includes(GOOGLE_DRIVE_SYNC_BRIDGE_MARKER)) return source;
    return `${source}\n\n${googleDriveSettingsSyncBridgeSource()}\n`;
}

export function hardenExtensionManifest(manifest, options = {}) {
    // A chrome_url_overrides.newtab declaration takes over every new tab as
    // soon as the extension is enabled. Browsers expose no API that can make
    // that takeover genuinely opt-in at runtime, so the main Yomu extension
    // never ships it. Study remains packaged and opens as a normal page from
    // the popup without changing the browser's own new-tab experience.
    const {
        browser_url_overrides: _browserUiOverride,
        chrome_settings_overrides: _browserSettingOverride,
        chrome_url_overrides: _newTabOverride,
        ...manifestWithoutNewTabOverride
    } = manifest;
    const version = Number(manifest.manifest_version || 2);
    const target = options.target ?? '';
    const googleOAuthClientId = options.googleOAuthClientId
        ?? process.env.YOMU_GOOGLE_OAUTH_CLIENT_ID
        ?? process.env.GOOGLE_OAUTH_CLIENT_ID
        ?? '';
    const chromeOAuthConfigured = target === 'chrome' && Boolean(googleOAuthClientId);
    const permissions = uniqueArray([
        ...(manifest.permissions ?? []).filter(permission => permission !== 'tabs'),
        'storage',
        ...(chromeOAuthConfigured ? ['identity'] : []),
    ]);
    const oauth2 = chromeOAuthConfigured
        ? {
            ...(manifest.oauth2 ?? {}),
            client_id: googleOAuthClientId,
            scopes: uniqueArray([...(manifest.oauth2?.scopes ?? []), GOOGLE_DRIVE_APPDATA_SCOPE]),
        }
        : manifest.oauth2;
    const browserSpecificSettings = target === 'firefox'
        ? firefoxBrowserSpecificSettings(manifest.browser_specific_settings)
        : manifest.browser_specific_settings;
    const contentScripts = target === 'safari'
        ? safariCompatibleContentScripts(manifest.content_scripts)
        : target === 'firefox'
            ? firefoxSplitContentScripts(manifest.content_scripts)
            : manifest.content_scripts;
    const withPermissions = {
        ...manifestWithoutNewTabOverride,
        permissions,
        ...(contentScripts ? { content_scripts: contentScripts } : {}),
        ...(oauth2 ? { oauth2 } : {}),
        ...(browserSpecificSettings ? { browser_specific_settings: browserSpecificSettings } : {}),
        ...(options.packagedReaderCss ? {
            web_accessible_resources: withPackagedRuntimeResources(manifest.web_accessible_resources, version),
        } : {}),
    };
    if (version >= 3) {
        return {
            ...withPermissions,
            host_permissions: uniqueArray([
                ...(manifest.host_permissions ?? []).filter(permission => permission !== 'file:///*'),
                '<all_urls>',
            ]),
        };
    }
    return {
        ...withPermissions,
        permissions: uniqueArray([
            ...withPermissions.permissions.filter(permission => permission !== 'file:///*'),
            '<all_urls>',
        ]),
    };
}

function safariCompatibleContentScripts(contentScripts) {
    if (!Array.isArray(contentScripts)) return contentScripts;
    return contentScripts.map(contentScript => ({
        ...contentScript,
        ...(Array.isArray(contentScript.matches)
            ? { matches: contentScript.matches.filter(match => !/^file:/i.test(String(match))) }
            : {}),
    }));
}

export function reconcilePackageValidationAudit(audit, options = {}) {
    const finalSafariManifest = options.safariManifest ?? {};
    const safariHasBrowserOverride = Boolean(
        finalSafariManifest.chrome_url_overrides
        || finalSafariManifest.browser_url_overrides
        || finalSafariManifest.chrome_settings_overrides,
    );
    const targets = (audit.targets ?? []).map(target => {
        if (target.target !== 'safari' || safariHasBrowserOverride) return target;
        const issues = (target.issues ?? []).filter(issue => issue.code !== 'safari.newtab.review');
        return {
            ...target,
            status: issues.some(issue => issue.severity === 'error') ? 'error' : 'ok',
            summary: summarizeValidationIssues(issues),
            issues,
        };
    });
    return {
        ...audit,
        summary: targets.reduce((summary, target) => ({
            errors: summary.errors + Number(target.summary?.errors ?? 0),
            warnings: summary.warnings + Number(target.summary?.warnings ?? 0),
            info: summary.info + Number(target.summary?.info ?? 0),
        }), { errors: 0, warnings: 0, info: 0 }),
        targets,
    };
}

function summarizeValidationIssues(issues) {
    return issues.reduce((summary, issue) => {
        const key = issue.severity === 'error' ? 'errors' : issue.severity === 'warning' ? 'warnings' : 'info';
        summary[key] += 1;
        return summary;
    }, { errors: 0, warnings: 0, info: 0 });
}

export function hardenExtensionSubmissionGuide(source, evidence = {}) {
    const hardened = String(source)
        .replace(
            'Safari new-tab behavior must be tested through Apple Safari Web Extension packaging because platform support differs.',
            'The bundled Study page must be tested through Apple Safari Web Extension packaging; Yomu does not replace Safari new tabs.',
        )
        .replace(
            'an extension popup menu, and a packaged new-tab page.',
            'an extension popup menu, and a packaged Study page that opens only when the user chooses it.',
        )
        .replace(
            'Keep all new-tab content packaged in the extension. Do not redirect the new tab to a remote page.',
            'Keep all Study content packaged in the extension. Yomu does not declare a new-tab override or redirect new tabs.',
        )
        .replace(
            '**Remote new tab:** keep new-tab files inside the extension package.',
            '**Study page:** keep Study files inside the extension package; do not add a browser new-tab override.',
        );
    let guide = hardenSafariSubmissionGuide(hardened, evidence);
    if (evidence.firefoxHasUnsafeHtmlAssignment === false) {
        guide = guide.replace(/^\s*- \[warning\] amo\.innerHTML: .*\n?/gm, '');
    }
    if (evidence.safariHasBrowserOverride === false) {
        guide = guide.replace(/^\s*- \[info\] safari\.newtab\.review.*\n?/gm, '');
    }
    return guide;
}

function hardenSafariSubmissionGuide(source, evidence) {
    if (evidence.safariHasFileUrlMatch !== false) return source;
    const sectionPattern = /(## Safari App Store \/ Safari Web Extension Notes[\s\S]*?)(?=\n## |$)/;
    return source.replace(sectionPattern, section => section
        .replace(/^\s*- \[info\] permissions\.file-urls: .*\n?/gm, ''));
}

function firefoxBrowserSpecificSettings(settings = {}) {
    return {
        ...settings,
        gecko: {
            ...(settings.gecko ?? {}),
            id: 'yomu@yomureader.com',
            strict_min_version: '140.0',
            data_collection_permissions: {
                required: ['websiteContent'],
                optional: ['authenticationInfo'],
            },
        },
        gecko_android: {
            ...(settings.gecko_android ?? {}),
            strict_min_version: '142.0',
        },
    };
}

export async function hardenGeneratedExtensionBackgrounds(root, options = {}) {
    const packageAssets = packagedAssets(options);
    const files = await collectBackgroundFiles(root);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const target = extensionTargetFromPath(file, root);
        const googleOAuthClientId = process.env.YOMU_GOOGLE_OAUTH_CLIENT_ID
            ?? process.env.GOOGLE_OAUTH_CLIENT_ID
            ?? '';
        const hardened = hardenExtensionBackgroundSource(source, {
            target,
            googleOAuthClientId,
            dictionaryBackgroundSource: options.dictionaryBackgroundSource,
        });
        if (hardened !== source) await writeFile(file, hardened);
    }
    await hardenGeneratedExtensionContentScripts(root);
    await hardenGeneratedExtensionPopups(root);
    await hardenGeneratedExtensionManifests(root, { packagedReaderCss: packageAssets.size > 0 });
    await reconcileGeneratedPackageValidationAudit(root);
    await stageGeneratedExtensionAssets(root, packageAssets);
    await hardenGeneratedReleaseArchives(
        root,
        packageAssets,
        options.archiveTimestamp,
        options.dictionaryBackgroundSource,
    );
    return files;
}

export async function refreshGeneratedExtensionProjectArchive(root, archiveTimestamp) {
    const entries = {};
    for (const file of ['README.md', 'package.json']) {
        entries[file] = new Uint8Array(await readFile(path.join(root, file)));
    }
    for (const directory of ['audit', 'packages', 'review', 'tools']) {
        for (const file of await collectRelativeFiles(path.join(root, directory))) {
            const name = `${directory}/${file.split(path.sep).join('/')}`;
            entries[name] = new Uint8Array(await readFile(path.join(root, directory, file)));
        }
    }
    await writeFile(
        path.join(root, PROJECT_ARCHIVE_FILE),
        zipSync(zipEntriesWithTimestamp(entries, archiveTimestamp), { level: 9 }),
    );
}

export async function assertExtensionReleasePackageParity(root) {
    await assertArchivePackageParity(root, 'chrome', 'yomureader.com-chrome.zip', [
        'manifest.json',
        'background.js',
        'content.js',
        PACKAGED_STUDY_STORAGE_RUNTIME_FILE,
        'newtab/index.html',
    ]);
    await assertArchivePackageParity(root, 'firefox', 'yomureader.com-firefox.xpi', [
        'manifest.json',
        'background.js',
        'gm-runtime.js',
        PACKAGED_STUDY_STORAGE_RUNTIME_FILE,
        'newtab/index.html',
        'content.js',
    ]);
    await assertDirectoryPackageParity(root, 'safari', 'yomureader.com-safari-web-extension', [
        'manifest.json',
        'background.js',
        'content.js',
        PACKAGED_STUDY_STORAGE_RUNTIME_FILE,
        'newtab/index.html',
    ]);
}

/** Bind release acceptance to the exact launcher/storage bytes that execute. */
export async function assertShippedSettingsAuthorityRuntime(entries, target, expectedVersion) {
    assertShippedManifestVersion(entries, target, expectedVersion);
    const content = extensionEntryText(entries, CONTENT_FILE, target);
    assertShippedContentLauncher(content, target);
    assertShippedUserscriptReadiness(content, target);
    const gmRuntime = settingsAuthorityGmRuntime(entries, target, content);
    assertShippedDurableRuntime(gmRuntime, target);
    await assertRejectingShippedDurableMutations(gmRuntime, target);
    assertShippedStudyStorageAdapter(entries, target);
    if (target.startsWith('firefox')) assertShippedFirefoxSettingsBridge(entries, target);
    assertShippedStudyVersion(entries, target, expectedVersion);
}

function assertShippedManifestVersion(entries, target, expectedVersion) {
    const manifest = JSON.parse(extensionEntryText(entries, 'manifest.json', target));
    if (manifest.version !== expectedVersion) {
        throw new Error(`${target} manifest version ${JSON.stringify(manifest.version)} does not match ${expectedVersion}.`);
    }
}

function assertShippedContentLauncher(content, target) {
    requireRuntimeContract(content, 'yomu.openPackagedStudySettings', `${target} content launcher message`);
    requireRuntimeContract(content, PACKAGED_STUDY_SETTINGS_LAUNCHER_PROTOCOL, `${target} content launcher protocol`);
}

function settingsAuthorityGmRuntime(entries, target, content) {
    return target.startsWith('firefox')
        ? extensionEntryText(entries, CONTENT_RUNTIME_FILE, target)
        : content;
}

function assertShippedDurableRuntime(gmRuntime, target) {
    requireRuntimeContract(gmRuntime, COMPILER_DURABLE_STORAGE_MARKER, `${target} durable GM storage marker`);
    rejectRuntimeContract(
        gmRuntime,
        LEGACY_COMPILER_DURABLE_STORAGE_MARKER,
        `${target} retired optimistic durable GM storage marker`,
    );
    requireRuntimeContract(
        gmRuntime,
        'const yomuDurableMutationQueues = new Map();',
        `${target} per-key durable GM mutation queue`,
    );
    requireRuntimeContract(
        gmRuntime,
        'const current = previous.then(mutation, mutation);',
        `${target} rejection-tolerant durable GM mutation sequence`,
    );
    requireRuntimeContract(
        gmRuntime,
        "return yomuQueueDurableMutation(name, () => gmMessage('GM_setValue', { name, value }).then(() => {",
        `${target} success-gated GM set publication`,
    );
    requireRuntimeContract(
        gmRuntime,
        "return yomuQueueDurableMutation(name, () => gmMessage('GM_deleteValue', { name }).then(() => {",
        `${target} success-gated GM delete publication`,
    );
    requireRuntimeContract(
        gmRuntime,
        COMPILER_CATALOG_VALUES_READY_STRICT,
        `${target} strict storage hydration gate`,
    );
    rejectRuntimeContract(
        gmRuntime,
        COMPILER_CATALOG_VALUES_READY_LEGACY,
        `${target} swallowed storage hydration failure`,
    );
}

function assertShippedUserscriptReadiness(content, target) {
    requireRuntimePattern(
        content,
        /Promise\.resolve\(globalThis\.__USC_READY\)\.then\(\s*\(\)\s*=>\s*\{/,
        `${target} strict userscript readiness gate`,
    );
    rejectRuntimePattern(
        content,
        /Promise\.resolve\(globalThis\.__USC_READY\)\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)\.then\(\s*\(\)\s*=>\s*\{/,
        `${target} swallowed userscript readiness failure`,
    );
}

async function assertRejectingShippedDurableMutations(gmRuntime, target) {
    const sandbox = shippedRuntimeMutationSandbox();
    executeShippedGmRuntime(gmRuntime, sandbox);
    await sandbox.__USC_READY;
    const changes = [];
    sandbox.GM_addValueChangeListener('__yomu_release_verifier__', (...args) => changes.push(args));
    await assertRejectedShippedMutation(
        sandbox.GM_setValue('__yomu_release_verifier__', 'changed'),
        target,
        'set',
    );
    await assertRejectedShippedMutation(
        sandbox.GM_deleteValue('__yomu_release_verifier__'),
        target,
        'delete',
    );
    assertRejectedMutationStateUnchanged(sandbox, changes, target);
}

function executeShippedGmRuntime(gmRuntime, sandbox) {
    new Function('globalThis', 'window', 'fetch', shippedGmRuntimePrelude(gmRuntime))(
        sandbox,
        sandbox,
        async () => ({ ok: true, json: async () => ({ dictionaries: [] }) }),
    );
}

function assertRejectedMutationStateUnchanged(sandbox, changes, target) {
    if (sandbox.GM_getValue('__yomu_release_verifier__', null) !== 'stable') {
        throw new Error(`${target} rejected durable GM mutation changed its cache.`);
    }
    if (changes.length) throw new Error(`${target} rejected durable GM mutation notified listeners.`);
}

function shippedRuntimeMutationSandbox() {
    const rejection = new Error('yomu-release-verifier-durable-rejection');
    const runtime = {
        getURL: file => `moz-extension://yomu-release-verifier/${file}`,
        onMessage: { addListener: () => undefined },
        sendMessage: message => shippedRuntimeVerifierMessage(message, rejection),
    };
    return { browser: { runtime } };
}

function shippedRuntimeVerifierMessage(message, rejection) {
    if (message.type === 'GM_getAllValues') {
        return Promise.resolve({ values: { __yomu_release_verifier__: 'stable' } });
    }
    if (message.type === 'GM_setValue') return Promise.reject(rejection);
    if (message.type === 'GM_deleteValue') return Promise.reject(rejection);
    return Promise.resolve({});
}

function shippedGmRuntimePrelude(gmRuntime) {
    const bodyGate = 'Promise.resolve(globalThis.__USC_READY).then(() => {';
    const bodyGateIndex = gmRuntime.indexOf(bodyGate);
    return bodyGateIndex < 0 ? gmRuntime : gmRuntime.slice(0, bodyGateIndex);
}

async function assertRejectedShippedMutation(mutation, target, operation) {
    try {
        await mutation;
    } catch (error) {
        if (error?.message === 'yomu-release-verifier-durable-rejection') return;
        throw error;
    }
    throw new Error(`${target} rejected durable GM ${operation} resolved successfully.`);
}

function assertShippedStudyStorageAdapter(entries, target) {
    const studyRuntime = extensionEntryText(entries, PACKAGED_STUDY_STORAGE_RUNTIME_FILE, target);
    requireRuntimeContract(
        studyRuntime,
        EXTENSION_STUDY_STORAGE_MARKER,
        `${target} packaged Study storage adapter marker`,
    );
    requireRuntimeContract(
        studyRuntime,
        '__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__',
        `${target} packaged Study storage adapter flag`,
    );
    const studyIndex = extensionEntryText(entries, 'newtab/index.html', target);
    requireRuntimeContract(
        studyIndex,
        './study-storage-runtime.js',
        `${target} packaged Study storage adapter script`,
    );
}

function assertShippedFirefoxSettingsBridge(entries, target) {
    const background = extensionEntryText(entries, BACKGROUND_FILE, target);
    requireRuntimeContract(background, PACKAGED_STUDY_SETTINGS_BRIDGE_MARKER, `${target} settings background bridge`);
    requireRuntimeContract(background, 'yomu.openPackagedStudySettings', `${target} background launcher message`);
    requireRuntimeContract(background, PACKAGED_STUDY_SETTINGS_LAUNCHER_PROTOCOL, `${target} background launcher protocol`);
}

function assertShippedStudyVersion(entries, target, expectedVersion) {
    const version = JSON.parse(extensionEntryText(entries, 'newtab/version.json', target));
    if (typeof version.buildId !== 'string' || !version.buildId.startsWith(`${expectedVersion}-`)) {
        throw new Error(`${target} packaged Study build id does not match ${expectedVersion}.`);
    }
}

function extensionEntryText(entries, file, target) {
    const value = entries[file];
    if (value === undefined) throw new Error(`${target} package is missing ${file}.`);
    return typeof value === 'string' ? value : new TextDecoder().decode(value);
}

function requireRuntimeContract(source, marker, label) {
    if (!source.includes(marker)) throw new Error(`${label} is missing.`);
}

function rejectRuntimeContract(source, marker, label) {
    if (source.includes(marker)) throw new Error(`${label} is present.`);
}

function requireRuntimePattern(source, pattern, label) {
    if (!pattern.test(source)) throw new Error(`${label} is missing.`);
}

function rejectRuntimePattern(source, pattern, label) {
    if (pattern.test(source)) throw new Error(`${label} is present.`);
}

async function assertArchivePackageParity(root, target, archiveName, files) {
    const packageDirectory = path.join(root, 'packages', 'extension', target);
    const archive = path.join(root, 'release', target, archiveName);
    const releaseEntries = unzipSync(new Uint8Array(await readFile(archive)));
    for (const file of files) {
        await assertPackageFileParity(target, packageDirectory, releaseEntries[file], file);
    }
}

async function assertDirectoryPackageParity(root, target, directoryName, files) {
    const packageDirectory = path.join(root, 'packages', 'extension', target);
    const releaseDirectory = path.join(root, 'release', target, directoryName);
    for (const file of files) {
        const released = new Uint8Array(await readFile(path.join(releaseDirectory, file)));
        await assertPackageFileParity(target, packageDirectory, released, file);
    }
}

async function assertPackageFileParity(target, packageDirectory, released, file) {
    const packaged = await readFile(path.join(packageDirectory, file));
    if (released && packaged.equals(released)) return;
    throw new Error(`${target} ${file} differs between the unpacked review project and release artifact.`);
}

async function hardenGeneratedExtensionPopups(root) {
    const files = await collectNamedFiles(root, POPUP_FILE);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const hardened = hardenExtensionPopupSource(source, { target: extensionTargetFromPath(file, root) });
        if (hardened !== source) await writeFile(file, hardened);
    }
}

async function reconcileGeneratedPackageValidationAudit(root) {
    const auditFile = path.join(root, 'audit', 'package-validation.json');
    const safariManifestFile = (await collectManifestFiles(path.join(root, 'packages', 'extension', 'safari')))[0];
    if (!safariManifestFile) return;
    const [auditSource, manifestSource] = await Promise.all([
        readFile(auditFile, 'utf8').catch(() => ''),
        readFile(safariManifestFile, 'utf8'),
    ]);
    if (!auditSource) return;
    const reconciled = reconcilePackageValidationAudit(JSON.parse(auditSource), {
        safariManifest: JSON.parse(manifestSource),
    });
    await writeFile(auditFile, `${JSON.stringify(reconciled, null, 2)}\n`);
}

async function hardenGeneratedReleaseArchives(root, packageAssets, archiveTimestamp, dictionaryBackgroundSource) {
    const releaseRoot = path.join(root, 'release');
    const files = await collectArchiveFiles(releaseRoot);
    for (const file of files) {
        const target = extensionTargetFromPath(file, releaseRoot);
        if (!RELEASE_ARCHIVE_TARGETS.has(target)) continue;
        const entries = unzipSync(new Uint8Array(await readFile(file)));
        const storagePrefix = releaseArchiveStoragePrefix(entries, file);
        entries[PACKAGED_STUDY_STORAGE_RUNTIME_FILE] = strToU8(
            extensionStudyStorageRuntimeSource(storagePrefix),
        );
        await hardenReleaseArchiveEntries(entries, {
            target,
            packageAssets,
            dictionaryBackgroundSource,
            googleOAuthClientId: extensionGoogleOAuthClientId(),
        });
        installReleaseArchiveAssets(entries, packageAssets);
        await writeFile(file, zipSync(zipEntriesWithTimestamp(entries, archiveTimestamp), { level: 9 }));
    }
}

function installReleaseArchiveAssets(entries, packageAssets) {
    for (const [name, bytes] of packageAssets) entries[name] = bytes;
}

function releaseArchiveStoragePrefix(entries, file) {
    const archiveBackground = entries[BACKGROUND_FILE];
    if (!archiveBackground) throw new Error(`${file} is missing ${BACKGROUND_FILE}.`);
    return extensionStoragePrefixFromBackgroundSource(new TextDecoder().decode(archiveBackground));
}

function extensionGoogleOAuthClientId() {
    return process.env.YOMU_GOOGLE_OAUTH_CLIENT_ID
        ?? process.env.GOOGLE_OAUTH_CLIENT_ID
        ?? '';
}

async function hardenReleaseArchiveEntries(entries, options) {
    for (const [name, bytes] of Object.entries(entries)) {
        entries[name] = await hardenReleaseArchiveEntry(name, bytes, entries, options);
    }
}

async function hardenReleaseArchiveEntry(name, bytes, entries, options) {
    if (name === BACKGROUND_FILE) return hardenReleaseArchiveBackground(bytes, options);
    if (name === CONTENT_FILE) return hardenReleaseArchiveContent(bytes, entries, options.target);
    if (name === MANIFEST_FILE) return hardenReleaseArchiveManifest(bytes, options);
    return bytes;
}

function hardenReleaseArchiveBackground(bytes, options) {
    return strToU8(hardenExtensionBackgroundSource(new TextDecoder().decode(bytes), {
        target: options.target,
        googleOAuthClientId: options.googleOAuthClientId,
        dictionaryBackgroundSource: options.dictionaryBackgroundSource,
    }));
}

async function hardenReleaseArchiveContent(bytes, entries, target) {
    // This archive is patched from its own entries rather than from the
    // already-hardened package directory, so the Firefox size fix has to be
    // applied here as well or the shipped .xpi keeps the padding.
    let content = hardenExtensionContentSource(new TextDecoder().decode(bytes));
    if (target !== 'firefox') return strToU8(content);
    content = unindentContentScriptBody(content);
    const split = splitCompilerContentScript(content);
    const compactedContent = await compactFirefoxContentScript(split.content);
    assertFirefoxContentScriptFitsAmo(split.runtime, CONTENT_RUNTIME_FILE);
    assertFirefoxContentScriptFitsAmo(compactedContent, CONTENT_FILE);
    entries[CONTENT_RUNTIME_FILE] = strToU8(split.runtime);
    return strToU8(compactedContent);
}

function hardenReleaseArchiveManifest(bytes, options) {
    const manifest = JSON.parse(new TextDecoder().decode(bytes));
    return strToU8(`${JSON.stringify(hardenExtensionManifest(manifest, {
        target: options.target,
        packagedReaderCss: options.packageAssets.size > 0,
    }), null, 2)}\n`);
}

async function hardenGeneratedExtensionManifests(root, options = {}) {
    const files = await collectManifestFiles(root);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const manifest = JSON.parse(source);
        const hardened = hardenExtensionManifest(manifest, {
            target: extensionTargetFromPath(file, root),
            packagedReaderCss: options.packagedReaderCss,
        });
        const output = `${JSON.stringify(hardened, null, 2)}\n`;
        if (output !== source) await writeFile(file, output);
    }
}

async function hardenGeneratedExtensionContentScripts(root) {
    const files = await collectNamedFiles(root, CONTENT_FILE);
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const background = await readFile(path.join(path.dirname(file), BACKGROUND_FILE), 'utf8');
        const storagePrefix = extensionStoragePrefixFromBackgroundSource(background);
        let hardened = hardenExtensionContentSource(source);
        // Packaged Study is an extension page, not a content script. Give it a
        // narrow storage adapter rather than the compiler's full GM runtime.
        await writeFile(
            path.join(path.dirname(file), PACKAGED_STUDY_STORAGE_RUNTIME_FILE),
            extensionStudyStorageRuntimeSource(storagePrefix),
        );
        // Firefox only: Chrome ships and reviews fine as generated, so its bytes
        // are left exactly as they are.
        if (extensionTargetFromPath(file, root) === 'firefox') {
            hardened = unindentContentScriptBody(hardened);
            const split = splitCompilerContentScript(hardened);
            const compactedContent = await compactFirefoxContentScript(split.content);
            assertFirefoxContentScriptFitsAmo(split.runtime, CONTENT_RUNTIME_FILE);
            assertFirefoxContentScriptFitsAmo(compactedContent, file);
            await writeFile(path.join(path.dirname(file), CONTENT_RUNTIME_FILE), split.runtime);
            hardened = compactedContent;
        }
        if (hardened !== source) await writeFile(file, hardened);
    }
}

// Undoes the compiler's blanket four-space body indent before the parser-based
// compaction. This is an exact inverse for code and, critically, restores the
// original contents of multi-line template literals before esbuild reads them;
// skipping it would preserve the compiler's padding as observable string data.
export function unindentContentScriptBody(source) {
    const start = source.indexOf(CONTENT_BODY_PREFIX);
    const end = source.lastIndexOf(CONTENT_BODY_SUFFIX);
    if (start < 0 || end < 0 || end <= start) {
        throw new Error('Generated content.js no longer uses the expected userscript body wrapper; the Firefox size fix needs updating.');
    }
    const bodyStart = start + CONTENT_BODY_PREFIX.length;
    const lines = source.slice(bodyStart, end).split('\n');
    const unindented = lines.map(line => {
        // Every line was prefixed unconditionally, so anything shorter than the
        // prefix means the wrapper changed shape and the inverse is unsafe.
        if (!line.startsWith('    ') && line.trim() !== '') {
            throw new Error('Generated content.js body is not uniformly indented; refusing to rewrite it.');
        }
        return line.startsWith('    ') ? line.slice(4) : line.trimEnd();
    });
    return source.slice(0, bodyStart) + unindented.join('\n') + source.slice(end);
}

export function splitCompilerContentScript(source) {
    const bodyStart = source.indexOf(CONTENT_BODY_PREFIX);
    if (bodyStart <= 0) {
        throw new Error('Generated content.js no longer separates the GM runtime from the userscript body.');
    }
    return {
        runtime: source.slice(0, bodyStart),
        content: source.slice(bodyStart),
    };
}

// AMO parses each JavaScript file independently and rejects files above 5 MiB.
// Keep identifier and syntax minification disabled, but let esbuild remove
// parser-irrelevant whitespace and non-legal comments from the Firefox-only
// generated body. The load-bearing hardening markers stay in gm-runtime.js on
// the uncompacted side of the split. Chrome and
// Safari retain the compiler's readable output, while the AMO source archive
// still contains the exact ungenerated project used to reproduce this package.
export async function compactFirefoxContentScript(source) {
    const { transform } = await import('esbuild');
    const result = await transform(source, {
        loader: 'js',
        target: 'es2022',
        legalComments: 'inline',
        minifyWhitespace: true,
        minifyIdentifiers: false,
        minifySyntax: false,
    });
    return result.code;
}

function assertFirefoxContentScriptFitsAmo(source, file) {
    assertAmoJavaScriptFiles({ [path.basename(file)]: source });
}

export function assertAmoJavaScriptFiles(files) {
    for (const [file, source] of Object.entries(files)) {
        if (!/\.m?js$/i.test(file)) continue;
        const bytes = typeof source === 'string'
            ? Buffer.byteLength(source, 'utf8')
            : source.byteLength;
        if (bytes <= AMO_FILE_SIZE_LIMIT) continue;
        throw new Error([
            `${file} is ${bytes} bytes, over the ${AMO_FILE_SIZE_LIMIT}-byte addons.mozilla.org parse limit.`,
            'web-ext lint fails this as FILE_TOO_LARGE, so the Firefox submission would be rejected before review.',
            'Move code into a packaged companion or split the local module.',
        ].join('\n'));
    }
}

function firefoxSplitContentScripts(contentScripts = []) {
    return contentScripts.map(contentScript => ({
        ...contentScript,
        js: (contentScript.js ?? []).flatMap(file => (
            file === CONTENT_FILE ? [CONTENT_RUNTIME_FILE, CONTENT_FILE] : [file]
        )),
    }));
}

async function stageGeneratedExtensionAssets(root, packageAssets) {
    if (!packageAssets.size) return;
    const manifests = await collectManifestFiles(root);
    for (const manifest of manifests) {
        const directory = path.dirname(manifest);
        for (const [name, bytes] of packageAssets) await writeFile(path.join(directory, name), bytes);
    }
}

function extensionTargetFromPath(file, root) {
    const relative = path.relative(root, file);
    return ['chrome', 'firefox', 'safari'].find(target => relative.split(path.sep).includes(target)) ?? '';
}

async function collectBackgroundFiles(directory) {
    return collectNamedFiles(directory, BACKGROUND_FILE);
}

async function collectManifestFiles(directory) {
    return collectNamedFiles(directory, MANIFEST_FILE);
}

async function collectNamedFiles(directory, fileName) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectNamedFiles(file, fileName));
        } else if (entry.isFile() && entry.name === fileName) {
            files.push(file);
        }
    }
    return files;
}

async function collectArchiveFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectArchiveFiles(file));
        else if (entry.isFile() && (entry.name.endsWith('.zip') || entry.name.endsWith('.xpi'))) files.push(file);
    }
    return files;
}

async function collectRelativeFiles(directory, relative = '') {
    const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) files.push(...await collectRelativeFiles(directory, child));
        else if (entry.isFile()) files.push(child);
    }
    return files;
}

function uniqueArray(values) {
    return [...new Set(values.filter(Boolean))];
}

function withPackagedRuntimeResources(resources, manifestVersion) {
    const current = Array.isArray(resources) ? resources : [];
    const packaged = [READER_CSS_FILE, RUNTIME_CATALOG_FILE];
    if (manifestVersion < 3) return uniqueArray([...current, ...packaged]);
    const existing = new Set(current.flatMap(resource => (
        typeof resource === 'object' ? resource?.resources ?? [] : []
    )));
    const missing = packaged.filter(resource => !existing.has(resource));
    if (!missing.length) {
        return current;
    }
    return [
        ...current,
        {
            resources: missing,
            matches: ['<all_urls>'],
        },
    ];
}

function packagedAssets(options) {
    const assets = new Map();
    if (options.readerCss) assets.set(READER_CSS_FILE, asBytes(options.readerCss));
    if (options.thirdPartyNotices) assets.set(THIRD_PARTY_NOTICES_FILE, asBytes(options.thirdPartyNotices));
    if (options.runtimeDictionaryCatalog) assets.set(RUNTIME_CATALOG_FILE, asBytes(options.runtimeDictionaryCatalog));
    if (assets.size !== 0 && assets.size !== 3) {
        throw new Error('Extension packaging requires yomu.css, THIRD_PARTY_NOTICES.txt, and runtime-catalog.json.');
    }
    return assets;
}

function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    return strToU8(String(value));
}

function zipEntriesWithTimestamp(entries, archiveTimestamp) {
    const timestamp = new Date(archiveTimestamp || '1980-01-01T00:00:00.000Z');
    if (Number.isNaN(timestamp.getTime())) throw new Error('Extension archive timestamp must be a valid ISO timestamp.');
    // ZIP's DOS timestamp cannot represent dates before 1980.
    const mtime = timestamp < new Date('1980-01-01T00:00:00.000Z')
        ? new Date('1980-01-01T00:00:00.000Z')
        : timestamp;
    return Object.fromEntries(Object.entries(entries)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, bytes]) => [name, [bytes, { mtime }]]));
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

function packagedStudySettingsBridgeSource() {
    return `;(() => {
  // ${PACKAGED_STUDY_SETTINGS_BRIDGE_MARKER}
  const MESSAGE_TYPE = 'yomu.openPackagedStudySettings';
  const PROTOCOL = '${PACKAGED_STUDY_SETTINGS_LAUNCHER_PROTOCOL}';
  const PANELS = new Set(${JSON.stringify([
        'appearance',
        'backup',
        'api',
        'dictionaries',
        'media',
        'mining',
        'newTab',
        'shortcuts',
        'help',
    ])});
  const api = globalThis.browser || globalThis.chrome;
  if (!api?.runtime?.id || !api.runtime.onMessage || !api.runtime.getURL || !api?.tabs?.create) return;
  const listener = (message, sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE) return undefined;
    const send = response => {
      try { sendResponse(response); } catch (_) { /* response port closed */ }
    };
    const senderTabId = sender?.tab?.id;
    if (sender?.id !== api.runtime.id || !Number.isInteger(senderTabId)) {
      send({ ok: false, error: 'Packaged Study settings requests require an extension content tab.' });
      return false;
    }
    if (message.protocol !== PROTOCOL) {
      send({ ok: false, error: 'Unsupported packaged Study settings launcher protocol.' });
      return false;
    }
    const panel = typeof message.panel === 'string' ? message.panel : '';
    if (!PANELS.has(panel)) {
      send({ ok: false, error: 'Unknown packaged Study settings panel.' });
      return false;
    }
    const url = api.runtime.getURL('newtab/index.html') + '#settings=' + panel;
    createActiveTab(url).then(
      tab => Number.isInteger(tab?.id)
        ? send({ ok: true, tabId: tab.id })
        : send({ ok: false, error: 'Packaged Study tab creation returned no tab id.' }),
      error => send({ ok: false, error: error?.message || String(error || 'Packaged Study tab creation failed.') }),
    );
    return true;
  };
  api.runtime.onMessage.addListener(listener);

  function createActiveTab(url) {
    const options = { url, active: true };
    if (api.tabs.create.length > 1) {
      return new Promise((resolve, reject) => {
        try {
          api.tabs.create(options, tab => {
            const error = api.runtime.lastError;
            if (error) reject(new Error(error.message || String(error)));
            else resolve(tab);
          });
        } catch (error) {
          reject(error);
        }
      });
    }
    try {
      const pending = api.tabs.create(options);
      return pending && typeof pending.then === 'function'
        ? pending
        : Promise.reject(new Error('Packaged Study tab creation did not provide completion.'));
    } catch (error) {
      return Promise.reject(error);
    }
  }
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
