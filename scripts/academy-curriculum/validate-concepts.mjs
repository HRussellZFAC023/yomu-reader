// Validate the canonical concept registry (concepts.json) and sources.json.
// Run: node scripts/academy-curriculum/validate-concepts.mjs
import {
    loadMapping, makeReport, printResult,
    CONCEPT_TYPES, TYPE_PREFIX, LEVEL_BANDS, JLPT_BANDS, ALL_LESSON_IDS,
} from './lib/load.mjs';

export function validate() {
    const report = makeReport('concepts');
    const sources = loadMapping('sources.json');
    const concepts = loadMapping('concepts.json');

    const sourceIds = new Set(sources.sources.map((s) => s.id));
    if (sourceIds.size !== sources.sources.length) report.error('sources.json has duplicate source ids');

    const lessonIds = new Set([...ALL_LESSON_IDS, ...concepts.lessonIndex.map((l) => l.lesson)]);
    const byId = new Map();

    for (const c of concepts.concepts) {
        if (!c.id) { report.error(`concept missing id: ${JSON.stringify(c).slice(0, 80)}`); continue; }
        if (byId.has(c.id)) report.error(`duplicate concept id: ${c.id}`);
        byId.set(c.id, c);

        if (!CONCEPT_TYPES.includes(c.type)) report.error(`${c.id}: unknown type "${c.type}"`);
        const prefix = TYPE_PREFIX[c.type];
        if (prefix && !c.id.startsWith(prefix)) report.error(`${c.id}: id prefix does not match type "${c.type}" (expected ${prefix})`);

        if (!LEVEL_BANDS.includes(c.levelBand)) report.error(`${c.id}: invalid levelBand "${c.levelBand}"`);
        if (!JLPT_BANDS.includes(c.jlpt)) report.error(`${c.id}: invalid jlpt "${c.jlpt}"`);

        if (!c.label || !c.label.en || !c.label.ja) report.error(`${c.id}: label must have en and ja`);

        // firstIntroduced may be null only for uncovered/incidental phonology concepts.
        if (c.firstIntroduced === null) {
            if (c.type !== 'phonology') report.error(`${c.id}: firstIntroduced null is only allowed for phonology concepts`);
        } else if (c.firstIntroduced) {
            if (!lessonIds.has(c.firstIntroduced.lesson)) report.error(`${c.id}: firstIntroduced.lesson "${c.firstIntroduced.lesson}" not a known lesson`);
        } else {
            report.error(`${c.id}: missing firstIntroduced`);
        }

        if (!Array.isArray(c.prerequisites)) report.error(`${c.id}: prerequisites must be an array`);
        if (!Array.isArray(c.reviewedIn)) report.error(`${c.id}: reviewedIn must be an array`);
        for (const r of c.reviewedIn || []) {
            if (!lessonIds.has(r)) report.error(`${c.id}: reviewedIn references unknown lesson "${r}"`);
        }

        if (!Array.isArray(c.evidence) || c.evidence.length === 0) {
            report.error(`${c.id}: evidence must be a non-empty array`);
        } else {
            for (const e of c.evidence) {
                if (!e.source || !sourceIds.has(e.source)) report.error(`${c.id}: evidence.source "${e.source}" not in sources.json`);
                if (!e.note) report.error(`${c.id}: evidence entry missing note`);
            }
        }
    }

    // Prerequisites must resolve; no self-loops; no cycles.
    for (const c of concepts.concepts) {
        for (const p of c.prerequisites || []) {
            if (p === c.id) report.error(`${c.id}: prerequisite references itself`);
            if (!byId.has(p)) report.error(`${c.id}: prerequisite "${p}" is not a known concept`);
        }
    }
    detectCycles(concepts.concepts, report);

    // A prerequisite should be introduced no later than its dependent (weak chronology check).
    const order = (id) => {
        const c = byId.get(id);
        if (!c || !c.firstIntroduced) return null;
        return c.firstIntroduced.routeNumber ?? null;
    };
    for (const c of concepts.concepts) {
        const depOrder = order(c.id);
        if (depOrder === null) continue;
        for (const p of c.prerequisites || []) {
            const pOrder = order(p);
            if (pOrder !== null && pOrder > depOrder) {
                report.error(`${c.id} (route ${depOrder}) is introduced before its prerequisite ${p} (route ${pOrder})`);
            }
        }
    }

    return report.finish();
}

function detectCycles(conceptList, report) {
    const graph = new Map(conceptList.map((c) => [c.id, c.prerequisites || []]));
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map([...graph.keys()].map((k) => [k, WHITE]));
    const stack = [];
    const visit = (node) => {
        color.set(node, GREY);
        stack.push(node);
        for (const next of graph.get(node) || []) {
            if (!graph.has(next)) continue;
            if (color.get(next) === GREY) {
                const cycle = stack.slice(stack.indexOf(next)).concat(next).join(' -> ');
                report.error(`prerequisite cycle: ${cycle}`);
            } else if (color.get(next) === WHITE) {
                visit(next);
            }
        }
        stack.pop();
        color.set(node, BLACK);
    };
    for (const node of graph.keys()) if (color.get(node) === WHITE) visit(node);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const ok = printResult(validate());
    process.exit(ok ? 0 : 1);
}
