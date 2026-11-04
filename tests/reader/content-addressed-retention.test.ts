import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { RELEASE_RETENTION_COUNT, SUPPORTED_RELEASE_REFS, contentAddressedRetentionManifest, contentAddressedRetentionReport, isShallowRepository, pinnedArtifactPaths, restoreRetainedContentAddressedAssets, retentionManifestIsCurrent, retentionManifestShortfall } from '../../scripts/lib/content-addressed-retention.mjs';

const repositories: string[] = [];

afterEach(() => {
    for (const repository of repositories.splice(0)) rmSync(repository, { recursive: true, force: true });
});

function header(companionHash: string, cssHash: string): string {
    return `// ==UserScript==
// @require https://yomureader.com/greasyfork/yomu-runtime.${companionHash}.user.js#sha256=fake
// @resource yomuCss https://yomureader.com/yomu.${cssHash}.css#sha256=fake
// ==/UserScript==
`;
}

function write(root: string, path: string, contents: string | Uint8Array = 'artifact\n'): void {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
}

const PRIOR_RELEASE_PINS = [
    { prefix: 'docs/public/greasyfork/yomu-runtime.', suffix: '.user.js', data: 'prior release runtime\n' },
    { prefix: 'docs/public/yomu.', suffix: '.css', data: 'prior release stylesheet\n' },
].map(pin => ({
    path: `${pin.prefix}${createHash('sha256').update(pin.data).digest('hex').slice(0, 12)}${pin.suffix}`,
    integrity: createHash('sha256').update(pin.data).digest('base64'),
    data: pin.data,
}));
const PRIOR_RELEASE_HEADER = `// ==UserScript==
// @version 2.2.2
// @require https://yomureader.com/${PRIOR_RELEASE_PINS[0].path.slice('docs/public/'.length)}#sha256=${PRIOR_RELEASE_PINS[0].integrity}
// @resource yomuCss https://yomureader.com/${PRIOR_RELEASE_PINS[1].path.slice('docs/public/'.length)}#sha256=${PRIOR_RELEASE_PINS[1].integrity}
// ==/UserScript==
`;

function releasedRepository(): string {
    const root = repository();
    // Match the release hand-off: the manifest predates 2.2.2, whose current
    // header was sufficient to protect its new pins until the next build.
    write(root, 'config/ci/content-addressed-retention.json', `${JSON.stringify(contentAddressedRetentionManifest(root))}\n`);
    for (const pin of PRIOR_RELEASE_PINS) write(root, pin.path, pin.data);
    write(root, 'dist/yomu.user.js', PRIOR_RELEASE_HEADER);
    write(root, 'docs/public/yomu.user.js', PRIOR_RELEASE_HEADER);
    git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'prior release graph');
    git(root, '-c', 'tag.gpgSign=false', 'tag', 'v2.2.2');
    return root;
}

function installPruner(root: string): string {
    for (const path of ['scripts/prune-content-addressed-assets.mjs', 'scripts/lib/content-addressed-retention.mjs']) {
        write(root, path, readFileSync(join(process.cwd(), path)));
    }
    return join(root, 'scripts/prune-content-addressed-assets.mjs');
}

function git(root: string, ...args: string[]): void {
    execFileSync('git', args, { cwd: root, stdio: 'pipe' });
}

function cloneRepository(source: string, options: string[]): string {
    const clone = mkdtempSync(join(tmpdir(), 'yomu-retention-clone-'));
    repositories.push(clone);
    execFileSync('git', ['-c', 'core.autocrlf=false', 'clone', '--quiet', ...options, pathToFileURL(source).href, clone], { stdio: 'pipe' });
    return clone;
}

function writeNextBuild(root: string): void {
    writeCurrentBuild(root, header('555555555555', '666666666666'));
}

function writeCurrentBuild(root: string, next: string): void {
    write(root, 'dist/yomu.user.js', next); write(root, 'docs/public/yomu.user.js', next);
    for (const path of pinnedArtifactPaths(next)) write(root, path);
}

function expectPriorReleaseBytes(root: string): void {
    for (const pin of PRIOR_RELEASE_PINS) {
        expect(createHash('sha256').update(readFileSync(join(root, pin.path))).digest('base64')).toBe(pin.integrity);
    }
}

function repository(): string {
    const root = mkdtempSync(join(tmpdir(), 'yomu-retention-'));
    repositories.push(root);
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.name', 'retention test');
    git(root, 'config', 'user.email', 'retention@example.test');

    const storeHeader = header('111111111111', '222222222222');
    write(root, 'dist/yomu.user.js', storeHeader);
    write(root, 'docs/public/yomu.user.js', storeHeader);
    write(root, 'docs/public/greasyfork/yomu-runtime.111111111111.user.js');
    write(root, 'docs/public/yomu.222222222222.css');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'store release');
    git(root, '-c', 'tag.gpgSign=false', 'tag', 'v1.8.2');

    const currentHeader = header('333333333333', '444444444444');
    write(root, 'dist/yomu.user.js', currentHeader);
    write(root, 'docs/public/yomu.user.js', currentHeader);
    write(root, 'docs/public/greasyfork/yomu-runtime.333333333333.user.js');
    write(root, 'docs/public/yomu.444444444444.css');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'current release');
    git(root, '-c', 'tag.gpgSign=false', 'tag', 'v1.8.43');
    return root;
}

describe('content-addressed artifact retention', () => {
    it('builds retention from full release history without fetching historical Academy blobs', () => {
        const workflow = readFileSync(join(process.cwd(), '.github/workflows/build-userscript.yml'), 'utf8');
        const checkout = workflow.split('actions/checkout@v6')[1]?.split('- uses:')[0] ?? '';
        expect(checkout).toMatch(/fetch-depth:\s*0/);
        expect(checkout).toMatch(/fetch-tags:\s*true/);
        expect(checkout).toMatch(/filter:\s*blob:none/);
    });

    it('refuses retention planning when Git cannot read the repository', () => {
        const root = mkdtempSync(join(tmpdir(), 'yomu-retention-unavailable-'));
        repositories.push(root);
        // Coverage temp directories can be inside this checkout; block parent Git discovery.
        write(root, '.git', 'gitdir: missing-retention-repository\n');
        expect(() => isShallowRepository(root)).toThrow('refusing to prune assets');
        expect(() => contentAddressedRetentionReport(root)).toThrow('refusing to prune assets');
    });

    it('extracts immutable companion and stylesheet pins from a userscript header', () => {
        expect([...pinnedArtifactPaths(header('abcdef123456', '654321fedcba'))]).toEqual([
            'docs/public/greasyfork/yomu-runtime.abcdef123456.user.js',
            'docs/public/yomu.654321fedcba.css',
        ]);
    });

    it('keeps current, recent-release, and frozen-store pins while reporting unrelated files', () => {
        const root = repository();
        write(root, 'docs/public/greasyfork/yomu-runtime.aaaaaaaaaaaa.user.js', 'stale companion\n');
        write(root, 'docs/public/yomu.bbbbbbbbbbbb.css', 'stale css\n');

        const report = contentAddressedRetentionReport(root);

        expect(report.missing).toEqual([]);
        expect(report.retained).toEqual([
            'docs/public/greasyfork/yomu-runtime.111111111111.user.js',
            'docs/public/greasyfork/yomu-runtime.333333333333.user.js',
            'docs/public/yomu.222222222222.css',
            'docs/public/yomu.444444444444.css',
        ]);
        expect(report.stale).toEqual([
            'docs/public/greasyfork/yomu-runtime.aaaaaaaaaaaa.user.js',
            'docs/public/yomu.bbbbbbbbbbbb.css',
        ]);
    });

    it('keeps the same historical release pins when the current header receives its release tag', () => {
        const root = mkdtempSync(join(tmpdir(), 'yomu-retention-tag-transition-'));
        repositories.push(root);
        git(root, 'init', '--quiet');
        git(root, 'config', 'user.name', 'retention test');
        git(root, 'config', 'user.email', 'retention@example.test');
        const oldest = header('111111111111', '222222222222');
        const hosted = header('333333333333', '444444444444');
        write(root, 'dist/yomu.user.js', oldest);
        write(root, 'docs/public/yomu.user.js', hosted);
        for (const path of pinnedArtifactPaths(oldest + hosted)) write(root, path);
        git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'oldest release has a unique dist-only pin');
        git(root, '-c', 'tag.gpgSign=false', 'tag', 'v1.0.0');

        write(root, 'dist/yomu.user.js', hosted);
        git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'later historical release');
        for (let index = 1; index < RELEASE_RETENTION_COUNT; index += 1) {
            git(root, '-c', 'tag.gpgSign=false', 'tag', `v1.0.${index}`);
        }
        const current = header('555555555555', '666666666666').replace('// ==UserScript==', '// ==UserScript==\n// @version 2.3.1');
        writeCurrentBuild(root, current);
        git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'current release before publication');
        const before = contentAddressedRetentionManifest(root);
        const report = contentAddressedRetentionReport(root);
        expect(before.retainedPaths).toEqual(expect.arrayContaining([...pinnedArtifactPaths(oldest)]));
        expect(report.stale).toEqual([]);

        git(root, '-c', 'tag.gpgSign=false', 'tag', 'v2.3.1');

        expect(contentAddressedRetentionManifest(root)).toEqual(before);
        expect(contentAddressedRetentionReport(root)).toEqual(report);

        const rebuilt = header('777777777777', '888888888888').replace('// ==UserScript==', '// ==UserScript==\n// @version 2.3.1');
        writeCurrentBuild(root, rebuilt);
        git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'different current bytes under the same version');

        const rebuiltReport = contentAddressedRetentionReport(root);
        expect(rebuiltReport.stale).toEqual([...pinnedArtifactPaths(oldest)].sort());
        expect(rebuiltReport.retained).toEqual(expect.arrayContaining([...pinnedArtifactPaths(current)]));
    });

    it('fails closed when a supported header pins a file that is absent', () => {
        const root = repository();
        rmSync(join(root, 'docs/public/yomu.222222222222.css'));

        expect(contentAddressedRetentionReport(root).missing).toEqual([
            'docs/public/yomu.222222222222.css',
        ]);
    });

    // This used to assert `toContain('v1.8.2')`, which froze a measurement into a
    // test: the pin stayed on 1.8.2 for ~70 patch releases because the repo believed
    // only a `v*.*.0` tag can publish to a browser store. `release.yml`'s
    // `publish_browser_stores` input publishes patch builds too, and it did — AMO
    // serves 1.8.72 and the Chrome Web Store 1.8.71 (measured 2026-08-04). So assert
    // the SHAPE of the pin plus the floor we measured, and name the debunked value so
    // it cannot come back silently.
    it('documents a week-sized release window and pins the published store builds', () => {
        expect(RELEASE_RETENTION_COUNT).toBe(40);
        expect(SUPPORTED_RELEASE_REFS.length).toBeGreaterThan(0);
        for (const ref of SUPPORTED_RELEASE_REFS) expect(ref).toMatch(/^v\d+\.\d+\.\d+$/);
        expect(SUPPORTED_RELEASE_REFS).not.toContain('v1.8.2');
        expect(SUPPORTED_RELEASE_REFS).toEqual(['v1.8.88']);
    });

    // The gate used to demand byte equality with a freshly computed manifest, so every
    // release shifted the tag window, the committed file stopped matching, and
    // check:release went red at its second stage for everyone (A43). The two
    // directions are not symmetric, and only one of them is dangerous.
    it('tolerates a manifest that retains more than history still pins', () => {
        const source = repository();
        const manifest = contentAddressedRetentionManifest(source);
        const generous = {
            ...manifest,
            retainedPaths: [...manifest.retainedPaths, 'docs/public/greasyfork/yomu-anki.deadbeef0000.user.js'].sort(),
        };
        write(source, 'config/ci/content-addressed-retention.json', `${JSON.stringify(generous, null, 2)}\n`);
        git(source, 'add', '.');
        git(source, 'commit', '--quiet', '-m', 'generous retention manifest');

        // Harmless: a shallow checkout simply retains one path longer than needed,
        // which is exactly what a release leaves behind as a tag ages out.
        const shortfall = retentionManifestShortfall(source);
        expect(shortfall.ok).toBe(true);
        expect(shortfall.missingFromManifest).toEqual([]);
        expect(shortfall.extraInManifest).toEqual(['docs/public/greasyfork/yomu-anki.deadbeef0000.user.js']);
        expect(retentionManifestIsCurrent(source)).toBe(true);
    });

    it('fails when the manifest omits an artifact history still pins', () => {
        const source = repository();
        const manifest = contentAddressedRetentionManifest(source);
        expect(manifest.retainedPaths.length).toBeGreaterThan(0);
        const [dropped, ...kept] = manifest.retainedPaths;
        write(source, 'config/ci/content-addressed-retention.json', `${JSON.stringify({ ...manifest, retainedPaths: kept }, null, 2)}\n`);
        git(source, 'add', '.');
        git(source, 'commit', '--quiet', '-m', 'short retention manifest');

        // Dangerous: a shallow checkout would prune an artifact a published userscript
        // still pins by hash, which 404s its @require for everyone on that version.
        const shortfall = retentionManifestShortfall(source);
        expect(shortfall.ok).toBe(false);
        expect(shortfall.missingFromManifest).toEqual([dropped]);
        expect(retentionManifestIsCurrent(source)).toBe(false);
    });

    it('uses the committed retention manifest when CI checks out one shallow commit', () => {
        const source = repository();
        const manifest = contentAddressedRetentionManifest(source);
        write(source, 'config/ci/content-addressed-retention.json', `${JSON.stringify(manifest, null, 2)}\n`);
        git(source, 'add', '.');
        git(source, 'commit', '--quiet', '-m', 'retention manifest');
        expect(retentionManifestIsCurrent(source)).toBe(true);

        const clone = cloneRepository(source, ['--depth', '1']);

        expect(isShallowRepository(clone)).toBe(true);
        const report = contentAddressedRetentionReport(clone);
        expect(report.missing).toEqual([]);
        expect(report.stale).toEqual([]);
        expect(report.retained).toEqual(manifest.retainedPaths);
    });

    it('retains the immediately previous release pins when a shallow build replaces both current headers', () => {
        const source = releasedRepository();
        const clone = cloneRepository(source, ['--depth', '1']);
        expect(isShallowRepository(clone)).toBe(true);
        writeNextBuild(clone);
        const report = contentAddressedRetentionReport(clone);
        for (const pin of PRIOR_RELEASE_PINS) {
            expect(report.retained, pin.path).toContain(pin.path);
            expect(report.stale, pin.path).not.toContain(pin.path);
        }
    });

    it('repairs already-pruned previous release pins from a blob-filtered release history before pruning again', () => {
        const source = releasedRepository();
        writeNextBuild(source);
        for (const pin of PRIOR_RELEASE_PINS) rmSync(join(source, pin.path));
        git(source, 'add', '.'); git(source, 'commit', '--quiet', '-m', 'previous shallow build pruned published pins');
        git(source, 'config', 'uploadpack.allowFilter', 'true');
        const clone = cloneRepository(source, ['--filter=blob:none']);
        git(clone, 'config', 'protocol.file.allow', 'always');
        expect(isShallowRepository(clone)).toBe(false);
        expect(contentAddressedRetentionReport(clone).missing).toEqual(PRIOR_RELEASE_PINS.map(pin => pin.path));
        const pruner = installPruner(clone);
        const log = execFileSync(process.execPath, [pruner, '--write'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
        for (const pin of PRIOR_RELEASE_PINS) {
            expect(log).toContain(`restored ${pin.path} from v2.2.2`);
        }
        expectPriorReleaseBytes(clone);
        expect(contentAddressedRetentionReport(clone).missing).toEqual([]);
        expect(retentionManifestShortfall(clone).ok).toBe(true);
        // Child CLI execution is a separate entrypoint proof. Exercise the actual
        // imported recovery API too so Istanbul measures these verified writes.
        for (const pin of PRIOR_RELEASE_PINS) rmSync(join(clone, pin.path));
        expect(restoreRetainedContentAddressedAssets(clone)).toEqual(PRIOR_RELEASE_PINS.map(pin => ({
            path: pin.path, ref: 'v2.2.2', bytes: Buffer.byteLength(pin.data),
        })));
        expectPriorReleaseBytes(clone);
        expect(restoreRetainedContentAddressedAssets(clone)).toEqual([]);
        execFileSync(process.execPath, [pruner, '--write'], { stdio: 'pipe' });
        expect(contentAddressedRetentionReport(clone).missing).toEqual([]);
    });

    it('refuses to recreate a pin from Git bytes that do not match its content-addressed hash', () => {
        const root = repository();
        const hash = createHash('sha256').update('expected immutable bytes\n').digest('hex').slice(0, 12);
        const pin = `docs/public/greasyfork/yomu-runtime.${hash}.user.js`;
        const broken = header(hash, '444444444444');
        write(root, 'dist/yomu.user.js', broken); write(root, 'docs/public/yomu.user.js', broken);
        write(root, pin, 'corrupt stored bytes\n');
        git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'invalid immutable bytes');
        rmSync(join(root, pin));
        const pruner = installPruner(root);
        expect(() => execFileSync(process.execPath, [pruner, '--write'], { stdio: 'pipe' }))
            .toThrow('Cannot recover required content-addressed asset from Git');
        expect(() => restoreRetainedContentAddressedAssets(root)).toThrow('Cannot recover required content-addressed asset from Git');
        expect(existsSync(join(root, pin))).toBe(false);
        expect(existsSync(join(root, 'docs/public/yomu.222222222222.css'))).toBe(true);
    });

    it('stops before manifest changes or pruning when a historical blob cannot be fetched', () => {
        const source = releasedRepository();
        git(source, 'config', 'uploadpack.allowFilter', 'true');
        const clone = cloneRepository(source, ['--filter=blob:none']);
        const oldHeader = execFileSync('git', ['rev-parse', 'v1.8.43:dist/yomu.user.js'], { cwd: clone, encoding: 'utf8' }).trim();
        const missing = execFileSync('git', ['rev-list', '--objects', '--all', '--missing=print'], { cwd: clone, encoding: 'utf8' });
        expect(missing).toContain(`?${oldHeader}`);
        git(clone, 'remote', 'set-url', 'origin', pathToFileURL(join(source, 'unavailable')).href);
        const stale = 'docs/public/yomu.bbbbbbbbbbbb.css';
        write(clone, stale, 'must not be pruned after a failed history read\n');
        const manifest = readFileSync(join(clone, 'config/ci/content-addressed-retention.json'));
        const pruner = installPruner(clone);
        expect(() => execFileSync(process.execPath, [pruner, '--write'], { stdio: 'pipe' }))
            .toThrow('Cannot read Git retention history; refusing to prune assets');
        expect(readFileSync(join(clone, 'config/ci/content-addressed-retention.json'))).toEqual(manifest);
        expect(existsSync(join(clone, stale))).toBe(true);
        expect(() => contentAddressedRetentionReport(clone)).toThrow('Cannot read Git retention history');
    });
});
