#!/usr/bin/env node
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
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
syncNewTabIndex();

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

function syncNewTabIndex() {
  const appSource = join(root, 'dist', 'newtab', 'app.js');
  const indexSource = join(root, 'public', 'newtab', 'index.html');
  const indexDist = join(root, 'dist', 'newtab', 'index.html');
  const indexTarget = join(root, 'docs', 'public', 'newtab', 'index.html');
  if (!existsSync(appSource)) {
    console.error(`Missing built new-tab app: ${appSource}`);
    process.exit(1);
  }
  if (!existsSync(indexSource)) {
    console.error(`Missing new-tab HTML template: ${indexSource}`);
    process.exit(1);
  }
  const hash = createHash('sha256').update(readFileSync(appSource)).digest('hex').slice(0, 12);
  const buildId = `${packageVersion()}-${hash}`;
  const html = readFileSync(indexSource, 'utf8')
    .replaceAll('__YOMU_NEW_TAB_APP_HASH__', hash)
    .replaceAll('__YOMU_NEW_TAB_BUILD_ID__', buildId)
    .replace(/<script src="\.\/app\.js(?:\?v=[^"]*)?"><\/script>/, `<script src="./app.js?v=${hash}"></script>`);
  mkdirSync(dirname(indexDist), { recursive: true });
  writeFileSync(indexDist, html);
  mkdirSync(dirname(indexTarget), { recursive: true });
  writeFileSync(indexTarget, html);
  syncNewTabVersion(hash, buildId);
  console.log(`Synced ${indexTarget}`);
  syncNewTabServiceWorker(hash);
}

function syncNewTabVersion(hash, buildId) {
  const version = `${JSON.stringify({ appHash: hash, buildId, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const versionDist = join(root, 'dist', 'newtab', 'version.json');
  const versionTarget = join(root, 'docs', 'public', 'newtab', 'version.json');
  mkdirSync(dirname(versionDist), { recursive: true });
  writeFileSync(versionDist, version);
  mkdirSync(dirname(versionTarget), { recursive: true });
  writeFileSync(versionTarget, version);
  console.log(`Synced ${versionTarget}`);
}

function packageVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return pkg.version || 'dev';
}

function syncNewTabServiceWorker(hash) {
  const swSource = join(root, 'public', 'newtab', 'sw.js');
  const swDist = join(root, 'dist', 'newtab', 'sw.js');
  const swTarget = join(root, 'docs', 'public', 'newtab', 'sw.js');
  if (!existsSync(swSource)) return;
  const js = readFileSync(swSource, 'utf8')
    .replaceAll('__YOMU_NEW_TAB_APP_HASH__', hash);
  mkdirSync(dirname(swDist), { recursive: true });
  writeFileSync(swDist, js);
  mkdirSync(dirname(swTarget), { recursive: true });
  writeFileSync(swTarget, js);
  console.log(`Synced ${swTarget}`);
}
