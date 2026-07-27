#!/usr/bin/env node
// Stages the demo footage this clip films over.
//
//   npm run frames
//
// The source frames are copyrighted game captures kept OUTSIDE the product
// repository (references/ is gitignored and scripts/check-repository-hygiene.mjs
// refuses to let it be tracked), so they are converted into public/frames/ —
// also gitignored — at render time rather than committed.
//
// If the reference frames are absent the script still produces valid, clearly
// labelled stand-ins so `npm run render` works on a clean checkout; the motion
// design is then reviewable even though the footage is not the real thing.

import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const repoRoot = resolve(projectRoot, '..');
const outputDirectory = join(projectRoot, 'public', 'frames');

const FRAMES = [
    { source: 'p5r-leblanc-morgana-dialogue-1920x1080.webp', output: 'scene-1.jpg', placeholder: '0x2a1408' },
    { source: 'p5r-scene-2-1920x1080.webp', output: 'scene-2.jpg', placeholder: '0x241a2e' },
];

async function exists(path) {
    try {
        await access(path, constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

// references/ lives at the repository root in a normal checkout, but a git
// worktree gets its own root while the (gitignored) corpus stays in the primary
// tree — so walk up until the directory turns up, and let an env var win.
async function findReferenceRoot() {
    const candidates = [];
    if (process.env.YOMU_VIDEO_FRAMES_DIR) candidates.push(resolve(process.env.YOMU_VIDEO_FRAMES_DIR));
    let cursor = repoRoot;
    for (let depth = 0; depth < 6; depth++) {
        candidates.push(join(cursor, 'references', 'style-persona'));
        const parent = dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
    }
    for (const candidate of candidates) {
        if (await exists(candidate)) return candidate;
    }
    return candidates[1] ?? candidates[0];
}

async function convert(sourcePath, outputPath) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', sourcePath, '-vf', 'scale=1920:1080', '-q:v', '2', outputPath]);
}

async function writePlaceholder(outputPath, colour) {
    await run('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-f', 'lavfi', '-i', `color=c=${colour}:s=1920x1080`,
        '-frames:v', '1', '-q:v', '2', outputPath,
    ]);
}

async function main() {
    await mkdir(outputDirectory, { recursive: true });
    const referenceRoot = await findReferenceRoot();
    let missing = 0;
    for (const frame of FRAMES) {
        const sourcePath = join(referenceRoot, frame.source);
        const outputPath = join(outputDirectory, frame.output);
        if (await exists(sourcePath)) {
            await convert(sourcePath, outputPath);
            console.log(`${frame.output}  <-  ${sourcePath}`);
            continue;
        }
        missing += 1;
        await writePlaceholder(outputPath, frame.placeholder);
        console.warn(`${frame.output}  <-  PLACEHOLDER (missing ${sourcePath})`);
    }

    await writeFile(
        join(outputDirectory, 'source.json'),
        `${JSON.stringify({ referenceRoot, usingPlaceholders: missing > 0, frames: FRAMES.map(frame => frame.output) }, null, 2)}\n`,
        'utf8',
    );

    if (missing > 0) {
        console.warn(`\n${missing} reference frame(s) missing. Put the captures in ${referenceRoot} and re-run for the real footage.`);
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
