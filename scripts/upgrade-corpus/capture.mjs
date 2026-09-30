#!/usr/bin/env node
// Rebuilds tests/reader/fixtures/upgrade-v1.9.3/ from the releases' OWN writers.
//
// Every fixture in that folder is bytes a shipped release persisted, captured by
// running that release's source (not a hand-written imitation) in jsdom with
// recording GM, browser.storage.local, localStorage and fake-indexeddb stubs.
// v2 is then tested against exactly what upgrading learners have on disk.
//
// Each stage runs inside a READ-ONLY detached worktree of its tag, using that
// tag's vite config, defines and test setup:
//
//   git worktree add --detach <dir>/v193-reference  v1.9.3
//   git worktree add --detach <dir>/v1890-reference v1.8.90
//   git worktree add --detach <dir>/v1880-reference v1.8.80
//   ln -s "$PWD/node_modules" <dir>/v193-reference/node_modules   (same for each)
//
//   node scripts/upgrade-corpus/capture.mjs --references <dir> [--stage <name>]
//
// Stages run in order because later ones upgrade the stores earlier ones wrote:
// v1.8.80 (pin store) -> v1.8.90 (unmarked ledger) -> v1.9.3 (every scenario).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const OUT = path.join(repo, 'tests', 'reader', 'fixtures', 'upgrade-v1.9.3');
const STAGES = [
    { stage: 'v1.8.80', tag: 'v1.8.80', checkout: 'v1880-reference' },
    { stage: 'v1.8.90', tag: 'v1.8.90', checkout: 'v1890-reference' },
    { stage: 'v1.9.3-userscript', tag: 'v1.9.3', checkout: 'v193-reference' },
    { stage: 'v1.9.3-extension', tag: 'v1.9.3', checkout: 'v193-reference' },
    { stage: 'v1.9.3-hosted', tag: 'v1.9.3', checkout: 'v193-reference' },
    { stage: 'v1.9.3-indexeddb', tag: 'v1.9.3', checkout: 'v193-reference' },
    { stage: 'v1.9.3-backup', tag: 'v1.9.3', checkout: 'v193-reference' },
];

function option(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index > 0 ? process.argv[index + 1] : undefined;
}

function git(root, args) {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${root}: ${result.stderr}`);
    return result.stdout.trim();
}

function verifiedCheckout(references, { tag, checkout }) {
    const root = path.join(references, checkout);
    if (!existsSync(path.join(root, 'vite.config.ts'))) throw new Error(`Missing ${tag} checkout at ${root}.`);
    const head = git(root, ['rev-parse', 'HEAD']);
    const tagged = git(root, ['rev-parse', `${tag}^{commit}`]);
    if (head !== tagged) throw new Error(`${root} is at ${head}, not ${tag} (${tagged}).`);
    const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']);
    if (dirty) throw new Error(`${root} has local modifications; the corpus must come from the tagged source.`);
    return { root, commit: head };
}

function runStage(entry, { root, commit }) {
    console.log(`[upgrade-corpus] ${entry.stage} from ${entry.tag} (${commit.slice(0, 9)})`);
    const vitest = path.join(repo, 'node_modules', 'vitest', 'vitest.mjs');
    const result = spawnSync(process.execPath, [
        vitest, 'run', '--config', path.join(here, 'vitest.capture.config.mjs'), '--root', root,
    ], {
        cwd: root,
        stdio: 'inherit',
        env: {
            ...process.env,
            YOMU_CAPTURE_ROOT: root,
            YOMU_CAPTURE_STAGE: entry.stage,
            YOMU_CAPTURE_OUT: OUT,
            YOMU_CAPTURE_COMMIT: commit,
            YOMU_CAPTURE_TAG: entry.tag,
        },
    });
    if (result.status !== 0) throw new Error(`Stage ${entry.stage} failed.`);
    return { stage: entry.stage, tag: entry.tag, commit };
}

function writeManifest(ran) {
    const scenarios = readdirSync(OUT)
        .filter(file => file.endsWith('.json') && file !== 'manifest.json')
        .sort()
        .map(file => {
            const fixture = JSON.parse(readFileSync(path.join(OUT, file), 'utf8'));
            return { file, scenario: fixture.scenario, channel: fixture.channel, producedBy: fixture.producedBy };
        });
    const manifest = {
        description: 'Bytes persisted by shipped releases, captured by scripts/upgrade-corpus/capture.mjs.',
        compilerStoragePrefix: 'usc_https_github_com_HRussellZFAC023_yomu_reader_',
        stages: ran,
        scenarios,
    };
    writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const references = option('references');
if (!references) {
    console.error('Usage: node scripts/upgrade-corpus/capture.mjs --references <dir with v1880/v1890/v193-reference> [--stage <name>]');
    process.exit(2);
}
const only = option('stage');
const selected = STAGES.filter(entry => !only || entry.stage === only);
if (!selected.length) throw new Error(`Unknown stage ${only}; expected one of ${STAGES.map(entry => entry.stage).join(', ')}.`);
// Every checkout is verified before anything is written, and a full capture
// starts clean so a renamed or dropped scenario cannot linger.
const checkouts = selected.map(entry => verifiedCheckout(path.resolve(references), entry));
if (!only) rmSync(OUT, { recursive: true, force: true });
const ran = selected.map((entry, index) => runStage(entry, checkouts[index]));
if (!only) writeManifest(ran);
