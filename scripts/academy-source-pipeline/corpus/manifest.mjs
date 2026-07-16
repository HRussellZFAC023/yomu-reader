import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CORPUS_REVISION, CORPUS_SCHEMAS, SOURCE_SCOPES } from './paths.mjs';
import { readJson, sha256File } from '../io.mjs';

export function buildCorpusManifest(roots, moodleLedger) {
    const library = readJson(roots.libraryLedgerPath);
    const packs = readJson(roots.packCandidatesPath);
    const soyaMapPath = path.join(roots.soyaRoot, 'listening-question-audio-map.json');
    const soya = readJson(soyaMapPath);
    const storyFiles = readdirSync(roots.providedStoriesRoot)
        .filter(name => name.endsWith('.json'))
        .sort()
        .map(name => ({ sourceId: `provided-story:${sha256File(path.join(roots.providedStoriesRoot, name))}` }));

    const privateManifest = {
        schema: CORPUS_SCHEMAS.manifest,
        revision: CORPUS_REVISION,
        policy: corpusPolicy(),
        roots: {
            moodleRaw: roots.corpusRoot,
            moodleDigitized: roots.donorPacksRoot,
            japanese: library.libraryRoot,
            soyaResearch: roots.soyaRoot,
            providedStories: roots.providedStoriesRoot,
        },
        sources: SOURCE_SCOPES,
        evidence: {
            moodle: moodleEvidence(moodleLedger),
            digitized: digitizedEvidence(packs),
            japanese: japaneseEvidence(library),
            soya: soyaEvidence(soyaMapPath, soya),
            providedStories: storyFiles,
        },
    };
    return { privateManifest, publicManifest: toPublicManifest(privateManifest) };
}

function corpusPolicy() {
    return {
        progressionOrder: [
            'moodle-raw',
            'japanese-minna',
            'japanese-genki',
            'japanese-library',
            'soya-research',
            'provided-stories',
        ],
        foundationScopes: ['moodle-raw', 'japanese-minna', 'japanese-genki'],
        advancedProgressionScopes: ['japanese-library', 'soya-research', 'provided-stories'],
        rules: [
            'Moodle chronology is authoritative for the class and N5-N4 foundation.',
            'Minna no Nihongo and Genki are prerequisite anchors inside that foundation.',
            'After the N4 foundation, vetted Japanese-library textbooks, Soya and JLPT banks, graded readers, and native media may advance N3-N1 progression.',
            'Every advanced progression item must declare its level, prerequisite concepts, source locus, and rights state.',
            'Source answers and model answers remain concealed until a learner attempt.',
            'A missing or ambiguous source field remains an explicit gap.',
        ],
        answerGate: 'after-attempt',
    };
}

function moodleEvidence(ledger) {
    return {
        manifestSha256: ledger.manifest.sha256,
        archiveOccurrences: ledger.archiveOccurrences.length,
        memberOccurrences: ledger.memberOccurrences.length,
        uniquePayloads: ledger.uniquePayloads.length,
    };
}

function digitizedEvidence(packs) {
    const outsideMoodle = packs.packs.filter(pack => !pack.sourceDocument.inMoodleCorpus);
    if (outsideMoodle.length > 0) throw new Error('Digitized pack corpus contains sources outside Moodle.');
    return {
        schema: packs.schema,
        packCount: packs.packs.length,
        sourceCandidateCount: packs.totals.sourceCandidateCount,
        sourceDocumentIds: packs.packs.map(pack => `moodle-digitized:${pack.sourceDocument.sha256}`),
    };
}

function japaneseEvidence(library) {
    const entries = library.entries.filter(entry => entry.entryKind === 'file');
    return {
        schema: library.schema,
        scanRevision: library.scanRevision,
        entryCount: library.summary.entryCount,
        uniquePayloadCount: library.summary.uniquePayloadCount,
        minnaPayloadCount: entries.filter(entry => /minna|\u307f\u3093\u306a/iu.test(entry.relativePath)).length,
        genkiPayloadCount: entries.filter(entry => /genki/iu.test(entry.relativePath)).length,
        storyPayloadCount: entries.filter(entry => /children.?s|stories|reader/iu.test(entry.relativePath)).length,
    };
}

function soyaEvidence(mapPath, map) {
    if (!existsSync(mapPath)) throw new Error(`Missing Soya question/media map: ${mapPath}`);
    return {
        mapSha256: sha256File(mapPath),
        questionCount: map.questions.length,
        mapFailureCount: map.failures.length,
        rightsState: 'item-review-required',
    };
}

function toPublicManifest(value) {
    return {
        schema: value.schema,
        revision: value.revision,
        policy: value.policy,
        sources: value.sources,
        evidence: {
            moodle: value.evidence.moodle,
            digitized: value.evidence.digitized,
            japanese: value.evidence.japanese,
            soya: value.evidence.soya,
            providedStories: { sourceDocumentIds: value.evidence.providedStories.map(item => item.sourceId) },
        },
    };
}
