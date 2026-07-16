import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CORPUS_REVISION, CORPUS_SCHEMAS } from './paths.mjs';
import { readJson, readJsonIfPresent, sha256File } from '../io.mjs';

export function buildMediaCrosswalk(roots) {
    const moodle = buildMoodleMedia(roots);
    const digitized = buildDigitizedMedia(roots);
    const soya = buildSoyaMedia(roots);
    const japanese = buildJapaneseMedia(roots);
    const stories = buildProvidedStoryMedia(roots);
    const privateCrosswalk = {
        schema: CORPUS_SCHEMAS.media,
        revision: CORPUS_REVISION,
        reusePolicy: {
            progressionSources: ['moodle-raw', 'japanese-minna', 'japanese-genki'],
            enrichmentOnly: ['japanese-library', 'soya-research', 'provided-stories'],
            answerGate: 'after-attempt',
            unresolvedMediaMayShip: false,
        },
        mappings: { moodle, digitized, soya, japanese, stories },
    };
    return { privateCrosswalk, publicCrosswalk: toPublic(privateCrosswalk) };
}

function buildMoodleMedia(roots) {
    const audio = (readJsonIfPresent(roots.audioCensusPath)?.payloads ?? []).map(payload => ({
        sourceId: `moodle-audio:${payload.payloadSha256}`,
        payloadSha256: payload.payloadSha256,
        status: payload.status,
        durationSeconds: payload.durationSeconds ?? null,
        codec: payload.codec ?? null,
        occurrenceCount: payload.occurrenceCount ?? null,
    }));
    const images = [];
    if (existsSync(roots.pdfCensusRoot)) {
        for (const sha of readdirSync(roots.pdfCensusRoot).sort()) {
            const censusPath = path.join(roots.pdfCensusRoot, sha, 'census.json');
            if (!existsSync(censusPath)) continue;
            const census = readJson(censusPath);
            const objectCount = census.summary?.imageObjectCount ?? 0;
            const regionCount = census.summary?.nativeMediaRegionCount ?? 0;
            if (objectCount === 0 && regionCount === 0) continue;
            images.push({
                sourceId: `moodle-pdf-media:${sha}`,
                payloadSha256: sha,
                imageObjectCount: objectCount,
                positionedRegionCount: regionCount,
                status: census.nativeImageExtraction?.status === 'complete' ? 'censused' : 'unresolved',
            });
        }
    }
    return { audio, images };
}

function buildDigitizedMedia(roots) {
    const packs = readJsonIfPresent(roots.packCandidatesPath)?.packs ?? [];
    return packs.flatMap(pack => pack.sourceCandidates.flatMap(item => item.mediaDescriptions.map((media, index) => ({
        sourceId: `moodle-digitized-media:${pack.sourceDocument.sha256}:${item.itemId}:${index + 1}`,
        sourceDocumentSha256: pack.sourceDocument.sha256,
        itemId: item.itemId,
        kind: media.kind,
        ref: media.ref,
        status: media.status,
        answerGate: 'after-attempt',
    }))));
}

function buildSoyaMedia(roots) {
    const map = readJson(path.join(roots.soyaRoot, 'listening-question-audio-map.json'));
    return map.questions.map(question => {
        const audioPath = resolveSoyaPath(roots.soyaRoot, 'audio-public', question.audioPath);
        const imagePath = resolveSoyaImage(roots.soyaRoot, question.imageUrl);
        const audio = fileIdentity(audioPath, 'audio');
        const image = fileIdentity(imagePath, 'image');
        const missing = [question.audioMode === 'static' && !audio, question.imageUrl && !image].filter(Boolean).length;
        return {
            sourceId: `soya-question:${question.id}`,
            questionId: question.id,
            course: question.course,
            audioMode: question.audioMode,
            audio,
            image,
            sourceFile: question.sourceFile,
            answerPresent: Boolean(question.correctAnswer),
            answerGate: 'after-attempt',
            rightsState: 'item-review-required',
            sequenceRole: 'enrichment-only',
            status: missing === 0 ? 'mapped-review-required' : 'missing-media',
        };
    });
}

function resolveSoyaPath(root, subtree, sourcePath) {
    if (!sourcePath) return null;
    const relative = sourcePath.replace(/^\/+/, '');
    const candidate = path.join(root, subtree, relative);
    return existsSync(candidate) ? candidate : null;
}

function resolveSoyaImage(root, sourcePath) {
    if (!sourcePath) return null;
    const relative = sourcePath.replace(/^\/+/, '');
    const candidates = [
        path.join(root, 'assets-public', relative),
        path.join(root, 'site-static', relative),
        path.join(root, 'site-static-live', relative),
    ];
    return candidates.find(existsSync) ?? null;
}

function fileIdentity(filePath, kind) {
    if (!filePath) return null;
    return {
        sourceId: `${kind}:${sha256File(filePath)}`,
        sha256: sha256File(filePath),
        bytes: statSync(filePath).size,
        path: filePath,
    };
}

function buildJapaneseMedia(roots) {
    const library = readJson(roots.libraryLedgerPath);
    const usable = library.entries.filter(entry =>
        entry.entryKind === 'file'
        && (entry.state === 'included' || entry.state.startsWith('duplicate-of:')));
    return usable.filter(entry => ['audio', 'video', 'image'].includes(entry.classification?.kind)).flatMap(entry => {
        let scope = null;
        if (/genki/iu.test(entry.relativePath)) scope = 'japanese-genki';
        else if (/minna|\u307f\u3093\u306a/iu.test(entry.relativePath)) scope = 'japanese-minna';
        else if (/children.?s|stories|reader/iu.test(entry.relativePath)) scope = 'japanese-library';
        if (!scope) return [];
        return [{
            sourceId: `${scope}-media:${entry.sha256}`,
            scope,
            sha256: entry.sha256,
            kind: entry.classification.kind,
            relativePath: entry.relativePath,
            chapter: inferChapter(entry.relativePath),
            sequenceRole: scope === 'japanese-library' ? 'enrichment-only' : 'prerequisite-anchor-media',
        }];
    });
}

function inferChapter(value) {
    const match = /(?:^|[/_-])(?:K|L|Lesson)?(\d{1,2})(?:[/_.-]|$)/iu.exec(value);
    return match ? Number(match[1]) : null;
}

function buildProvidedStoryMedia(roots) {
    return readdirSync(roots.providedStoriesRoot).filter(name => name.endsWith('.json')).sort().map(name => {
        const filePath = path.join(roots.providedStoriesRoot, name);
        return {
            sourceId: `provided-story:${sha256File(filePath)}`,
            sha256: sha256File(filePath),
            path: filePath,
            kind: 'story-data',
            sequenceRole: 'enrichment-only',
        };
    });
}

function toPublic(value) {
    const { moodle, digitized, soya, japanese, stories } = value.mappings;
    return {
        schema: value.schema,
        revision: value.revision,
        reusePolicy: value.reusePolicy,
        scopes: {
            moodle: {
                audioCount: moodle.audio.length,
                imageBearingPdfCount: moodle.images.length,
                unresolvedCount: [...moodle.audio, ...moodle.images].filter(item =>
                    String(item.status).startsWith('failed') || item.status === 'unresolved').length,
                sourceIds: [...moodle.audio, ...moodle.images].map(item => item.sourceId),
            },
            digitized: summarizeMappings(digitized),
            soya: {
                ...summarizeMappings(soya),
                withAudio: soya.filter(item => item.audio).length,
                withImage: soya.filter(item => item.image).length,
                answerGated: soya.filter(item => item.answerPresent && item.answerGate === 'after-attempt').length,
                rightsReviewRequired: soya.filter(item => item.rightsState === 'item-review-required').length,
            },
            japanese: {
                ...summarizeMappings(japanese),
                byScope: countValues(japanese.map(item => item.scope)),
                byKind: countValues(japanese.map(item => item.kind)),
                chapterMapped: japanese.filter(item => item.chapter !== null).length,
            },
            providedStories: summarizeMappings(stories),
        },
    };
}

function summarizeMappings(items) {
    return {
        mappingCount: items.length,
        unresolvedCount: items.filter(item => /missing|unresolved|described-not-verified/u.test(item.status ?? '')).length,
        sourceIds: items.map(item => item.sourceId),
    };
}

function countValues(values) {
    const counts = {};
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
