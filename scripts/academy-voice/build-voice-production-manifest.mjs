#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const storyRoot = join(root, 'src/academy/content/story-sources');
const audioRoot = join(root, 'public/academy/audio');
const docsRoot = join(root, 'docs/academy/audio');
const cast = readJson(join(docsRoot, 'aivis-cast-models.json'));
const locks = readJson(join(docsRoot, 'voice-line-locks.json'));
const uiLines = readJson(join(audioRoot, 'voice-lines.json'));
const modelBySpeaker = new Map(cast.map(entry => [entry.speaker, entry]));

const story = readdirSync(storyRoot)
    .filter(file => file.endsWith('.v2.json'))
    .sort()
    .flatMap(file => storyEntries(file, readJson(join(storyRoot, file))));
const ui = Object.entries(uiLines)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, line]) => ({
        key: `ui:${id}`,
        surface: 'ui',
        sourceId: id,
        speakerId: line.speaker,
        japanese: line.text,
        sourceSha256: digest([line.speaker, line.text]),
        status: 'remote-ready',
        output: line.url,
    }));

const entries = [...story, ...ui];
const manifest = {
    schema: 'yomu-academy.voice-production.v1',
    counts: {
        entries: entries.length,
        storyVariants: story.length,
        uiLines: ui.length,
        locked: entries.filter(entry => entry.status === 'locked').length,
        pilotRendered: entries.filter(entry => entry.pilotOutput).length,
        staleLocks: entries.filter(entry => entry.status === 'stale').length,
        missingModels: entries.filter(entry => entry.surface === 'story' && !entry.voiceModel?.uuid).length,
    },
    entries,
};

writeFileSync(join(docsRoot, 'voice-production-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const playbackCatalog = {
    schema: 'yomu-academy.story-voice-playback.v1',
    entries: story
        .filter(entry => (
            entry.status === 'locked'
            && entry.pitch?.status === 'pilot-rendered'
            && entry.pilotOutput
            && entry.speakerId !== 'learner'
            && entry.speakerId !== 'narrator'
        ))
        .map(entry => playbackEntry(entry)),
};
writeFileSync(join(audioRoot, 'story-voice-playback.json'), `${JSON.stringify(playbackCatalog, null, 2)}\n`);
console.log(JSON.stringify({ ...manifest.counts, playablePilots: playbackCatalog.entries.length }));

function storyEntries(file, source) {
    return source.scenes.flatMap(scene => scene.nodes.flatMap(node => {
        if (node.kind !== 'line') return [];
        return Object.entries(node.variants ?? {}).map(([band, variant]) => {
            const key = `${node.id}::${band}`;
            const sourceSha256 = digest([
                source.id,
                scene.id,
                node.speakerId ?? '',
                band,
                variant.japanese,
                variant.reading,
                variant.english,
            ]);
            const lock = locks[key];
            const status = !lock ? 'draft' : lock.sourceSha256 === sourceSha256 ? lock.status : 'stale';
            const pilotOutput = band === pilotBand(source.season)
                ? pilotPath(source.id, node.id, node.speakerId)
                : undefined;
            return {
                key,
                surface: 'story',
                sourceFile: file,
                chapterId: source.id,
                chapter: source.chapter ?? null,
                season: source.season,
                sceneId: scene.id,
                lineId: node.id,
                speakerId: node.speakerId ?? 'narrator',
                intent: node.intent ?? null,
                band,
                japanese: variant.japanese,
                reading: variant.reading,
                english: variant.english,
                sourceSha256,
                status,
                voiceModel: modelBySpeaker.get(node.speakerId ?? 'narrator') ?? null,
                pitch: lock?.pitch ?? { status: 'unreviewed' },
                ...(pilotOutput ? { pilotOutput } : {}),
            };
        });
    }));
}

function pilotBand(season) {
    if (season === 1) return 'n5';
    if (season === 2) return 'n4';
    if (season === 3) return 'n3';
    return 'n2';
}

function pilotPath(chapterId, lineId, speakerId) {
    const stem = `${chapterId}__${lineId.split(':').at(-1)}__${speakerId ?? 'narrator'}.opus`;
    const relative = `story-pilot/${stem}`;
    return existsSync(join(audioRoot, relative)) ? `/academy/audio/${relative}` : undefined;
}

function playbackEntry(entry) {
    const publicRelative = entry.pilotOutput.replace(/^\//, '');
    const assetPath = join(root, 'public', publicRelative);
    const asset = readFileSync(assetPath);
    return {
        lineId: entry.lineId,
        speakerId: entry.speakerId,
        japanese: entry.japanese,
        band: entry.band,
        sourceSha256: entry.sourceSha256,
        assetSha256: createHash('sha256').update(asset).digest('hex'),
        bytes: statSync(assetPath).size,
        url: entry.pilotOutput,
        reviewStatus: 'locked',
    };
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function digest(parts) {
    return createHash('sha256').update(parts.join('\n')).digest('hex');
}
