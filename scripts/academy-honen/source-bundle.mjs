import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const HONEN_DIRECT_EXTENSIONS = new Set([
    '.doc',
    '.docx',
    '.gif',
    '.jpeg',
    '.jpg',
    '.markdown',
    '.md',
    '.mov',
    '.mp4',
    '.pdf',
    '.png',
    '.ppt',
    '.pptx',
    '.txt',
    '.webm',
    '.webp',
]);

const BAND_RULES = Object.freeze([
    {
        id: '05-n1-mastery',
        patterns: [/(?:^|[/ _-])n1(?:$|[/ _.-])/i, /advanced japanese/i, /上級/u],
    },
    {
        id: '04-n2-advanced',
        patterns: [/(?:^|[/ _-])n2(?:$|[/ _.-])/i, /中上級/u],
    },
    {
        id: '03-n3-intermediate',
        patterns: [
            /(?:^|[/ _-])n3(?:$|[/ _.-])/i,
            /tobira/i,
            /intermediate/i,
            /中級/u,
            /ちゅうきゅう/u,
        ],
    },
    {
        id: '02-n4-elementary',
        patterns: [/(?:^|[/ _-])n4(?:$|[/ _.-])/i, /elementary/i, /初中級/u],
    },
    {
        id: '01-n5-foundations',
        patterns: [
            /(?:^|[/ _-])n5(?:$|[/ _.-])/i,
            /beginner/i,
            /genki/i,
            /minna no nihongo/i,
            /hiragana/i,
            /katakana/i,
            /kana/i,
            /初級/u,
            /ひらがな/u,
            /カタカナ/u,
        ],
    },
    {
        id: '06-reference-corpora',
        patterns: [
            /dictionar/i,
            /jmdict/i,
            /corpus/i,
            /subtitle/i,
            /tatoeba/i,
            /common voice/i,
            /vocabulary/i,
        ],
    },
]);

export function inferCurriculumBand(relativePath) {
    for (const rule of BAND_RULES) {
        if (rule.patterns.some(pattern => pattern.test(relativePath))) return rule.id;
    }
    return '07-cross-level-review';
}

export function canImportDirectlyToHonen(extension) {
    return HONEN_DIRECT_EXTENSIONS.has(String(extension ?? '').toLowerCase());
}

export function buildSourceRows(ledger) {
    if (!Array.isArray(ledger?.entries)) throw new TypeError('Library ledger entries are required.');

    return ledger.entries
        .filter(entry => entry.entryKind === 'file')
        .map(entry => {
            const extension = String(entry.classification?.extension ?? path.extname(entry.relativePath)).toLowerCase();
            return {
                sourceId: `jp-${entry.sha256?.slice(0, 16) ?? 'unhashed'}`,
                relativePath: entry.relativePath,
                sha256: entry.sha256 ?? null,
                byteLength: entry.byteLength,
                kind: entry.classification?.kind ?? 'unknown',
                state: entry.state ?? entry.classification?.state ?? 'unknown',
                extension,
                curriculumBand: inferCurriculumBand(entry.relativePath),
                honenDirect: canImportDirectlyToHonen(extension),
            };
        })
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'));
}

export function buildUploadBatches(rows, {
    maxFiles = 24,
    maxBytes = 200 * 1024 * 1024,
} = {}) {
    const batches = [];
    let current = null;

    for (const row of rows.filter(candidate => candidate.honenDirect)) {
        const group = `${row.curriculumBand}/${path.dirname(row.relativePath)}`;
        const startsNewBatch = current === null
            || current.group !== group
            || current.files.length >= maxFiles
            || current.byteLength + row.byteLength > maxBytes;

        if (startsNewBatch) {
            current = {
                id: `batch-${String(batches.length + 1).padStart(4, '0')}`,
                group,
                byteLength: 0,
                files: [],
            };
            batches.push(current);
        }

        current.files.push({
            sourceId: row.sourceId,
            relativePath: row.relativePath,
            sha256: row.sha256,
            byteLength: row.byteLength,
        });
        current.byteLength += row.byteLength;
    }

    return batches;
}

function countsBy(rows, key) {
    const counts = new Map();
    for (const row of rows) {
        const value = row[key];
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right), 'en')));
}

function bytesBy(rows, key) {
    const counts = new Map();
    for (const row of rows) {
        const value = row[key];
        counts.set(value, (counts.get(value) ?? 0) + row.byteLength);
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right), 'en')));
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes;
    let unit = 'B';
    for (const candidate of units) {
        value /= 1024;
        unit = candidate;
        if (value < 1024) break;
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function tsvCell(value) {
    return String(value ?? '')
        .replaceAll('\t', ' ')
        .replaceAll('\r', ' ')
        .replaceAll('\n', ' ');
}

function buildCensusText(rows, summary) {
    const header = [
        '# Yomu Academy complete Japanese source census',
        `# generatedAt\t${summary.generatedAt}`,
        `# regularFiles\t${summary.regularFiles}`,
        `# regularFileBytes\t${summary.regularFileBytes}`,
        `# honenDirectFiles\t${summary.honenDirectFiles}`,
        `# honenDirectBytes\t${summary.honenDirectBytes}`,
        '# sourceId\trelativePath\tsha256\tbyteLength\tkind\tstate\textension\tcurriculumBand\thonenDirect',
    ];
    const lines = rows.map(row => [
        row.sourceId,
        row.relativePath,
        row.sha256,
        row.byteLength,
        row.kind,
        row.state,
        row.extension,
        row.curriculumBand,
        row.honenDirect,
    ].map(tsvCell).join('\t'));
    return `${[...header, ...lines].join('\n')}\n`;
}

function buildSummaryMarkdown(summary, batches) {
    const bandRows = Object.entries(summary.byCurriculumBand)
        .map(([band, count]) => `| \`${band}\` | ${count.toLocaleString('en-GB')} | ${formatBytes(summary.bytesByCurriculumBand[band] ?? 0)} |`)
        .join('\n');
    const directRows = Object.entries(summary.byDirectImport)
        .map(([state, count]) => `| \`${state}\` | ${count.toLocaleString('en-GB')} | ${formatBytes(summary.bytesByDirectImport[state] ?? 0)} |`)
        .join('\n');

    return `# Yomu Academy Honen source census

Generated ${summary.generatedAt}.

This is the transfer ledger for the complete local Japanese library. It does not replace Yomu's canonical lesson packages. Honen may index, summarize, draft, compare, and propose activity variants; Yomu remains the narrative, rendering, SRS, game, accessibility, and release layer.

## Corpus

- Regular files: **${summary.regularFiles.toLocaleString('en-GB')}**
- Bytes: **${formatBytes(summary.regularFileBytes)}**
- Stable unique payloads recorded by the source pipeline: **${summary.uniquePayloadCount.toLocaleString('en-GB')}**
- Honen-direct formats: **${summary.honenDirectFiles.toLocaleString('en-GB')} files / ${formatBytes(summary.honenDirectBytes)}**
- Companion-index formats: **${summary.companionOnlyFiles.toLocaleString('en-GB')} files / ${formatBytes(summary.companionOnlyBytes)}**
- Deterministic direct-upload batches: **${batches.length.toLocaleString('en-GB')}**

## Curriculum bands

| Band | Files | Bytes |
| --- | ---: | ---: |
${bandRows}

## Honen transfer path

| Direct import | Files | Bytes |
| --- | ---: | ---: |
${directRows}

Audio, archives, Anki packages, structured corpora, dictionaries, and unsupported formats remain first-class source records. Their exact paths and hashes are present in \`source-census.txt\`; Yomu's source adapters consume them locally even when Honen's knowledge-base uploader cannot.

## Non-negotiable adaptation contract

1. Preserve source title, relative path, stable source ID, and SHA-256 in instructor-facing records.
2. Never import Honen output as a generic course page. Convert it into Yomu scenes, character dialogue, SRS evidence, games, and reachable map activities.
3. Keep the canonical N+1 order. Honen may enrich a prerequisite already introduced by Yomu; it may not skip or silently reorder it.
4. Keep answers hidden until an attempt. Repairs target the learner's actual miss and return to transfer.
5. Every generated variant must name the exact source rows, pages, audio, or media it uses.
6. A Yomu implementation is complete only after mobile and desktop learner-route proof.
`;
}

export function buildSummary(ledger, rows) {
    const directRows = rows.filter(row => row.honenDirect);
    const companionRows = rows.filter(row => !row.honenDirect);
    return {
        schema: 'yomu-academy.honen-source-census.v1',
        generatedAt: new Date().toISOString(),
        regularFiles: rows.length,
        regularFileBytes: rows.reduce((sum, row) => sum + row.byteLength, 0),
        uniquePayloadCount: ledger.summary?.uniquePayloadCount ?? 0,
        honenDirectFiles: directRows.length,
        honenDirectBytes: directRows.reduce((sum, row) => sum + row.byteLength, 0),
        companionOnlyFiles: companionRows.length,
        companionOnlyBytes: companionRows.reduce((sum, row) => sum + row.byteLength, 0),
        byCurriculumBand: countsBy(rows, 'curriculumBand'),
        bytesByCurriculumBand: bytesBy(rows, 'curriculumBand'),
        byDirectImport: countsBy(rows, 'honenDirect'),
        bytesByDirectImport: bytesBy(rows, 'honenDirect'),
        byKind: countsBy(rows, 'kind'),
        byState: countsBy(rows, 'state'),
    };
}

export function buildHonenSourceBundle({ ledgerPath, outputDir }) {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const rows = buildSourceRows(ledger);
    const summary = buildSummary(ledger, rows);
    const batches = buildUploadBatches(rows);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'source-census.txt'), buildCensusText(rows, summary));
    fs.writeFileSync(path.join(outputDir, 'source-census-summary.md'), buildSummaryMarkdown(summary, batches));
    fs.writeFileSync(path.join(outputDir, 'source-census.v1.json'), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, 'upload-batches.v1.json'), `${JSON.stringify({
        schema: 'yomu-academy.honen-upload-batches.v1',
        generatedAt: summary.generatedAt,
        libraryRoot: ledger.libraryRoot,
        batches,
    }, null, 2)}\n`);

    return { summary, batches, outputDir };
}

function parseArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--ledger') options.ledgerPath = argv[++index];
        else if (arg === '--output') options.outputDir = argv[++index];
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

function main() {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
    const options = parseArguments(process.argv.slice(2));
    const ledgerPath = path.resolve(
        options.ledgerPath
        ?? process.env.ACADEMY_LIBRARY_LEDGER
        ?? path.join(repoRoot, 'artifacts/yomu-academy/source-pipeline/library/library-ledger.v1.json'),
    );
    const outputDir = path.resolve(
        options.outputDir
        ?? process.env.ACADEMY_HONEN_BUNDLE_DIR
        ?? path.join(repoRoot, 'artifacts/yomu-academy/honen'),
    );

    if (!fs.existsSync(ledgerPath)) {
        throw new Error(`Academy library ledger not found: ${ledgerPath}. Run academy:library:scan or pass --ledger.`);
    }

    const result = buildHonenSourceBundle({ ledgerPath, outputDir });
    process.stdout.write(`${JSON.stringify({
        outputDir: result.outputDir,
        regularFiles: result.summary.regularFiles,
        honenDirectFiles: result.summary.honenDirectFiles,
        batches: result.batches.length,
    })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
