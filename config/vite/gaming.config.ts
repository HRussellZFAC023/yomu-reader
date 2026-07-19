import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(configDir, '../..');
const pkg = createRequire(import.meta.url)(path.join(appRoot, 'package.json')) as { version: string };

export default defineConfig({
    root: path.join(appRoot, 'src/gaming/renderer'),
    base: './',
    // The overlay renderer bundles the real reader, which reads these build-time globals.
    define: {
        __YOMU_VERSION__: JSON.stringify(pkg.version),
        __YOMU_NEWTAB_BUILD__: JSON.stringify(false),
        __YOMU_EXTENSION_BUILD__: JSON.stringify(false),
        __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__: JSON.stringify(process.env.YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID ?? ''),
        __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__: JSON.stringify(false),
    },
    resolve: {
        alias: {
            '@gaming': path.join(appRoot, 'src/gaming'),
        },
    },
    build: {
        outDir: path.join(appRoot, 'dist-gaming/renderer'),
        emptyOutDir: true,
        target: 'es2022',
        minify: false,
        cssMinify: false,
    },
    server: {
        host: '127.0.0.1',
        port: Number(process.env.YOMU_GAMING_RENDERER_PORT || 5187),
        strictPort: false,
    },
});
