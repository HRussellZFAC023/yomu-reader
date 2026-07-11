#!/usr/bin/env node
// Build the canonical WEEK PLAN for the 3-year Yomu Academy spine.
//
// Deterministic, grounded backbone. For every discovered class-week folder in
// the learner's five-term spine it emits: stable identity, source coverage
// (the real worksheet inventory from the ledger, metadata only), derived scope
// (Minna chapters anchored to worksheet titles + grammar points), prerequisite
// and spiral-review links, cumulative checkpoints, and recommended cast.
//
// It INVENTS no pedagogical claim: chapter numbers come from real worksheet
// titles; grammar labels come from the public Minna chapter reference; where a
// folder yields no chapter anchor the scope is left open and flagged for review.
//
// Output: generated/week-plan.json  (consumed by the authoring workflow).

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LEDGER = resolve(HERE, 'generated', 'week-source-ledger.json');
const CHAPTERS = resolve(HERE, 'minna-chapter-reference.json');
const OUT = resolve(HERE, 'generated', 'week-plan.json');

// The learner's chronological spine: one term per row, in order. Alternate
// cohorts (2023/24 Level 1+ 5pm; 2025/26 Level 2+) are NOT spine terms; they are
// recorded as corroborating source coverage where they share a section title.
const SPINE = [
    { termId: 'l1', courseId: 'ucl-japanese-2023-2024', sectionId: 'rie-level-1', academyYear: 1, termLabel: 'Level 1', levelBand: 'N5', minnaBook: 'I' },
    { termId: 'l1plus', courseId: 'ucl-japanese-2023-2024', sectionId: 'rie-level-1-plus-thursday-7pm', academyYear: 1, termLabel: 'Level 1+', levelBand: 'N5', minnaBook: 'I' },
    { termId: 'l2plus', courseId: 'ucl-japanese-2024-2025', sectionId: 'rie-level-2-plus-thursday-7pm', academyYear: 2, termLabel: 'Level 2+', levelBand: 'N5>N4', minnaBook: 'I>II' },
    { termId: 'l3-2', courseId: 'ucl-japanese-2025-2026', sectionId: 'rie-level-3-2', academyYear: 3, termLabel: 'Level 3-2', levelBand: 'N4', minnaBook: 'II' },
    { termId: 'l3plus', courseId: 'ucl-japanese-2025-2026', sectionId: 'rie-level-3-plus-thursday-7pm', academyYear: 3, termLabel: 'Level 3+', levelBand: 'N4', minnaBook: 'II' },
];

// Alternate cohorts to fold in as corroborating coverage (same scope, taught to
// a different cohort). Keyed by the spine termId they reinforce is not 1:1, so
// we attach by matching Minna chapter overlap at author time; here we just list
// them for the ledger cross-reference section.
const ALTERNATE_COHORTS = [
    { courseId: 'ucl-japanese-2023-2024', sectionId: 'rie-level-1-plus-thursday-5pm', reinforces: 'l1plus', note: 'Parallel Level 1+ cohort (Thursday 5pm).' },
    { courseId: 'ucl-japanese-2025-2026', sectionId: 'rie-level-2-plus', reinforces: 'l2plus', note: 'Level 2+ re-run in the following academic year.' },
];

const CAST = {
    sensei: 'rie',
    painted: ['rie', 'henry', 'aakash', 'alex', 'tom', 'sam', 'francis', 'shin', 'jodi', 'christian', 'jenny', 'robert', 'mika', 'sophie', 'xingyu', 'angel', 'stasi', 'ruparna', 'pho'],
};

// level band -> foundation route band -> seed speakers (from cast-learning matrix).
const SPEAKERS_BY_BAND = {
    'pre-N5': ['rie', 'henry', 'aakash', 'tom'],
    'N5-early': ['rie', 'francis', 'shin', 'jodi', 'christian', 'jenny'],
    'N5-mid': ['rie', 'robert', 'mika', 'sophie', 'xingyu', 'angel'],
    'N5-late': ['rie', 'stasi', 'ruparna', 'pho', 'ena', 'leo'],
    'N4-early': ['rie', 'sophie', 'mika', 'aakash', 'xingyu', 'angel'],
    'N4-mid': ['rie', 'christian', 'jenny', 'tom', 'ruparna', 'jodi'],
    'N4-late': ['rie', 'angel', 'jodi', 'robert', 'pho', 'francis', 'shin'],
};

// grammar-topic -> character affinity ("the grammar picks the person").
const GRAMMAR_AFFINITY = [
    [/invit|ませんか|ましょう|plan|予定|つもり/i, ['sam', 'robert', 'angel']],
    [/kanji|漢字/i, ['shin']],
    [/feel|きもち|adjective|すき|ほしい|たいです/i, ['francis', 'jodi', 'aakash']],
    [/date|time|schedule|counter|予定|checklist|ておく|てある/i, ['angel', 'jodi']],
    [/potential|ability|できます|られます/i, ['mika', 'sophie']],
    [/casual|plain|常体/i, ['pho', 'henry']],
    [/read|sign|書いてあります|意味|reading/i, ['shin', 'ruparna']],
    [/imperative|命令|advice|ほうがいい/i, ['sophie', 'alex']],
];

function bandForWeek(term, minnaChapters) {
    const maxCh = minnaChapters.length ? Math.max(...minnaChapters) : null;
    if (term.termId === 'l1') return maxCh && maxCh >= 4 ? 'N5-early' : 'pre-N5';
    if (term.termId === 'l1plus') return 'N5-mid';
    if (term.termId === 'l2plus') return maxCh && maxCh >= 20 ? 'N5-late' : 'N5-mid';
    if (term.termId === 'l3-2') return maxCh && maxCh >= 30 ? 'N4-mid' : 'N4-early';
    if (term.termId === 'l3plus') return maxCh && maxCh >= 34 ? 'N4-late' : 'N4-mid';
    return 'N5-early';
}

function classifyWeekKind(module) {
    const t = module.title;
    if (/^Lesson\s*[0-9０-９６]+/i.test(t)) return 'lesson';
    if (/^Introduction$/i.test(t)) return 'term-kickoff';
    if (/^Hiragana|Look-alike hiragana/i.test(t)) return 'script-hiragana';
    if (/^Katakana/i.test(t)) return 'script-katakana';
    if (/^Kanji\s*[0-9]/i.test(t)) return 'kanji-set';
    if (/Self study/i.test(t)) return 'self-study';
    if (/Pre-study/i.test(t)) return 'pre-study';
    if (/Summer Homework/i.test(t)) return 'consolidation';
    return 'lesson';
}

function slugForModule(module, kind, counters) {
    const t = module.title;
    if (kind === 'lesson') {
        const m = /Lesson\s*([0-9０-９６]+)/i.exec(t);
        const n = m ? String(m[1]).replace(/[０-９]/g, (d) => '０１２３４５６７８９'.indexOf(d)).replace('６', '6') : String(++counters.lesson);
        return `l${String(Number(n) || n).padStart(2, '0')}`;
    }
    if (kind === 'term-kickoff') return 'kickoff';
    if (kind === 'kanji-set') { const m = /Kanji\s*([0-9]+)/i.exec(t); return `kanji-${m ? m[1] : ++counters.kanji}`; }
    if (kind === 'self-study') return `selfstudy-ch${(/Chapter\s*([0-9]+)/i.exec(t) || [])[1] || (++counters.self)}`;
    if (kind === 'pre-study') return `prestudy-${/volitional/i.test(t) ? 'volitional' : ++counters.pre}`;
    if (kind === 'consolidation') return 'summer-homework';
    if (kind === 'script-hiragana') return `hiragana-${++counters.hira}`;
    if (kind === 'script-katakana') return `katakana-${++counters.kata}`;
    return `unit-${++counters.other}`;
}

function extractChapters(members) {
    const chaps = new Set();
    const re = /Chapter\s*([0-9]{1,2})/gi;
    for (const m of members) { let g; const s = m.title; while ((g = re.exec(s))) chaps.add(Number(g[1])); }
    return [...chaps].sort((a, b) => a - b);
}

function extractGrammarTokens(members) {
    const toks = new Set();
    for (const m of members) {
        const g = m.title.match(/[〜～][^ |、。]{1,10}/g);
        if (g) for (const t of g) toks.add(t.replace(/[〜～]/, '〜').replace(/[0-9\-,]+$/, '').trim());
    }
    return [...toks].filter((t) => t.length > 1);
}

function extractKanji(module) {
    const m = /Kanji\s*[0-9]+[-\s]*([一-龠、，,\s]+)/.exec(module.title);
    if (!m) return [];
    return [...m[1]].filter((c) => /[一-龠]/.test(c));
}

function extractDate(title) {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{2})/.exec(title);
    if (!m) return null;
    const [, d, mo, y] = m;
    return `20${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function safeMembers(members) {
    return members.map((m) => ({ title: m.title, role: m.role, kind: m.kind, extension: m.extension, uncompressedBytes: m.uncompressedBytes, payloadSha256: m.payloadSha256 }));
}

function recommendSpeakers(band, grammarText) {
    const seed = SPEAKERS_BY_BAND[band] ? [...SPEAKERS_BY_BAND[band]] : ['rie'];
    const set = new Set(seed);
    for (const [re, ids] of GRAMMAR_AFFINITY) if (re.test(grammarText)) ids.forEach((i) => set.add(i));
    return [...set].filter((id) => CAST.painted.includes(id)).slice(0, 6);
}

async function main() {
    const ledger = JSON.parse(await readFile(LEDGER, 'utf8'));
    const chapterRef = JSON.parse(await readFile(CHAPTERS, 'utf8'));
    const findSection = (courseId, sectionId) => {
        const c = ledger.courses.find((x) => x.courseId === courseId);
        return c && { course: c, section: c.sections.find((s) => s.sectionId === sectionId) };
    };

    const weeks = [];
    let order = 0;

    // Lesson 0 — global orientation / kana on-ramp (synthesized, grounded in the
    // Welcome + per-term Introduction folders and the kana strands).
    weeks.push({
        id: 'orientation',
        order: order++,
        weekKind: 'orientation',
        identity: {
            title: 'Lesson 0 — Welcome to the class',
            academyYear: 0, termId: 'orientation', termLabel: 'Orientation', courseYear: null,
            levelBand: 'pre-N5', weekNumberInTerm: 0, moduleId: null, moduleType: 'synthesized', date: null,
            sourceOrdering: { manifestOrder: null, harvestOrder: null },
        },
        sourceCoverage: {
            harvested: false,
            summary: 'Synthesized orientation. Grounded in the three courses’ Welcome sections and per-term Introduction folders; no single source module.',
            members: [], externalUrlModules: [], corroboratingCohorts: [],
            gaps: ['Orientation is authored, not a captured class week. Confirm framing with a human before publication.'],
        },
        derivedScope: {
            minnaChapters: [], grammarPoints: ['hiragana readiness', 'katakana awareness', 'classroom phrases', 'self-introduction preview'],
            grammarTokens: [], kanji: [], themes: ['how the class works', 'kana on-ramp', 'meeting the class'], jlpt: 'pre-N5',
            scopeConfidence: 'authored-orientation',
        },
        pedagogy: { prerequisiteWeekIds: [], reviewTargetWeekIds: [], isCheckpoint: false },
        casting: { sensei: 'rie', recommendedSpeakers: ['rie', 'henry', 'aakash', 'tom', 'jenny'] },
    });

    for (const term of SPINE) {
        const found = findSection(term.courseId, term.sectionId);
        if (!found || !found.section) throw new Error(`Spine section missing: ${term.courseId}/${term.sectionId}`);
        const { course, section } = found;
        const urlModules = section.modules.filter((m) => m.type === 'url' || m.type === 'external').map((m) => ({ title: m.title, externalUrl: m.externalUrl || null }));
        const harvested = section.modules.filter((m) => m.harvested).sort((a, b) => a.manifestOrder - b.manifestOrder);
        const counters = { lesson: 0, kanji: 0, self: 0, pre: 0, hira: 0, kata: 0, other: 0 };
        const termWeekIds = [];

        for (const module of harvested) {
            const kind = classifyWeekKind(module);
            const slug = slugForModule(module, kind, counters);
            const id = `${term.termId}-${slug}`;
            const lessonNumber = kind === 'lesson'
                ? Number(String((/Lesson\s*([0-9０-９６]+)/i.exec(module.title) || [])[1] || '')
                    .replace(/[０-９]/g, (d) => '０１２３４５６７８９'.indexOf(d)).replace('６', '6')) || null
                : null;
            const chapters = extractChapters(module.members);
            const grammarTokens = extractGrammarTokens(module.members);
            const kanji = extractKanji(module);
            const date = extractDate(module.title);
            const band = bandForWeek(term, chapters);

            const chapterInfo = chapters.map((ch) => ({ chapter: ch, ...(chapterRef.chapters[String(ch)] || { theme: null, grammar: [], jlpt: null, unresolved: true }) }));
            const grammarPoints = [...new Set([...chapterInfo.flatMap((c) => c.grammar || []), ...grammarTokens])];
            const themes = [...new Set(chapterInfo.map((c) => c.theme).filter(Boolean))];
            const grammarText = `${module.title} ${grammarPoints.join(' ')} ${themes.join(' ')}`;

            const gaps = [];
            if (kind === 'lesson' && chapters.length === 0) gaps.push('No Minna chapter anchor in worksheet titles — scope inferred from term position; confirm with a human.');
            const scopeConfidence = chapters.length ? 'anchored' : (kind === 'lesson' ? 'sequence-inferred' : 'strand');

            weeks.push({
                id,
                order: order++,
                weekKind: kind,
                identity: {
                    title: module.title,
                    academyYear: term.academyYear, termId: term.termId, termLabel: term.termLabel, courseYear: course.year,
                    levelBand: chapterInfo.length ? (chapterInfo.some((c) => c.jlpt === 'N4') ? 'N4' : 'N5') : term.levelBand,
                    weekNumberInTerm: lessonNumber,
                    moduleId: module.moduleId, moduleType: module.type, date,
                    sourceOrdering: { manifestOrder: module.manifestOrder, moodleSection: section.moodleSection },
                },
                sourceCoverage: {
                    harvested: true,
                    archiveModuleId: module.moduleId,
                    memberFileCount: module.memberFileCount,
                    members: safeMembers(module.members),
                    externalUrlModules: urlModules,
                    corroboratingCohorts: [],
                    gaps,
                },
                derivedScope: {
                    minnaBook: term.minnaBook, minnaChapters: chapters, chapterInfo,
                    grammarPoints, grammarTokens, kanji,
                    themes, jlpt: chapterInfo.some((c) => c.jlpt === 'N4') ? 'N4' : (chapterInfo.length ? 'N5' : term.levelBand),
                    scopeConfidence,
                },
                pedagogy: { prerequisiteWeekIds: [], reviewTargetWeekIds: [], isCheckpoint: false },
                casting: { sensei: 'rie', recommendedSpeakers: recommendSpeakers(band, grammarText) },
            });
            termWeekIds.push(id);
        }

        // Attach alternate-cohort corroboration for this term (chapter overlap).
        for (const alt of ALTERNATE_COHORTS.filter((a) => a.reinforces === term.termId)) {
            const af = findSection(alt.courseId, alt.sectionId);
            if (!af || !af.section) continue;
            const altHarvested = af.section.modules.filter((m) => m.harvested);
            for (const w of weeks) {
                if (w.identity.termId !== term.termId || w.weekKind !== 'lesson') continue;
                const overlap = altHarvested.filter((m) => extractChapters(m.members).some((ch) => w.derivedScope.minnaChapters.includes(ch)));
                if (overlap.length) {
                    w.sourceCoverage.corroboratingCohorts.push({
                        cohort: af.section.title, note: alt.note,
                        modules: overlap.map((m) => ({ moduleId: m.moduleId, title: m.title, memberFileCount: m.memberFileCount })),
                    });
                }
            }
        }
    }

    // Prerequisite chain (previous ordered week) + spiral review (earlier weeks
    // sharing a Minna chapter) + cumulative checkpoints (term-final lessons).
    for (let i = 0; i < weeks.length; i += 1) {
        const w = weeks[i];
        if (i > 0) w.pedagogy.prerequisiteWeekIds = [weeks[i - 1].id];
        const myChs = w.derivedScope.minnaChapters || [];
        w.pedagogy.reviewTargetWeekIds = weeks.slice(0, i)
            .filter((p) => (p.derivedScope.minnaChapters || []).some((ch) => myChs.includes(ch)) && p.id !== w.id)
            .map((p) => p.id).slice(-3);
    }
    // Mark the final numbered lesson of each term as a cumulative checkpoint.
    for (const term of SPINE) {
        const lessons = weeks.filter((w) => w.identity.termId === term.termId && w.weekKind === 'lesson');
        if (lessons.length) lessons[lessons.length - 1].pedagogy.isCheckpoint = true;
        if (lessons.length >= 6) lessons[Math.floor(lessons.length / 2)].pedagogy.isCheckpoint = true;
    }

    const plan = {
        schema: 'yomu-academy.week-plan.v1',
        generatedFrom: { ledger: 'generated/week-source-ledger.json', chapterReference: 'minna-chapter-reference.json' },
        note: 'Grounded backbone for the 3-year weekly synthesis. Chapter anchors derive from real worksheet titles; grammar labels from the Minna reference; nothing pedagogical is invented. Authors cover this scope with original Yomu content.',
        spine: SPINE.map((t) => ({ termId: t.termId, termLabel: t.termLabel, academyYear: t.academyYear, courseYear: t.courseId, levelBand: t.levelBand, minnaBook: t.minnaBook })),
        curriculumGaps: [
            'Minna no Nihongo chapters 24 (〜てあげる/くれる/もらう) and 26 (〜んです) are not represented in any harvested spine worksheet. Likely a missing "Level 3-1" term between Level 2+ and Level 3-2. Human review needed before claiming full N4 coverage.',
            'Kanji strand sets 1, 2, 3 and 5 are not in the harvest (only Kanji 4/6/7 folders exist). Their exact character lists are unknown; the hiragana (Level 1) and katakana (Level 1+) strands cover early script. Flag for human review.',
            'Per-week (Lesson-N to Chapter-N) boundaries are ledger-anchored for every term (chapter numbers come from real worksheet titles). Where a lesson folder yields multiple chapters, authors should treat the lower chapter as the new teaching focus and the higher as preview/spill; confirm against Moodle per-week folders if exact boundaries matter.',
            'Level 1+ Lesson 3 references Chapter 9 (わかります) earlier than a strict pace predicts; treat its chapter anchors as authoritative over any assumed even pace.',
        ],
        summary: {
            weekCount: weeks.length,
            byKind: weeks.reduce((acc, w) => ((acc[w.weekKind] = (acc[w.weekKind] || 0) + 1), acc), {}),
            byTerm: weeks.reduce((acc, w) => ((acc[w.identity.termId] = (acc[w.identity.termId] || 0) + 1), acc), {}),
            checkpoints: weeks.filter((w) => w.pedagogy.isCheckpoint).map((w) => w.id),
            totalWorksheetsCovered: weeks.reduce((n, w) => n + (w.sourceCoverage.members?.length || 0), 0),
        },
        weeks,
    };

    await mkdir(resolve(OUT, '..'), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(plan, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(plan.summary, null, 2)}\n`);
}

main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exitCode = 1; });
