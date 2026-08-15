import path from 'node:path';

const EXTENSION_DICTIONARY_BACKGROUND_MARKER = 'yomu-extension-dictionary-background-service';
const EXTENSION_STORAGE_PREFIX_PLACEHOLDER = '__YOMU_EXTENSION_STORAGE_PREFIX_PLACEHOLDER__';

const COMPILER_BACKGROUND_MARKER = '/* UserScript Compiler runtime background.';
const COMPILER_CHANNEL_GUARD_MARKER = 'yomu-userscript-compiler-channel-guard';
const COMPILER_LISTENER_BODY = `event.addListener((message, sender, sendResponse) => {
      Promise.resolve(handleMessage(message, sender)).then(sendResponse, error => sendResponse({ error: error?.message || String(error) }));
      return true;
    });`;
const HARDENED_COMPILER_LISTENER_BODY = `event.addListener((message, sender, sendResponse) => {
      // ${COMPILER_CHANNEL_GUARD_MARKER}
      if (!message || message.channel !== 'userscript-compiler') return undefined;
      Promise.resolve(handleMessage(message, sender)).then(sendResponse, error => sendResponse({ error: error?.message || String(error) }));
      return true;
    });`;
const STORAGE_PREFIX_DECLARATION = /\bconst storagePrefix = ("(?:\\.|[^"\\])*");/g;
const ALIAS_IMPORT_CANDIDATE = /(?:^|\/)(?:storage|logger|settings|index|archive-cache)(?:\.[cm]?[jt]s)?$/;
const CONTENT_GM_STORAGE_IDENTIFIER = /\bgmStorage(?:Get|Set|Delete)(?:ForResetEnumeration|Sync)?\b/;

export async function buildExtensionDictionaryBackgroundSource(root) {
    const { build } = await import('esbuild');
    const entry = path.join(root, 'src', 'reader', 'dictionaries', 'extension-background-entry.ts');
    const adapter = path.join(root, 'src', 'reader', 'dictionaries', 'extension-background-adapters.ts');
    const aliasTargets = new Set([
        path.join(root, 'src', 'reader', 'app', 'storage.ts'),
        path.join(root, 'src', 'reader', 'app', 'logger.ts'),
        path.join(root, 'src', 'reader', 'settings', 'index.ts'),
        path.join(root, 'src', 'reader', 'dictionaries', 'archive-cache.ts'),
    ].map(normalizedPath));
    const result = await build({
        absWorkingDir: root,
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        charset: 'utf8',
        legalComments: 'inline',
        minify: false,
        treeShaking: true,
        sourcemap: false,
        metafile: true,
        logLevel: 'silent',
        banner: { js: `// ${EXTENSION_DICTIONARY_BACKGROUND_MARKER}` },
        define: {
            window: 'globalThis',
            'import.meta.env.DEV': 'false',
            'import.meta.env.PROD': 'true',
            'import.meta.env.MODE': '"production"',
            __YOMU_EXTENSION_STORAGE_PREFIX__: JSON.stringify(EXTENSION_STORAGE_PREFIX_PLACEHOLDER),
        },
        plugins: [extensionBackgroundAdapterAliases(aliasTargets, adapter)],
    });
    if (result.outputFiles?.length !== 1) {
        throw new Error(`Extension dictionary background build produced ${result.outputFiles?.length ?? 0} outputs; expected one self-contained IIFE.`);
    }
    const bundledInputs = new Set(Object.keys(result.metafile?.inputs ?? {}).map(input => (
        normalizedPath(path.isAbsolute(input) ? input : path.resolve(root, input))
    )));
    const leakedAliasTarget = [...aliasTargets].find(target => bundledInputs.has(target));
    if (leakedAliasTarget) {
        throw new Error(`Extension dictionary background bundled browser-only module instead of its adapter: ${leakedAliasTarget}`);
    }
    if (!bundledInputs.has(normalizedPath(adapter))) {
        throw new Error('Extension dictionary background did not bundle its worker storage/settings adapter.');
    }
    const source = result.outputFiles[0].text;
    assertSingleOccurrence(source, EXTENSION_DICTIONARY_BACKGROUND_MARKER, 'background service marker');
    assertSingleOccurrence(source, JSON.stringify(EXTENSION_STORAGE_PREFIX_PLACEHOLDER), 'storage-prefix placeholder');
    const contentStorageIdentifier = source.match(CONTENT_GM_STORAGE_IDENTIFIER)?.[0];
    if (contentStorageIdentifier) {
        throw new Error(`Extension dictionary background bundled content-side GM storage identifier: ${contentStorageIdentifier}`);
    }
    return source;
}

export function hardenCompilerRuntimeMessageChannel(source) {
    if (source.includes(COMPILER_CHANNEL_GUARD_MARKER)) return source;
    if (source.includes(COMPILER_LISTENER_BODY)) {
        assertSingleOccurrence(source, COMPILER_LISTENER_BODY, 'UserScript Compiler runtime message listener');
        return source.replace(COMPILER_LISTENER_BODY, HARDENED_COMPILER_LISTENER_BODY);
    }
    if (source.includes(COMPILER_BACKGROUND_MARKER)) {
        throw new Error('UserScript Compiler background no longer exposes the expected runtime message listener.');
    }
    return source;
}

export function installExtensionDictionaryBackgroundSource(source, dictionaryBackgroundSource) {
    if (!dictionaryBackgroundSource) return source;
    if (source.includes(EXTENSION_DICTIONARY_BACKGROUND_MARKER)) {
        return verifiedInstalledDictionaryBackground(source);
    }
    return appendConfiguredDictionaryBackground(source, dictionaryBackgroundSource);
}

function verifiedInstalledDictionaryBackground(source) {
    assertSingleOccurrence(source, EXTENSION_DICTIONARY_BACKGROUND_MARKER, 'injected background service marker');
    if (source.includes(EXTENSION_STORAGE_PREFIX_PLACEHOLDER)) {
        throw new Error('Injected extension dictionary background still contains its storage-prefix placeholder.');
    }
    return source;
}

function appendConfiguredDictionaryBackground(source, dictionaryBackgroundSource) {
    assertSingleOccurrence(dictionaryBackgroundSource, EXTENSION_DICTIONARY_BACKGROUND_MARKER, 'background service marker');
    const placeholder = JSON.stringify(EXTENSION_STORAGE_PREFIX_PLACEHOLDER);
    assertSingleOccurrence(dictionaryBackgroundSource, placeholder, 'storage-prefix placeholder');
    const storagePrefix = extensionStoragePrefixFromBackgroundSource(source);
    const configuredSource = dictionaryBackgroundSource.replace(placeholder, JSON.stringify(storagePrefix));
    if (configuredSource.includes(EXTENSION_STORAGE_PREFIX_PLACEHOLDER)) {
        throw new Error('Extension dictionary background storage-prefix substitution did not consume the placeholder.');
    }
    return `${source}\n\n${configuredSource}\n`;
}

export function extensionStoragePrefixFromBackgroundSource(source) {
    const storagePrefixLiterals = [...source.matchAll(STORAGE_PREFIX_DECLARATION)].map(match => match[1]);
    if (storagePrefixLiterals.length !== 1) {
        throw new Error(`Generated extension background exposes ${storagePrefixLiterals.length} exact storagePrefix declarations; expected one.`);
    }
    return JSON.parse(storagePrefixLiterals[0]);
}

export function assertHardenedExtensionDictionaryBackgroundSource(source, description = 'Extension background') {
    const markerCount = source.split(EXTENSION_DICTIONARY_BACKGROUND_MARKER).length - 1;
    if (markerCount !== 1) {
        throw new Error(`${description} contains ${markerCount} shared dictionary background markers; expected one.`);
    }
    const guardCount = source.split(COMPILER_CHANNEL_GUARD_MARKER).length - 1;
    if (guardCount !== 1) {
        throw new Error(`${description} contains ${guardCount} UserScript Compiler channel guards; expected one.`);
    }
    if (source.includes(EXTENSION_STORAGE_PREFIX_PLACEHOLDER)) {
        throw new Error(`${description} still contains the dictionary storage-prefix placeholder.`);
    }
}

function extensionBackgroundAdapterAliases(aliasTargets, adapter) {
    return {
        name: 'yomu-extension-background-adapters',
        setup(build) {
            build.onResolve({ filter: ALIAS_IMPORT_CANDIDATE }, async args => {
                if (args.pluginData?.yomuExtensionBackgroundAlias) return undefined;
                const resolution = await build.resolve(args.path, {
                    importer: args.importer,
                    namespace: args.namespace,
                    resolveDir: args.resolveDir,
                    kind: args.kind,
                    pluginData: { yomuExtensionBackgroundAlias: true },
                });
                if (resolution.errors.length || !aliasTargets.has(normalizedPath(resolution.path))) return undefined;
                return { path: adapter };
            });
        },
    };
}

function assertSingleOccurrence(source, value, description) {
    const count = source.split(value).length - 1;
    if (count !== 1) throw new Error(`Extension dictionary integration found ${count} ${description} occurrences; expected one.`);
}

function normalizedPath(value) {
    return path.normalize(value);
}
