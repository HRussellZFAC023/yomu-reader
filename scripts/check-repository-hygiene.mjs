#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const forbiddenRoots = [
    '.agents',
    '.claude',
    '.codex',
    '.cursor',
    '.idea',
    '.playwright-mcp',
    '.vscode',
    'artifacts',
    'cast-standardize',
    'qa-artifacts',
    'references',
    'references-academy',
    'release-worktrees',
    'screens',
    'tmp',
    'verify',
];

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
const violations = tracked.filter(file => forbiddenRoots.some(directory => file === directory || file.startsWith(`${directory}/`)));

if (violations.length > 0) {
    console.error('Repository-local research, generated evidence, or tool state is tracked:');
    for (const file of violations) console.error(`  ${file}`);
    console.error('Keep these files outside the product repository; the matching roots are ignored.');
    process.exit(1);
}

console.log(`Repository hygiene passed (${tracked.length} tracked files, no local-only roots).`);
