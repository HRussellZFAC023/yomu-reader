import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function functionSource(source, name) {
    const start = source.indexOf(`\nfunction ${name}(`);
    const next = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, next < 0 ? undefined : next);
}
function functionFrom(file, name) {
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf(`\nfunction ${name}(`);
    assert.ok(start >= 0, `${file}: ${name}`);
    const next = source.indexOf('\nfunction ', start + 1);
    const body = source.slice(start, next < 0 ? undefined : next);
    const dependency = name === 'readJsonConstant' && source.includes('function jsonConstantRange(')
        ? functionSource(source, 'jsonConstantRange') : '';
    return Function(`${dependency}\n${body}; return ${name};`)();
}
test('both cast owner scripts can parse every JSON constant they read', () => {
    const manifest = readFileSync('src/academy/domain/cast-standardization-manifest.ts', 'utf8');
    for (const file of ['scripts/academy-cast-promote.mjs', 'scripts/academy-cast-manifest-refresh.mjs']) {
        const source = readFileSync(file, 'utf8');
        const read = functionFrom(file, 'readJsonConstant');
        for (const [, name, suffix] of source.matchAll(/readJsonConstant\(\s*source,\s*'([^']+)'(?:,\s*'([^']+)')?/g)) {
            const value = read(manifest, name, suffix);
            assert.ok(value && typeof value === 'object', `${file}: ${name}`);
        }
    }
});
test('story promotion emits only consumed manifest data', () => {
    const render = functionFrom('scripts/academy-story-art-promote.mjs', 'renderManifest');
    const output = render({ node: { assetId: 'art' } }, { art: { files: {} } });
    assert.match(output, /ACADEMY_STORY_ART_BY_NODE/);
    assert.match(output, /ACADEMY_STORY_ART_RUNTIME_ASSETS/);
    assert.ok(!output.includes('ACADEMY_STORY_ART_COVERAGE'));
});
