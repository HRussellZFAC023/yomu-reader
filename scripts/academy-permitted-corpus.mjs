#!/usr/bin/env node
import { resolveCorpusRoots } from './academy-source-pipeline/corpus/paths.mjs';
import { buildCorpusManifest } from './academy-source-pipeline/corpus/manifest.mjs';
import { buildCurriculumCrosswalk } from './academy-source-pipeline/corpus/curriculum.mjs';
import { buildVocabularyParity } from './academy-source-pipeline/corpus/vocabulary.mjs';
import { buildMediaCrosswalk } from './academy-source-pipeline/corpus/media.mjs';
import { validateCorpusOutputs } from './academy-source-pipeline/corpus/validate.mjs';
import { readJson, writeJsonAtomic } from './academy-source-pipeline/io.mjs';

const command = process.argv[2] ?? 'build';
const roots = resolveCorpusRoots();

if (command === 'validate') {
    report(validateCorpusOutputs(roots));
} else if (command === 'build') {
    const moodleLedger = readJson(roots.moodlePrivateLedgerPath);
    const rawManifest = readJson(`${roots.corpusRoot}/manifest.json`);
    const manifest = buildCorpusManifest(roots, moodleLedger);
    const curriculum = buildCurriculumCrosswalk(roots, rawManifest);
    const vocabulary = buildVocabularyParity(roots);
    const media = buildMediaCrosswalk(roots);
    writePair(roots, 'manifest', manifest.privateManifest, manifest.publicManifest);
    writePair(roots, 'curriculum', curriculum.privateCrosswalk, curriculum.publicCrosswalk);
    writePair(roots, 'vocabulary', vocabulary.privateParity, vocabulary.publicParity);
    writePair(roots, 'media', media.privateCrosswalk, media.publicCrosswalk);
    report(validateCorpusOutputs(roots));
} else {
    console.error('Usage: node scripts/academy-permitted-corpus.mjs <build|validate>');
    process.exitCode = 2;
}

function writePair(resolvedRoots, name, privateValue, publicValue) {
    writeJsonAtomic(resolvedRoots.privateFiles[name], privateValue);
    writeJsonAtomic(resolvedRoots.publicFiles[name], publicValue);
    console.log(`[permitted-corpus] wrote ${resolvedRoots.publicFiles[name]}`);
}

function report(violations) {
    if (violations.length === 0) {
        console.log('[permitted-corpus] validation: OK');
        return;
    }
    for (const violation of violations) console.error(`[permitted-corpus] ${violation}`);
    process.exitCode = 1;
}
