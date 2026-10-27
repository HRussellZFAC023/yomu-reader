import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('release preparation assembles and restores shipping namespaces after successful or failed packaging', t => {
    for (const status of [0, 7]) {
        const root = mkdtempSync(join(tmpdir(), 'yomu-smoke-preparation-'));
        t.after(() => rmSync(root, { recursive: true, force: true }));
        const put = (path, data, mode) => {
            mkdirSync(dirname(join(root, path)), { recursive: true });
            writeFileSync(join(root, path), data, { mode });
        };
        const core = '// @require https://yomureader.com/greasyfork/yomu-runtime.test.user.js\n';
        const shipping = {
            'yomu.user.js': core, 'yomu.css': 'reader css',
            'greasyfork/runtime.user.js': 'split companion',
            'newtab/app.js': 'hosted app', 'newtab/styles.css': 'Study css',
            'academy/app.js': 'Academy app',
        };
        for (const [path, data] of Object.entries(shipping)) put(`dist/${path}`, data);
        // Labelled mechanism fixture: only the real preparer's writer contract
        // is under test. Product behavior is covered by the release smokes.
        const templates = ['index.html', 'sw.js', 'version.json', 'manifest.webmanifest'];
        put('scripts/sync-docs-userscript.cjs', `const fs = require('node:fs'); for (const file of ${JSON.stringify(templates)}) fs.writeFileSync('dist/newtab/' + file, 'assembled ' + file);`);
        for (const file of templates) shipping[`newtab/${file}`] = `assembled ${file}`;
        put('scripts/prepare-release-smokes.mjs', readFileSync(resolve('scripts/prepare-release-smokes.mjs')));
        put('fake-builder.mjs', `import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
            rmSync('dist', { recursive: true, force: true });
            mkdirSync('dist/newtab', { recursive: true });
            mkdirSync('dist/extension', { recursive: true });
            writeFileSync('dist/yomu.user.js', 'self contained');
            writeFileSync('dist/yomu.css', 'packaging css');
            writeFileSync('dist/newtab/app.js', 'packaging app');
            writeFileSync('dist/newtab/extra.js', 'packaging-only file');
            writeFileSync('dist/extension/package.zip', 'compiled package');
            process.exit(${status});`);
        put('bin/npm', '#!/bin/sh\nexec "$YOMU_FIXTURE_NODE" "$YOMU_FIXTURE_BUILDER"\n', 0o755);
        const result = spawnSync(process.execPath, ['scripts/prepare-release-smokes.mjs'], {
            cwd: root, encoding: 'utf8',
            env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, YOMU_FIXTURE_NODE: process.execPath, YOMU_FIXTURE_BUILDER: join(root, 'fake-builder.mjs') },
        });
        assert.equal(result.status === 0, status === 0, result.stdout + result.stderr);
        for (const [path, data] of Object.entries(shipping)) assert.equal(readFileSync(join(root, 'dist', path), 'utf8'), data, path);
        assert.deepEqual(readdirSync(join(root, 'dist/newtab')).sort(), ['app.js', 'styles.css', ...templates].sort());
        assert.equal(readFileSync(join(root, 'dist/extension/package.zip'), 'utf8'), 'compiled package');
        assert.deepEqual(readdirSync(join(root, 'artifacts')), []);
    }
});
