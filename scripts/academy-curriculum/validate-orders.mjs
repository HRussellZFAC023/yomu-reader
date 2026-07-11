// Validate curriculum-orders.json (and post-source-syllabus.json orders) as
// topological sorts of the concept prerequisite DAG.
// - Each order has no duplicate entries.
// - Every entry is a known concept of an ordered type.
// - The ordered set is closed under prerequisites (of the ordered types).
// - For each concept, every prerequisite that is in the ordered set appears earlier.
// - All base orders cover exactly the same concept set.
// Run: node scripts/academy-curriculum/validate-orders.mjs
import { loadMapping, makeReport, printResult } from './lib/load.mjs';

export function validate() {
    const report = makeReport('orders');
    const concepts = loadMapping('concepts.json');
    const orders = loadMapping('curriculum-orders.json');
    const post = loadMapping('post-source-syllabus.json');

    const byId = new Map(concepts.concepts.map((c) => [c.id, c]));
    // Post-source introduces new concepts; fold them in for that file's checks.
    const postById = new Map(byId);
    for (const c of post.newConcepts || []) {
        if (!c.id) continue;
        postById.set(c.id, { id: c.id, type: c.type, prerequisites: c.prerequisites || [] });
    }

    const baseOrderedTypes = new Set(orders.orderedConceptTypes || ['grammar', 'function']);
    const NONE = new Set();
    const baseSets = [];
    for (const order of orders.orders) {
        const set = checkOrder(order, byId, baseOrderedTypes, report, 'curriculum-orders', NONE);
        if (set) baseSets.push({ id: order.id, set });
    }
    // All base orders cover the same set.
    if (baseSets.length > 1) {
        const [first, ...rest] = baseSets;
        for (const other of rest) {
            const missing = [...first.set].filter((x) => !other.set.has(x));
            const extra = [...other.set].filter((x) => !first.set.has(x));
            if (missing.length) report.error(`order "${other.id}" is missing: ${missing.join(', ')}`);
            if (extra.length) report.error(`order "${other.id}" has extra: ${extra.join(', ')}`);
        }
    }

    // Post-source orders are a continuation: base concepts (weeks 1-10) are already
    // taught, so they count as satisfied prerequisites without appearing in the order.
    const postOrderedTypes = new Set(['grammar', 'function', 'skill']);
    const priorSet = new Set(byId.keys());
    for (const order of post.orders || []) {
        checkOrder(order, postById, postOrderedTypes, report, 'post-source-syllabus', priorSet);
    }

    return report.finish();
}

function checkOrder(order, byId, orderedTypes, report, fileTag, priorSet) {
    const seq = order.sequence || [];
    const position = new Map();
    const set = new Set();
    for (let i = 0; i < seq.length; i++) {
        const id = seq[i];
        if (set.has(id)) { report.error(`[${fileTag}] order "${order.id}": duplicate entry ${id}`); continue; }
        set.add(id);
        position.set(id, i);
        const c = byId.get(id);
        if (!c) { report.error(`[${fileTag}] order "${order.id}": unknown concept ${id}`); continue; }
        if (!orderedTypes.has(c.type)) report.error(`[${fileTag}] order "${order.id}": ${id} has type ${c.type}, not an ordered type`);
    }
    // Closure + topological order.
    for (const id of set) {
        const c = byId.get(id);
        if (!c) continue;
        for (const p of c.prerequisites || []) {
            const pc = byId.get(p);
            if (pc && orderedTypes.has(pc.type)) {
                if (set.has(p)) {
                    if (position.get(p) > position.get(id)) {
                        report.error(`[${fileTag}] order "${order.id}": ${p} appears after its dependent ${id} (not topological)`);
                    }
                } else if (priorSet.has(p)) {
                    // Assumed already taught before this order; satisfied.
                } else {
                    report.error(`[${fileTag}] order "${order.id}": ${id} needs prerequisite ${p}, which is not in the order (closure violation)`);
                }
            }
        }
    }
    return set;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const ok = printResult(validate());
    process.exit(ok ? 0 : 1);
}
