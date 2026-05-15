#!/usr/bin/env node
import ts from 'typescript';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const THRESHOLD = Number(process.env.YOMU_COMPLEXITY_MAX || 30);
const TARGETS = [
    path.join(ROOT, 'src'),
    path.join(ROOT, 'scripts'),
    path.join(ROOT, 'tests'),
    path.join(ROOT, 'vite.config.ts'),
];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-reader', 'docs/.vitepress/dist', 'qa-artifacts']);
const FUNCTION_LIKE_CHECKS = [
    ts.isFunctionDeclaration,
    ts.isFunctionExpression,
    ts.isArrowFunction,
    ts.isMethodDeclaration,
    ts.isGetAccessorDeclaration,
    ts.isSetAccessorDeclaration,
    ts.isConstructorDeclaration,
];

const files = [];
for (const target of TARGETS) {
    const info = await stat(target).catch(() => null);
    if (!info) continue;
    if (info.isDirectory()) files.push(...await listTypeScriptFiles(target));
    else if (target.endsWith('.ts') || target.endsWith('.mts') || target.endsWith('.mjs')) files.push(target);
}

const results = [];
for (const file of files) {
    const sourceText = await readFile(file, 'utf8');
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, sourceKind(file));
    collectComplexity(source, source, file, results);
}

results.sort((a, b) => b.complexity - a.complexity || a.file.localeCompare(b.file));
const offenders = results.filter(result => result.complexity > THRESHOLD);

console.log(`Cyclomatic complexity threshold: ${THRESHOLD}`);
console.log('Top complexity results:');
for (const result of results.slice(0, 25)) {
    console.log(`${String(result.complexity).padStart(3)}  ${path.relative(ROOT, result.file)}:${result.line}  ${result.name}`);
}

if (offenders.length) {
    console.error('\nFunctions over threshold:');
    for (const result of offenders) {
        console.error(`${result.complexity} > ${THRESHOLD}  ${path.relative(ROOT, result.file)}:${result.line}  ${result.name}`);
    }
    process.exitCode = 1;
}

async function listTypeScriptFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const found = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const relative = path.relative(ROOT, full);
        if (entry.isDirectory()) {
            if ([...IGNORED_DIRS].some(ignored => relative === ignored || relative.startsWith(`${ignored}${path.sep}`))) continue;
            found.push(...await listTypeScriptFiles(full));
        } else if (/\.(?:ts|mts|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
            found.push(full);
        }
    }
    return found;
}

function sourceKind(file) {
    if (file.endsWith('.mts') || file.endsWith('.mjs')) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
}

function collectComplexity(node, source, file, output) {
    if (isFunctionLike(node)) {
        const name = functionName(node);
        const complexity = measureFunctionComplexity(node);
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        output.push({ file, line, name, complexity });
        return;
    }
    ts.forEachChild(node, child => collectComplexity(child, source, file, output));
}

function isFunctionLike(node) {
    return FUNCTION_LIKE_CHECKS.some(check => check(node));
}

function functionName(node) {
    if (node.name?.getText) return node.name.getText();
    const parent = node.parent;
    const assignedName = assignedFunctionName(parent);
    if (assignedName) return assignedName;
    if (ts.isCallExpression(parent) && parent.expression) return callbackFunctionName(parent);
    return '<anonymous>';
}

function assignedFunctionName(parent) {
    if (ts.isVariableDeclaration(parent) && parent.name) return parent.name.getText();
    if (ts.isPropertyAssignment(parent) && parent.name) return parent.name.getText();
    return '';
}

function callbackFunctionName(parent) {
    return `<callback:${parent.expression.getText().slice(0, 48)}>`;
}

function measureFunctionComplexity(node) {
    let complexity = 1;
    const visit = child => {
        if (child !== node && isFunctionLike(child)) return;
        if (
            ts.isIfStatement(child)
            || ts.isForStatement(child)
            || ts.isForInStatement(child)
            || ts.isForOfStatement(child)
            || ts.isWhileStatement(child)
            || ts.isDoStatement(child)
            || ts.isCatchClause(child)
            || ts.isConditionalExpression(child)
        ) {
            complexity += 1;
        } else if (ts.isCaseClause(child) || ts.isDefaultClause(child)) {
            complexity += 1;
        } else if (ts.isBinaryExpression(child)) {
            const kind = child.operatorToken.kind;
            if (kind === ts.SyntaxKind.AmpersandAmpersandToken || kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
                complexity += 1;
            }
        }
        ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
    return complexity;
}
