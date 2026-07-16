import path from 'node:path';
import { insideRoot, resolveRoots } from '../paths.mjs';

export const CORPUS_REVISION = 'yomu-academy.permitted-corpus/2026-07-16.1';

export const CORPUS_SCHEMAS = Object.freeze({
    manifest: 'yomu-academy.permitted-corpus.manifest/v1',
    curriculum: 'yomu-academy.permitted-corpus.curriculum-crosswalk/v1',
    vocabulary: 'yomu-academy.permitted-corpus.vocabulary-parity/v1',
    media: 'yomu-academy.permitted-corpus.media-crosswalk/v1',
});

export const SOURCE_SCOPES = Object.freeze([
    { id: 'moodle-raw', role: 'progression-anchor', sequenceAuthority: 1 },
    { id: 'moodle-digitized', role: 'exact-derivative', sequenceAuthority: null },
    { id: 'japanese-minna', role: 'progression-anchor', sequenceAuthority: 3 },
    { id: 'japanese-genki', role: 'progression-anchor', sequenceAuthority: 4 },
    { id: 'japanese-library', role: 'advanced-progression-anchor', sequenceAuthority: 5 },
    { id: 'soya-research', role: 'assessment-and-progression-anchor', sequenceAuthority: 6 },
    { id: 'provided-stories', role: 'graded-reading-anchor', sequenceAuthority: 7 },
]);

export function resolveCorpusRoots(env = process.env) {
    const base = resolveRoots(env);
    const privateRoot = insideRoot(base.privateRoot, 'permitted-corpus');
    const publicRoot = base.publicRoot;
    return Object.freeze({
        ...base,
        privateRoot,
        publicRoot,
        lessonsRoot: path.join(base.repoRoot, 'public/academy/content/lessons'),
        moodlePrivateLedgerPath: insideRoot(base.privateRoot, 'private-ledger.v1.json'),
        libraryLedgerPath: insideRoot(base.privateRoot, 'library', 'library-ledger.v1.json'),
        packCandidatesPath: insideRoot(base.privateRoot, 'pack-candidates.v1.json'),
        pdfCensusRoot: insideRoot(base.privateRoot, 'pdf-census'),
        audioCensusPath: insideRoot(base.privateRoot, 'audio-census.v1.json'),
        soyaRoot: path.resolve(env.ACADEMY_SOYA_ROOT
            ?? path.join(base.repoRoot, '../../references/soya-research')),
        providedStoriesRoot: path.resolve(env.ACADEMY_PROVIDED_STORIES_ROOT
            ?? path.join(base.repoRoot, 'src/academy/content/story-sources')),
        privateFiles: outputFiles(privateRoot),
        publicFiles: outputFiles(publicRoot),
    });
}

function outputFiles(root) {
    return Object.freeze({
        manifest: insideRoot(root, 'permitted-corpus.v1.json'),
        curriculum: insideRoot(root, 'curriculum-crosswalk.v1.json'),
        vocabulary: insideRoot(root, 'vocabulary-parity.v1.json'),
        media: insideRoot(root, 'media-crosswalk.v1.json'),
    });
}
