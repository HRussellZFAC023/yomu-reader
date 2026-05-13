#!/usr/bin/env node
const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = join(__dirname, '..');
const source = join(root, 'dist', 'yomu.user.js');
const target = join(root, 'docs', 'public', 'yomu.user.js');

if (!existsSync(source)) {
  console.error(`Missing built userscript: ${source}`);
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Synced ${target}`);
