// Every command the contributor docs tell you to run has to exist.
//
// AGENTS.md told every agent to run `npm run qa:live` for months after the
// script was deleted, and a QA audit in docs/qa recorded not running it as if it
// were a real command that was merely unavailable. A named command that does not
// exist reads as coverage and delivers none.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DOCS = ['README.md', 'AGENTS.md', 'CONTEXT.md'];

function scriptNames(file: string): Set<string> {
    return new Set(Object.keys(JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')).scripts ?? {}));
}

describe('documented npm commands', () => {
    it('names only scripts that exist', () => {
        // video/ is a separate package with its own lockfile, and README invokes
        // its commands as `cd video && npm run frames` on a line that also names
        // root commands, so both packages count as defining a name.
        const defined = new Set([...scriptNames('package.json'), ...scriptNames('video/package.json')]);

        for (const file of DOCS) {
            const source = readFileSync(path.join(ROOT, file), 'utf8');
            for (const match of source.matchAll(/npm run ([a-z0-9:@._-]+)/giu)) {
                const name = match[1].replace(/[.,)`]+$/u, '');
                expect(defined.has(name), `${file} names \`npm run ${name}\`, which no package.json defines`)
                    .toBe(true);
            }
        }
    });

    it('keeps the advertised quality command a real chain of real stages', () => {
        // README:128 and AGENTS.md advertise `npm run qa`. Its last stage used to
        // fail on 51 functions over the complexity threshold, so the command
        // could not pass and nothing behind it was ever reached.
        const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
        const qa: string = scripts.qa;
        expect(qa).toContain('node scripts/complexity-audit.mjs');
        for (const stage of qa.split('&&').map(part => part.trim())) {
            const named = /^npm run (\S+)$/u.exec(stage)?.[1];
            if (named) expect(Object.keys(scripts), `qa runs npm run ${named}`).toContain(named);
        }
        // The ratchet has to run somewhere that actually runs, not only inside a
        // command a contributor may never invoke.
        expect(readFileSync(path.join(ROOT, 'scripts/run-check.mjs'), 'utf8'))
            .toContain('node scripts/complexity-audit.mjs');
        expect(readFileSync(path.join(ROOT, 'scripts/run-check.mjs'), 'utf8'))
            .toContain("stage('multilingual-parity-ratchet', 'npm run -s quality:multilingual-parity')");
    });
});
