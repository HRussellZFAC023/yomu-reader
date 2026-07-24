import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: [
            'tests/reader/dictionary-catalog*.test.ts',
            'tests/workers/yomu-dictionaries*.test.ts',
        ],
        globals: true,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
});
