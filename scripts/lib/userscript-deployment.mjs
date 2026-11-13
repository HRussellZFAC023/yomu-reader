import { createHash } from 'node:crypto';

// Inspect the actual installer, not package.json or the mutable runtime alias.
// Tampermonkey does not run any of the script when a pinned @require is missing.
export function userscriptDependencies(source) {
    const header = source.match(/^\/\/ ==UserScript==\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m)?.[1];
    if (!header) throw new Error('Missing userscript metadata header');
    const version = header.match(/^\/\/\s*@version\s+(\S+)/m)?.[1];
    if (!version) throw new Error('Missing userscript version');
    const dependencies = [];
    for (const line of header.split('\n')) {
        const match = line.match(/^\/\/\s*@(require|resource)\s+(?:\S+\s+)?(https:\/\/\S+)\s*$/);
        if (!match) {
            if (/^\/\/\s*@(require|resource)\s/.test(line)) throw new Error(`Invalid dependency: ${line}`);
            continue;
        }
        const url = new URL(match[2]);
        const digest = url.hash.match(/^#sha256=([A-Za-z0-9+/]+={0,2})$/)?.[1];
        if (!digest) throw new Error(`Missing SHA-256 pin: ${url.href}`);
        url.hash = '';
        dependencies.push({ kind: match[1], url: url.href, digest });
    }
    if (!dependencies.some(item => item.kind === 'require')) throw new Error('Missing runtime dependency');
    if (!dependencies.some(item => item.kind === 'resource')) throw new Error('Missing stylesheet dependency');
    return { version, dependencies };
}

export async function verifyUserscriptDeployment(source, fetcher = fetch) {
    const { version, dependencies } = userscriptDependencies(source);
    const results = [];
    for (const dependency of dependencies) {
        try {
            const response = await fetcher(dependency.url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            const actual = createHash('sha256').update(bytes).digest('base64');
            if (actual !== dependency.digest) throw new Error('SHA-256 mismatch (wrong bytes or HTML fallback)');
            results.push({ ...dependency, ok: true, detail: `${bytes.length} bytes, SHA-256 verified` });
        } catch (error) {
            results.push({ ...dependency, ok: false, detail: error.message });
        }
    }
    return { version, ok: results.every(result => result.ok), results };
}
