import { defineConfig } from 'vite';
import pkg from '../../package.json' with { type: 'json' };

export default defineConfig({
    define: {
        __YOMU_VERSION__: JSON.stringify(pkg.version),
    },
    publicDir: false,
    build: {
        outDir: 'dist/academy',
        emptyOutDir: true,
        target: 'es2022',
        minify: false,
        cssMinify: false,
        lib: {
            entry: 'src/academy/entrypoint.ts',
            formats: ['iife'],
            name: 'YomuAcademy',
            fileName: () => 'app.js',
        },
        rollupOptions: {
            output: {
                assetFileNames: asset => asset.name?.endsWith('.css') ? 'styles.css' : 'assets/[name]-[hash][extname]',
            },
        },
    },
});
