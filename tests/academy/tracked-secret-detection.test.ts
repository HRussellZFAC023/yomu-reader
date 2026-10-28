import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCANNER = path.resolve('scripts/tracked-secret-scan.mjs');
const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository(files: Record<string, string>, tracked = Object.keys(files)): string {
    const root = mkdtempSync(path.join(tmpdir(), 'yomu-secret-scan-'));
    roots.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    for (const [file, content] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), content);
    }
    if (tracked.length > 0) execFileSync('git', ['-C', root, 'add', '--', ...tracked]);
    return root;
}

function scan(root: string) {
    return spawnSync(process.execPath, [SCANNER, '--root', root, '--json'], { encoding: 'utf8' });
}

describe('tracked secret detection', () => {
    it('accepts explicit fixture credentials', () => {
        const root = repository({
            'fixtures.ts': [
                "const API_TOKEN = 'mock-jpdb-token';",
                "const ACADEMY_ADMIN_TOKEN = 'sqlite-test-admin-token';",
                "const clientSecret = 'example-client-secret';",
            ].join('\n'),
        });

        const result = scan(root);
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout).findings).toEqual([]);
    });

    it('does not exempt a high-confidence credential merely because it is in a test file', () => {
        const credential = ['sk-proj', 'abcdefghijklmnopqrstuvwxyz123456'].join('-');
        const root = repository({
            'tests/copied-production.test.ts': `const copied = '${credential}';\n`,
        });

        const result = scan(root);
        const report = JSON.parse(result.stdout);
        expect(result.status).toBe(1);
        expect(report.findings).toEqual(expect.arrayContaining([
            expect.objectContaining({ rule: 'openai-api-key', file: 'tests/copied-production.test.ts' }),
        ]));
        expect(result.stdout).not.toContain(credential);
    });

    it('blocks reusable invite literals and credential patterns with redacted output', () => {
        const invite = ['TEAM', '2026', 'ALPHA'].join('-');
        const accessKey = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
        const genericCredential = ['live', 'credential', 'value'].join('-');
        const root = repository({
            'release.ts': `const inviteCode = '${invite}';\nconst apiKey = '${genericCredential}';\nconst cloudKey = '${accessKey}';\n`,
        });

        const result = scan(root);
        const report = JSON.parse(result.stdout);
        expect(result.status).toBe(1);
        expect(report.findings.map((finding: { rule: string }) => finding.rule)).toEqual([
            'invite-code-assignment',
            'credential-assignment',
            'aws-access-key',
        ]);
        expect(result.stdout).not.toContain(invite);
        expect(result.stdout).not.toContain(genericCredential);
        expect(result.stdout).not.toContain(accessKey);
    });

    it('detects the Academy reusable invite even in prose while ignoring untracked files', () => {
        const academyInvite = ['UCL', '2026'].join('');
        const untrackedKey = ['sk-proj', 'abcdefghijklmnopqrstuvwxyz123456'].join('-');
        const root = repository({
            'tracked.md': `Use ${academyInvite} for enrollment.\n`,
            'untracked.env': `OPENAI_API_KEY='${untrackedKey}'\n`,
        }, ['tracked.md']);

        const result = scan(root);
        const report = JSON.parse(result.stdout);
        expect(result.status).toBe(1);
        expect(report.findings).toMatchObject([{
            rule: 'reusable-academy-invite',
            file: 'tracked.md',
            line: 1,
        }]);
        expect(report.findings).toHaveLength(1);
    });

    it('reports the browser-visible Lens integration key as non-blocking debt', () => {
        const publicKey = ['AIza', 'abcdefghijklmnopqrstuvwxyz123456789'].join('');
        const root = repository({
            'src/gaming/ocr.ts': `const GOOGLE_LENS_API_KEY = '${publicKey}';\n`,
        });

        const result = scan(root);
        const report = JSON.parse(result.stdout);
        expect(result.status).toBe(0);
        expect(report.findings).toEqual(expect.arrayContaining([
            expect.objectContaining({ severity: 'debt', rule: 'google-api-key' }),
        ]));
        expect(report.findings.every((finding: { severity: string }) => finding.severity === 'debt')).toBe(true);
    });

    it('keeps versioned generated Lens userscripts on the same explicit public-key allowlist', () => {
        const publicKey = ['AIza', 'abcdefghijklmnopqrstuvwxyz123456789'].join('');
        const root = repository({
            'docs/public/greasyfork/yomu-ocr-manga.0123456789ab.user.js': `const GOOGLE_LENS_API_KEY = '${publicKey}';\n`,
        });

        const result = scan(root);
        const report = JSON.parse(result.stdout);
        expect(result.status).toBe(0);
        expect(report.findings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                file: 'docs/public/greasyfork/yomu-ocr-manga.0123456789ab.user.js',
                severity: 'debt',
                rule: 'google-api-key',
            }),
        ]));
    });

    it('classifies the full generated runtime Lens key as public debt', () => {
        const publicKey = ['AIza', 'abcdefghijklmnopqrstuvwxyz123456789'].join('');
        const root = repository({
            'docs/public/greasyfork/yomu-runtime.0123456789ab.user.js': `const GOOGLE_LENS_API_KEY = '${publicKey}';\n`,
        });

        const result = scan(root);
        const report = JSON.parse(result.stdout);
        expect(result.status).toBe(0);
        expect(report.findings).toEqual([
            expect.objectContaining({
                file: 'docs/public/greasyfork/yomu-runtime.0123456789ab.user.js',
                severity: 'debt',
                rule: 'google-api-key',
            }),
        ]);
    });

    it('accepts generated placeholders and local proof credentials without exempting real key shapes', () => {
        const root = repository({
            'scripts/local-runtime-proof.mjs': "const ACADEMY_ADMIN_TOKEN = 'local-proof-admin-token';\n",
            'scripts/revision.cjs': "const REVISION_TOKEN = '__ACADEMY_REVISION__';\n",
            'docs/public/api/vendor/client.js': "const accessToken = 'generated-documentation-option';\n",
        });

        const result = scan(root);
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout).findings).toEqual([]);
    });
    describe('reviewed fixture literal allowlist', () => {
        const CORPUS_FILE = 'scripts/upgrade-corpus/lib/learner-story.ts';
        // The documented fake upgrade-corpus key, assembled so this file holds no literal.
        const corpusKey = ['corpus', '0'.repeat(22), 'jpdb'].join('');
        const assignment = (value: string) => `export const CORPUS_JPDB_API_KEY = '${value}';`;
        const atLine = (line: number, content: string) => `${'// filler\n'.repeat(line - 1)}${content}\n`;

        it('accepts the exact reviewed literal at its recorded file and line, and reports it', () => {
            const result = scan(repository({ [CORPUS_FILE]: atLine(12, assignment(corpusKey)) }));
            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout).findings).toEqual([
                expect.objectContaining({ severity: 'reviewed-fixture', rule: 'credential-assignment', file: CORPUS_FILE, line: 12 }),
            ]);
            expect(result.stdout).not.toContain(corpusKey);
        });

        it('blocks the same literal when it moves line, file, or is copied elsewhere', () => {
            for (const files of ([
                { [CORPUS_FILE]: atLine(13, assignment(corpusKey)) },
                { 'scripts/upgrade-corpus/lib/other-story.ts': atLine(12, assignment(corpusKey)) },
                { 'src/reader/jpdb/key.ts': atLine(12, assignment(corpusKey)) },
            ] as Record<string, string>[])) {
                const result = scan(repository(files));
                expect(result.status).toBe(1);
                expect(JSON.parse(result.stdout).findings).toEqual([
                    expect.objectContaining({ severity: 'blocker', rule: 'credential-assignment' }),
                ]);
            }
        });

        it('still blocks a real-looking key at the reviewed location and elsewhere', () => {
            const realLooking = ['9f3b2c71', 'a04e5d88', 'c61f0b2e', '7d94a356'].join('');
            for (const files of ([
                { [CORPUS_FILE]: atLine(12, assignment(realLooking)) },
                { 'src/reader/jpdb/settings.ts': `const JPDB_API_KEY = '${realLooking}';\nconst settings = { apiKey: '${realLooking}' };\n` },
            ] as Record<string, string>[])) {
                const result = scan(repository(files));
                const report = JSON.parse(result.stdout);
                expect(result.status).toBe(1);
                expect(report.findings.length).toBeGreaterThan(0);
                expect(report.findings.every((finding: { severity: string }) => finding.severity === 'blocker')).toBe(true);
                expect(result.stdout).not.toContain(realLooking);
            }
        });
    });
});
