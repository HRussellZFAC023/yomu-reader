// Some v1.9.3 writers are module-private (the VitePress theme) or inline page
// script (the PDF Reader and Video Player shells), so no import reaches them.
// Rather than re-typing them, this lifts each named function's exact shipped
// source out of the reference checkout and evaluates it with the named module
// bindings supplied, so the bytes still come from the released code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type ShippedFunctions = Record<string, (...args: never[]) => unknown>;

function functionSource(source: string, name: string, file: string): string {
    const start = new RegExp(`^([ \\t]*)(?:async\\s+)?function ${name}\\(`, 'm').exec(source);
    if (!start) throw new Error(`${file} no longer declares function ${name}.`);
    const indent = start[1];
    const bodyEnd = source.indexOf(`\n${indent}}\n`, start.index);
    if (bodyEnd < 0) throw new Error(`Could not find the end of function ${name} in ${file}.`);
    return source.slice(start.index, bodyEnd + indent.length + 2);
}

function declarationSource(source: string, name: string, file: string): string {
    const line = new RegExp(`^[ \\t]*(?:const|let) ${name}\\b[^\\n]*;$`, 'm').exec(source);
    if (!line) throw new Error(`${file} no longer declares ${name} on one line.`);
    return line[0].trim();
}

export interface ShippedSource {
    /** Path inside the reference checkout. */
    readonly file: string;
    /** Function declarations to lift verbatim. */
    readonly functions: readonly string[];
    /** One-line module `const`/`let` declarations those functions read. */
    readonly declarations?: readonly string[];
    /** Imports and page globals the lifted code closes over. */
    readonly bindings?: Record<string, unknown>;
    /** Harness-only glue (stubs for DOM painters) and what it exports. */
    readonly glue?: string;
    readonly glueExports?: readonly string[];
}

/** Evaluates the named shipped functions from the reference checkout. */
export function shippedFunctions(spec: ShippedSource): ShippedFunctions {
    const root = process.env.YOMU_CAPTURE_ROOT;
    if (!root) throw new Error('YOMU_CAPTURE_ROOT is required.');
    const source = readFileSync(path.join(root, spec.file), 'utf8');
    const lifted = [
        ...(spec.declarations ?? []).map(name => declarationSource(source, name, spec.file)),
        spec.glue ?? '',
        ...spec.functions.map(name => functionSource(source, name, spec.file)),
    ].join('\n\n');
    // TypeScript's own transpiler: esbuild refuses jsdom's cross-realm TextEncoder.
    const { outputText: code } = ts.transpileModule(lifted, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });
    const exported = [...spec.functions, ...(spec.glueExports ?? [])];
    const bindings = spec.bindings ?? {};
    const parameters = Object.keys(bindings);
    // Evaluating the shipped release source is the point of this module.
    const factory = new Function(...parameters, `${code}\nreturn { ${exported.join(', ')} };`) as (...values: unknown[]) => ShippedFunctions;
    return factory(...parameters.map(name => bindings[name]));
}
