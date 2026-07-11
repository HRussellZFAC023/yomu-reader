// Shared chronology assignment: map a ledger record to its week (unit order) and year in
// the synthesised three-year spine. Used by both the source-ledger builder (to stamp
// week/year onto each record) and the week-ledger builder (to group assets by week), so a
// single definition drives both — they can never disagree.

export function normChapter(ch) {
    if (ch == null) return null;
    const m = String(ch).match(/(\d{1,3})/);
    return m ? Number(m[1]) : null;
}

// Parse a unit's chapter string, e.g. "28 (sub-sections 28-1, 28-2)" -> { chapter:28, subsections:[1,2] }.
export function unitChapterSpec(unit) {
    const chapter = normChapter(unit.chapter);
    const subs = [...String(unit.chapter ?? '').matchAll(/\d+-(\d+)/g)].map((m) => Number(m[1]));
    return { chapter, subsections: subs };
}

// Build a deterministic record -> unit assigner from the synthesis units.
export function makeUnitOf(units) {
    const classUnits = units.filter((u) => u.order >= 28).map((u) => ({ u, spec: unitChapterSpec(u), lesson: Number((u.label ?? '').match(/class lesson\s*(\d+)/i)?.[1] ?? NaN) }));
    const genkiUnits = units.filter((u) => /genki/i.test(u.textbook ?? ''));
    const byGenkiLesson = new Map(genkiUnits.map((u) => [normChapter(u.chapter), u]));
    const byClassLesson = new Map(classUnits.filter((c) => Number.isFinite(c.lesson)).map((c) => [c.lesson, c.u]));

    // Overlap of a record's grammar concepts with a unit's grammar points (loose-file tiebreak).
    const grammarOverlap = (record, unitDesc) => {
        const gs = record.curriculum.grammarConcepts ?? [];
        if (!gs.length) return 0;
        const pts = (unitDesc.u.grammarPoints ?? []).join(' ');
        return gs.filter((g) => pts.includes(g)).length;
    };

    return (record) => {
        const c = record.curriculum;
        if (record.datasetGroup === 'genki-study-site' && c.lesson != null) return byGenkiLesson.get(c.lesson) ?? null;
        if (record.datasetGroup === 'class-lessons') {
            if (c.lesson != null && byClassLesson.has(c.lesson)) return byClassLesson.get(c.lesson);
            if (c.chapter != null) {
                const chapterMatches = classUnits.filter((cu) => cu.spec.chapter === c.chapter);
                if (chapterMatches.length) {
                    // Prefer the unit whose sub-sections contain the file's sub-section; else the
                    // unit whose grammar points overlap the file's grammar (fixes e.g. a loose
                    // 〜てしまいました file landing in the 29-1 week instead of 29-2); else earliest.
                    const bySub = chapterMatches.find((cu) => c.subsection != null && cu.spec.subsections.includes(c.subsection));
                    if (bySub) return bySub.u;
                    const ranked = chapterMatches.map((cu) => ({ cu, ov: grammarOverlap(record, cu) })).sort((a, b) => b.ov - a.ov);
                    if (ranked[0].ov > 0) return ranked[0].cu.u;
                    return chapterMatches[0].u;
                }
            }
        }
        return null;
    };
}

// Resolve a record to its unit, applying duplicate inheritance: a loose class file with no
// lesson folder inherits the unit of a byte-identical duplicate that DOES sit in a lesson
// folder (byte-identical copies belong to the same session). Falls back to direct matching.
export function resolveUnit(record, unitOf, byId) {
    if (record.datasetGroup === 'class-lessons' && record.curriculum.lesson == null && record.duplicate?.occurrences?.length) {
        for (const occId of record.duplicate.occurrences) {
            const occ = byId.get(occId);
            if (occ && occ.curriculum.lesson != null) { const u = unitOf(occ); if (u) return u; }
        }
    }
    return unitOf(record);
}

// Year number for a unit order, honouring multi-range year declarations
// ("orders 24-27 …; orders 28-33 …").
export function yearOf(model, order) {
    for (const y of model?.years ?? []) {
        for (const m of (y.unitRange ?? '').matchAll(/(\d+)\s*-\s*(\d+)/g)) {
            if (order >= Number(m[1]) && order <= Number(m[2])) return { year: y.year, label: y.label };
        }
    }
    return { year: null, label: null };
}
