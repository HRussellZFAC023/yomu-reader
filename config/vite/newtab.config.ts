import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import pkg from '../../package.json' with { type: 'json' };

const configRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const extensionBuild = process.env.YOMU_USERSCRIPT_BUNDLE_MODE === 'self-contained';

export default defineConfig({
    define: {
        __YOMU_VERSION__: JSON.stringify(pkg.version),
        __YOMU_EXTENSION_BUILD__: JSON.stringify(extensionBuild),
        __YOMU_NEWTAB_BUILD__: JSON.stringify(true),
        __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__: JSON.stringify(process.env.YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID ?? ''),
    },
    resolve: extensionBuild ? undefined : {
        alias: {
            './cloud-sync': path.join(configRoot, 'src', 'reader', 'settings', 'cloud-sync-web.ts'),
        },
    },
    publicDir: false,
    build: {
        outDir: 'dist/newtab',
        emptyOutDir: false,
        target: 'es2022',
        minify: false,
        cssMinify: false,
        lib: {
            entry: 'src/reader/newtab/entrypoint.ts',
            formats: ['iife'],
            name: 'YomuNewTab',
            fileName: () => 'app.js',
        },
    },
});
