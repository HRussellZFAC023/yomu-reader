// Non-import inputs of one module, not a taint on its importers. Unknown reads
// stay conservative until reviewed with @yomu-reads or a contract-lane entry.
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export function readTargets(source, file, root, ts) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const variables = new Map();
    const fs = new Set();
    const namespaces = new Set();
    const subprocess = new Set();
    const processNamespaces = new Set();
    const targets = new Set();
    const modules = new Set();
    const unknown = [];
    const annotations = [...source.matchAll(/^\s*\/\/\s*@yomu-reads\s+(.+)$/gm)]
        .flatMap(match => match[1].trim().split(/\s+/)).filter(path => path !== 'none');
    const annotated = /^\s*\/\/\s*@yomu-reads\s+/m.test(source);
    // Subprocess bundlers consume the import closure of their entrypoints.
    for (const match of source.matchAll(/^\s*\/\/\s*@yomu-imports\s+(.+)$/gm)) {
        for (const path of match[1].trim().split(/\s+/)) modules.add(resolve(root, path));
    }
    const reader = /^(?:read(?:File|link|v)?(?:Sync)?|readdir(?:Sync)?|opendir(?:Sync)?|stat(?:Sync)?|lstat(?:Sync)?|existsSync|access(?:Sync)?|realpath(?:Sync)?|open(?:Sync)?|createReadStream|glob(?:Sync)?|copyFile(?:Sync)?|cp(?:Sync)?)$/;
    function collect(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            const values = variables.get(node.name.text) ?? [];
            values.push(node.initializer);
            variables.set(node.name.text, values);
        }
        if (ts.isImportDeclaration(node) && /^(?:node:)?fs(?:\/promises)?$/.test(node.moduleSpecifier.text)) {
            const clause = node.importClause;
            if (clause?.name) namespaces.add(clause.name.text);
            if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaces.add(clause.namedBindings.name.text);
            if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                for (const entry of clause.namedBindings.elements) if (reader.test(entry.propertyName?.text ?? entry.name.text)) fs.add(entry.name.text);
            }
        }
        if (ts.isImportDeclaration(node) && /^(?:node:)?child_process$/.test(node.moduleSpecifier.text)) {
            for (const entry of node.importClause?.namedBindings?.elements ?? []) subprocess.add(entry.name.text);
            if (node.importClause?.name) processNamespaces.add(node.importClause.name.text);
            if (node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) processNamespaces.add(node.importClause.namedBindings.name.text);
        }
        const initializer = ts.isVariableDeclaration(node) && node.initializer && (ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer);
        if (initializer && ts.isCallExpression(initializer)
            && (initializer.expression.getText(ast) === 'require' || initializer.expression.kind === ts.SyntaxKind.ImportKeyword)
            && /^(?:node:)?fs(?:\/promises)?$/.test(initializer.arguments[0]?.text ?? '')) {
            if (ts.isIdentifier(node.name)) namespaces.add(node.name.text);
            else for (const entry of node.name.elements) if (reader.test(entry.propertyName?.text ?? entry.name.text)) fs.add(entry.name.text);
        }
        ts.forEachChild(node, collect);
    }
    collect(ast);
    function values(node, seen = new Set()) {
        if (!node) return [];
        if (ts.isStringLiteralLike(node)) return [node.text];
        if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(element => values(element, seen));
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return values(node.expression, seen);
        if (ts.isIdentifier(node)) {
            if (node.text === '__dirname') return [dirname(file)];
            if (node.text === '__filename') return [file];
            if (seen.has(node.text)) return [];
            const next = new Set([...seen, node.text]);
            return (variables.get(node.text) ?? []).flatMap(value => values(value, next));
        }
        if (ts.isConditionalExpression(node)) return [...values(node.whenTrue, seen), ...values(node.whenFalse, seen)];
        if (ts.isTemplateExpression(node)) {
            // A literal directory prefix bounds any interpolated suffix, even
            // when its value contains slashes. Do not mistake a filename prefix
            // for an exact input or invent a value for a function parameter.
            let prefixes = [node.head.text];
            for (const span of node.templateSpans) {
                const parts = values(span.expression, seen);
                if (!parts.length) return prefixes.filter(prefix => prefix.includes('/')).map(prefix => prefix.slice(0, prefix.lastIndexOf('/') + 1) + '**');
                prefixes = prefixes.flatMap(prefix => parts.map(part => prefix + part + span.literal.text));
            }
            return prefixes;
        }
        if (ts.isPropertyAccessExpression(node) && node.getText(ast) === 'import.meta.dirname') return [dirname(file)];
        if (ts.isPropertyAccessExpression(node) && node.getText(ast) === 'import.meta.url') return [file];
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'href') return values(node.expression, seen);
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            const name = node.expression.getText(ast).split('.').at(-1);
            if (node.expression.getText(ast) === 'process.cwd') return [root];
            if (name === 'fileURLToPath') return values(node.arguments?.[0], seen);
            if (name === 'pathToFileURL') return values(node.arguments?.[0], seen);
            if (name === 'dirname') return values(node.arguments?.[0], seen).map(value => dirname(value));
            if (name === 'URL') {
                const paths = values(node.arguments?.[0], seen);
                const bases = values(node.arguments?.[1], seen);
                return bases.flatMap(base => paths.map(path => resolve(dirname(base), path)));
            }
            if (name === 'join' || name === 'resolve') {
                let paths = [''];
                for (const argument of node.arguments ?? []) {
                    const parts = values(argument, seen);
                    if (!parts.length) return paths.filter(path => path && resolve(root, path) !== root).map(path => resolve(root, path, '**'));
                    paths = paths.flatMap(path => parts.map(part => resolve(root, path, part)));
                }
                return paths;
            }
        }
        return [];
    }
    function add(path, recursive = false) {
        if (path.startsWith('node:') || /^(?:https?|data):/.test(path)) return;
        const local = relative(root, isAbsolute(path) ? path : resolve(root, path)).replaceAll('\\', '/');
        if (local.startsWith('../') || isAbsolute(local)) return; // temp/private inputs are not repository edits
        targets.add(local === '' ? '**' : recursive ? `${local.replace(/\/$/, '')}/**` : local);
    }
    function visit(node) {
        if (ts.isExportDeclaration(node) && /^(?:node:)?(?:fs(?:\/promises)?|child_process)$/.test(node.moduleSpecifier?.text ?? '')) {
            unknown.push(`I/O re-export: ${node.getText(ast)}`);
        }
        const declaration = node.parent && (ts.isImportSpecifier(node.parent) || ts.isImportClause(node.parent) || ts.isNamespaceImport(node.parent) || ts.isBindingElement(node.parent));
        if (ts.isIdentifier(node) && fs.has(node.text) && !declaration && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) unknown.push(`escaped filesystem reader: ${node.text}`);
        if (ts.isPropertyAccessExpression(node) && namespaces.has(node.expression.getText(ast)) && reader.test(node.name.text)
            && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) unknown.push(`escaped filesystem reader: ${node.getText(ast)}`);
        if (ts.isCallExpression(node)) {
            const expression = node.expression;
            const name = ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text : '';
            const owner = ts.isPropertyAccessExpression(expression) ? expression.expression.getText(ast) : '';
            const inlineFs = ts.isPropertyAccessExpression(expression) && ts.isCallExpression(expression.expression)
                && /^(?:node:)?fs(?:\/promises)?$/.test(expression.expression.arguments[0]?.text ?? '');
            const read = fs.has(name) || ((inlineFs || namespaces.has(owner) || namespaces.has(owner.replace(/\.promises$/, ''))) && reader.test(name));
            const glob = /^(?:import\.meta)$/.test(owner) && /^(?:glob|globEager)$/.test(name);
            const dynamic = expression.kind === ts.SyntaxKind.ImportKeyword || name === 'require' || /^(?:importActual|importMock|mock|doMock|unmock|doUnmock)$/.test(name) && owner === 'vi';
            if (read || glob || dynamic) {
                const paths = values(node.arguments[0]);
                if (!paths.length) unknown.push(node.getText(ast).slice(0, 160));
                for (const path of paths) {
                    if (dynamic) {
                        // require/import can hand a subprocess API to arbitrary
                        // aliases. Its invocation inputs need an owner declaration.
                        if (/^(?:node:)?child_process$/.test(path)) unknown.push(`subprocess module load: ${path}`);
                        if (path.startsWith('.')) modules.add(resolve(dirname(file), path));
                        else if (!/^(?:node:)?[\w@]/.test(path)) unknown.push(`computed module ${path}`);
                    } else if (glob) add(resolve(dirname(file), path));
                    else add(path, /^(?:readdir|opendir)/.test(name));
                }
            }
            if (subprocess.has(name) || (processNamespaces.has(owner) && /^(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)$/.test(name))) unknown.push(node.getText(ast).slice(0, 160));
        }
        ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const path of annotations) add(path);
    return { targets: [...targets].sort(), modules: [...modules].sort(), unknown: annotated ? [] : unknown, declared: annotated };
}
