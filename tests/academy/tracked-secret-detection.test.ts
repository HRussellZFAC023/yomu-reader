// Filesystem/subprocess inputs, including generic helpers called by this test.
// @yomu-reads scripts/tracked-secret-scan.mjs
// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCANNER = path.resolve('scripts/tracked-secret-scan.mjs');
const CORPUS_FILE = 'scripts/upgrade-corpus/lib/learner-story.ts';
const corpusKey = ['corpus', '0'.repeat(22), 'jpdb'].join('');
const credential = ['sk-proj', 'abcdefghijklmnopqrstuvwxyz123456'].join('-');
const invite = ['TEAM', '2026', 'ALPHA'].join('-');
const academyInvite = ['UCL', '2026'].join('');
const accessKey = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const genericCredential = ['live', 'credential', 'value'].join('-');
const publicKey = ['AIza', 'abcdefghijklmnopqrstuvwxyz123456789'].join('');
const realLooking = ['9f3b2c71', 'a04e5d88', 'c61f0b2e', '7d94a356'].join('');
const assignment = (value: string) => `export const CORPUS_JPDB_API_KEY = '${value}';`;
const atLine = (line: number, content: string) => `${'// filler\n'.repeat(line - 1)}${content}\n`;
const roots: string[] = [];
interface Finding { rule: string; file: string; line: number; severity: string }
interface Scan { status: number | null; stdout: string; findings: Finding[] }
let clean: Scan;
let blocked: Scan;
let moved: Scan;
let replaced: Scan;

function scan(files: Record<string, string>, untracked: Record<string, string> = {}): Scan {
    const root = mkdtempSync(path.join(tmpdir(), 'yomu-secret-scan-'));
    roots.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    for (const [file, content] of Object.entries({ ...files, ...untracked })) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), content);
    }
    execFileSync('git', ['-C', root, 'add', '--', ...Object.keys(files)]);
    const result = spawnSync(process.execPath, [SCANNER, '--root', root, '--json'], { encoding: 'utf8' });
    if (result.error) throw result.error;
    return { status: result.status, stdout: result.stdout, findings: JSON.parse(result.stdout).findings };
}

beforeAll(() => {
    clean = scan({
        'fixtures.ts': "const API_TOKEN = 'mock-jpdb-token';\nconst ACADEMY_ADMIN_TOKEN = 'sqlite-test-admin-token';\nconst clientSecret = 'example-client-secret';",
        'scripts/local-runtime-proof.mjs': "const ACADEMY_ADMIN_TOKEN = 'local-proof-admin-token';",
        'scripts/revision.cjs': "const REVISION_TOKEN = '__ACADEMY_REVISION__';",
        'docs/public/api/vendor/client.js': "const accessToken = 'generated-documentation-option';",
        'src/gaming/ocr.ts': `const GOOGLE_LENS_API_KEY = '${publicKey}';`,
        'docs/public/greasyfork/yomu-ocr-manga.0123456789ab.user.js': `const GOOGLE_LENS_API_KEY = '${publicKey}';`,
        'docs/public/greasyfork/yomu-runtime.0123456789ab.user.js': `const GOOGLE_LENS_API_KEY = '${publicKey}';`,
        [CORPUS_FILE]: atLine(12, assignment(corpusKey)),
    }, { 'untracked.txt': `OPENAI_API_KEY='${credential}'` });
    blocked = scan({
        'tests/copied-production.test.ts': `const copied = '${credential}';`,
        'release.ts': `const inviteCode = '${invite}';\nconst apiKey = '${genericCredential}';\nconst cloudKey = '${accessKey}';`,
        'tracked.md': `Use ${academyInvite} for enrollment.`,
        'scripts/upgrade-corpus/lib/other-story.ts': atLine(12, assignment(corpusKey)),
        'src/reader/jpdb/key.ts': atLine(12, assignment(corpusKey)),
        'src/reader/jpdb/settings.ts': `const JPDB_API_KEY = '${realLooking}';\nconst settings = { apiKey: '${realLooking}' };`,
    });
    moved = scan({ [CORPUS_FILE]: atLine(13, assignment(corpusKey)) });
    replaced = scan({ [CORPUS_FILE]: atLine(12, assignment(realLooking)) });
});
afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('tracked secret detection', () => {
    it('accepts explicit fixture credentials, generated placeholders and untracked files', () => {
        expect(clean.status).toBe(0);
        expect(clean.findings.filter(finding => !['debt', 'reviewed-fixture'].includes(finding.severity))).toEqual([]);
        expect(clean.findings.some(finding => finding.file === 'untracked.txt')).toBe(false);
    });
    it('does not exempt a high-confidence credential in a test file', () => {
        expect(blocked.status).toBe(1);
        expect(blocked.findings).toContainEqual(expect.objectContaining({ rule: 'openai-api-key', file: 'tests/copied-production.test.ts' }));
    });
    it('blocks reusable invite literals and credential patterns', () => {
        expect(blocked.findings.filter(finding => finding.file === 'release.ts').map(finding => finding.rule))
            .toEqual(['invite-code-assignment', 'credential-assignment', 'aws-access-key']);
        expect(blocked.findings.filter(finding => finding.file === 'tracked.md'))
            .toMatchObject([{ rule: 'reusable-academy-invite', line: 1 }]);
    });
    it.each([
        'src/gaming/ocr.ts',
        'docs/public/greasyfork/yomu-ocr-manga.0123456789ab.user.js',
        'docs/public/greasyfork/yomu-runtime.0123456789ab.user.js',
    ])('reports the public Lens key as non-blocking debt in %s', file => {
        expect(clean.findings.filter(finding => finding.file === file))
            .toMatchObject([{ severity: 'debt', rule: 'google-api-key' }]);
    });
    it('accepts and reports only the exact reviewed literal at its recorded file and line', () => {
        expect(clean.findings.filter(finding => finding.file === CORPUS_FILE))
            .toMatchObject([{ severity: 'reviewed-fixture', rule: 'credential-assignment', line: 12 }]);
        expect(moved.status).toBe(1);
        expect(replaced.status).toBe(1);
        for (const result of [moved, replaced]) {
            expect(result.findings).toMatchObject([{ severity: 'blocker', rule: 'credential-assignment' }]);
        }
        for (const file of ['scripts/upgrade-corpus/lib/other-story.ts', 'src/reader/jpdb/key.ts', 'src/reader/jpdb/settings.ts']) {
            const findings = blocked.findings.filter(finding => finding.file === file);
            expect(findings.length).toBeGreaterThan(0);
            expect(findings.every(finding => finding.severity === 'blocker')).toBe(true);
        }
    });
    it('redacts every credential from the scanner output', () => {
        for (const result of [clean, blocked, moved, replaced]) {
            for (const value of [credential, invite, academyInvite, accessKey, genericCredential, publicKey, realLooking, corpusKey]) {
                expect(result.stdout).not.toContain(value);
            }
        }
    });
});
