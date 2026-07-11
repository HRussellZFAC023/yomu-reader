// Run every Yomu Academy curriculum-mapping validator plus a source-drift guard,
// and exit non-zero if anything fails. This is the machine-readable gate for the
// mappings/ and linguistic-qa/ content.
// Run: node scripts/academy-curriculum/validate-all.mjs
import { validate as validateConcepts } from './validate-concepts.mjs';
import { validate as validateCrosswalk } from './validate-crosswalk.mjs';
import { validate as validateActivityMap } from './validate-activity-map.mjs';
import { validate as validateOrders } from './validate-orders.mjs';
import { validate as validateLinguisticQa } from './validate-linguistic-qa.mjs';
import { loadMapping, makeReport, printResult, readSource } from './lib/load.mjs';

// Guard against the mapping drifting away from the canonical source TS files.
function validateSourceDrift() {
    const report = makeReport('source-drift');
    const concepts = loadMapping('concepts.json');
    const foundation = readSource('foundation-course.ts');
    const lessons = readSource('lessons-content.ts');
    if (!foundation) report.error('cannot read src/academy/foundation-course.ts');
    if (!lessons) report.error('cannot read src/academy/lessons-content.ts');

    const warmLayer = new Set(['lesson-28', 'lesson-29', 'lesson-30']);

    // Build the authoritative first-appearance lesson for each kanji CARD in the
    // foundation source, by scanning top-to-bottom (file order == route order).
    // Only `character:` lines (kanji cards) are considered; a kanji reappearing in a
    // later lesson's card array is a review, so first-seen wins.
    const firstCardLesson = new Map();
    if (foundation) {
        let current = null;
        for (const line of foundation.split('\n')) {
            const idm = line.match(/id: '(kana-on-ramp|lesson-\d[\w-]*)'/);
            if (idm) current = idm[1];
            const chm = line.match(/character: '(.)'/u);
            if (chm && current && !firstCardLesson.has(chm[1])) firstCardLesson.set(chm[1], current);
        }
    }

    for (const c of concepts.concepts) {
        if (c.type !== 'kanji') continue;
        const ch = c.label.ja;
        const lesson = c.firstIntroduced?.lesson;
        const inWarm = warmLayer.has(lesson);
        const haystack = inWarm ? lessons : foundation;
        if (haystack && !haystack.includes(ch)) {
            report.error(`kanji ${c.id}: character not found in ${inWarm ? 'lessons-content.ts' : 'foundation-course.ts'} (mapping drift?)`);
            continue;
        }
        // Precise drift guard for foundation kanji: firstIntroduced must match the
        // lesson whose kanji card first presents the character.
        if (!inWarm && firstCardLesson.has(ch)) {
            const expected = firstCardLesson.get(ch);
            if (expected !== lesson) {
                report.error(`kanji ${c.id}: firstIntroduced is ${lesson} but the source kanji card first appears in ${expected}`);
            }
        }
    }

    // Every foundation lesson id referenced in the activity map must exist in source.
    const map = loadMapping('activity-concept-map.json');
    for (const l of map.lessons) {
        if (warmLayer.has(l.lesson)) {
            // The warm-layer lesson id (lesson-28) lives in lessons-content.ts; its
            // 'mirrors' value is a foundation route lesson id, which lives in foundation-course.ts.
            if (lessons && !lessons.includes(`'${l.lesson}'`)) report.error(`warm-layer lesson id ${l.lesson} not found in lessons-content.ts`);
            if (foundation && l.mirrors && !foundation.includes(`'${l.mirrors}'`)) report.warn(`warm-layer ${l.lesson}: mirrored foundation lesson ${l.mirrors} not found in foundation-course.ts`);
            continue;
        }
        if (foundation && !foundation.includes(`'${l.lesson}'`) && l.lesson !== 'kana-on-ramp') {
            report.error(`activity map lesson id ${l.lesson} not found in foundation-course.ts`);
        }
    }
    // kana on-ramp is the kanaOnRamp export (id 'kana-on-ramp').
    if (foundation && !foundation.includes("id: 'kana-on-ramp'")) report.error("kana-on-ramp id not found in foundation-course.ts");

    return report.finish();
}

const results = [
    validateConcepts(),
    validateCrosswalk(),
    validateActivityMap(),
    validateOrders(),
    validateSourceDrift(),
    validateLinguisticQa(),
];

console.log('Yomu Academy curriculum-mapping validation\n');
let allOk = true;
for (const r of results) {
    const ok = printResult(r);
    allOk = allOk && ok;
}
console.log(`\n${allOk ? 'ALL PASSED' : 'VALIDATION FAILED'}`);
process.exit(allOk ? 0 : 1);
