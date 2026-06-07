#!/usr/bin/env node
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { dirname, join } = require('node:path');
const {
  DIST_USERSCRIPT_PATH,
  DOCS_USERSCRIPT_PATH,
  ROOT: root,
  fail,
  packageVersion,
} = require('./userscript-build-utils.cjs');
const { GREASY_FORK_LIBRARIES, greasyForkLibraryPath } = require('./greasyfork-libraries.cjs');

const source = DIST_USERSCRIPT_PATH;
const target = DOCS_USERSCRIPT_PATH;

copyBuiltAsset('dist/newtab/app.js', 'docs/public/newtab/app.js');
copyBuiltAsset('dist/newtab/styles.css', 'docs/public/newtab/styles.css');
copyBuiltAsset('dist/yomu.css', 'docs/public/yomu.css');
for (const library of GREASY_FORK_LIBRARIES) {
  const libraryPath = greasyForkLibraryPath(library.fileName);
  copyBuiltAsset(`dist/${libraryPath}`, `docs/public/${libraryPath}`);
}
syncNewTabIndex();
syncUserscript();

function syncUserscript() {
  if (!existsSync(source)) {
    fail(`Missing built userscript: ${source}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`Synced ${target}`);
}

function copyBuiltAsset(sourcePath, targetPath) {
  const assetSource = join(root, sourcePath);
  const assetTarget = join(root, targetPath);
  if (!existsSync(assetSource)) {
    fail(`Missing built asset: ${assetSource}`);
  }
  mkdirSync(dirname(assetTarget), { recursive: true });
  copyFileSync(assetSource, assetTarget);
  console.log(`Synced ${assetTarget}`);
}

function syncNewTabIndex() {
  const appSource = join(root, 'dist', 'newtab', 'app.js');
  const cssSource = join(root, 'dist', 'newtab', 'styles.css');
  const indexSource = join(root, 'public', 'newtab', 'index.html');
  const indexDist = join(root, 'dist', 'newtab', 'index.html');
  const indexTarget = join(root, 'docs', 'public', 'newtab', 'index.html');
  if (!existsSync(appSource)) {
    fail(`Missing built new-tab app: ${appSource}`);
  }
  if (!existsSync(indexSource)) {
    fail(`Missing new-tab HTML template: ${indexSource}`);
  }
  if (!existsSync(cssSource)) {
    fail(`Missing built new-tab CSS: ${cssSource}`);
  }
  const hash = createHash('sha256').update(readFileSync(appSource)).digest('hex').slice(0, 12);
  const cssHash = createHash('sha256').update(readFileSync(cssSource)).digest('hex').slice(0, 12);
  const buildId = `${packageVersion()}-${hash}`;
  const html = readFileSync(indexSource, 'utf8')
    .replaceAll('__YOMU_NEW_TAB_APP_HASH__', hash)
    .replaceAll('__YOMU_NEW_TAB_BUILD_ID__', buildId)
    .replaceAll('__YOMU_NEW_TAB_CSS_HASH__', cssHash)
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
