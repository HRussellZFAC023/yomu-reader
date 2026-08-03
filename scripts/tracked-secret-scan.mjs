import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BINARY_EXTENSIONS = new Set([
    '.7z', '.avi', '.bin', '.bmp', '.bz2', '.class', '.dmg', '.eot', '.flac', '.gif',
    '.gz', '.ico', '.jpeg', '.jpg', '.m4a', '.m4v', '.mov', '.mp3', '.mp4', '.ogg',
    '.otf', '.pdf', '.png', '.tar', '.tif', '.tiff', '.ttf', '.wav', '.webm', '.webp',
    '.woff', '.woff2', '.xz', '.zip',
]);

const MAX_TEXT_BYTES = 20 * 1024 * 1024;
const MAX_REPORTED_FINDINGS = 80;

const RULES = [
    {
        id: 'reusable-academy-invite',
        description: 'reusable Academy invite literal',
        pattern: /\bUCL\d{4}\b/g,
    },
    {
        id: 'invite-code-assignment',
        description: 'invite/access code assigned as a reusable literal',
        pattern: /\b(?:inviteCode|invite_code|classCode|class_code|accessCode|access_code|seedCode|seed_code)\b\s*(?:=|:)\s*(['"`])([A-Z0-9][A-Z0-9-]{5,63})\1/gi,
        valueGroup: 2,
    },
    {
        id: 'credential-assignment',
        description: 'credential-shaped name assigned a literal value',
        pattern: /["']?((?:apiKey|adminToken|authToken|accessToken|refreshToken|clientSecret|privateKey|hmacKey|password|passwd)|(?:[a-z][A-Za-z0-9]*(?:ApiKey|AdminToken|AuthToken|AccessToken|RefreshToken|ClientSecret|PrivateKey|HmacKey|Password|Passwd))|(?:(?:bunpro|jpdb|jiten|stripe|openai|google|slack|github|aws|cloudVision)[A-Za-z0-9]*Token)|(?:[A-Z][A-Z0-9_]*(?:_TOKEN|_SECRET|_PASSWORD|_PASSWD|_API_KEY|_PRIVATE_KEY|_HMAC_KEY))|(?:access_token|refresh_token|client_secret|api_key|private_key|hmac_key))["']?\s*(?:=|:)\s*(['"`])([^'"`\r\n]{8,})\2/g,
        valueGroup: 3,
    },
    {
        id: 'aws-access-key',
        description: 'AWS access key',
        pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    },
    {
        id: 'github-token',
        description: 'GitHub access token',
        pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})\b/g,
    },
    {
        id: 'openai-api-key',
        description: 'OpenAI API key',
        pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    },
    {
        id: 'stripe-live-key',
        description: 'Stripe live secret key',
        pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g,
    },
    {
        id: 'slack-token',
        description: 'Slack access token',
        pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
    },
    {
        id: 'google-api-key',
        description: 'Google API key',
        pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    },
    {
        id: 'jwt',
        description: 'serialized JSON Web Token',
        pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    },
    {
        id: 'private-key',
        description: 'private key material',
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    },
];

function parseArguments(argv) {
    const options = { root: process.cwd(), json: false };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--json') {
            options.json = true;
        } else if (argument === '--root' && argv[index + 1]) {
            options.root = argv[index + 1];
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return options;
}

function trackedFiles(root) {
    const output = execFileSync('git', ['-C', root, 'ls-files', '-z'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    return output.split('\0').filter(Boolean);
}

function fixtureValue(value) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || /^(?:\$\{|<|\[?redacted|process\.env\.|import\.meta\.env\.)/.test(normalized)) return true;
    if (/^__[a-z0-9_-]+__$/.test(normalized)) return true;
    if (/(?:^|[-_.:/])(?:test|mock|fixture|example|fake|dummy|placeholder|redacted|opaque|sample)(?:$|[-_.:/])/.test(normalized)) return true;
    if (/^(?:x|0|1|a){8,}$/.test(normalized) || /^(?:change|replace)[-_ ]?me$/.test(normalized)) return true;
    return false;
}

function fixturePath(file) {
    return /(?:^|\/)(?:tests?|__fixtures__|fixtures?)(?:\/|$)/.test(file)
        || /^scripts\/[^/]*(?:smoke|fixture|profile|proof|qa)[^/]*\.[cm]?[jt]s$/.test(file)
        || /^docs\/public\/api\/vendor\//.test(file);
}

function findingSeverity(file, rule) {
    const publicLensKey = /^(?:src\/(?:gaming\/ocr\.ts|reader\/ocr\/(?:controller|ocr-providers)\.ts)|docs\/public\/(?:study\/app\.js|greasyfork\/yomu-(?:ocr-manga|runtime)(?:\.[0-9a-f]{12})?\.user\.js))$/.test(file);
    if (publicLensKey && (rule === 'google-api-key' || rule === 'credential-assignment')) return 'debt';
    return 'blocker';
}

function lineNumberAt(text, offset) {
    let line = 1;
    for (let index = 0; index < offset; index += 1) {
        if (text.charCodeAt(index) === 10) line += 1;
    }
    return line;
}

export function scanText(file, text) {
    const findings = [];
    for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        for (const match of text.matchAll(rule.pattern)) {
            const value = rule.valueGroup ? match[rule.valueGroup] : match[0];
            if (rule.id === 'credential-assignment' && fixturePath(file)) continue;
            if (rule.valueGroup && fixtureValue(value)) continue;
            if (rule.id === 'credential-assignment' && /\s/.test(value)) continue;
            findings.push({
                severity: findingSeverity(file, rule.id),
                rule: rule.id,
                description: rule.description,
                file,
                line: lineNumberAt(text, match.index ?? 0),
            });
        }
    }
    return findings.filter(finding => finding.rule !== 'credential-assignment'
        || !findings.some(other => other !== finding
            && other.file === finding.file
            && other.line === finding.line
            && other.rule !== 'credential-assignment'));
}

export function scanTrackedFiles(root) {
    const findings = [];
    const skipped = [];
    let scanned = 0;

    for (const file of trackedFiles(root)) {
        const absolute = path.join(root, file);
        if (!existsSync(absolute)) continue;
        if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;

        const size = statSync(absolute).size;
        if (size > MAX_TEXT_BYTES) {
            skipped.push({ file, reason: `text candidate exceeds ${MAX_TEXT_BYTES} bytes` });
            continue;
        }

        const bytes = readFileSync(absolute);
        if (bytes.subarray(0, 8192).includes(0)) continue;
        scanned += 1;
        findings.push(...scanText(file, bytes.toString('utf8')));
    }

    return { root, scanned, findings, skipped };
}

function printHuman(result) {
    const blockers = result.findings.filter(finding => finding.severity === 'blocker');
    const debt = result.findings.filter(finding => finding.severity === 'debt');
    if (blockers.length === 0 && result.skipped.length === 0) {
        console.log(`PASS tracked-secret scan (${result.scanned} tracked text files)`);
    } else {
        console.error(`BLOCKER tracked-secret scan found ${blockers.length} credential or reusable-invite literal(s) and ${result.skipped.length} unscanned oversized text candidate(s).`);
        for (const finding of blockers.slice(0, MAX_REPORTED_FINDINGS)) {
            console.error(`  ${finding.file}:${finding.line} [${finding.rule}] ${finding.description} ([redacted])`);
        }
        if (blockers.length > MAX_REPORTED_FINDINGS) {
            console.error(`  ... ${blockers.length - MAX_REPORTED_FINDINGS} additional finding(s) omitted`);
        }
        for (const item of result.skipped) console.error(`  ${item.file}: ${item.reason}`);
    }

    if (debt.length > 0) {
        console.error(`DEBT tracked-secret scan found ${debt.length} allowlisted public credential occurrence(s).`);
        for (const finding of debt) {
            console.error(`  ${finding.file}:${finding.line} [${finding.rule}] ${finding.description} ([redacted], non-blocking)`);
        }
    }
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    const result = scanTrackedFiles(path.resolve(options.root));
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    process.exitCode = (result.skipped.length > 0
        || result.findings.some(finding => finding.severity === 'blocker')) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
