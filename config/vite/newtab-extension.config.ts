import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import pkg from '../../package.json' with { type: 'json' };

const configRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig({
    define: {
        __YOMU_VERSION__: JSON.stringify(pkg.version),
        __YOMU_EXTENSION_BUILD__: JSON.stringify(true),
        __YOMU_NEWTAB_BUILD__: JSON.stringify(true),
        __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__: JSON.stringify(process.env.YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID ?? ''),
        __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__: JSON.stringify(Boolean(
            process.env.YOMU_GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID,
        )),
    },
    publicDir: false,
    build: {
        outDir: 'dist/newtab-extension',
        emptyOutDir: true,
        target: 'es2022',
        minify: false,
        cssMinify: false,
        lib: {
            entry: 'src/reader/newtab/entrypoint.ts',
            formats: ['es'],
            fileName: () => 'app.js',
        },
        rollupOptions: {
            output: {
                chunkFileNames: 'chunks/[name]-[hash].js',
                manualChunks(id) {
                    const normalized = id.split(path.sep).join('/');
                    if (normalized.includes('/src/reader/settings/')
                        || normalized.includes('/src/reader/dictionaries/')) {
                        return 'study-settings';
                    }
                    return undefined;
                },
            },
        },
    },
    resolve: {
        alias: {
            // Extension Study uses the browser-storage implementation and must
            // not inherit the hosted page's localStorage cloud-sync adapter.
            './cloud-sync': path.join(configRoot, 'src', 'reader', 'settings', 'cloud-sync.ts'),
        },
    },
});
