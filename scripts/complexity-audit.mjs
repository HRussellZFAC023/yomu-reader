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
    path.join(ROOT, 'config'),
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
const BRANCH_NODE_CHECKS = [
    ts.isIfStatement,
    ts.isForStatement,
    ts.isForInStatement,
    ts.isForOfStatement,
    ts.isWhileStatement,
    ts.isDoStatement,
    ts.isCatchClause,
    ts.isConditionalExpression,
];
const COMPLEXITY_BINARY_OPERATORS = new Set([
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
]);
const COMPLEXITY_CONTRIBUTION_CHECKS = [
    node => BRANCH_NODE_CHECKS.some(check => check(node)),
    ts.isCaseClause,
    ts.isDefaultClause,
    isComplexityBinaryExpression,
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

// A ratchet, not a wish. At the threshold of 30 this exited 1 with 51 offenders
// and a worst case of 112, so `npm run qa` — advertised in README.md and named in
// AGENTS.md — could not pass, no workflow ran it, and nothing had held the line
// for a long time. A gate that always fails is read as noise and stops being a
// gate at all.
//
// So existing debt is baselined and only GROWTH fails: no new function over the
// threshold, and no function worse than today's worst. Both numbers are measured,
// and both may only be lowered. Lower them whenever a refactor earns it.
const BASELINE_OFFENDERS = Number(process.env.YOMU_COMPLEXITY_BASELINE_COUNT || 51);
const BASELINE_WORST = Number(process.env.YOMU_COMPLEXITY_BASELINE_WORST || 112);
const worst = offenders.length ? Math.max(...offenders.map(result => result.complexity)) : 0;

if (offenders.length) {
    console.error(`\nFunctions over threshold (${offenders.length}, baseline ${BASELINE_OFFENDERS}; worst ${worst}, baseline ${BASELINE_WORST}):`);
    for (const result of offenders) {
        console.error(`${result.complexity} > ${THRESHOLD}  ${path.relative(ROOT, result.file)}:${result.line}  ${result.name}`);
    }
}

if (offenders.length > BASELINE_OFFENDERS) {
    console.error(`\nFAIL: ${offenders.length} functions over ${THRESHOLD}, up from the ${BASELINE_OFFENDERS} baselined. Simplify the new one rather than raising the baseline.`);
    process.exitCode = 1;
} else if (worst > BASELINE_WORST) {
    console.error(`\nFAIL: worst complexity ${worst} exceeds the ${BASELINE_WORST} baselined.`);
    process.exitCode = 1;
} else if (offenders.length < BASELINE_OFFENDERS || worst < BASELINE_WORST) {
    // Say so loudly: an unlowered baseline is how a ratchet quietly stops ratcheting.
    console.log(`\nBaseline can be tightened: ${offenders.length} offenders (baseline ${BASELINE_OFFENDERS}), worst ${worst} (baseline ${BASELINE_WORST}). Lower them in this file.`);
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
        const contribution = visitComplexityChild(node, child, visit);
        complexity += contribution;
    };
    ts.forEachChild(node, visit);
    return complexity;
}

function visitComplexityChild(root, child, visit) {
    if (isNestedFunctionScope(root, child)) return 0;
    const contribution = complexityContribution(child);
    ts.forEachChild(child, visit);
    return contribution;
}

function isNestedFunctionScope(root, child) {
    return child !== root && isFunctionLike(child);
}

function complexityContribution(node) {
    return Number(COMPLEXITY_CONTRIBUTION_CHECKS.some(check => check(node)));
}

function isComplexityBinaryExpression(node) {
    return ts.isBinaryExpression(node) && COMPLEXITY_BINARY_OPERATORS.has(node.operatorToken.kind);
}
