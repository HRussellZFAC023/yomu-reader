export type HostedRuntimeScriptRole = 'dependency' | 'core';

export interface HostedRuntimeScript {
    readonly integrity: string;
    readonly path: string;
    readonly role: HostedRuntimeScriptRole;
}

export interface HostedRuntimeGraph {
    readonly revision: string;
    readonly scripts: readonly HostedRuntimeScript[];
}

export interface HostedRuntimeLoadOptions {
    readonly document?: Document;
    readonly realm?: typeof globalThis;
    readonly resolveCandidates: (script: HostedRuntimeScript) => readonly string[];
    readonly scriptIdPrefix: string;
}

export interface HostedRuntimeLoadResult {
    readonly core: HTMLScriptElement;
    readonly scripts: readonly HTMLScriptElement[];
}

const HOSTED_RUNTIME_GRAPH_SLOT = '__yomuHostedRuntimeGraph';
const HOSTED_DEPENDENCY_PATH = /^greasyfork\/[a-z\d][a-z\d.-]*\.([a-f\d]{12})\.user\.js$/u;
const HOSTED_CORE_PATH = 'yomu.user.js';
const SHA256_INTEGRITY = /^sha256-([A-Za-z\d+/]{43}=)$/u;
const HOSTED_RUNTIME_SCRIPT_STATES = new Set(['error', 'loaded', 'loading']);
const runtimeLoads = new WeakMap<Document, Promise<HostedRuntimeLoadResult>>();

type HostedRuntimeGraphRealm = typeof globalThis & { [HOSTED_RUNTIME_GRAPH_SLOT]?: unknown };
type ValidatedHostedRuntimeScript = HostedRuntimeScript & { readonly pathHash: string };

/**
 * Reads the one graph generated from the final userscript metadata. Hosted
 * surfaces never name or order executable companions themselves: the same
 * @require graph used by a userscript manager is their sole authority too.
 */
export function hostedRuntimeGraph(realm: typeof globalThis = globalThis): HostedRuntimeGraph {
    const value = (realm as HostedRuntimeGraphRealm)[HOSTED_RUNTIME_GRAPH_SLOT];
    const graph = requiredRecord(value, 'Hosted runtime graph is missing or unsupported.');
    if (graph.schemaVersion !== 1) throw new Error('Hosted runtime graph is missing or unsupported.');
    const dependencies = hostedDependencies(graph.dependencies);
    const core = hostedCore(graph.core, graph.revision);
    const paths = [...dependencies.map(entry => entry.path), core.path];
    if (new Set(paths).size !== paths.length) throw new Error('Hosted runtime graph paths must be unique.');
    return Object.freeze({
        revision: core.pathHash,
        scripts: Object.freeze([
            ...dependencies.map(({ pathHash: _pathHash, ...entry }) => Object.freeze(entry)),
            Object.freeze({ integrity: core.integrity, path: core.path, role: 'core' as const }),
        ]),
    });
}

/**
 * Loads every dependency serially and appends the core only after all of them
 * execute successfully. SRI protects every script; a missing, stale, or
 * partially deployed graph therefore fails closed without evaluating core.
 */
export function loadHostedReaderRuntime(options: HostedRuntimeLoadOptions): Promise<HostedRuntimeLoadResult> {
    const ownerDocument = options.document ?? document;
    const current = runtimeLoads.get(ownerDocument);
    if (current) return current;
    const graph = hostedRuntimeGraph(options.realm);
    const load = loadHostedRuntimeGraph(graph, ownerDocument, options);
    runtimeLoads.set(ownerDocument, load);
    void load.catch(() => {
        if (runtimeLoads.get(ownerDocument) === load) runtimeLoads.delete(ownerDocument);
    });
    return load;
}

async function loadHostedRuntimeGraph(
    graph: HostedRuntimeGraph,
    ownerDocument: Document,
    options: HostedRuntimeLoadOptions,
): Promise<HostedRuntimeLoadResult> {
    const loaded: HTMLScriptElement[] = [];
    for (const [index, entry] of graph.scripts.entries()) {
        const id = `${options.scriptIdPrefix}-${entry.role}-${index}`;
        const candidates = options.resolveCandidates(entry);
        loaded.push(await loadHostedRuntimeScript(ownerDocument, id, entry, candidates));
    }
    const core = loaded.at(-1);
    if (!(core instanceof HTMLScriptElement) || core.dataset.yomuHostedRuntimeRole !== 'core') {
        throw new Error('Hosted runtime graph did not finish with core.');
    }
    return Object.freeze({ core, scripts: Object.freeze(loaded) });
}

async function loadHostedRuntimeScript(
    ownerDocument: Document,
    id: string,
    entry: HostedRuntimeScript,
    candidates: readonly string[],
): Promise<HTMLScriptElement> {
    for (const candidate of hostedRuntimeCandidates(candidates, entry.role)) {
        try {
            return await appendHostedRuntimeScript(ownerDocument, id, candidate, entry);
        } catch {
            removeFailedHostedRuntimeScript(ownerDocument, id, candidate, entry);
        }
    }
    throw new Error(`Hosted runtime ${entry.role} failed integrity or network loading.`);
}

function appendHostedRuntimeScript(
    ownerDocument: Document,
    id: string,
    src: string,
    entry: HostedRuntimeScript,
): Promise<HTMLScriptElement> {
    const adopted = adoptHostedRuntimeScript(ownerDocument, id, src, entry);
    if (adopted) return adopted;
    const script = ownerDocument.createElement('script');
    script.id = id;
    script.async = false;
    script.crossOrigin = 'anonymous';
    script.integrity = entry.integrity;
    script.src = src;
    script.dataset.yomuHostedRuntimeRole = entry.role;
    script.dataset.yomuHostedRuntimeState = 'loading';
    (ownerDocument.head ?? ownerDocument.documentElement).append(script);
    return waitForHostedRuntimeScript(script);
}

function adoptHostedRuntimeScript(
    ownerDocument: Document,
    id: string,
    src: string,
    entry: HostedRuntimeScript,
): Promise<HTMLScriptElement> | undefined {
    const existing = ownerDocument.getElementById(id);
    if (!existing) return undefined;
    if (!(existing instanceof HTMLScriptElement)) {
        throw new Error(`Hosted runtime script id ${id} is already owned by another element.`);
    }
    if (!ownsHostedRuntimeScript(ownerDocument, existing, src, entry)) {
        throw new Error(`Hosted runtime script id ${id} does not match the requested asset.`);
    }
    return waitForHostedRuntimeScript(existing);
}

function waitForHostedRuntimeScript(script: HTMLScriptElement): Promise<HTMLScriptElement> {
    if (script.dataset.yomuHostedRuntimeState === 'loaded') return Promise.resolve(script);
    if (script.dataset.yomuHostedRuntimeState === 'error') return Promise.reject(new Error('Hosted runtime script failed.'));
    return new Promise((resolve, reject) => {
        script.addEventListener('load', () => {
            script.dataset.yomuHostedRuntimeState = 'loaded';
            resolve(script);
        }, { once: true });
        script.addEventListener('error', () => {
            script.dataset.yomuHostedRuntimeState = 'error';
            reject(new Error('Hosted runtime script failed.'));
        }, { once: true });
    });
}

function hostedDependencies(value: unknown): readonly ValidatedHostedRuntimeScript[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('Hosted runtime graph has no dependencies.');
    }
    return value.map((entry, index) => hostedDependency(entry, index));
}

function hostedDependency(value: unknown, index: number): ValidatedHostedRuntimeScript {
    const record = requiredRecord(value, `Hosted runtime dependency ${index} is invalid.`);
    const path = requiredString(record.path, `Hosted runtime dependency ${index} path is invalid.`);
    const pathMatch = HOSTED_DEPENDENCY_PATH.exec(path);
    if (!pathMatch) throw new Error(`Hosted runtime dependency ${index} path is unsafe.`);
    const pathHash = pathMatch[1];
    const integrity = hostedIntegrity(record.integrity, `Hosted runtime dependency ${index} integrity is invalid.`);
    if (integrityHashPrefix(integrity) !== pathHash) {
        throw new Error(`Hosted runtime dependency ${index} filename and integrity disagree.`);
    }
    return { integrity, path, pathHash, role: 'dependency' };
}

function hostedCore(value: unknown, revision: unknown): ValidatedHostedRuntimeScript {
    const record = requiredRecord(value, 'Hosted runtime core is invalid.');
    const path = requiredString(record.path, 'Hosted runtime core path is invalid.');
    if (path !== HOSTED_CORE_PATH) throw new Error('Hosted runtime core path is invalid.');
    const integrity = hostedIntegrity(record.integrity, 'Hosted runtime core integrity is invalid.');
    const pathHash = requiredString(revision, 'Hosted runtime revision is invalid.');
    if (!/^[a-f\d]{12}$/u.test(pathHash)) throw new Error('Hosted runtime revision is invalid.');
    if (integrityHashPrefix(integrity) !== pathHash) {
        throw new Error('Hosted runtime core revision and integrity disagree.');
    }
    return { integrity, path: HOSTED_CORE_PATH, pathHash, role: 'core' };
}

function hostedRuntimeCandidates(candidates: readonly string[], role: HostedRuntimeScriptRole): readonly string[] {
    const message = `Hosted runtime ${role} has no usable asset candidates.`;
    if (!Array.isArray(candidates)) throw new Error(message);
    if (candidates.length === 0) throw new Error(message);
    if (candidates.some(candidate => !candidate?.trim())) throw new Error(message);
    return [...new Set(candidates)];
}

function removeFailedHostedRuntimeScript(
    ownerDocument: Document,
    id: string,
    src: string,
    entry: HostedRuntimeScript,
): void {
    const script = ownerDocument.getElementById(id);
    if (!(script instanceof HTMLScriptElement)) return;
    if (!ownsHostedRuntimeScript(ownerDocument, script, src, entry)) return;
    if (script.dataset.yomuHostedRuntimeState === 'error') script.remove();
}

function ownsHostedRuntimeScript(
    ownerDocument: Document,
    script: HTMLScriptElement,
    src: string,
    entry: HostedRuntimeScript,
): boolean {
    if (!HOSTED_RUNTIME_SCRIPT_STATES.has(script.dataset.yomuHostedRuntimeState ?? '')) return false;
    const requested = ownerDocument.createElement('script');
    requested.src = src;
    requested.integrity = entry.integrity;
    requested.crossOrigin = 'anonymous';
    requested.dataset.yomuHostedRuntimeRole = entry.role;
    return hostedRuntimeScriptIdentity(script) === hostedRuntimeScriptIdentity(requested);
}

function hostedRuntimeScriptIdentity(script: HTMLScriptElement): string {
    return [
        script.dataset.yomuHostedRuntimeRole,
        script.integrity,
        script.src,
        script.crossOrigin,
    ].join('\u0000');
}

function hostedIntegrity(value: unknown, message: string): string {
    const integrity = requiredString(value, message);
    if (!SHA256_INTEGRITY.test(integrity)) throw new Error(message);
    return integrity;
}

function integrityHashPrefix(integrity: string): string {
    const encoded = integrity.match(SHA256_INTEGRITY)?.[1];
    if (!encoded) return '';
    try {
        return Array.from(atob(encoded), character => character.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 12);
    } catch {
        return '';
    }
}

function requiredString(value: unknown, message: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(message);
    return value;
}

function requiredRecord(value: unknown, message: string): Record<string, unknown> {
    if (!isRecord(value)) throw new Error(message);
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
