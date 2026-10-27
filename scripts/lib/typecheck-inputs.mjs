import { execFileSync } from 'node:child_process';
import { isAbsolute, join, relative } from 'node:path';

// Ask the same compiler/config as typecheck. This includes imported JSON,
// transitive docs modules and ambient declarations outside tsconfig.include.
// Re-discover on every invocation: a newly added import can change the program.
export function typecheckInputs(root) {
    const output = execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--listFilesOnly', '--incremental', 'false', '-p', 'tsconfig.json'], {
        cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    return [...new Set(['tsconfig*.json', ...output.trim().split(/\r?\n/).filter(Boolean).map(file => {
        const path = relative(root, file);
        if (path.split('/').includes('node_modules')) return null;
        if (isAbsolute(path) || path.startsWith('../')) throw new Error(`Typecheck input outside repository: ${file}`);
        if (/(^|\/)\.env(?:\.|$)/.test(path)) throw new Error(`Secret typecheck input: ${path}`);
        return path;
    }).filter(Boolean)])].sort();
}
