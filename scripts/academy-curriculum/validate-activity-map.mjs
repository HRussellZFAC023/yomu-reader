// Validate activity-concept-map.json against the concept registry.
// - Every foundation route lesson (0-9) and warm-layer lesson (28/29/30) is present.
// - Every referenced concept id exists.
// - Every concept a lesson claims to "introduce" has firstIntroduced pointing back at that lesson.
// - Every non-phonology concept is introduced by exactly one lesson.
// - Activity ids are unique within a lesson.
// Run: node scripts/academy-curriculum/validate-activity-map.mjs
import {
    loadMapping, makeReport, printResult,
    FOUNDATION_LESSON_IDS, WARM_LAYER_LESSON_IDS,
} from './lib/load.mjs';

export function validate() {
    const report = makeReport('activity-map');
    const concepts = loadMapping('concepts.json');
    const map = loadMapping('activity-concept-map.json');

    const byId = new Map(concepts.concepts.map((c) => [c.id, c]));
    const mapLessons = new Map(map.lessons.map((l) => [l.lesson, l]));

    for (const id of [...FOUNDATION_LESSON_IDS, ...WARM_LAYER_LESSON_IDS]) {
        if (!mapLessons.has(id)) report.error(`activity map missing lesson "${id}"`);
    }

    const introducedBy = new Map();
    const refConcept = (id, where) => {
        if (!byId.has(id)) report.error(`${where}: unknown concept id "${id}"`);
    };

    for (const lesson of map.lessons) {
        const seenActivityIds = new Set();
        for (const cid of lesson.introduces || []) {
            refConcept(cid, `${lesson.lesson}.introduces`);
            if (byId.has(cid)) {
                if (introducedBy.has(cid)) report.error(`${cid} is introduced by both ${introducedBy.get(cid)} and ${lesson.lesson}`);
                introducedBy.set(cid, lesson.lesson);
                // Cross-check against concepts.json firstIntroduced.
                const c = byId.get(cid);
                if (c.firstIntroduced && c.firstIntroduced.lesson !== lesson.lesson) {
                    report.error(`${cid}: activity map introduces it in ${lesson.lesson} but concepts.json says ${c.firstIntroduced.lesson}`);
                }
            }
        }
        for (const cid of lesson.reviews || []) refConcept(cid, `${lesson.lesson}.reviews`);
        for (const act of lesson.activities || []) {
            if (act.id) {
                if (seenActivityIds.has(act.id)) report.error(`${lesson.lesson}: duplicate activity id "${act.id}"`);
                seenActivityIds.add(act.id);
            }
            for (const cid of act.concepts || []) refConcept(cid, `${lesson.lesson}.activity ${act.id || act.ref}`);
        }
        for (const cid of (lesson.finalTask?.concepts) || []) refConcept(cid, `${lesson.lesson}.finalTask`);
    }

    // Coverage: every non-phonology concept in the registry is introduced by some lesson,
    // OR is a post-source concept (not present in the base registry's activity map).
    for (const c of concepts.concepts) {
        if (c.type === 'phonology') continue;
        if (c.firstIntroduced === null) continue;
        if (!introducedBy.has(c.id)) {
            report.error(`${c.id}: registry concept is never introduced by any lesson in the activity map`);
        }
    }

    return report.finish();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const ok = printResult(validate());
    process.exit(ok ? 0 : 1);
}
