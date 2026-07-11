// Validate framework-crosswalk.json against the concept registry.
// Every grammar/function/skill concept needs a per-concept crosswalk row.
// Every kanji/vocab-set/phonology concept must be covered by a bandCrosswalk rule.
// Run: node scripts/academy-curriculum/validate-crosswalk.mjs
import { loadMapping, makeReport, printResult, JLPT_BANDS } from './lib/load.mjs';

const PER_CONCEPT_TYPES = new Set(['grammar', 'function', 'skill']);
const BAND_TYPES = new Set(['kanji', 'vocab-set', 'phonology']);
const CONFIDENCE = new Set(['high', 'approximate', 'scope']);

export function validate() {
    const report = makeReport('crosswalk');
    const concepts = loadMapping('concepts.json');
    const crosswalk = loadMapping('framework-crosswalk.json');

    const byId = new Map(concepts.concepts.map((c) => [c.id, c]));
    const rowByConcept = new Map();

    for (const row of crosswalk.conceptCrosswalk) {
        if (!byId.has(row.concept)) { report.error(`crosswalk row references unknown concept "${row.concept}"`); continue; }
        if (rowByConcept.has(row.concept)) report.error(`duplicate crosswalk row for ${row.concept}`);
        rowByConcept.set(row.concept, row);

        const c = byId.get(row.concept);
        if (!PER_CONCEPT_TYPES.has(c.type)) report.error(`${row.concept}: type "${c.type}" should be covered by bandCrosswalk, not a per-concept row`);
        if (!JLPT_BANDS.includes(row.jlpt)) report.error(`${row.concept}: crosswalk jlpt "${row.jlpt}" invalid`);
        if (row.jlpt !== c.jlpt) report.warn(`${row.concept}: crosswalk jlpt (${row.jlpt}) differs from concept jlpt (${c.jlpt})`);

        for (const key of ['genki', 'minna']) {
            const cell = row[key];
            if (!cell || !cell.ref) { report.error(`${row.concept}: missing ${key}.ref`); continue; }
            if (!CONFIDENCE.has(cell.confidence)) report.error(`${row.concept}: ${key}.confidence "${cell.confidence}" invalid`);
        }
        if (!row.jfCanDo || !row.jfCanDo.cefr || !row.jfCanDo.ref) report.error(`${row.concept}: jfCanDo must have cefr and ref`);
        if (!Array.isArray(row.evidence) || row.evidence.length === 0) report.error(`${row.concept}: crosswalk row needs evidence`);
    }

    // Band rules: index by type + jlpt (phonology matches by type only).
    const bandByType = new Map();
    for (const rule of crosswalk.bandCrosswalk) {
        const t = rule.appliesTo?.type;
        if (!BAND_TYPES.has(t)) report.error(`bandCrosswalk rule has non-band type "${t}"`);
        const key = t === 'phonology' ? 'phonology' : `${t}:${rule.appliesTo.jlpt}`;
        bandByType.set(key, rule);
    }

    // Coverage: every concept is covered.
    for (const c of concepts.concepts) {
        if (PER_CONCEPT_TYPES.has(c.type)) {
            if (!rowByConcept.has(c.id)) report.error(`${c.id}: ${c.type} concept has no crosswalk row`);
        } else if (BAND_TYPES.has(c.type)) {
            const key = c.type === 'phonology' ? 'phonology' : `${c.type}:${c.jlpt}`;
            if (!bandByType.has(key)) report.error(`${c.id}: no bandCrosswalk rule for ${key}`);
        }
    }

    return report.finish();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const ok = printResult(validate());
    process.exit(ok ? 0 : 1);
}
