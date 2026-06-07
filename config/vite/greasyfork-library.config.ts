import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
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
