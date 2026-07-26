import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const configRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };
const { GREASY_FORK_LIBRARIES, greasyForkLibraryDir } = require('../../scripts/lib/greasyfork-libraries.cjs') as {
    GREASY_FORK_LIBRARIES: Array<{
        id: string;
        entry: string;
        fileName: string;
        globalName: string;
    }>;
    greasyForkLibraryDir: string;
};

const library = GREASY_FORK_LIBRARIES.find(candidate => candidate.id === process.env.YOMU_GREASYFORK_LIBRARY_ID);

if (!library) {
    throw new Error(`Unknown YOMU_GREASYFORK_LIBRARY_ID: ${process.env.YOMU_GREASYFORK_LIBRARY_ID ?? '(missing)'}`);
}

export default defineConfig({
    define: {
        __YOMU_VERSION__: JSON.stringify(pkg.version),
        __YOMU_EXTENSION_BUILD__: JSON.stringify(false),
        __YOMU_NEWTAB_BUILD__: JSON.stringify(false),
        __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__: JSON.stringify(process.env.YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID ?? ''),
        __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__: JSON.stringify(false),
    },
    resolve: {
        alias: {
            './cloud-sync': path.join(configRoot, 'src', 'reader', 'settings', 'cloud-sync-web.ts'),
        },
    },
    // Nothing consumes dist/greasyfork/<public asset> — only the companion
    // .user.js files are read (smokes) or published (sync-docs-userscript).
    // Copying the 270 MB public tree once per companion made every build spend
    // minutes on redundant I/O and raced the main build's outDir wipe
    // (ENOTEMPTY / ENOENT mid-copy) whenever two builds overlapped.
    publicDir: false,
    build: {
        outDir: `dist/${greasyForkLibraryDir}`,
        emptyOutDir: false,
        target: 'es2022',
        minify: false,
        cssMinify: false,
        lib: {
            entry: library.entry,
            name: library.globalName,
            formats: ['iife'],
            fileName: () => library.fileName,
        },
    },
});
