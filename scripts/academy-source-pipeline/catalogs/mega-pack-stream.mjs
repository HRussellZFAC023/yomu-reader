import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJsonAtomic } from '../io.mjs';

export const MEGA_PACK_STREAM_SCHEMA = 'yomu-academy.source-pipeline.mega-pack-stream/v1';
const MEGA_PACK_STREAM_REVISION = 'mega-pack-stream/2026-07-14.1';

const INSTRUCTIONAL_KINDS = new Set([
    'data', 'document', 'ebook', 'interactive', 'spreadsheet', 'subtitle', 'text', 'web', 'word-document',
]);

const SOURCE_DEFINITIONS = Object.freeze([
    source('genki-study-resources', 1, 'Genki Study Resources', prefix('Resource Packs/genki-study-resources-master 2'), {
        lane: 'primary-permitted',
        rights: 'permitted-mit',
        usefulness: 'Directly lesson-indexed interactive practice with a repository-level MIT license.',
        curriculum: ['Genki I', 'Genki II'],
        weeks: 'Map lesson-N to the Academy week that introduces the same prerequisite.',
        skills: ['grammar', 'vocabulary', 'reading', 'sentence-construction', 'kanji'],
        jlpt: ['N5', 'N4'],
    }),
    source('lessons', 2, 'Lessons', prefix('Lessons'), {
        lane: 'minna-moodle-anchor',
        rights: 'private-course-material-review-required',
        usefulness: 'Teacher-authored lesson, handout, homework, and class-delivery sequence with dated week folders.',
        curriculum: ['Minna no Nihongo II lessons 28-30', 'UCL Moodle class sequence'],
        weeks: 'Dated Lesson 1-6 folders; retain folder date and Handouts/Homework bucket.',
        skills: ['grammar', 'reading', 'writing', 'speaking', 'vocabulary'],
        jlpt: ['N4'],
    }),
    source('mega-03-grammar-workbooks', 3, 'Mega Pack 03: Grammar, Workbooks, Usage', prefix('Resource Packs/Japanese Mega Learning Pack/03.Grammar, Workbooks, Usage'), {
        lane: 'candidate-review',
        rights: 'private-reference-review-required',
        usefulness: 'Dense grammar and workbook material, useful after a licensed or class source establishes scope.',
        curriculum: ['cross-textbook grammar reference'],
        weeks: 'Unmapped; require title/page crosswalk before use.',
        skills: ['grammar', 'reading', 'writing'],
        jlpt: ['N5', 'N4', 'N3', 'N2', 'N1'],
    }),
    source('mega-01-writing-system', 4, 'Mega Pack 01: Japanese Writing System', prefix('Resource Packs/Japanese Mega Learning Pack/01.Japanese Writing System'), {
        lane: 'candidate-review',
        rights: 'private-reference-review-required',
        usefulness: 'Concentrated kana and writing references with little executable debris.',
        curriculum: ['kana and introductory writing systems'],
        weeks: 'Lesson 0 reinforcement or the first week that introduces each script item.',
        skills: ['kana-recognition', 'handwriting', 'reading'],
        jlpt: ['N5'],
    }),
    source('kanji-look-and-learn', 5, 'Kanji Look and Learn', contains(/kanji look and learn/iu), {
        lane: 'candidate-review',
        rights: 'private-reference-review-required',
        usefulness: 'Strong kanji illustration, mnemonic, workbook, and answer-key set; exact week mapping is still required.',
        curriculum: ['Kanji Look and Learn 1-512'],
        weeks: 'Unmapped; bind only after an Academy kanji crosswalk exists.',
        skills: ['kanji-recognition', 'kanji-writing', 'reading'],
        jlpt: ['N5', 'N4', 'N3', 'N2'],
    }),
    source('mega-04-vocabulary-expressions', 6, 'Mega Pack 04: Vocabulary, Expressions, Idioms', prefix('Resource Packs/Japanese Mega Learning Pack/04.Vocabulary, Expressions, Idioms'), {
        lane: 'candidate-review',
        rights: 'private-reference-review-required',
        usefulness: 'Useful expression and vocabulary reinforcement after prerequisite and rights review.',
        curriculum: ['cross-textbook vocabulary'],
        weeks: 'Unmapped; introduce only after the matching curriculum concept.',
        skills: ['vocabulary', 'reading'],
        jlpt: ['N5', 'N4', 'N3', 'N2', 'N1'],
    }),
    source('mega-05-readers', 7, "Mega Pack 05: Children's Books, Readers", prefix("Resource Packs/Japanese Mega Learning Pack/05.Children's Books, Readers"), {
        lane: 'candidate-review',
        rights: 'private-reference-review-required',
        usefulness: 'Potential graded-reading material, but many pages are images and need text/rights review.',
        curriculum: ['supplemental extensive reading'],
        weeks: 'Unmapped; gate by vocabulary and grammar coverage.',
        skills: ['reading', 'comprehension'],
        jlpt: ['N5', 'N4', 'N3'],
    }),
    source('mega-02-audio-textbooks', 8, 'Mega Pack 02: Audio Courses, Textbooks', prefix('Resource Packs/Japanese Mega Learning Pack/02.Audio Courses, Textbooks'), {
        lane: 'defer-audio-and-rights',
        rights: 'private-reference-review-required',
        usefulness: 'Broad textbook coverage, but high duplication, disc images, media, and audio that are outside this stream.',
        curriculum: ['multi-textbook reference'],
        weeks: 'Unmapped; title/page crosswalk required.',
        skills: ['listening', 'reading'],
        jlpt: ['N5', 'N4', 'N3', 'N2', 'N1'],
    }),
    source('subtitles', 9, 'Subtitles', prefix('Subtitles'), {
        lane: 'immersion-later',
        rights: 'private-reference-review-required',
        usefulness: 'Compact authentic-input pool, valuable after episode, rights, and vocabulary coverage are known.',
        curriculum: ['supplemental immersion'],
        weeks: 'Unmapped; require episode-level vocabulary coverage.',
        skills: ['reading', 'listening-comprehension'],
        jlpt: ['N4', 'N3', 'N2', 'N1'],
    }),
    source('mega-07-culture', 10, 'Mega Pack 07: Society, Culture, History, Tourism', prefix('Resource Packs/Japanese Mega Learning Pack/07.Society,Culture,History,Tourism'), {
        lane: 'culture-later',
        rights: 'private-reference-review-required',
        usefulness: 'Useful cultural reading, but not a prerequisite source for the early playable curriculum.',
        curriculum: ['supplemental culture'],
        weeks: 'Unmapped; attach to a matching story or culture objective.',
        skills: ['reading', 'culture'],
        jlpt: ['N3', 'N2', 'N1'],
    }),
    source('vocabulary-loose-lists', 11, 'Vocabulary', prefix('Vocabulary'), {
        lane: 'defer-unsequenced',
        rights: 'provenance-unknown-review-required',
        usefulness: 'Two large loose lists without a prerequisite or teacher sequence.',
        curriculum: ['unsequenced frequency vocabulary'],
        weeks: 'None; do not relabel as pre-study material.',
        skills: ['vocabulary'],
        jlpt: ['unmapped'],
    }),
    source('mega-06-dictionaries', 12, 'Mega Pack 06: Dictionaries, Phrasebooks', prefix('Resource Packs/Japanese Mega Learning Pack/06.Dictionaries, Phrasebooks'), {
        lane: 'reference-only',
        rights: 'private-reference-review-required',
        usefulness: 'Mostly reference and executable/tool material; poor fit for authored lesson activities.',
        curriculum: ['lookup reference'],
        weeks: 'None.',
        skills: ['reference'],
        jlpt: ['unmapped'],
    }),
    source('mega-08-miscellaneous', 13, 'Mega Pack 08: Miscellaneous', prefix('Resource Packs/Japanese Mega Learning Pack/08.Miscellaneous'), {
        lane: 'lowest-priority',
        rights: 'private-reference-review-required',
        usefulness: 'Mixed unknown, tool, web, and executable material with no coherent curriculum sequence.',
        curriculum: ['unmapped'],
        weeks: 'None.',
        skills: ['unmapped'],
        jlpt: ['unmapped'],
    }),
]);

function buildMegaPackStreamCatalog(ledger, { ledgerSha256 = null } = {}) {
    if (ledger?.schema !== 'yomu-academy.library.private-ledger/v1' || !Array.isArray(ledger.entries)) {
        throw new TypeError('A private Japanese-library ledger is required.');
    }
    const files = ledger.entries.filter(entry => entry.entryKind === 'file');
    const sources = SOURCE_DEFINITIONS.map(definition => summarizeSource(definition, files));
    return {
        schema: MEGA_PACK_STREAM_SCHEMA,
        revision: MEGA_PACK_STREAM_REVISION,
        generatedFrom: {
            schema: ledger.schema,
            scanRevision: ledger.scanRevision,
            ...(ledgerSha256 ? { ledgerSha256 } : {}),
            entryCount: ledger.summary?.entryCount ?? ledger.entries.length,
            uniquePayloadCount: ledger.summary?.uniquePayloadCount ?? null,
        },
        policy: {
            sourcePreference: ['genki', 'minna', 'moodle'],
            answerGate: 'after-attempt',
            permittedVerbatimSource: 'genki-study-resources-mit',
            excludedPathPatterns: ['(^|/)typer(/|$)'],
            excludedMaterial: ['filesystem metadata', 'executables', 'compiler output', 'tool source', 'unknown binary formats'],
            rule: 'A ranked source is not permission to redistribute it; only an item with an explicit permitted rights state may supply verbatim playable content.',
        },
        census: {
            requestedSourceCount: sources.length,
            megaPackFolderCount: sources.filter(item => item.id.startsWith('mega-')).length,
            sources,
        },
        curriculumCrosswalk: curriculumCrosswalk(),
        selectedSlice: selectedSlice(),
    };
}

export function validateMegaPackStreamCatalog(catalog) {
    const issues = [];
    if (catalog?.schema !== MEGA_PACK_STREAM_SCHEMA) issues.push('schema is not mega-pack-stream/v1');
    const sources = catalog?.census?.sources;
    if (!Array.isArray(sources) || sources.length !== 13) issues.push('census must contain all 13 requested source groups');
    if (sources?.filter(source => source.id.startsWith('mega-')).length !== 8) issues.push('census must contain the eight Mega Pack folders');
    const ranks = sources?.map(source => source.rank) ?? [];
    if (new Set(ranks).size !== ranks.length || ranks.some((rank, index) => rank !== index + 1)) issues.push('source ranks must be unique and contiguous');
    if (JSON.stringify(catalog).includes('/Users/')) issues.push('public catalog leaks an absolute private path');
    if (JSON.stringify(catalog).toLowerCase().includes('/typer/')) issues.push('public catalog includes low-value typer material');
    if (catalog?.selectedSlice?.source?.rights !== 'permitted-mit') issues.push('playable slice must use explicitly permitted source content');
    if (catalog?.selectedSlice?.source?.payloadSha256 !== 'b909643450ead83af08d8dd22f717f9d320b165e5accf790514a31212d155451') {
        issues.push('playable slice source hash changed');
    }
    return issues;
}

function source(id, rank, label, selector, metadata) {
    return Object.freeze({ id, rank, label, selector, ...metadata });
}

function prefix(value) {
    return relativePath => relativePath === value || relativePath.startsWith(`${value}/`);
}

function contains(pattern) {
    return relativePath => pattern.test(relativePath);
}

function summarizeSource(definition, files) {
    const selected = files.filter(entry => definition.selector(entry.relativePath));
    const included = selected.filter(entry => entry.state === 'included');
    const duplicate = selected.filter(entry => entry.state?.startsWith('duplicate-of:'));
    const excluded = selected.filter(entry => entry.state?.startsWith('excluded:'));
    const review = selected.filter(entry => entry.state?.startsWith('review:'));
    const archive = selected.filter(entry => entry.state === 'archive-container');
    return {
        id: definition.id,
        rank: definition.rank,
        label: definition.label,
        lane: definition.lane,
        rights: definition.rights,
        usefulness: definition.usefulness,
        curriculum: definition.curriculum,
        weeks: definition.weeks,
        skills: definition.skills,
        jlpt: definition.jlpt,
        counts: {
            files: selected.length,
            bytes: selected.reduce((sum, entry) => sum + (entry.byteLength ?? 0), 0),
            uniquePayloads: new Set(selected.map(entry => entry.sha256).filter(Boolean)).size,
            included: included.length,
            instructionalCandidates: included.filter(entry => INSTRUCTIONAL_KINDS.has(entry.classification?.kind)).length,
            archiveContainers: archive.length,
            duplicateOccurrences: duplicate.length,
            excludedDebris: excluded.length,
            reviewRequired: review.length,
        },
        kinds: countBy(selected, entry => entry.classification?.kind ?? 'unknown'),
    };
}

function countBy(values, keyFor) {
    const counts = {};
    for (const value of values) {
        const key = keyFor(value);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, 'en')));
}

function curriculumCrosswalk() {
    return [
        {
            id: 'genki-2e-l1-workbook-5',
            rank: 1,
            sourceGroupId: 'genki-study-resources',
            source: {
                relativePath: 'lessons/lesson-1/workbook-5/index.html',
                payloadSha256: 'b909643450ead83af08d8dd22f717f9d320b165e5accf790514a31212d155451',
                lineLocus: { start: 76, end: 113 },
                licenseSha256: '78ce1f38ce4e700e0f2e50f80d549db0798cbdac9dfb5873dfb87c66a711f839',
                rights: 'permitted-mit',
            },
            mapping: {
                curriculum: ['Genki I lesson 1', 'Minna no Nihongo I lesson 1', 'UCL Level 1 lesson 1'],
                academyWeek: 'l1-l01',
                moodleModuleId: 5777762,
                skills: ['grammar', 'reading', 'sentence-construction'],
                jlpt: 'N5',
                concepts: ['N は N です', 'occupations', 'nationalities'],
            },
            decision: 'selected-for-first-playable-slice',
        },
        {
            id: 'moodle-level-one-vocabulary-sheet',
            rank: 2,
            sourceGroupId: 'moodle-raw',
            source: {
                sourceId: 'moodle-vocabulary:5777762:c6df5dd2979a7ce376ecfb5d37c813813d99819d825f17a10c2ff2e5be79220e',
                payloadSha256: 'c6df5dd2979a7ce376ecfb5d37c813813d99819d825f17a10c2ff2e5be79220e',
                title: 'Chapter 1-1 Vocabulary Sheet',
                pageLocus: { start: 1, end: 2 },
                rights: 'private-course-material-review-required',
            },
            mapping: {
                curriculum: ['Minna no Nihongo I lesson 1', 'UCL Level 1 lesson 1'],
                academyWeek: 'l1-l01',
                moodleModuleId: 5777762,
                skills: ['vocabulary', 'reading', 'speaking'],
                jlpt: 'N5',
                concepts: ['greetings', 'name', 'job', 'country', 'topic particle は'],
            },
            decision: 'curriculum-anchor-not-verbatim-source-for-this-slice',
        },
        {
            id: 'dated-lessons-minna-28-nagara',
            rank: 3,
            sourceGroupId: 'lessons',
            source: {
                sourceId: 'japanese-library:Lessons/Lesson 1-20260310/Handouts/Chapter 28-1 〜ながら_grammar_exercise.pdf',
                payloadSha256: 'b5a1d39c3306a5e7b1c55b108d906bdbf697caea45bdb28746cf5661e772bf48',
                rights: 'private-course-material-review-required',
            },
            mapping: {
                curriculum: ['Minna no Nihongo II lesson 28'],
                academyWeek: 'dated-course-week-1',
                skills: ['grammar', 'writing'],
                jlpt: 'N4',
                concepts: ['Vます-stem + ながら'],
            },
            decision: 'high-value-later-week-candidate',
        },
        {
            id: 'kanji-look-and-learn-main',
            rank: 4,
            sourceGroupId: 'kanji-look-and-learn',
            source: {
                payloadSha256: '54e8e0c2aea7d71339d7cc743599e2b00c5e255fd8704b52bfe135be1c9dd80a',
                occurrenceCount: 2,
                rights: 'private-reference-review-required',
            },
            mapping: {
                curriculum: ['Kanji Look and Learn 1-512'],
                academyWeek: null,
                skills: ['kanji-recognition', 'kanji-writing', 'reading'],
                jlpt: 'N5-N2',
                concepts: [],
                gap: 'No item/page-to-Academy-week crosswalk has been verified.',
            },
            decision: 'defer-until-kanji-crosswalk',
        },
    ];
}

function selectedSlice() {
    return {
        id: 'l1-l01-genki-sentence-builder',
        pluginKind: 'academy-sentence-builder',
        source: {
            sourceGroupId: 'genki-study-resources',
            relativePath: 'lessons/lesson-1/workbook-5/index.html',
            payloadSha256: 'b909643450ead83af08d8dd22f717f9d320b165e5accf790514a31212d155451',
            lineLocus: { start: 76, end: 113 },
            license: 'MIT',
            licenseSha256: '78ce1f38ce4e700e0f2e50f80d549db0798cbdac9dfb5873dfb87c66a711f839',
            rights: 'permitted-mit',
            reuse: 'verbatim-rendered-quiz-prompts-and-answers',
        },
        mapping: {
            curriculum: ['Genki I lesson 1', 'Minna no Nihongo I lesson 1', 'UCL Level 1 lesson 1'],
            academyWeek: 'l1-l01',
            moodleModuleId: 5777762,
            skills: ['grammar', 'reading', 'sentence-construction'],
            jlpt: 'N5',
            concept: 'N は N です',
        },
        exercises: [
            { id: 'ogawa-japanese', lineLocus: { start: 83, end: 84 }, prompt: 'Ms. Ogawa is Japanese.', answer: 'おがわさんはにほんじんです。' },
            { id: 'takeda-teacher', lineLocus: { start: 88, end: 89 }, prompt: 'Mr. Takeda is a teacher.', answer: 'たけださんはせんせいです。' },
        ],
    };
}

async function main() {
    const command = process.argv[2] ?? 'build';
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const ledgerPath = path.join(repoRoot, 'artifacts/yomu-academy/source-pipeline/library/library-ledger.v1.json');
    const outputPath = path.join(repoRoot, 'public/academy/content/source-pipeline/mega-pack-stream.v1.json');
    if (command === 'validate') {
        const issues = validateMegaPackStreamCatalog(readJson(outputPath));
        if (issues.length) throw new Error(issues.join('; '));
        console.log('[mega-pack-stream] validation: OK');
        return;
    }
    if (command !== 'build') throw new Error('Usage: node mega-pack-stream.mjs <build|validate>');
    const ledgerBytes = readFileSync(ledgerPath);
    const catalog = buildMegaPackStreamCatalog(JSON.parse(ledgerBytes.toString('utf8')), {
        ledgerSha256: createHash('sha256').update(ledgerBytes).digest('hex'),
    });
    const issues = validateMegaPackStreamCatalog(catalog);
    if (issues.length) throw new Error(issues.join('; '));
    writeJsonAtomic(outputPath, catalog);
    console.log(`[mega-pack-stream] wrote ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(`[mega-pack-stream] fatal: ${error?.stack ?? error}`);
        process.exitCode = 1;
    });
}
