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
const IGNORED_DIRS = new Set(['node_modules', '.git', 'artifacts', 'dist', 'dist-reader', 'docs/.vitepress/dist', 'qa-artifacts']);
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
        found.push(...await auditedFilesForEntry(dir, entry));
    }
    return found;
}

async function auditedFilesForEntry(dir, entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return auditedDirectoryFiles(full);
    if (isAuditedTypeScriptFile(entry.name)) return [full];
    return [];
}

async function auditedDirectoryFiles(dir) {
    if (isIgnoredPath(path.relative(ROOT, dir))) return [];
    return listTypeScriptFiles(dir);
}

function isIgnoredPath(relative) {
    return [...IGNORED_DIRS].some(ignored => relative === ignored || relative.startsWith(`${ignored}${path.sep}`));
}

function isAuditedTypeScriptFile(name) {
    return /\.(?:ts|mts|mjs)$/.test(name) && !name.endsWith('.d.ts');
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
    const ownName = ownFunctionName(node);
    if (ownName) return ownName;

    const parent = node.parent;
    const assignedName = assignedFunctionName(parent);
    if (assignedName) return assignedName;

    const callbackName = callExpressionFunctionName(parent);
    return callbackName || '<anonymous>';
}

function ownFunctionName(node) {
    if (!node.name) return '';
    if (!node.name.getText) return '';
    return node.name.getText();
}

function assignedFunctionName(parent) {
    if (ts.isVariableDeclaration(parent)) return parent.name.getText();
    if (ts.isPropertyAssignment(parent)) return parent.name.getText();
    return '';
}

function callExpressionFunctionName(parent) {
    if (!ts.isCallExpression(parent)) return '';
    return callbackFunctionName(parent);
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
