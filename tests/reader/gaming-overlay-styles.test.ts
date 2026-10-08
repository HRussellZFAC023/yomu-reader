import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER = join(process.cwd(), 'src/gaming/renderer');
const styles = readFileSync(join(RENDERER, 'styles.css'), 'utf8');
const rendererSource = readdirSync(RENDERER)
    .filter(name => /\.(ts|html)$/u.test(name))
    .map(name => readFileSync(join(RENDERER, name), 'utf8'))
    .join('\n');

describe('よむ Desktop overlay styles', () => {
    it('styles only overlay pieces the renderer still draws', () => {
        const classes = [...new Set(styles.match(/\.overlay-[a-z-]+/gu) ?? [])].map(selector => selector.slice(1));
        expect(classes.filter(name => !new RegExp(`\\b${name}\\b`, 'u').test(rendererSource))).toEqual([]);
    });

    it('keeps its chrome at the shared UI weights, never 800 and above', () => {
        expect(styles.match(/font(?:-weight)?:\s*(?:[89]\d\d)\b/gu) ?? []).toEqual([]);
    });
});
