#!/usr/bin/env node
const { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { dirname, join } = require('node:path');

const root = join(__dirname, '..');
const distRoot = join(root, 'dist', 'academy');
const docsRoot = join(root, 'docs', 'public', 'academy');
const appPath = join(distRoot, 'app.js');
const cssPath = join(distRoot, 'styles.css');
const templatePath = join(root, 'public', 'academy', 'index.html');
const mediaPath = join(root, 'public', 'academy', 'media');
const catalogPath = join(root, 'public', 'academy', 'catalog.json');

for (const required of [appPath, cssPath, templatePath]) {
    if (!existsSync(required)) throw new Error(`Missing Academy build input: ${required}`);
}

const appHash = digest(appPath);
const cssHash = digest(cssPath);
const html = readFileSync(templatePath, 'utf8')
    .replaceAll('__YOMU_ACADEMY_APP_HASH__', appHash)
    .replaceAll('__YOMU_ACADEMY_CSS_HASH__', cssHash);

mkdirSync(docsRoot, { recursive: true });
copyFileSync(appPath, join(docsRoot, 'app.js'));
copyFileSync(cssPath, join(docsRoot, 'styles.css'));
if (existsSync(mediaPath)) {
    cpSync(mediaPath, join(distRoot, 'media'), { recursive: true });
    cpSync(mediaPath, join(docsRoot, 'media'), { recursive: true });
}
if (existsSync(catalogPath)) {
    copyFileSync(catalogPath, join(distRoot, 'catalog.json'));
    copyFileSync(catalogPath, join(docsRoot, 'catalog.json'));
}
// Static asset directories and files (art, audio, course content, PWA manifest/service worker).
// `content` carries the data-driven course corpus (week JSONs + worksheet packs)
// that the course registry fetches at runtime; without it the chronology is
// empty and every unit reads as "coming soon".
for (const dir of ['art', 'audio', 'content']) {
    const src = join(root, 'public', 'academy', dir);
    if (existsSync(src)) {
        cpSync(src, join(distRoot, dir), { recursive: true });
        cpSync(src, join(docsRoot, dir), { recursive: true });
    }
}
for (const file of ['manifest.webmanifest', 'sw.js']) {
    const src = join(root, 'public', 'academy', file);
    if (existsSync(src)) {
        copyFileSync(src, join(distRoot, file));
        copyFileSync(src, join(docsRoot, file));
    }
}
writeFileSync(join(distRoot, 'index.html'), html);
writeFileSync(join(docsRoot, 'index.html'), html);
console.log(`Synced ${docsRoot}`);

function digest(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex').slice(0, 12);
}
