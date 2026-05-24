#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src', 'reader', 'styles-reader.css');
const out = path.resolve(process.env.YOMU_READER_CSS_OUT || path.join(root, 'dist', 'yomu.css'));

const css = await bundleCss(entry);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${css.trim()}\n`);
console.log(`Wrote ${path.relative(root, out)}`);

async function bundleCss(file, seen = new Set()) {
    const resolved = path.resolve(file);
    if (seen.has(resolved)) return '';
    seen.add(resolved);

    const source = await readFile(resolved, 'utf8');
    const parts = [];
    let cursor = 0;
    const importPattern = /@import\s+['"]([^'"]+)['"]\s*;/g;
    for (const match of source.matchAll(importPattern)) {
        parts.push(source.slice(cursor, match.index));
        const imported = path.resolve(path.dirname(resolved), match[1]);
        parts.push(`\n/* Source: ${path.relative(root, imported)} */\n`);
        parts.push(await bundleCss(imported, seen));
        cursor = (match.index ?? 0) + match[0].length;
    }
    parts.push(source.slice(cursor));
    return parts.join('');
}
