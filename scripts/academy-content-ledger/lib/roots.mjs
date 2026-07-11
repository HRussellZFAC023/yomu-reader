// Shared configuration for the Yomu Academy content-source ledger.
//
// This ledger is the PRIVATE source-of-truth inventory of every Japanese-learning
// asset discoverable on this machine. Unlike public/academy/catalog.json (which is
// deliberately metadata-only and withholds names/paths for rights reasons), the
// source ledger retains original absolute paths and titles because it is an internal
// provenance record and is never published. Downstream publishable artifacts must
// re-apply the catalog's redaction policy; see docs/academy/content-ledger/README.md.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEDGER_SCHEMA = 'yomu-academy-source-ledger/v1';

// Repository root = two levels up from scripts/academy-content-ledger/lib/.
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const HOME = '/Users/heru';

// Directory basenames that never hold class resources (build artifacts, VCS, caches,
// language runtimes). Matched by exact basename during the walk.
export const JUNK_DIRS = new Set([
    '.git', '.svn', '.hg', 'node_modules', '.venv', 'venv', 'env',
    '__pycache__', '.pytest_cache', '.mypy_cache', '.cache', '.gradle',
    'site-packages', 'dist-info', '.idea', '.vscode', '.next', '.turbo',
    '.DS_Store', '.Trash', '__MACOSX', '.parcel-cache', 'target',
]);

// Extension -> asset kind. Allowlist: only learning-relevant media are hashed.
// Deliberately excludes source code (.js/.ts), icon libraries (.svg), fonts,
// compiler intermediates, and other non-curricular noise.
export const EXT_KIND = new Map([
    // audio
    ['.mp3', 'audio'], ['.m4a', 'audio'], ['.wav', 'audio'], ['.aac', 'audio'],
    ['.aiff', 'audio'], ['.aif', 'audio'], ['.flac', 'audio'], ['.ogg', 'audio'],
    ['.oga', 'audio'], ['.opus', 'audio'], ['.wma', 'audio'],
    // video
    ['.mp4', 'video'], ['.mov', 'video'], ['.mkv', 'video'], ['.avi', 'video'],
    ['.webm', 'video'], ['.mpeg', 'video'], ['.mpg', 'video'], ['.ogv', 'video'],
    ['.m4v', 'video'], ['.flv', 'video'], ['.wmv', 'video'],
    // image
    ['.png', 'image'], ['.jpg', 'image'], ['.jpeg', 'image'], ['.gif', 'image'],
    ['.webp', 'image'], ['.avif', 'image'], ['.bmp', 'image'], ['.tif', 'image'],
    ['.tiff', 'image'], ['.heic', 'image'],
    // portable documents
    ['.pdf', 'pdf'],
    // slide decks
    ['.ppt', 'deck'], ['.pptx', 'deck'], ['.potx', 'deck'], ['.ppsx', 'deck'],
    ['.key', 'deck'], ['.odp', 'deck'],
    // spreadsheets (vocabulary sheets, trackers)
    ['.xls', 'spreadsheet'], ['.xlsx', 'spreadsheet'], ['.xlsm', 'spreadsheet'],
    ['.ods', 'spreadsheet'], ['.csv', 'spreadsheet'], ['.tsv', 'spreadsheet'],
    ['.numbers', 'spreadsheet'],
    // word-processor / text documents
    ['.doc', 'document'], ['.docx', 'document'], ['.odt', 'document'],
    ['.rtf', 'document'], ['.txt', 'document'], ['.md', 'document'],
    ['.pages', 'document'],
    // web documents (Genki study-site lessons are html)
    ['.html', 'document-web'], ['.htm', 'document-web'],
    // subtitles / captions
    ['.srt', 'subtitle'], ['.ass', 'subtitle'], ['.ssa', 'subtitle'],
    ['.vtt', 'subtitle'], ['.sup', 'subtitle'], ['.sub', 'subtitle'],
    ['.ttml', 'subtitle'], ['.sbv', 'subtitle'],
    // ebooks / scanned books
    ['.epub', 'ebook'], ['.mobi', 'ebook'], ['.azw3', 'ebook'], ['.djvu', 'ebook'],
    // Anki decks + generic archives (inspected as archives)
    ['.apkg', 'anki-deck'], ['.anki', 'anki-deck'], ['.anki2', 'anki-deck'],
    ['.colpkg', 'anki-deck'],
    ['.zip', 'archive'], ['.7z', 'archive'], ['.rar', 'archive'],
    ['.tar', 'archive'], ['.tgz', 'archive'], ['.gz', 'archive'],
    ['.iso', 'disc-image'],
    // interactive + proprietary study formats found in the mega packs
    ['.swf', 'interactive'],        // Meguro Language Center Flash vocab/verb/adjective lessons
    ['.clv', 'study-game-deck'],    // CleverLearn / study-game JLPT vocab & kanji decks
    ['.mdb', 'dictionary-db'], ['.accdb', 'dictionary-db'], // Access dictionary databases
    // structured data (yomitan dictionaries, research maps)
    ['.json', 'data'], ['.xml', 'data'],
]);

// Archive kinds whose members we hash individually when a member inspector is available.
export const INSPECTABLE_ARCHIVE_EXT = new Set(['.zip', '.apkg', '.anki', '.colpkg']);

export function classifyExt(ext) {
    return EXT_KIND.get(ext.toLowerCase()) ?? null;
}

// Ordered root descriptors. `bulkDirs` are root-relative directory paths whose files
// are catalogued as a single aggregate dataset record instead of one record per file
// (e.g. a scraped website mirror). `excludeDirs` are additional root-relative dirs to
// skip entirely on top of JUNK_DIRS.
export function contentRoots(repoRoot = REPO_ROOT) {
    return [
        {
            id: 'japanese-library',
            absPath: `${HOME}/Documents/Japanese`,
            role: 'primary-corpus',
            note: 'Primary class corpus: lessons, worksheets, homework, audio, vocab, dictionaries, resource packs.',
            excludeDirs: [],
            bulkDirs: [],
        },
        {
            id: 'soya-research',
            absPath: `${HOME}/Documents/Projects/yomu/references/soya-research`,
            role: 'research-reference',
            note: 'Research capture of the soya-eagle-online.com listening resource. Build artifacts excluded; scraped audio mirror aggregated.',
            sourceLinks: ['https://soya-eagle-online.com/'],
            excludeDirs: [
                'extracted-src', 'extracted-src-all', 'extracted-src-latest',
                'extracted-src-live-all', 'bundles', 'site-static', 'site-static-live',
                'network', 'assets', 'assets-public',
            ],
            bulkDirs: ['audio-public'],
        },
        {
            id: 'academy-references',
            absPath: `${repoRoot}/references-academy`,
            role: 'craft-reference',
            note: 'Cloned UX/craft reference apps (not Japanese-learning content). Scanned for completeness.',
            excludeDirs: [],
            bulkDirs: [],
        },
        {
            id: 'class-photos',
            absPath: `${repoRoot}/references/class-photos`,
            role: 'art-reference',
            note: 'Class/cast reference photography used for character art.',
            excludeDirs: [],
            bulkDirs: [],
        },
        {
            id: 'academy-public',
            absPath: `${repoRoot}/public/academy`,
            role: 'production-derivative',
            note: 'Already-digitised Academy production assets. Used to cross-link sources to shipped derivatives.',
            // Never scan our own ledger output or the sibling digitisation index.
            excludeDirs: ['content/source-ledger', 'content'],
            bulkDirs: [],
        },
    ];
}

export const CATALOG_PATH = `${REPO_ROOT}/public/academy/catalog.json`;
export const LEDGER_OUT_DIR = `${REPO_ROOT}/public/academy/content/source-ledger`;
export const RAW_DIR = `${LEDGER_OUT_DIR}/raw`;
export const DOCS_DIR = `${REPO_ROOT}/docs/academy/content-ledger`;
