import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const buildUserscriptWorkflow = readFileSync(
    join(process.cwd(), '.github/workflows/build-userscript.yml'),
    'utf8',
);

describe('release workflow safety', () => {
    it('does not suppress Actions from the generated-assets commit', () => {
        const commitCommand = buildUserscriptWorkflow
            .split('\n')
            .find(line => line.includes('git commit -m'));

        expect(commitCommand).toBeDefined();
        expect(commitCommand).not.toMatch(/\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i);
    });
});
