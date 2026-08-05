#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMemberPayload, readZipMembers } from './academy-source-pipeline/zip.mjs';
import { readJson, readJsonIfPresent, writeJsonAtomic } from './academy-source-pipeline/io.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = 'yomu-academy.audio-source-inventory/v1';
const privateCatalogPath = path.join(repoRoot, 'artifacts/yomu-academy/audio-source-inventory.v1.json');
// public/academy only: scripts/sync-academy.cjs regenerates
// docs/public/academy from it on every build:academy.
const publicCatalogPath = path.join(repoRoot, 'public/academy/content/audio/source-inventory.v1.json');
const moodleLedgerPath = path.join(repoRoot, 'artifacts/yomu-academy/source-pipeline/private-ledger.v1.json');
const taskBindingsPath = path.join(repoRoot, 'public/academy/content/listening/listening-task-bindings.v1.json');
const zipMetadataVersion = 5;
const audioExtensions = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']);
const visualExtensions = new Set([
    '.apng', '.avif', '.avi', '.bmp', '.gif', '.jpeg', '.jpg', '.m4v', '.mov', '.mp4',
    '.mpeg', '.mpg', '.png', '.svg', '.tif', '.tiff', '.webm', '.webp',
]);
const minnaChapterTrackEnds = Object.freeze([
    4, 8, 11, 16, 20, 23, 27, 31, 34, 38, 42, 45, 48,
    52, 55, 59, 62, 65, 68, 71, 74, 77, 81, 84, 87,
]);
const defaultSources = Object.freeze([
    {
        id: 'soya-public',
        kind: 'directory',
        path: path.resolve(repoRoot, '../../references/soya-research/audio-public'),
        textbook: { publisher: 'Soya', collection: 'public audio corpus' },
    },
    {
        id: 'minna-shokyu-1',
        kind: 'zip',
        path: '/Users/heru/Downloads/0-0001-01-230020-0.zip',
        textbook: { publisher: '3A Corporation', collection: 'Minna no Nihongo Shokyu I', volume: 1 },
        officialSource: {
            url: 'https://www.3anet.co.jp/np/resrcs/230020/',
            downloadUrl: 'https://www.3anet.co.jp/np/secure/0-0001-01-230020/0-0001-01-230020-0.zip',
            access: 'free-no-registration',
            evidence: 'The official 3A page labels the 87-track MP3 download and every chapter block as free and no-registration.',
            verifiedOn: '2026-07-15',
        },
        harvestEligibility: 'official-free-no-registration',
        usagePolicy: 'exact-missing-tracks-only',
    },
    {
        id: 'genki-2e',
        kind: 'zip',
        path: '/Users/heru/Downloads/Genki Japanese-20260714T213954Z-1-001.zip',
        textbook: { publisher: 'The Japan Times', collection: 'Genki: An Integrated Course in Elementary Japanese', edition: 2 },
    },
    {
        id: 'japanese-folder',
        kind: 'directory',
        path: '/Users/heru/Documents/Japanese',
        textbook: { collection: 'User-supplied Japanese folder' },
    },
]);

export function collectAudioSourceCatalog({
    sources = defaultSources,
    moodleLedger = readJson(moodleLedgerPath),
    taskBindings = readJsonIfPresent(taskBindingsPath),
    lessonRoot = path.join(repoRoot, 'public/academy/content/lessons'),
    cache = readJsonIfPresent(privateCatalogPath),
    log = () => {},
} = {}) {
    const moodle = indexMoodleAssets(moodleLedger);
    const academyPackages = indexAcademyPackageAssets(lessonRoot);
    const verifiedTasks = indexVerifiedTasks(taskBindings);
    const sourceRows = sources.map(source => source.kind === 'zip'
        ? indexZipSource(source, cache?.sources?.find(row => row.id === source.id), log)
        : indexDirectorySource(source, cache?.sources?.find(row => row.id === source.id), log));
    const bindings = sourceRows.flatMap(source => uniquePayloadAssets(source.assets.filter(isAudioAsset))
        .map(asset => bindingFor({
            source, asset, moodle: moodle.audio, academyPackages: academyPackages.audio,
            verifiedTasks, kind: 'audio',
        }))
        .filter(Boolean));
    const visualBindings = sourceRows.flatMap(source => uniquePayloadAssets(source.assets.filter(isVisualAsset))
        .map(asset => bindingFor({
            source, asset, moodle: moodle.visual, academyPackages: academyPackages.visual,
            verifiedTasks, kind: 'visual',
        }))
        .filter(Boolean));
    const summary = sourceRows.map(source => {
        const audioAssets = source.assets.filter(isAudioAsset);
        const visualAssets = source.assets.filter(isVisualAsset);
        const uniqueAudioPayloads = uniquePayloadAssets(audioAssets);
        const uniqueVisualPayloads = uniquePayloadAssets(visualAssets);
        return {
            id: source.id,
            kind: source.kind,
            textbook: source.textbook,
            officialSource: source.officialSource,
            harvestEligibility: source.harvestEligibility ?? 'inventory-only',
            usagePolicy: source.usagePolicy,
            archiveSha256: source.archiveSha256,
            audioFileCount: audioAssets.length,
            uniquePayloadCount: uniqueAudioPayloads.length,
            duplicatePayloadCount: audioAssets.length - uniqueAudioPayloads.length,
            visualFileCount: visualAssets.length,
            uniqueVisualPayloadCount: uniqueVisualPayloads.length,
            duplicateVisualPayloadCount: visualAssets.length - uniqueVisualPayloads.length,
            exactMoodlePayloadCount: uniqueAudioPayloads.filter(asset => moodle.audio.has(asset.sha256)).length,
            exactMoodleVisualPayloadCount: uniqueVisualPayloads.filter(asset => moodle.visual.has(asset.sha256)).length,
            exactAcademyPackageReferenceCount: bindings
                .filter(binding => binding.sourceId === source.id)
                .reduce((total, binding) => total + binding.academyPackageReferences.length, 0),
            exactAcademyPackageVisualReferenceCount: visualBindings
                .filter(binding => binding.sourceId === source.id)
                .reduce((total, binding) => total + binding.academyPackageReferences.length, 0),
            unmatchedAudioFileCount: audioAssets.filter(asset => !moodle.audio.has(asset.sha256)).length,
            unmatchedVisualFileCount: visualAssets.filter(asset => !moodle.visual.has(asset.sha256)).length,
            rights: source.harvestEligibility === 'official-free-no-registration'
                ? 'official-download-access-verified-redistribution-not-claimed'
                : 'private-source-review-required',
            runtime: 'inventory-only',
        };
    });
    return {
        schema,
        generation: {
            deterministic: true,
            generatedAt: null,
            zipMetadataVersion,
            method: 'SHA-256 every supplied audio and visual payload; deduplicate by payload hash; bind only byte-identical Moodle payloads and Academy package source references. Runtime availability additionally requires an exact packaged task binding with the same audio SHA-256. Only the official free/no-registration 3A archive is harvest-eligible for audio harvest. No filename, chapter, lesson-number, duration, or visual filename inference creates a runtime binding.',
        },
        moodle: {
            audioOccurrenceCount: occurrenceCount(moodle.audio),
            uniquePayloadCount: moodle.audio.size,
            visualOccurrenceCount: occurrenceCount(moodle.visual),
            uniqueVisualPayloadCount: moodle.visual.size,
            rights: 'private-course-source-review-required',
            runtime: 'inventory-only',
        },
        sources: sourceRows,
        summary,
        bindings,
        visualBindings,
        gaps: {
            unmatchedInventoryBySource: summary.map(source => ({ id: source.id, audioFileCount: source.unmatchedAudioFileCount })),
            unmatchedVisualInventoryBySource: summary.map(source => ({ id: source.id, visualFileCount: source.unmatchedVisualFileCount })),
            taskPairing: 'A byte-identical Moodle source reference without a matching exact task binding remains inventory-only. Transcript, worksheet/task, answer, and rights review are required before runtime delivery.',
            visualPairing: 'A byte-identical visual source reference is inventory evidence only. A reviewed media region, source question, semantic role, and rights review are required before any runtime delivery.',
        },
    };
}

export function publicAudioSourceCatalog(catalog) {
    return {
        schema: catalog.schema,
        generation: catalog.generation,
        moodle: catalog.moodle,
        sources: catalog.summary,
        bindings: catalog.bindings,
        visualBindings: catalog.visualBindings,
        gaps: catalog.gaps,
    };
}

function indexZipSource(source, previous, log) {
    const archive = readFileSync(source.path);
    const archiveSha256 = sha256(archive);
    const priorByName = new Map(previous?.archiveSha256 === archiveSha256 && previous?.metadataVersion === zipMetadataVersion
        ? previous.assets.map(asset => [asset.sourceRelativePath, asset])
        : []);
    const { buffer, members } = readZipMembers(archive, source.path);
    const assets = [];
    for (const member of members) {
        if (member.memberKind !== 'file' || mediaKindForPath(member.name) === undefined) continue;
        const cached = priorByName.get(member.name);
        if (cached?.bytes === member.uncompressedBytes && cached.sha256) {
            assets.push(cached);
            continue;
        }
        log(`hash ${source.id}:${member.name}`);
        const payload = readMemberPayload(buffer, member, source.path);
        assets.push(describeAsset(member.name, payload, source.textbook));
    }
    return {
        id: source.id,
        kind: source.kind,
        textbook: source.textbook,
        officialSource: source.officialSource,
        harvestEligibility: source.harvestEligibility,
        usagePolicy: source.usagePolicy,
        archiveSha256,
        metadataVersion: zipMetadataVersion,
        assets: assets.sort(byPath),
    };
}

function indexDirectorySource(source, previous, log) {
    const cached = new Map(previous?.metadataVersion === zipMetadataVersion
        ? (previous.assets ?? []).map(asset => [asset.sourceRelativePath, asset])
        : []);
    const assets = [];
    for (const relativePath of mediaFiles(source.path)) {
        const absolutePath = path.join(source.path, relativePath);
        const stat = statSync(absolutePath);
        const prior = cached.get(relativePath);
        if (prior?.bytes === stat.size && prior.mtimeMs === stat.mtimeMs && prior.sha256) {
            assets.push(prior);
            continue;
        }
        log(`hash ${source.id}:${relativePath}`);
        const payload = readFileSync(absolutePath);
        assets.push({ ...describeAsset(relativePath, payload, source.textbook), mtimeMs: stat.mtimeMs });
    }
    return {
        id: source.id,
        kind: source.kind,
        textbook: source.textbook,
        officialSource: source.officialSource,
        harvestEligibility: source.harvestEligibility,
        usagePolicy: source.usagePolicy,
        metadataVersion: zipMetadataVersion,
        assets: assets.sort(byPath),
    };
}

function describeAsset(sourceRelativePath, payload, textbook) {
    return {
        sourceRelativePath: sourceRelativePath.split(path.sep).join('/'),
        mediaKind: mediaKindForPath(sourceRelativePath),
        ...textbookTrack(sourceRelativePath, textbook),
        sha256: sha256(payload),
        bytes: payload.byteLength,
    };
}

function textbookTrack(sourceRelativePath, textbook) {
    const fileName = path.basename(sourceRelativePath);
    const minna = /^minna_shokyu_(\d+)_(\d+)\.mp3$/iu.exec(fileName);
    if (minna) {
        const track = Number(minna[2]);
        const chapter = minnaChapterTrackEnds.findIndex(lastTrack => track <= lastTrack) + 1;
        return { textbook: { ...textbook, volume: Number(minna[1]), chapter, track } };
    }
    const genki = /Genki([12])_(KaiwaBunpo-hen\(Textbook\)|ListeningComprehension\(Workbook\)|Yomikaki-hen\(Textbook\))\/([KWY])(\d{2})(?:-(\d{1,2}|[A-Z]))?\(?\d?\)?\.mp3$/iu.exec(sourceRelativePath);
    if (!genki) {
        const title = /(?:^|\/)Genki (I|II)\/Genki\d+_KaiwaBunpo-hen\(Textbook\)\/Genki ?\d+-Title\.mp3$/iu.exec(sourceRelativePath);
        if (!title) return { textbook };
        return { textbook: { ...textbook, volume: title[1] === 'I' ? 1 : 2, item: 'title' } };
    }
    return {
        textbook: {
            ...textbook,
            volume: Number(genki[1]),
            section: genki[2],
            chapter: Number(genki[4]),
            track: genki[5] ?? genki[3],
        },
    };
}

function indexMoodleAssets(ledger) {
    const archiveById = new Map(ledger.archiveOccurrences.map(archive => [archive.id, archive]));
    const rows = { audio: new Map(), visual: new Map() };
    for (const member of ledger.memberOccurrences) {
        const kind = mediaKindForLedgerMember(member);
        if (!kind) continue;
        const archive = archiveById.get(member.archiveOccurrenceId);
        const row = {
            payloadSha256: member.payloadSha256,
            sourceTitle: member.name,
            moduleId: archive?.mapping?.moduleId ?? null,
            moduleTitle: archive?.mapping?.title ?? null,
            archiveId: member.archiveOccurrenceId,
        };
        const group = rows[kind].get(member.payloadSha256) ?? [];
        group.push(row);
        rows[kind].set(member.payloadSha256, group);
    }
    return rows;
}

function indexAcademyPackageAssets(lessonRoot) {
    const rows = { audio: new Map(), visual: new Map() };
    for (const fileName of readdirSync(lessonRoot).filter(name => name.endsWith('.json')).sort()) {
        const lesson = JSON.parse(readFileSync(path.join(lessonRoot, fileName), 'utf8'));
        for (const member of lesson.sourceCoverage?.members ?? []) {
            const kind = member.kind === 'audio' ? 'audio' : isVisualMember(member) ? 'visual' : undefined;
            if (!kind || typeof member.payloadSha256 !== 'string') continue;
            const group = rows[kind].get(member.payloadSha256) ?? [];
            const textbookChapter = chapterFrom(lesson.mapping?.minna);
            group.push({
                packageId: lesson.id,
                packageOrder: lesson.order,
                sourceTitle: member.title,
                ...(textbookChapter ? { textbookChapter } : {}),
            });
            rows[kind].set(member.payloadSha256, group);
        }
    }
    return rows;
}

function chapterFrom(value) {
    if (typeof value !== 'string') return undefined;
    const match = /\bChapter\s+(\d+)\b/iu.exec(value);
    return match ? Number(match[1]) : undefined;
}

function bindingFor({ source, asset, moodle, academyPackages, verifiedTasks, kind }) {
    const moodleReferences = moodle.get(asset.sha256);
    const packageReferences = academyPackages.get(asset.sha256);
    if (!moodleReferences && !packageReferences) return null;
    const taskBindingReferences = kind === 'audio' ? verifiedTasks.get(asset.sha256) ?? [] : [];
    const taskBound = taskBindingReferences.length > 0;
    return {
        sourceId: source.id,
        textbook: asset.textbook,
        sourceRelativePath: asset.sourceRelativePath,
        sha256: asset.sha256,
        bytes: asset.bytes,
        moodleReferences: moodleReferences ?? [],
        academyPackageReferences: packageReferences ?? [],
        ...(taskBound ? { taskBindingReferences } : {}),
        status: kind === 'audio'
            ? taskBound ? 'canonical-source-match-task-bound' : 'canonical-source-match-awaiting-task-pairing'
            : 'canonical-visual-source-match-awaiting-semantic-pairing',
        runtime: taskBound ? 'packaged-static' : 'unavailable',
        reason: kind === 'audio'
            ? taskBound
                ? 'A byte-identical source item has an exact transcript-and-task binding; runtime authority remains the canonical packaged task and its gated learner contract.'
                : 'A byte-identical source item is recorded, but no transcript-and-task verification grants runtime playback.'
            : 'A byte-identical visual source item is recorded, but no reviewed media-region and source-question verification grants runtime delivery.',
    };
}

function indexVerifiedTasks(taskBindings) {
    const rows = new Map();
    for (const entry of taskBindings?.entries ?? []) {
        if (entry.delivery?.status !== 'packaged-static' || typeof entry.source?.audioSha256 !== 'string') continue;
        const group = rows.get(entry.source.audioSha256) ?? [];
        group.push({
            packageId: entry.packageId,
            sourceQuestionId: entry.sourceQuestionId,
            locator: entry.locator,
            deliveryUrl: entry.delivery.url,
        });
        rows.set(entry.source.audioSha256, group);
    }
    return rows;
}

function uniquePayloadAssets(assets) {
    const firstByHash = new Map();
    for (const asset of assets) {
        if (!firstByHash.has(asset.sha256)) firstByHash.set(asset.sha256, asset);
    }
    return [...firstByHash.values()];
}

function* mediaFiles(root, prefix = '') {
    for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
        if (entry.isDirectory()) yield* mediaFiles(root, relativePath);
        else if (entry.isFile() && mediaKindForPath(entry.name) !== undefined) yield relativePath;
    }
}

function byPath(left, right) {
    return left.sourceRelativePath < right.sourceRelativePath ? -1 : left.sourceRelativePath > right.sourceRelativePath ? 1 : 0;
}

function isAudioAsset(asset) {
    return asset.mediaKind === 'audio';
}

function isVisualAsset(asset) {
    return asset.mediaKind === 'visual';
}

function mediaKindForPath(value) {
    const extension = path.extname(value).toLowerCase();
    if (audioExtensions.has(extension)) return 'audio';
    return visualExtensions.has(extension) ? 'visual' : undefined;
}

function mediaKindForLedgerMember(member) {
    if (member.classification?.kind === 'audio') return 'audio';
    if (member.classification?.kind === 'image' || member.classification?.kind === 'video') return 'visual';
    return mediaKindForPath(member.classification?.extension ?? member.name) === 'visual' ? 'visual' : undefined;
}

function isVisualMember(member) {
    return member.kind === 'image' || member.kind === 'video' || member.kind === 'visual'
        || mediaKindForPath(member.title ?? '') === 'visual';
}

function occurrenceCount(index) {
    return [...index.values()].reduce((total, rows) => total + rows.length, 0);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function main() {
    if (!existsSync(moodleLedgerPath)) throw new Error(`Moodle audio census missing: run npm run academy:source:census first.`);
    let hashed = 0;
    const catalog = collectAudioSourceCatalog({
        log: () => {
            hashed += 1;
            if (hashed % 1_000 === 0) process.stderr.write(`[audio-source-catalog] hashed ${hashed} new payloads\n`);
        },
    });
    writeJsonAtomic(privateCatalogPath, catalog);
    writeJsonAtomic(publicCatalogPath, publicAudioSourceCatalog(catalog));
    process.stdout.write(`[audio-source-catalog] ${catalog.summary.map(source => `${source.id}: ${source.audioFileCount} audio, ${source.visualFileCount} visual files`).join(', ')}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
