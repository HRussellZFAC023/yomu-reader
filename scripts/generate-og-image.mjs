// Keep the reviewed raster social card byte-for-byte linked to its editable SVG.
//
// Sharp/libvips can encode equivalent PNGs differently across platforms. The
// committed golden raster is therefore the portable artifact: --check verifies
// the exact bytes of the reviewed SVG/PNG pair and its render recipe from a
// small SHA-256 manifest, without re-rendering it on the checking machine.
// These hashes detect pair drift; they do not prove that the PNG was derived
// from the SVG. That assurance comes from visually reviewing a refreshed
// candidate before committing it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRelativePath = 'docs/public/og-image.svg';
const outputRelativePath = 'docs/public/og-image.png';
const manifestRelativePath = 'docs/public/og-image.generated.json';
const generatorRelativePath = 'scripts/generate-og-image.mjs';
const sourcePath = join(root, sourceRelativePath);
const outputPath = join(root, outputRelativePath);
const manifestPath = join(root, manifestRelativePath);
const generatorPath = join(root, generatorRelativePath);
const packageLockPath = join(root, 'package-lock.json');
const expectedWidth = 1200;
const expectedHeight = 630;
const manifestSchemaVersion = 1;
const checkOnly = process.argv.includes('--check');
const refreshGolden = process.argv.includes('--refresh-golden');

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function lockedSharpVersion() {
    const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
    const version = packageLock.packages?.['node_modules/sharp']?.version;
    if (typeof version !== 'string' || version.length === 0) {
        throw new Error('package-lock.json does not pin node_modules/sharp.');
    }
    return version;
}

function pngDimensions(bytes) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (
        bytes.length < 24
        || !bytes.subarray(0, signature.length).equals(signature)
        || bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
    ) {
        return null;
    }
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
    };
}

function expectedManifest(sourceBytes, outputBytes) {
    return {
        schemaVersion: manifestSchemaVersion,
        contract: 'reviewed-golden-raster-link-v1',
        verification: 'pair-integrity-only',
        reviewedSvg: {
            path: sourceRelativePath,
            sha256: sha256(sourceBytes),
        },
        goldenRaster: {
            path: outputRelativePath,
            sha256: sha256(outputBytes),
            width: expectedWidth,
            height: expectedHeight,
        },
        renderRecipe: {
            path: generatorRelativePath,
            sha256: sha256(readFileSync(generatorPath)),
            renderer: `sharp@${lockedSharpVersion()}`,
        },
    };
}

function readManifest() {
    if (!existsSync(manifestPath)) return null;
    try {
        return JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
        return null;
    }
}

function pngFreshnessIssues(outputBytes) {
    const dimensions = pngDimensions(outputBytes);
    if (!dimensions) return [`${outputRelativePath} is not a PNG`];
    if (dimensions.width === expectedWidth && dimensions.height === expectedHeight) return [];
    return [
        `${outputRelativePath} is ${dimensions.width}x${dimensions.height}; expected ${expectedWidth}x${expectedHeight}`,
    ];
}

function freshnessIssues(manifest, sourceBytes, outputBytes) {
    if (!manifest) return [`${manifestRelativePath} is missing or invalid JSON`];
    if (!outputBytes) return [`${outputRelativePath} is missing`];

    const expected = expectedManifest(sourceBytes, outputBytes);
    const manifestIssues = JSON.stringify(manifest) === JSON.stringify(expected)
        ? []
        : [`${manifestRelativePath} pair hashes or render recipe do not match the committed files`];
    return [...manifestIssues, ...pngFreshnessIssues(outputBytes)];
}

const sourceBytes = readFileSync(sourcePath);
const currentOutput = existsSync(outputPath) ? readFileSync(outputPath) : null;
const issues = freshnessIssues(readManifest(), sourceBytes, currentOutput);

if (checkOnly && refreshGolden) {
    throw new Error('--check and --refresh-golden cannot be used together.');
}

if (issues.length === 0 && !refreshGolden) {
    console.log(`✓ ${outputRelativePath} matches the reviewed golden-pair hashes without rendering.`);
    process.exit(0);
}

if (!refreshGolden) {
    console.error(`${outputRelativePath} golden-pair contract is stale:`);
    for (const issue of issues) console.error(`- ${issue}`);
    console.error('Refusing to replace the golden raster during a routine build or check.');
    console.error('Run npm run docs:og-image -- --refresh-golden, then visually review the PNG before committing it.');
    process.exit(1);
}

const { default: sharp } = await import('sharp');
const rendered = await sharp(sourceBytes, { density: 96 })
    .resize(expectedWidth, expectedHeight, { fit: 'fill' })
    .png({
        adaptiveFiltering: false,
        compressionLevel: 9,
        force: true,
        palette: false,
    })
    .toBuffer();

const renderedDimensions = pngDimensions(rendered);
if (renderedDimensions?.width !== expectedWidth || renderedDimensions?.height !== expectedHeight) {
    throw new Error(`Sharp produced an invalid ${outputRelativePath}.`);
}

writeFileSync(outputPath, rendered);
writeFileSync(manifestPath, `${JSON.stringify(expectedManifest(sourceBytes, rendered), null, 2)}\n`);
console.log(`✓ Rendered a candidate ${outputRelativePath} and refreshed its pair-integrity manifest.`);
console.log('  Visually review the PNG against the SVG before committing the golden pair.');
