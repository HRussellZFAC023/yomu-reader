import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ command }) => ({
    // Dev serves the same hosted Reader + Academy tree as GitHub Pages so the
    // real annotation runtime is exercised during browser acceptance.
    publicDir: command === 'serve' ? path.join(root, 'docs/public') : false,
    server: {
        host: '127.0.0.1',
        port: Number(process.env.ACADEMY_PORT ?? 5174),
        strictPort: true,
    },
    build: {
        outDir: path.join(root, 'dist/academy'),
        emptyOutDir: true,
        target: 'es2022',
        minify: false,
        cssMinify: false,
        lib: {
            entry: path.join(root, 'src/academy/entrypoint.ts'),
            name: 'YomuAcademy',
            formats: ['iife'],
            fileName: () => 'app.js',
        },
    },
    test: {
        environment: 'jsdom',
        include: ['tests/academy/**/*.test.ts'],
        globals: true,
        pool: 'forks',
        poolOptions: { forks: { minForks: 1, maxForks: 4 } },
    },
}));
