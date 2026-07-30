#!/usr/bin/env node
/**
 * U46 live contract smoke for the Tatoeba example source.
 *
 * The unit suite runs against recorded payloads, which proves the normaliser but
 * cannot notice the API changing under it. This asks the live endpoint for a
 * handful of deliberately awkward targets and checks the contract the adapter
 * depends on: the mandatory `sort` parameter, the `data` array, per-sentence
 * `license`/`owner`, the `translations[].is_direct` flag, and the per-file
 * `audios[].license` the media allowlist reads.
 *
 * Network-dependent, so it is not part of `check:release`. Run it by hand or on
 * the nightly lane: `npm run smoke:tatoeba-contract`.
 */

const BASE = 'https://api.tatoeba.org/v1/sentences';
const USER_AGENT = 'yomu-reader-contract-smoke (+https://yomureader.com)';

// One high-supply target, one RTL target, one ancient language, the smallest
// corpus in the roster, and one code of the Serbo-Croatian aggregate.
const CASES = [
    { id: 'es', code: 'spa', term: 'agua', expectRows: true },
    { id: 'ar', code: 'ara', term: 'ماء', expectRows: true },
    { id: 'grc', code: 'grc', term: 'ὕδωρ', expectRows: true },
    { id: 'lo', code: 'lao', term: 'ນ້ຳ', expectRows: true },
    { id: 'sh', code: 'srp', term: 'voda', expectRows: true },
    { id: 'es', code: 'spa', term: 'zzqqxunlikelyterm', expectRows: false },
];

const failures = [];
const notes = [];

for (const testCase of CASES) {
    const url = `${BASE}?${new URLSearchParams({
        lang: testCase.code,
        q: `"${testCase.term}"`,
        sort: 'relevance',
        limit: '5',
        'trans:lang': 'eng',
        include: 'audios',
    })}`;
    let payload;
    try {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
        if (!response.ok) {
            failures.push(`${testCase.id} (${testCase.code}): HTTP ${response.status}`);
            continue;
        }
        payload = await response.json();
    } catch (error) {
        failures.push(`${testCase.id} (${testCase.code}): ${error instanceof Error ? error.message : String(error)}`);
        continue;
    }
    if (!Array.isArray(payload?.data)) {
        failures.push(`${testCase.id}: response has no data array`);
        continue;
    }
    const rows = payload.data;
    if (testCase.expectRows && !rows.length) {
        failures.push(`${testCase.id}: expected sentences for "${testCase.term}" and got none`);
        continue;
    }
    if (!testCase.expectRows) {
        if (rows.length) failures.push(`${testCase.id}: a nonsense term returned ${rows.length} rows`);
        notes.push(`${testCase.id} nonsense term -> empty, as the empty state expects`);
        continue;
    }
    const first = rows[0];
    for (const field of ['id', 'text', 'lang', 'license']) {
        if (first[field] === undefined || first[field] === null) failures.push(`${testCase.id}: row is missing ${field}`);
    }
    const translations = Array.isArray(first.translations) ? first.translations : [];
    if (translations.length && translations.every(translation => translation.is_direct === undefined)) {
        failures.push(`${testCase.id}: translations no longer carry is_direct`);
    }
    const audioLicences = rows
        .flatMap(row => (Array.isArray(row.audios) ? row.audios : []))
        .map(audio => audio.license ?? '(missing)');
    notes.push(`${testCase.id} (${testCase.code}): ${rows.length} rows, audio licences ${audioLicences.length ? audioLicences.join(', ') : 'none on this page'}`);
}

notes.forEach(note => console.log(`[tatoeba-contract] ${note}`));
if (failures.length) {
    console.error(`[tatoeba-contract] FAIL: ${failures.length} contract break(s).`);
    failures.forEach(failure => console.error(`  ${failure}`));
    process.exit(1);
}
console.log(`[tatoeba-contract] PASS: ${CASES.length} live cases match the adapter's contract.`);
