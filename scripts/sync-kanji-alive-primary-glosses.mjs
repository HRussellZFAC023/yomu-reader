import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_COMMIT = '1b5f96e8fa3f917d40c7644572399a1ccd1190d1';
const SOURCE_URL = `https://raw.githubusercontent.com/kanjialive/kanji-data-media/${SOURCE_COMMIT}/language-data/ka_data.csv`;
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/public/data/kanji-alive-primary-glosses.json');

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Kanji Alive data download failed (${response.status}).`);
const rows = parseCsv(await response.text());
const header = rows.shift() ?? [];
const kanjiIndex = header.indexOf('kanji');
const meaningIndex = header.indexOf('kmeaning');
if (kanjiIndex < 0 || meaningIndex < 0) throw new Error('Kanji Alive CSV is missing kanji or kmeaning.');

const meanings = Object.fromEntries(rows.flatMap(row => {
    const kanji = row[kanjiIndex]?.trim() ?? '';
    const gloss = primaryGloss(row[meaningIndex] ?? '');
    return kanji && gloss ? [[kanji, gloss]] : [];
}));
if (Object.keys(meanings).length < 1_200) throw new Error('Kanji Alive gloss extract is unexpectedly small.');

const payload = {
    _meta: {
        source: SOURCE_URL,
        sourceCommit: SOURCE_COMMIT,
        license: 'CC BY 4.0',
        attribution: 'Kanji Alive',
        field: 'Primary comma-delimited gloss from kmeaning',
    },
    meanings,
};
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`);
console.log(`Wrote ${Object.keys(meanings).length} Kanji Alive primary glosses to ${OUTPUT_PATH}`);

function parseCsv(source) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') quoted = false;
            else field += character;
        } else if (character === '"') quoted = true;
        else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n') {
            row.push(field.replace(/\r$/u, ''));
            if (row.some(Boolean)) rows.push(row);
            row = [];
            field = '';
        } else field += character;
    }
    if (field || row.length) rows.push([...row, field]);
    return rows;
}

function primaryGloss(value) {
    let parenthesisDepth = 0;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === '(') parenthesisDepth += 1;
        else if (character === ')' && parenthesisDepth > 0) parenthesisDepth -= 1;
        else if ((character === ',' || character === '、') && parenthesisDepth === 0) return value.slice(0, index).trim();
    }
    return value.trim();
}
