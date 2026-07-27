#!/usr/bin/env node
// Vendors a Noto Sans JP subset containing exactly the glyphs this project
// renders, so a render on a machine with no Japanese system font still produces
// Japanese instead of tofu, and so the committed font stays a few kilobytes
// instead of a few megabytes.
//
//   npm run fonts
//
// The character set is derived from src/, not hand-maintained: add copy, re-run
// this, commit the regenerated woff2 files. Output is deterministic (characters
// are sorted by code point) so an unchanged src/ produces an unchanged file.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const sourceRoot = join(projectRoot, 'src');
const fontDirectory = join(projectRoot, 'public', 'fonts');

const FAMILY = 'Noto Sans JP';
const WEIGHTS = [400, 700, 900];
// Google Fonts only serves woff2 to a user agent it believes supports it.
const MODERN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function collectSourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectSourceFiles(full));
        else if (/\.(tsx?|json)$/.test(entry.name)) files.push(full);
    }
    return files;
}

// Everything the clip can put on screen: the literal characters in the sources
// plus a full ASCII baseline so numbers and labels never fall back mid-word.
async function characterSet() {
    const files = await collectSourceFiles(sourceRoot);
    const characters = new Set();
    for (let code = 0x20; code <= 0x7e; code++) characters.add(String.fromCodePoint(code));
    for (const file of files) {
        const text = await readFile(file, 'utf8');
        for (const character of text) {
            const code = character.codePointAt(0) ?? 0;
            if (code < 0x20) continue;
            characters.add(character);
        }
    }
    return [...characters].sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0)).join('');
}

async function fetchText(url) {
    const response = await fetch(url, { headers: { 'User-Agent': MODERN_UA } });
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
    return response.text();
}

async function fetchBinary(url) {
    const response = await fetch(url, { headers: { 'User-Agent': MODERN_UA } });
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
}

function parseFaces(css) {
    const faces = [];
    const blocks = css.split('@font-face').slice(1);
    for (const block of blocks) {
        const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
        const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1];
        if (weight && url) faces.push({ weight: Number(weight), url });
    }
    return faces;
}

async function main() {
    const text = await characterSet();
    const query = new URLSearchParams({
        family: `${FAMILY}:wght@${WEIGHTS.join(';')}`,
        text,
        display: 'block',
    });
    const cssUrl = `https://fonts.googleapis.com/css2?${query.toString()}`;
    console.log(`Requesting a ${[...text].length}-character subset of ${FAMILY} (${WEIGHTS.join('/')}).`);

    const css = await fetchText(cssUrl);
    const faces = parseFaces(css);
    if (faces.length !== WEIGHTS.length) {
        throw new Error(`Expected ${WEIGHTS.length} @font-face blocks, got ${faces.length}. Google Fonts response:\n${css}`);
    }

    await mkdir(fontDirectory, { recursive: true });

    // Noto Sans JP is a variable font, so every requested weight comes back as
    // the same bytes. Committing three identical 60 KiB copies would be silly;
    // detect it and ship one file registered across the whole weight axis.
    const payloads = await Promise.all(faces.map(face => fetchBinary(face.url)));
    const first = payloads[0];
    if (!first) throw new Error('Google Fonts returned no font payloads.');
    const identical = payloads.every(payload => payload.equals(first));

    const manifest = { family: FAMILY, source: 'Google Fonts (SIL Open Font License 1.1)', characters: [...text].length, faces: [] };
    if (identical) {
        const name = 'noto-sans-jp-variable-subset.woff2';
        await writeFile(join(fontDirectory, name), first);
        manifest.faces.push({ weightRange: `${WEIGHTS[0]} ${WEIGHTS[WEIGHTS.length - 1]}`, file: name, bytes: first.byteLength });
        console.log(`  ${name}  ${(first.byteLength / 1024).toFixed(1)} KiB  (one variable face for ${WEIGHTS.join('/')})`);
    } else {
        for (const [index, face] of faces.entries()) {
            const bytes = payloads[index];
            if (!bytes) continue;
            const name = `noto-sans-jp-${face.weight}-subset.woff2`;
            await writeFile(join(fontDirectory, name), bytes);
            manifest.faces.push({ weight: face.weight, file: name, bytes: bytes.byteLength });
            console.log(`  ${name}  ${(bytes.byteLength / 1024).toFixed(1)} KiB`);
        }
    }

    await writeFile(join(fontDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log('Wrote public/fonts/manifest.json');
    console.log('src/fonts.ts must list exactly the files above.');
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
