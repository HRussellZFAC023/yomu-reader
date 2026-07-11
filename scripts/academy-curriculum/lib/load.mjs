// Shared loaders and constants for the Yomu Academy curriculum-mapping validators.
// Pure Node built-ins; no dependencies. ESM.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../..');

export const MAPPINGS_DIR = resolve(REPO_ROOT, 'public/academy/content/mappings');
export const QA_DIR = resolve(REPO_ROOT, 'public/academy/content/linguistic-qa');
export const SOURCE_DIR = resolve(REPO_ROOT, 'src/academy');

export const LEVEL_BANDS = ['pre-N5', 'N5', 'N4', 'N4+', 'N3-bridge', 'N3'];
export const JLPT_BANDS = ['N5', 'N4', 'N3'];
export const CONCEPT_TYPES = ['grammar', 'kanji', 'vocab-set', 'function', 'skill', 'phonology'];
export const TYPE_PREFIX = {
    grammar: 'grammar:',
    kanji: 'kanji:',
    'vocab-set': 'vocab:',
    function: 'function:',
    skill: 'skill:',
    phonology: 'phon:',
};

// Foundation route lesson ids (routeNumber 0-9) and warm-layer lesson ids.
export const FOUNDATION_LESSON_IDS = [
    'kana-on-ramp',
    'lesson-01-hajimemashite',
    'lesson-02-town-prices',
    'lesson-03-food-invitations',
    'lesson-04-routines-past-te',
    'lesson-05-n4-bridge',
    'lesson-06-parallel-reasons',
    'lesson-07-states-completion',
    'lesson-08-preparation',
    'lesson-09-shared-plans',
];
export const WARM_LAYER_LESSON_IDS = ['lesson-28', 'lesson-29', 'lesson-30'];
export const ALL_LESSON_IDS = [...FOUNDATION_LESSON_IDS, ...WARM_LAYER_LESSON_IDS];

export function loadJson(absPath) {
    const raw = readFileSync(absPath, 'utf8');
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(`Invalid JSON in ${absPath}: ${err.message}`);
    }
}

export function loadMapping(name) {
    return loadJson(resolve(MAPPINGS_DIR, name));
}

export function loadQa(name) {
    return loadJson(resolve(QA_DIR, name));
}

export function readSource(name) {
    const p = resolve(SOURCE_DIR, name);
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

// A tiny result collector so every validator speaks the same protocol.
export function makeReport(validator) {
    const errors = [];
    const warnings = [];
    return {
        validator,
        error: (msg) => errors.push(msg),
        warn: (msg) => warnings.push(msg),
        errors,
        warnings,
        finish() {
            return { validator, ok: errors.length === 0, errors, warnings };
        },
    };
}

export function printResult(result) {
    const tag = result.ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${result.validator}  (${result.errors.length} error(s), ${result.warnings.length} warning(s))`);
    for (const w of result.warnings) console.log(`   warn: ${w}`);
    for (const e of result.errors) console.log(`   error: ${e}`);
    return result.ok;
}
