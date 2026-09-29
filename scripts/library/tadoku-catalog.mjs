import { JSDOM } from 'jsdom';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TADOKU_CATALOG_URL = 'https://tadoku.org/japanese/en/free-books-en/';
const LEVELS = new Set(['l-start', 'l0', 'l1', 'l2', 'l3', 'l4', 'l5']);

function plainText(element) {
    if (!element) return '';
    const copy = element.cloneNode(true);
    copy.querySelectorAll('rt, rp').forEach(node => node.remove());
    return copy.textContent.replace(/\s+/gu, ' ').trim();
}

export function parseTadokuCatalog(html, checkedAt = new Date().toISOString()) {
    if (!Number.isFinite(Date.parse(checkedAt))) throw new Error('Invalid catalogue timestamp.');
    if (!/<!doctype\s+html\b/i.test(html) || !/<\/body>\s*<\/html>(?:\s|<!--[\s\S]*?-->)*$/i.test(html)) {
        throw new Error('Incomplete Tadoku HTML response.');
    }
    const dom = new JSDOM(html);
    try {
        const document = dom.window.document;
        const genres = [...document.querySelectorAll('input[name="genre[]"]')].map(input => {
            const label = input.closest('label');
            const id = input.value;
            const ja = plainText(label?.querySelector('.fb-genre-jp'));
            const en = plainText(label?.querySelector('.fb-genre-en'));
            if (!/^\d+$/u.test(id) || !ja || !en) throw new Error('Incomplete Tadoku genre metadata.');
            return { id, label: { ja, en } };
        });
        const genreIds = new Set(genres.map(genre => genre.id));
        if (!genres.length || genreIds.size !== genres.length) throw new Error('Missing or duplicate Tadoku genres.');
        const items = [...document.querySelectorAll('.freebooks-book-item')];
        if (!items.length) throw new Error('Tadoku returned no catalogue items.');
        const ids = new Set();
        const books = items.map(item => {
            const link = item.querySelector('.bl-title a');
            const title = plainText(link);
            const sourceUrl = new URL(link?.getAttribute('href') ?? '', TADOKU_CATALOG_URL);
            const match = /^\/japanese\/book\/(\d+)\/$/u.exec(sourceUrl.pathname);
            if (!title || sourceUrl.origin !== 'https://tadoku.org' || sourceUrl.search || sourceUrl.hash || !match) {
                throw new Error('Invalid Tadoku book title or source URL.');
            }
            const id = match[1];
            if (ids.has(id)) throw new Error(`Duplicate Tadoku book: ${id}`);
            ids.add(id);
            const coverUrl = new URL(item.querySelector('.bl-thumb img')?.getAttribute('src') ?? '', TADOKU_CATALOG_URL);
            if (coverUrl.origin !== 'https://tadoku.org' || !/^\/japanese\/wp-content\/uploads\/.+\.(?:png|jpe?g|webp|gif)$/iu.test(coverUrl.pathname)) {
                throw new Error(`Invalid Tadoku cover for book ${id}.`);
            }
            const level = item.getAttribute('data-level');
            if (!LEVELS.has(level)) throw new Error(`Unknown Tadoku level for book ${id}.`);
            const bookGenres = JSON.parse(item.getAttribute('data-genres') ?? 'null');
            if (!Array.isArray(bookGenres) || bookGenres.some(genre => typeof genre !== 'string' || !genreIds.has(genre))
                || new Set(bookGenres).size !== bookGenres.length) {
                throw new Error(`Invalid Tadoku genres for book ${id}.`);
            }
            return { id, title, level, genreIds: bookGenres, sourceUrl: sourceUrl.href, coverUrl: coverUrl.href };
        });
        return { schemaVersion: 1, sourceUrl: TADOKU_CATALOG_URL, checkedAt, sourceItemCount: items.length, genres, books };
    } finally {
        dom.window.close();
    }
}

export async function fetchTadokuCatalog(fetcher = fetch) {
    const response = await fetcher(TADOKU_CATALOG_URL, {
        signal: AbortSignal.timeout(15_000), redirect: 'error',
        headers: { Accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`Tadoku catalogue returned HTTP ${response.status}.`);
    const html = await response.text();
    if (Buffer.byteLength(html) > 5_000_000) throw new Error('Tadoku catalogue exceeds the reviewed size limit.');
    return parseTadokuCatalog(html);
}

export function validateTadokuRefresh(catalog, previous) {
    if (!previous) return;
    if (previous.schemaVersion !== 1 || previous.sourceUrl !== TADOKU_CATALOG_URL || !Array.isArray(previous.books)) {
        throw new Error('Existing Tadoku catalogue is not a supported snapshot.');
    }
    const nextIds = new Set(catalog.books.map(book => book.id));
    const missing = previous.books.filter(book => !nextIds.has(book.id));
    if (missing.length) throw new Error(`Tadoku refresh omitted ${missing.length} existing books; retain the snapshot and review source removals.`);
    const nextBooks = new Map(catalog.books.map(book => [book.id, book]));
    if (previous.books.some(book => book.genreIds?.length && !nextBooks.get(book.id)?.genreIds.length)) {
        throw new Error('Tadoku refresh erased existing genres; review the source metadata before replacement.');
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: tadoku-catalog.mjs [--out FILE]');
    const catalog = await fetchTadokuCatalog();
    if (!args.length) {
        console.log(JSON.stringify({ source: catalog.sourceUrl, books: catalog.books.length, genres: catalog.genres.length }));
        return;
    }
    const output = resolve(args[1]);
    let previous;
    try {
        previous = JSON.parse(await readFile(output, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    validateTadokuRefresh(catalog, previous);
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), '.tadoku-catalog-'));
    try {
        const staged = join(staging, 'catalog.json');
        await writeFile(staged, `${JSON.stringify(catalog, null, 2)}\n`);
        await rename(staged, output);
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
    console.log(`Recorded ${catalog.books.length} Tadoku book records in ${output}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
