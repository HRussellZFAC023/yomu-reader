import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(configDir, '../..');

export default defineConfig({
    root: path.join(appRoot, 'src/gaming/renderer'),
    base: './',
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
