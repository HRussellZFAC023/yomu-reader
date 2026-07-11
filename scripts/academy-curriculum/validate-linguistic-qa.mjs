// Validate the linguistic-qa artifacts.
// Enforces the non-fabrication rule for pitch accent: every entry is either a
// non-negative integer downstep or null, and null entries must carry a review
// flag and an uncertain source. Every entry carries reviewFlag = true.
// Run: node scripts/academy-curriculum/validate-linguistic-qa.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadQa, loadMapping, makeReport, printResult, QA_DIR, ALL_LESSON_IDS } from './lib/load.mjs';

const QA_DOMAINS = new Set([
    'grammar', 'particle', 'conjugation', 'counter', 'naturalness', 'register',
    'kanji-reading', 'furigana', 'vocabulary', 'orthography', 'pitch-accent',
]);
const SEVERITIES = new Set(['info', 'low', 'medium', 'high']);
const STATUSES = new Set(['open', 'verified-correct', 'fixed', 'wontfix', 'needs-native-review']);
const PATTERNS = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka']);
const LESSON_SCOPES = new Set([...ALL_LESSON_IDS, 'multiple', 'global', 'cross-lesson']);

function requireFile(name, report) {
    const p = resolve(QA_DIR, name);
    if (!existsSync(p)) { report.error(`missing required file: public/academy/content/linguistic-qa/${name}`); return null; }
    return loadQa(name);
}

export function validate() {
    const report = makeReport('linguistic-qa');

    // Concept ids for target cross-refs (optional but validated when present).
    let conceptIds = new Set();
    try { conceptIds = new Set(loadMapping('concepts.json').concepts.map((c) => c.id)); } catch { /* mappings validated elsewhere */ }

    // --- qa-findings.json ---
    const qa = requireFile('qa-findings.json', report);
    if (qa) {
        for (const f of qa.findings || []) {
            if (!f.id) report.error('qa finding missing id');
            if (!QA_DOMAINS.has(f.domain)) report.error(`qa finding ${f.id}: invalid domain "${f.domain}"`);
            if (!SEVERITIES.has(f.severity)) report.error(`qa finding ${f.id}: invalid severity "${f.severity}"`);
            if (f.status && !STATUSES.has(f.status)) report.error(`qa finding ${f.id}: invalid status "${f.status}"`);
            if (f.lesson && !LESSON_SCOPES.has(f.lesson)) report.error(`qa finding ${f.id}: lesson "${f.lesson}" is not a known lesson scope`);
            if (!f.target) report.error(`qa finding ${f.id}: missing target`);
        }
        if (!Array.isArray(qa.confirmations)) report.error('qa-findings.json: confirmations must be an array');
    }

    // --- pitch-accent.json (non-fabrication rules) ---
    const pitch = requireFile('pitch-accent.json', report);
    if (pitch) {
        const seen = new Set();
        for (const e of pitch.entries || []) {
            const key = `${e.word}/${e.reading}`;
            if (seen.has(key)) report.error(`pitch: duplicate entry ${key}`);
            seen.add(key);
            if (!e.word || !e.reading) report.error(`pitch ${key}: word and reading required`);
            if (e.reviewFlag !== true) report.error(`pitch ${key}: reviewFlag must be true (all pitch data needs OJAD/NHK confirmation)`);
            if (e.accent === null) {
                if (e.pattern !== null) report.error(`pitch ${key}: accent null but pattern is not null (do not fabricate a pattern)`);
                if (e.source !== 'null-uncertain') report.error(`pitch ${key}: accent null must have source "null-uncertain"`);
                if (e.confidence !== 'low') report.error(`pitch ${key}: accent null must have confidence "low"`);
            } else {
                if (!Number.isInteger(e.accent) || e.accent < 0) report.error(`pitch ${key}: accent must be a non-negative integer or null (got ${JSON.stringify(e.accent)})`);
                if (e.pattern !== null && !PATTERNS.has(e.pattern)) report.error(`pitch ${key}: invalid pattern "${e.pattern}"`);
                if (e.source === 'null-uncertain') report.error(`pitch ${key}: has an accent number but source says null-uncertain`);
                // Consistency: heiban <=> accent 0; atamadaka <=> accent 1.
                if (e.pattern === 'heiban' && e.accent !== 0) report.error(`pitch ${key}: pattern heiban requires accent 0`);
                if (e.pattern === 'atamadaka' && e.accent !== 1) report.error(`pitch ${key}: pattern atamadaka requires accent 1`);
                if (e.accent === 0 && e.pattern && e.pattern !== 'heiban') report.error(`pitch ${key}: accent 0 must be heiban`);
            }
        }
    }

    // --- furigana-segmentation.json ---
    const furi = requireFile('furigana-segmentation.json', report);
    if (furi) {
        for (const c of furi.checks || []) {
            if (!c.word || !c.reading) report.error(`furigana check missing word/reading: ${JSON.stringify(c).slice(0, 60)}`);
            if (c.lesson && !LESSON_SCOPES.has(c.lesson)) report.error(`furigana check: lesson "${c.lesson}" unknown`);
            if (c.status && !STATUSES.has(c.status)) report.error(`furigana check ${c.word}: invalid status "${c.status}"`);
        }
    }

    return report.finish();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const ok = printResult(validate());
    process.exit(ok ? 0 : 1);
}
