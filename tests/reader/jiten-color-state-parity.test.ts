import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SHIPPED_TEXT_ARTIFACTS = [
    'dist/yomu.user.js',
    'docs/public/yomu.user.js',
    'docs/public/study/app.js',
    'docs/public/greasyfork/yomu-settings-surface.user.js',
    'docs/public/greasyfork/yomu-video.user.js',
].map(path => [path, readFileSync(path, 'utf8')] as const);

describe('Jiten color state parity CSS', () => {
    it('does not ship standalone Legacy copy tokens', () => {
        for (const [path, text] of SHIPPED_TEXT_ARTIFACTS) {
            expect({ path, matches: text.match(/\bLegacy\b/g) ?? [] }).toEqual({ path, matches: [] });
        }
    });


});
