import { defineConfig } from 'vite';

export default defineConfig({
    publicDir: false,
    build: {
        outDir: 'dist/newtab',
        emptyOutDir: false,
        lib: {
            entry: 'src/reader/newtab-entry.ts',
            formats: ['iife'],
            name: 'YomuNewTab',
            fileName: () => 'app.js',
        },
    },
});
