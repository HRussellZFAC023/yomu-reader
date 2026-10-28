import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { hostedTemplateInputs, hostedTemplates } from '../../scripts/lib/hosted-template-inputs.mjs';

test('authored hosted template edits invalidate sync; regenerated revisions do not', t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-template-inputs-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const path of hostedTemplates) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), readFileSync(path));
    }
    const original = hostedTemplateInputs(root);
    for (const path of hostedTemplates) {
        const absolute = join(root, path);
        const source = readFileSync(absolute, 'utf8');
        writeFileSync(absolute, source.replace(/\b[a-f\d]{12}\b/g, '123456789abc'));
    }
    assert.deepEqual(hostedTemplateInputs(root), original);
    const path = join(root, hostedTemplates[0]);
    writeFileSync(path, readFileSync(path, 'utf8') + '\n<!-- authored edit -->');
    assert.notDeepEqual(hostedTemplateInputs(root), original);
});
