import path from 'node:path';

/**
 * Extension-driven classification table for the shared Japanese library.
 * Every regular file resolves to exactly one entry state:
 *  - `included`  — a learning resource the census must cover;
 *  - `archive`   — a container whose members get their own denominators;
 *  - `excluded:<reason>` — named non-resource state, still a denominator;
 *  - `review:unknown-extension` — explicit review state, never dropped.
 */
const TABLE = new Map();

function register(state, kind, extensions, reason) {
    for (const extension of extensions) TABLE.set(extension, { kind, state, reason: reason ?? null });
}

register('included', 'document', ['.pdf']);
register('included', 'word-document', ['.doc', '.docx', '.rtf']);
register('included', 'spreadsheet', ['.xls', '.xlsx', '.csv']);
register('included', 'presentation', ['.ppt', '.pptx']);
register('included', 'audio', ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma']);
register('included', 'video', ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv', '.flv', '.rm', '.rmvb']);
register('included', 'image', ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg', '.ico']);
register('included', 'subtitle', ['.vtt', '.srt', '.ass', '.ssa', '.sub', '.smi']);
register('included', 'ebook', ['.epub', '.djvu', '.mobi', '.azw', '.azw3', '.fb2', '.cbz', '.cbr']);
register('included', 'anki-legacy-database', ['.anki', '.anki2', '.anki21']);
register('included', 'web', ['.html', '.htm', '.xhtml']);
register('included', 'data', ['.json', '.xml', '.tsv', '.sqlite', '.db', '.mdb']);
register('included', 'text', ['.txt', '.md']);
register('included', 'interactive', ['.swf']);

register('archive', 'archive', ['.zip']);
register('archive', 'anki-archive', ['.apkg', '.colpkg']);

// The shared library contains browser-native Genki exercises whose authored
// behaviour and presentation live in adjacent JavaScript and CSS. Treat those
// files as source dependencies: discarding them would preserve the HTML shell
// while losing the actual exercise. Source maps remain build metadata.
register('included', 'web-dependency', ['.js', '.css']);
register('excluded', 'build-artifact', ['.map'], 'compiler-build-output');
register('excluded', 'font', ['.ttf', '.otf', '.woff', '.woff2', '.eot'], 'font-asset');
register('excluded', 'build-artifact', [
    '.d', '.rmeta', '.rlib', '.o', '.a', '.ll', '.dylib', '.so', '.pdb', '.timestamp',
], 'compiler-build-output');
register('excluded', 'executable', ['.exe', '.dll', '.ocx', '.tlb', '.msi', '.app', '.jar'], 'executable-binary');
register('excluded', 'source-code', ['.rs', '.c', '.h', '.cpp', '.py', '.sh', '.bat', '.ps1'], 'tool-source-code');
register('excluded', 'config', ['.toml', '.yml', '.yaml', '.ini', '.lock', '.cargo-lock', '.plist', '.cfg', '.expr'], 'tool-configuration');
register('excluded', 'finder-metadata', ['.ds_store'], 'filesystem-metadata');
register('excluded', 'playlist', ['.m3u', '.m3u8', '.cue', '.pls'], 'playback-metadata');
register('excluded', 'disc-image', ['.iso', '.nrg', '.img', '.mdf', '.mds'], 'unextracted-disc-image');
register('excluded', 'unsupported-archive', ['.rar', '.7z', '.tar', '.gz', '.bz2', '.lzh'], 'archive-format-without-reader');

export function classifyLibraryName(name) {
    const base = path.basename(name).toLowerCase();
    const extension = base.startsWith('.') && !base.slice(1).includes('.')
        ? base
        : path.extname(base) || '(none)';
    const entry = TABLE.get(extension);
    if (!entry) {
        return { extension, kind: 'unknown', state: 'review:unknown-extension', reason: null };
    }
    return {
        extension,
        kind: entry.kind,
        state: entry.state === 'excluded' ? `excluded:${entry.reason}` : entry.state,
        reason: entry.reason,
    };
}

/** Census family each included/archive kind belongs to (drives phase 2). */
export function censusFamilyFor(kind) {
    if (kind === 'document') return 'pdf';
    if (kind === 'audio' || kind === 'video' || kind === 'image') return 'media';
    if (kind === 'archive' || kind === 'anki-archive') return 'archive';
    return 'none';
}
