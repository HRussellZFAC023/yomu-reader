// The product a Recorded Page runs: this worktree's build, or a released one
// read out of git (so a gate can show it fails on the old release), as the
// files a userscript manager loads — dist/yomu.user.js, the companions its
// @require lines name, and dist/yomu.css for @resource — plus the build's
// docs/public, which answers requests for yomureader.com.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { userscriptCompanionPaths } from './smoke-test-helpers.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTENT_TYPES = new Map([
    ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json'], ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'],
    ['.jpg', 'image/jpeg'], ['.woff2', 'font/woff2'], ['.mp3', 'audio/mpeg'], ['.txt', 'text/plain; charset=utf-8'],
    ['.gz', 'application/gzip'],
]);

export function worktreeProduct(root = REPO_ROOT) {
    return userscriptProduct(root, 'worktree');
}

export function releaseProduct(tag, { repoRoot = REPO_ROOT } = {}) {
    if (!/^v\d+\.\d+\.\d+$/u.test(tag)) throw new Error(`Release tags look like v2.1.6, not ${tag}`);
    const root = path.join(tmpdir(), 'yomu-release-products', tag);
    if (!existsSync(path.join(root, 'dist', 'yomu.user.js'))) extractRelease(tag, repoRoot, root);
    return userscriptProduct(root, tag);
}

function extractRelease(tag, repoRoot, root) {
    ensureTag(tag, repoRoot);
    const show = file => execFileSync('git', ['show', `${tag}:${file}`], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
    const write = (file, bytes) => {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), bytes);
    };
    const core = show('dist/yomu.user.js');
    for (const name of requiredCompanionNames(core.toString('utf8'))) write(`docs/public/greasyfork/${name}`, show(`docs/public/greasyfork/${name}`));
    write('dist/yomu.css', show('dist/yomu.css'));
    write('dist/yomu.user.js', core);
}

function requiredCompanionNames(source) {
    return [...source.matchAll(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s/]+)/gmu)].map(match => match[1]);
}

// CI checks out one commit without tags; fetch just the one a gate names.
function ensureTag(tag, repoRoot) {
    const quiet = { cwd: repoRoot, stdio: 'ignore' };
    try {
        execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], quiet);
        return;
    } catch {
        // Not here yet.
    }
    try {
        execFileSync('git', ['fetch', '--depth=1', '--no-tags', 'origin', `refs/tags/${tag}:refs/tags/${tag}`], quiet);
    } catch {
        throw new Error(`The ${tag} product needs the ${tag} tag; git fetch origin tag ${tag} failed.`);
    }
}

function userscriptProduct(root, label) {
    const scriptPath = path.join(root, 'dist', 'yomu.user.js');
    const cssPath = path.join(root, 'dist', 'yomu.css');
    if (!existsSync(scriptPath)) throw new Error(`The ${label} product has no ${scriptPath}. Run npm run build first.`);
    const missing = [cssPath, ...userscriptCompanionPaths(scriptPath)].filter(file => !existsSync(file));
    if (missing.length) throw new Error(`The ${label} product is missing ${missing.join(', ')}. Run npm run build first.`);
    return { kind: 'userscript', label, root, scriptPath, cssPath, hostedRoot: path.join(root, 'docs', 'public') };
}

/** The build's own copy of a yomureader.com file, or null. */
export function hostedFile(product, url) {
    const parsed = URL.canParse(url) ? new URL(url) : null;
    return parsed?.hostname === 'yomureader.com' ? hostedPath(product, parsed.pathname) : null;
}

function hostedPath(product, pathname) {
    const relative = decodeURIComponent(pathname).replace(/^\/+/u, '').replace(/(^|\/)$/u, '$1index.html');
    const file = path.resolve(product.hostedRoot, relative);
    return file.startsWith(`${product.hostedRoot}${path.sep}`) && existsSync(file) ? file : null;
}

export function hostedAnswer(file) {
    return { status: 200, contentType: CONTENT_TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream', body: readFileSync(file) };
}
