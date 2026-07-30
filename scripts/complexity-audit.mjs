#!/usr/bin/env node
// Cyclomatic complexity, held by a ratchet rather than a wish.
//
// The audit is the last stage of `npm run qa`, which README.md and AGENTS.md
// both advertise as the quality command. It failed with 51 functions over the
// threshold of 30, so `qa` could not pass, no workflow ran it, and nothing held
// the line: a gate that cannot pass is not a gate.
//
// config/quality/complexity-baseline.json records exactly the functions that are
// over the threshold today, with the complexity each one has. The audit fails
// when a function appears that is not in the baseline, when a recorded function
// gets worse, and when a recorded entry no longer matches what the tree measures
// — so the list can only shrink, and it shrinks in the commit that does the
// work. Regenerate with `node scripts/complexity-audit.mjs --update-baseline`.
import ts from 'typescript';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const THRESHOLD = Number(process.env.YOMU_COMPLEXITY_MAX || 30);
const BASELINE_FILE = path.join(ROOT, 'config', 'quality', 'complexity-baseline.json');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
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

// One entry per over-threshold function, keyed by path and name rather than by
// line so that editing anything above a function does not move its entry.
const measured = new Map();
for (const result of offenders) {
    const key = `${path.relative(ROOT, result.file).split(path.sep).join('/')}:${result.name}`;
    measured.set(key, Math.max(measured.get(key) ?? 0, result.complexity));
}

if (UPDATE_BASELINE) {
    await writeBaseline(measured);
    console.log(`Recorded ${measured.size} function(s) over ${THRESHOLD} in ${path.relative(ROOT, BASELINE_FILE)}.`);
} else {
    const baseline = await readBaseline();
    const failures = baselineFailures(baseline, measured);
    console.log(`\nBaseline: ${Object.keys(baseline).length} function(s) over ${THRESHOLD}; measured ${measured.size}.`);
    if (failures.length) {
        console.error('\nComplexity baseline broken:');
        for (const failure of failures) console.error(`  ${failure}`);
        console.error('\nSplit the function, or re-record with: node scripts/complexity-audit.mjs --update-baseline');
        process.exitCode = 1;
    }
}

/** Every way the tree can disagree with the recorded baseline. */
function baselineFailures(baseline, measuredComplexity) {
    const failures = [];
    for (const [key, complexity] of measuredComplexity) {
        const recorded = baseline[key];
        if (recorded === undefined) failures.push(`${key} is ${complexity} > ${THRESHOLD} and is not in the baseline`);
        else if (complexity > recorded) failures.push(`${key} rose from ${recorded} to ${complexity}`);
        else if (complexity < recorded) {
            failures.push(`${key} improved from ${recorded} to ${complexity} — record it so the baseline cannot drift back up`);
        }
    }
    for (const key of Object.keys(baseline)) {
        if (!measuredComplexity.has(key)) {
            failures.push(`${key} is in the baseline but is no longer over ${THRESHOLD} — remove the entry`);
        }
    }
    return failures;
}

async function readBaseline() {
    const source = await readFile(BASELINE_FILE, 'utf8');
    const parsed = JSON.parse(source);
    if (parsed.threshold !== THRESHOLD) {
        throw new Error(`Baseline records threshold ${parsed.threshold}, audit is running at ${THRESHOLD}.`);
    }
    return parsed.functions;
}

async function writeBaseline(measuredComplexity) {
    const functions = Object.fromEntries([...measuredComplexity].sort(([a], [b]) => a.localeCompare(b)));
    const document = { threshold: THRESHOLD, functions };
    await writeFile(BASELINE_FILE, `${JSON.stringify(document, null, 4)}\n`);
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
