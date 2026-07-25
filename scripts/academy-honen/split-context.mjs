import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function safeStem(filePath) {
    return path.basename(filePath, path.extname(filePath))
        .replaceAll(/[^A-Za-z0-9._-]+/g, '-')
        .replaceAll(/^-+|-+$/g, '');
}

export function splitUtf8Buffer(buffer, maxBytes = DEFAULT_MAX_BYTES) {
    if (!Buffer.isBuffer(buffer)) throw new TypeError('A Buffer is required.');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024) {
        throw new RangeError('maxBytes must be an integer of at least 1024.');
    }

    const chunks = [];
    let cursor = 0;

    while (cursor < buffer.length) {
        let end = Math.min(cursor + maxBytes, buffer.length);
        if (end < buffer.length) {
            const newline = buffer.lastIndexOf(0x0a, end);
            if (newline > cursor) end = newline + 1;
        }
        if (end <= cursor) end = Math.min(cursor + maxBytes, buffer.length);
        chunks.push(buffer.subarray(cursor, end));
        cursor = end;
    }

    return chunks;
}

export function splitContextFile({
    inputPath,
    outputDir,
    maxBytes = DEFAULT_MAX_BYTES,
}) {
    const resolvedInput = path.resolve(inputPath);
    const resolvedOutput = path.resolve(outputDir);
    const source = fs.readFileSync(resolvedInput);
    const sourceHash = sha256(source);
    const chunks = splitUtf8Buffer(source, maxBytes);
    const width = Math.max(3, String(chunks.length).length);
    const stem = safeStem(resolvedInput);

    fs.mkdirSync(resolvedOutput, { recursive: true });

    const parts = chunks.map((chunk, index) => {
        const partNumber = index + 1;
        const filename = `${stem}--part-${String(partNumber).padStart(width, '0')}-of-${String(chunks.length).padStart(width, '0')}.md`;
        const header = Buffer.from([
            `# ${path.basename(resolvedInput)} — part ${partNumber} of ${chunks.length}`,
            '',
            `- Source path: \`${resolvedInput}\``,
            `- Source SHA-256: \`${sourceHash}\``,
            `- Source bytes: ${source.length}`,
            `- Part payload bytes: ${chunk.length}`,
            '',
            '---',
            '',
        ].join('\n'));
        const output = Buffer.concat([header, chunk]);
        const outputPath = path.join(resolvedOutput, filename);
        fs.writeFileSync(outputPath, output);
        return {
            partNumber,
            filename,
            outputPath,
            payloadBytes: chunk.length,
            outputBytes: output.length,
            sha256: sha256(output),
        };
    });

    return {
        sourcePath: resolvedInput,
        sourceBytes: source.length,
        sourceSha256: sourceHash,
        maxPayloadBytes: maxBytes,
        partCount: parts.length,
        parts,
    };
}

function parseArguments(argv) {
    const options = { inputs: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--input') options.inputs.push(argv[++index]);
        else if (arg === '--output') options.outputDir = argv[++index];
        else if (arg === '--max-bytes') options.maxBytes = Number(argv[++index]);
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

function main() {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
    const options = parseArguments(process.argv.slice(2));
    if (options.inputs.length === 0) throw new Error('Pass at least one --input path.');

    const outputDir = path.resolve(
        options.outputDir
        ?? path.join(repoRoot, 'artifacts/yomu-academy/honen/context-parts'),
    );
    const files = options.inputs.map(inputPath => splitContextFile({
        inputPath,
        outputDir,
        maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    }));
    const manifest = {
        schema: 'yomu-academy.honen-context-parts.v1',
        generatedAt: new Date().toISOString(),
        outputDir,
        files,
    };
    fs.writeFileSync(
        path.join(outputDir, 'context-parts.v1.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify({
        outputDir,
        sources: files.length,
        parts: files.reduce((sum, file) => sum + file.partCount, 0),
    })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
