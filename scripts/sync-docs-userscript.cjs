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

copyBuiltAsset('dist/newtab/app.js', 'docs/public/newtab/app.js');
copyBuiltAsset('dist/newtab/index.html', 'docs/public/newtab/index.html');

function copyBuiltAsset(sourcePath, targetPath) {
  const assetSource = join(root, sourcePath);
  const assetTarget = join(root, targetPath);
  if (!existsSync(assetSource)) {
    console.error(`Missing built asset: ${assetSource}`);
    process.exit(1);
  }
  mkdirSync(dirname(assetTarget), { recursive: true });
  copyFileSync(assetSource, assetTarget);
  console.log(`Synced ${assetTarget}`);
}
