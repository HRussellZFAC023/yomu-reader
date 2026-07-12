import { readdirSync } from 'node:fs';
import path from 'node:path';
import { EXTRACTION_REVISION, PRIVATE_SCHEMA_VERSIONS, insideRoot } from './paths.mjs';
import { compareUtf8, readJson, writeJsonAtomic } from './io.mjs';

/**
 * Migrates the donor 44-pack corpus into versioned pack candidates that keep
 * IMMUTABLE SOURCE CANDIDATES strictly apart from AUGMENTATION. Every donor
 * item survives; nothing is promoted to verified/playable here. Unresolved
 * page loci and prose media descriptions stay review-required.
 */
export function migrateDonorPacks(roots, ledger, { log = () => {} } = {}) {
    const packsDir = path.join(roots.donorPacksRoot, 'packs');
    const packFiles = readdirSync(packsDir).filter(name => name.endsWith('.json')).sort(compareUtf8);
    const moodlePayloadShas = new Set(ledger.uniquePayloads.map(payload => payload.sha256));

    const packs = packFiles.map(fileName => {
        log(`migrate pack ${fileName}`);
        return migrateOnePack(readJson(path.join(packsDir, fileName)), moodlePayloadShas);
    });
    const output = {
        schema: PRIVATE_SCHEMA_VERSIONS.packCandidates,
        extractionRevision: EXTRACTION_REVISION,
        packs,
        totals: totalize(packs),
    };
    writeJsonAtomic(insideRoot(roots.privateRoot, 'pack-candidates.v1.json'), output);
    return output;
}

function migrateOnePack(donor, moodlePayloadShas) {
    assertKnownPackFields(donor);
    const sha256 = (donor.sha256 ?? '').replace(/^sha256:/, '');
    const items = donor.items ?? [];
    for (const item of items) assertKnownItemFields(item, donor.packId);
    const sourceCandidates = items.map(toSourceCandidate);
    const augmentation = items.map(toAugmentation);
    assertDisjointFieldSets(sourceCandidates, augmentation, donor.packId);
    return {
        donorSchema: donor.schema ?? null,
        packId: donor.packId,
        slug: donor.slug,
        sourceDocument: {
            sha256,
            byteLength: donor.byteLength ?? null,
            pageCount: donor.pageCount ?? null,
            primaryName: donor.provenance?.primaryName ?? donor.primaryName ?? null,
            sourceId: donor.sourceId ?? null,
            occurrences: donor.provenance?.occurrences ?? donor.occurrences ?? [],
            extractionProvenance: donor.provenance?.extraction ?? null,
            donorRightsClaim: donor.provenance?.rights ?? null,
            donorTier: donor.provenance?.tier ?? null,
            inMoodleCorpus: moodlePayloadShas.has(sha256),
            rights: 'private-use-review-required',
        },
        title: {
            source: donor.title?.original ?? null,
            augmentation: donor.title?.translitOrTranslation ?? null,
        },
        instructions: (donor.instructions ?? []).map(instruction => ({
            source: { id: instruction.id, originalText: instruction.originalText ?? null },
            augmentation: { translation: instruction.translation ?? null, furigana: instruction.furigana ?? null },
        })),
        audioRefs: donor.audio ?? [],
        supplementalAugmentation: {
            curriculum: donor.curriculum ?? null,
            vocabulary: donor.vocabulary ?? [],
            listening: donor.listening ?? null,
            kanjiActivities: donor.kanjiActivities ?? [],
            freeWritingPrompts: donor.freeWritingPrompts ?? [],
            groupTask: donor.groupTask ?? null,
            mappings: donor.mappings ?? null,
            sceneSuggestions: donor.sceneSuggestions ?? [],
            reviewFlags: donor.reviewFlags ?? [],
        },
        sourceCandidates,
        augmentation,
        counts: {
            donorItemCount: items.length,
            instructionCount: (donor.instructions ?? []).length,
            sourceCandidateCount: sourceCandidates.length,
            augmentationRecordCount: augmentation.length,
            candidatePageCount: sourceCandidates.filter(candidate => candidate.locus.page !== null).length,
            unresolvedLocusCount: sourceCandidates.filter(candidate => candidate.locus.page === null).length,
            mediaReviewRequiredCount: sourceCandidates.filter(candidate => candidate.mediaDescriptions.length > 0).length,
            audioMediaRefCount: sourceCandidates.reduce((sum, candidate) =>
                sum + candidate.mediaDescriptions.filter(media => media.kind === 'audio').length, 0),
            imageMediaRefCount: sourceCandidates.reduce((sum, candidate) =>
                sum + candidate.mediaDescriptions.filter(media => media.kind === 'image').length, 0),
            donorAnswerClaimCount: augmentation.filter(record => record.answer !== null).length,
        },
    };
}

function toSourceCandidate(item) {
    return {
        itemId: item.id,
        type: item.type ?? 'other',
        promptOriginal: item.promptOriginal ?? null,
        number: item.number ?? null,
        section: item.section ?? null,
        options: item.options ?? [],
        annotations: item.annotations ?? [],
        blankLabel: item.blankLabel ?? null,
        card: item.card ?? null,
        label: item.label ?? null,
        partOfSpeech: item.partOfSpeech ?? null,
        locus: candidateLocus(item),
        mediaDescriptions: describeMedia(item.media),
        reviewState: 'machine-migrated-review-required',
    };
}

function toAugmentation(item) {
    return {
        itemId: item.id,
        promptTranslation: item.promptTranslation ?? null,
        furigana: item.furigana ?? null,
        pitchAccent: item.pitchAccent ?? null,
        answer: item.answer ? { ...item.answer, provenance: 'donor-claimed-review-required' } : null,
        hints: item.hints ?? [],
        feedback: item.feedback ?? [],
        commonErrors: item.commonErrors ?? [],
        tags: item.tags ?? [],
        srs: item.srs ?? null,
        reviewFlags: item.reviewFlags ?? [],
    };
}

function candidateLocus(item) {
    const pages = new Set();
    if (Number.isSafeInteger(item.page) && item.page > 0) pages.add(item.page);
    for (const imageRef of item.media?.imageRefs ?? []) {
        if (Number.isSafeInteger(imageRef?.page) && imageRef.page > 0) pages.add(imageRef.page);
    }
    if (pages.size === 1) {
        return { page: [...pages][0], status: 'donor-page-candidate-review-required' };
    }
    if (pages.size > 1) {
        return { page: null, candidatePages: [...pages].sort((a, b) => a - b), status: 'multiple-pages-review-required' };
    }
    return { page: null, status: 'unresolved-review-required' };
}

function describeMedia(media) {
    if (!media) return [];
    const descriptions = [];
    for (const audioRef of media.audioRefs ?? []) {
        descriptions.push({ kind: 'audio', ref: audioRef, status: 'described-not-verified' });
    }
    for (const imageRef of media.imageRefs ?? []) {
        descriptions.push({ kind: 'image', ref: imageRef, status: 'described-not-verified' });
    }
    if (media.timecode !== null && media.timecode !== undefined) {
        descriptions.push({ kind: 'timecode', ref: media.timecode, status: 'described-not-verified' });
    }
    return descriptions;
}

const PACK_FIELDS = new Set([
    'schema', 'packId', 'slug', 'sourceId', 'sha256', 'byteLength', 'pageCount', 'title',
    'provenance', 'curriculum', 'audio', 'instructions', 'items', 'vocabulary', 'listening',
    'kanjiActivities', 'freeWritingPrompts', 'groupTask', 'mappings', 'sceneSuggestions', 'reviewFlags',
]);
const SOURCE_ITEM_INPUT_FIELDS = new Set([
    'id', 'type', 'promptOriginal', 'number', 'section', 'options', 'annotations', 'blankLabel',
    'card', 'label', 'partOfSpeech', 'page', 'media',
]);
const AUGMENTATION_ITEM_INPUT_FIELDS = new Set([
    'promptTranslation', 'furigana', 'pitchAccent', 'answer', 'hints', 'feedback',
    'commonErrors', 'tags', 'srs', 'reviewFlags',
]);

function assertKnownPackFields(donor) {
    const unknown = Object.keys(donor).filter(field => !PACK_FIELDS.has(field));
    if (unknown.length > 0) throw new Error(`Pack ${donor.packId}: unmapped top-level fields: ${unknown.join(', ')}`);
}

function assertKnownItemFields(item, packId) {
    const unknown = Object.keys(item).filter(field =>
        !SOURCE_ITEM_INPUT_FIELDS.has(field) && !AUGMENTATION_ITEM_INPUT_FIELDS.has(field));
    if (unknown.length > 0) throw new Error(`Pack ${packId} item ${item.id}: unmapped fields: ${unknown.join(', ')}`);
}

const SOURCE_ONLY_FIELDS = new Set([
    'promptOriginal', 'number', 'section', 'options', 'annotations', 'blankLabel', 'card',
    'label', 'partOfSpeech', 'locus', 'mediaDescriptions',
]);
const AUGMENTATION_ONLY_FIELDS = new Set([
    'promptTranslation', 'furigana', 'pitchAccent', 'answer', 'hints', 'feedback',
    'commonErrors', 'tags', 'srs', 'reviewFlags',
]);

function assertDisjointFieldSets(sourceCandidates, augmentation, packId) {
    for (const candidate of sourceCandidates) {
        for (const field of Object.keys(candidate)) {
            if (AUGMENTATION_ONLY_FIELDS.has(field)) throw new Error(`Pack ${packId}: source candidate leaks augmentation field ${field}`);
        }
    }
    for (const record of augmentation) {
        for (const field of Object.keys(record)) {
            if (SOURCE_ONLY_FIELDS.has(field)) throw new Error(`Pack ${packId}: augmentation leaks source field ${field}`);
        }
    }
}

function totalize(packs) {
    return packs.reduce((totals, pack) => ({
        packCount: totals.packCount + 1,
        donorItemCount: totals.donorItemCount + pack.counts.donorItemCount,
        instructionCount: totals.instructionCount + pack.counts.instructionCount,
        sourceCandidateCount: totals.sourceCandidateCount + pack.counts.sourceCandidateCount,
        augmentationRecordCount: totals.augmentationRecordCount + pack.counts.augmentationRecordCount,
        candidatePageCount: totals.candidatePageCount + pack.counts.candidatePageCount,
        unresolvedLocusCount: totals.unresolvedLocusCount + pack.counts.unresolvedLocusCount,
        mediaReviewRequiredCount: totals.mediaReviewRequiredCount + pack.counts.mediaReviewRequiredCount,
        audioMediaRefCount: totals.audioMediaRefCount + pack.counts.audioMediaRefCount,
        imageMediaRefCount: totals.imageMediaRefCount + pack.counts.imageMediaRefCount,
        donorAnswerClaimCount: totals.donorAnswerClaimCount + pack.counts.donorAnswerClaimCount,
        packsInMoodleCorpus: totals.packsInMoodleCorpus + (pack.sourceDocument.inMoodleCorpus ? 1 : 0),
    }), {
        packCount: 0,
        donorItemCount: 0,
        instructionCount: 0,
        sourceCandidateCount: 0,
        augmentationRecordCount: 0,
        candidatePageCount: 0,
        unresolvedLocusCount: 0,
        mediaReviewRequiredCount: 0,
        audioMediaRefCount: 0,
        imageMediaRefCount: 0,
        donorAnswerClaimCount: 0,
        packsInMoodleCorpus: 0,
    });
}
