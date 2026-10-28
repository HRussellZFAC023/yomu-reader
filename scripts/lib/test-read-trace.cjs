// CI-only preload: observe product/test filesystem reads in each Vitest worker.
// No file contents are recorded. Loader internals and temporary inputs are not
// repository edit dependencies; unbounded modules retain precautionary selection.
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const { relative, resolve } = require('node:path');
const { fileURLToPath } = require('node:url');
const { threadId } = require('node:worker_threads');
const append = fs.appendFileSync;
const root = process.env.YOMU_READ_TRACE_ROOT ?? process.cwd();
const directory = process.env.YOMU_READ_TRACE_DIR;
const seen = new Set();
if (directory) append(`${directory}/${process.pid}-${threadId}.preload`, 'active\n');
function record(input) {
    const test = globalThis.__vitest_worker__?.filepath ?? process.env.YOMU_READ_TRACE_TEST;
    if (!directory || !test || !(typeof input === 'string' || input instanceof URL || Buffer.isBuffer(input))) return;
    const path = relative(root, resolve(input instanceof URL ? fileURLToPath(input) : String(input))).replaceAll('\\', '/');
    if (path.startsWith('../') || /^(?:node_modules|artifacts|\.git)\//.test(path)) return;
    // Ignore Vite's module loader reads, but retain test and helper calls.
    const caller = new Error().stack.split('\n').slice(3).find(line => !line.includes('node:')) ?? '';
    if (!caller.includes(root) || caller.includes('/node_modules/')) return;
    const owner = relative(root, test).replaceAll('\\', '/');
    const key = `${owner}\0${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    append(`${directory}/${process.pid}-${threadId}.jsonl`, JSON.stringify({ test: owner, path }) + '\n');
}
for (const api of [fs, fs.promises]) {
    for (const name of ['readFile', 'readFileSync', 'readdir', 'readdirSync', 'opendir', 'opendirSync', 'open', 'openSync', 'createReadStream', 'stat', 'statSync', 'lstat', 'lstatSync', 'existsSync', 'access', 'accessSync', 'realpath', 'realpathSync', 'readlink', 'readlinkSync', 'glob', 'globSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync']) {
        if (typeof api[name] !== 'function') continue;
        const original = api[name];
        api[name] = Object.assign(function (path, ...args) { record(path); return Reflect.apply(original, this, [path, ...args]); }, original);
    }
}
// Subprocess scripts inherit the spawning test's ownership, including when a
// test supplies a copied environment. Preserve the original call overloads.
const cp = require('node:child_process');
const { promisify } = require('node:util');
function invoke(original, receiver, args) {
    const test = globalThis.__vitest_worker__?.filepath ?? process.env.YOMU_READ_TRACE_TEST;
    if (directory && test) {
        const index = args.findIndex((arg, i) => i > 0 && arg && typeof arg === 'object' && !Array.isArray(arg));
        const options = index < 0 ? {} : args[index];
        const traced = { ...options, env: { ...(options.env ?? process.env), YOMU_READ_TRACE_TEST: test,
            YOMU_READ_TRACE_DIR: directory, YOMU_READ_TRACE_ROOT: root,
            NODE_OPTIONS: [options.env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS, `--require=${JSON.stringify(__filename)}`].filter(Boolean).join(' ') } };
        if (index >= 0) args[index] = traced;
        else args.splice(Array.isArray(args[1]) ? 2 : 1, 0, traced);
    }
    return Reflect.apply(original, receiver, args);
}
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']) {
    const original = cp[name];
    cp[name] = function (...args) { return invoke(original, this, args); };
    // Node's custom promisifier returns {stdout, stderr} and a child handle.
    // Preserve that contract while propagating ownership into async children.
    if (original[promisify.custom]) cp[name][promisify.custom] = function (...args) {
        return invoke(original[promisify.custom], this, args);
    };
}
syncBuiltinESMExports();
