import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readProjectFile(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

describe('hosted overflow menus', () => {
    it('keeps the homepage overflow link set complete', () => {
        const theme = readProjectFile('docs/.vitepress/theme/index.ts');
        const config = readProjectFile('docs/.vitepress/config.mts');

        for (const label of ['Video Player', 'PDF Reader', 'Stats', 'Local Audio', 'Changelog', 'Support']) {
            expect(theme).toContain(`text: '${label}'`);
            expect(config).toContain(`text: '${label}'`);
        }
        expect(theme).toContain("href: '/pdf-reader/index.html'");
        expect(config).toContain("const pdfReaderLink = '/pdf-reader/index.html';");
    });



});
