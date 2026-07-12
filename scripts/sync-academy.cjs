const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'docs', 'public', 'academy');
const revisionToken = '__ACADEMY_REVISION__';
const templates = [
    ['public/academy/index.html', 'index.html'],
    ['public/academy/sw.js', 'sw.js'],
];
const runtimeSources = [
    ['public/academy/manifest.webmanifest', 'manifest.webmanifest'],
    ['public/academy/art/characters', 'art/characters'],
    ['public/academy/art/protagonists', 'art/protagonists'],
    ['public/academy/art/locations', 'art/locations'],
    ['public/academy/art/events', 'art/events'],
    ['public/academy/content/vertical-slice', 'content/vertical-slice'],
    ['public/academy/vendor', 'vendor'],
    ['dist/academy/app.js', 'app.js'],
    ['dist/academy/style.css', 'style.css'],
];
const hostedDependencies = [
    'docs/public/yomu.user.js',
    'docs/public/yomu.css',
    'docs/public/greasyfork/yomu-settings-surface.user.js',
];

const sourcePaths = [...templates, ...runtimeSources].map(([source]) => source).concat(hostedDependencies);
for (const source of sourcePaths) {
    if (!fs.existsSync(path.join(root, source))) throw new Error(`Missing Academy runtime file: ${source}`);
}

const hash = crypto.createHash('sha256');
for (const source of sourcePaths.sort()) hashPath(source, path.join(root, source), hash);
const revision = `s1-${hash.digest('hex').slice(0, 12)}`;

fs.rmSync(destination, { recursive: true, force: true });
for (const [source, target] of runtimeSources) {
    const from = path.join(root, source);
    const to = path.join(destination, target);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
}
for (const [source, target] of templates) {
    const template = fs.readFileSync(path.join(root, source), 'utf8');
    if (!template.includes(revisionToken)) throw new Error(`Academy template has no revision token: ${source}`);
    const rendered = template.replaceAll(revisionToken, revision);
    const to = path.join(destination, target);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, rendered);
}

console.log(`Synced ${runtimeSources.length + templates.length} allowlisted Academy runtime entries at ${revision}.`);

function hashPath(label, absolutePath, digest) {
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
        for (const child of fs.readdirSync(absolutePath).sort()) {
            hashPath(`${label}/${child}`, path.join(absolutePath, child), digest);
        }
        return;
    }
    digest.update(label);
    digest.update('\0');
    digest.update(fs.readFileSync(absolutePath));
    digest.update('\0');
}
