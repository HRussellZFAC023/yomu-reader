#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = path.resolve(REPO_ROOT, '../..');
const RELEASE_ROOT = path.join(PROJECT_ROOT, 'release-worktrees');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs/academy/recovery/ASSET-CARRYOVER.json');
const REPORT_PATH = path.join(REPO_ROOT, 'docs/academy/recovery/ASSET-LEDGER-REPORT.md');
const RECOVERY_ROOT = path.join(REPO_ROOT, 'docs/academy/recovery/recovered-assets');
const SNAPSHOT_DATE = '2026-07-15';
const INITIAL_DONOR = 'yomu-academy-initial-20260711';

const MEDIA_EXTENSIONS = new Set([
    '.aac', '.apng', '.avif', '.flac', '.gif', '.ico', '.jpeg', '.jpg', '.m4a', '.mid', '.midi',
    '.mp3', '.mp4', '.ogg', '.opus', '.png', '.svg', '.wav', '.webm', '.webp',
]);
const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mid', '.midi', '.mp3', '.ogg', '.opus', '.wav']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);
const ANIMATION_EXTENSIONS = new Set(['.apng', '.gif']);
const CHARACTER_NAMES = [
    'aakash', 'alex', 'angel', 'christian', 'felix', 'francis', 'henry', 'jenny', 'jodi', 'ken',
    'leo', 'mary', 'mika', 'miller', 'mira', 'noa', 'nori', 'peter', 'pho', 'remi', 'rie', 'robert',
    'rose', 'ruparna', 'sam', 'sato', 'shaun', 'shin', 'sophie', 'stasi', 'suzu', 'tawapon', 'tom',
    'xingyu', 'yamada', 'yamashita',
];
const PLACE_NAMES = [
    'airport', 'bloomsbury-street', 'cafe', 'campus-entrance', 'campus-home', 'classroom', 'gym',
    'home', 'japan-ryokan', 'japan-shinkansen', 'japan-street', 'japan-temple', 'kanji-garden',
    'konbini', 'language-lab', 'library', 'office', 'park', 'pub', 'quad', 'railway-station', 'ramen',
    'restaurant', 'station', 'street', 'student-room', 'tennis-court', 'tokyo-street', 'tube-platform',
    'work', 'writing-studio',
];
const EXPRESSIONS = ['concerned', 'determined', 'embarrassed', 'encouraging', 'happy', 'laughing', 'neutral', 'repair', 'surprised', 'thinking'];
const POSES = ['fullbody', 'halfbody', 'listening', 'seated', 'speaking', 'standing', 'writing'];
const ITEM_TAGS = [
    'badge', 'book', 'camera', 'card', 'chair', 'door', 'doodle', 'folder', 'map', 'marker', 'menu',
    'phone', 'radio', 'table', 'thermos', 'ticket', 'umbrella', 'vegetable', 'worksheet',
];
const ACTIVITY_TAGS = [
    'conversation', 'directions', 'greeting', 'kanji', 'karaoke', 'listening', 'navigation', 'placement',
    'reading', 'review', 'study', 'vocabulary', 'wayfinding', 'writing',
];

function posix(value) {
    return value.split(path.sep).join('/');
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function uniqueSorted(values) {
    return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ''))].sort();
}

function compareJson(a, b) {
    return JSON.stringify(a).localeCompare(JSON.stringify(b), 'en');
}

function walk(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .flatMap(entry => {
            const target = path.join(directory, entry.name);
            return entry.isDirectory() ? walk(target) : [target];
        });
}

function discoverWorktrees() {
    const roots = [{ label: 'current', root: REPO_ROOT, current: true }];
    if (!fs.existsSync(RELEASE_ROOT)) return roots;
    for (const entry of fs.readdirSync(RELEASE_ROOT, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        if (!entry.isDirectory()) continue;
        const root = path.join(RELEASE_ROOT, entry.name);
        if (!fs.existsSync(path.join(root, 'public/academy')) && !fs.existsSync(path.join(root, 'docs/public/academy'))) continue;
        roots.push({ label: `release:${entry.name}`, root, current: false });
    }
    return roots;
}

function mediaType(extension) {
    if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
    if (VIDEO_EXTENSIONS.has(extension)) return 'video';
    if (extension === '.svg') return 'vector';
    if (ANIMATION_EXTENSIONS.has(extension)) return 'animation';
    return 'raster';
}

function probeRaster(buffer, extension) {
    if (extension === '.png' || extension === '.apng') {
        return buffer.length >= 24 ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null;
    }
    if (extension === '.gif') {
        return buffer.length >= 10 ? { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) } : null;
    }
    if (extension === '.jpg' || extension === '.jpeg') {
        let offset = 2;
        while (offset + 9 < buffer.length) {
            if (buffer[offset] !== 0xff) { offset += 1; continue; }
            const marker = buffer[offset + 1];
            const size = buffer.readUInt16BE(offset + 2);
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
                return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
            }
            if (size < 2) break;
            offset += 2 + size;
        }
    }
    if (extension === '.webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
        const chunk = buffer.toString('ascii', 12, 16);
        if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
        if (chunk === 'VP8 ' && buffer.toString('hex', 23, 26) === '9d012a') {
            return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
        }
        if (chunk === 'VP8L') {
            const bits = buffer.readUInt32LE(21);
            return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
        }
    }
    return null;
}

function probeSvg(buffer) {
    const source = buffer.toString('utf8', 0, Math.min(buffer.length, 8192));
    const width = source.match(/\bwidth=["']([\d.]+)/i)?.[1];
    const height = source.match(/\bheight=["']([\d.]+)/i)?.[1];
    if (width && height) return { width: Math.round(Number(width)), height: Math.round(Number(height)) };
    const viewBox = source.match(/\bviewBox=["'][\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
    return viewBox ? { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) } : null;
}

function probeAv(file) {
    try {
        const output = execFileSync('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels,width,height', '-of', 'json', file,
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const parsed = JSON.parse(output);
        const stream = parsed.streams?.[0] ?? {};
        const duration = Number(parsed.format?.duration);
        return {
            durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null,
            sampleRate: stream.sample_rate ? Number(stream.sample_rate) : null,
            channels: stream.channels ?? null,
            dimensions: stream.width && stream.height ? { width: stream.width, height: stream.height } : null,
        };
    } catch {
        return { durationMs: null, sampleRate: null, channels: null, dimensions: null };
    }
}

function scanOccurrences(worktrees) {
    const occurrences = [];
    for (const worktree of worktrees) {
        for (const base of ['public/academy', 'docs/public/academy']) {
            const absoluteBase = path.join(worktree.root, base);
            for (const file of walk(absoluteBase)) {
                const extension = path.extname(file).toLowerCase();
                if (!MEDIA_EXTENSIONS.has(extension)) continue;
                const relativePath = posix(path.relative(worktree.root, file));
                occurrences.push({
                    worktree: worktree.label,
                    path: relativePath,
                    role: base.startsWith('docs/') ? 'docs-mirror' : 'runtime-public',
                    current: worktree.current,
                    absolutePath: file,
                    extension,
                });
            }
        }
    }
    return occurrences.sort((a, b) => compareJson([a.worktree, a.path], [b.worktree, b.path]));
}

function loadPreviousVerdicts() {
    if (!fs.existsSync(LEDGER_PATH)) return new Map();
    try {
        const ledger = readJson(LEDGER_PATH);
        return new Map((ledger.assets ?? []).map(asset => [asset.sha256, asset.qualityVerdict ?? asset.verdict]));
    } catch {
        return new Map();
    }
}

function normalizePreviousVerdict(verdict) {
    const map = {
        'carry-now': 'verified-quality-carryover',
        'review-likeness': 'review-likeness',
        'reject-wrong-style': 'rejected-wrong-style',
        'reject-duplicate': 'rejected-production-derivative',
    };
    return map[verdict] ?? verdict ?? null;
}

function addManifestEvidence(evidence, hash, value) {
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return;
    const current = evidence.get(hash.toLowerCase()) ?? {
        sourceManifests: [], characters: [], places: [], activities: [], variants: [], poses: [], expressions: [], items: [],
        runtimeTargets: [],
    };
    for (const key of ['sourceManifests', 'characters', 'places', 'activities', 'variants', 'poses', 'expressions', 'items', 'runtimeTargets']) {
        current[key].push(...(value[key] ?? []));
    }
    for (const key of ['generationFamily', 'provenanceStatus', 'rightsStatus', 'assetType']) {
        if (value[key] && !current[key]) current[key] = value[key];
    }
    evidence.set(hash.toLowerCase(), current);
}

function loadManifestEvidence(worktrees) {
    const evidence = new Map();
    for (const worktree of worktrees) {
        const base = path.join(worktree.root, 'public/academy/art/codex-production-v1');
        const manifestSpecs = [
            ['backgrounds/manifest.json', 'direct-openai-image-generation', 'manifest-reviewed-production-candidate'],
            ['cinematic-events/manifest.json', 'direct-openai-image-generation', 'manifest-reviewed-likeness-gated'],
            ['lesson-assets/manifest.json', 'direct-openai-image-generation', 'manifest-reviewed-human-signoff-pending'],
            ['sprites/manifest.json', 'direct-openai-image-generation', 'manifest-reviewed-likeness-gated'],
        ];
        for (const [relative, generationFamily, provenanceStatus] of manifestSpecs) {
            const file = path.join(base, relative);
            if (!fs.existsSync(file)) continue;
            const manifest = readJson(file);
            const manifestRef = `${worktree.label}:public/academy/art/codex-production-v1/${relative}`;
            if (relative.startsWith('backgrounds/')) {
                for (const asset of manifest.assets ?? []) {
                    for (const variant of ['source', 'wide', 'mobile']) {
                        addManifestEvidence(evidence, asset.technical?.[variant]?.sha256, {
                            sourceManifests: [manifestRef], generationFamily, provenanceStatus,
                            rightsStatus: manifest.sourceProvenance?.rightsStatus ?? 'original-generated-candidate',
                            assetType: variant === 'source' ? 'background-source-master' : 'responsive-background',
                            places: [asset.locationId], variants: [asset.variant, variant],
                            activities: [...(asset.homes?.lessons ?? []), ...(asset.homes?.story ?? [])],
                            runtimeTargets: [...(asset.homes?.lessons ?? []), ...(asset.homes?.story ?? [])],
                        });
                    }
                }
            } else {
                for (const asset of manifest.assets ?? []) {
                    addManifestEvidence(evidence, asset.sha256 ?? asset.technical?.sha256, {
                        sourceManifests: [manifestRef], generationFamily, provenanceStatus,
                        rightsStatus: manifest.origin?.rightsStatus ?? manifest.generation?.origin ?? 'original-generated-candidate',
                        assetType: relative.startsWith('lesson-assets/') ? 'lesson-illustration' : relative.startsWith('cinematic') ? 'event-art' : 'character-sprite',
                        characters: asset.characterIds ?? asset.cast?.map(member => member.id) ?? [],
                        places: asset.locationIds ?? [asset.locationId],
                        activities: [...(asset.concepts ?? []), ...(asset.interactionModes ?? []), asset.learningPurpose],
                        variants: [asset.variant, asset.crop, asset.id],
                        poses: [asset.pose], expressions: [asset.expression, ...(asset.cast?.map(member => member.expression) ?? [])],
                        runtimeTargets: asset.runtimeHome ? [typeof asset.runtimeHome === 'string' ? asset.runtimeHome : JSON.stringify(asset.runtimeHome)] : [],
                    });
                }
            }
        }
    }
    for (const value of evidence.values()) {
        for (const key of ['sourceManifests', 'characters', 'places', 'activities', 'variants', 'poses', 'expressions', 'items', 'runtimeTargets']) {
            value[key] = uniqueSorted(value[key]);
        }
    }
    return evidence;
}

function loadRuntimeEvidence(worktrees) {
    const byHash = new Map();
    const add = (hash, use) => {
        if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return;
        const uses = byHash.get(hash.toLowerCase()) ?? [];
        uses.push(use);
        byHash.set(hash.toLowerCase(), uses);
    };
    for (const worktree of worktrees) {
        if (worktree.current) {
            const file = path.join(worktree.root, 'public/academy/art/ASSET-USAGE.json');
            if (!fs.existsSync(file)) continue;
            const ledger = readJson(file);
            for (const asset of ledger.assets ?? []) {
                const runtimeAuthorized = asset.verdict?.startsWith('approved-runtime')
                    || asset.verdict === 'review-candidate/runtime-preview';
                if (!runtimeAuthorized) continue;
                for (const delivery of asset.deliveries ?? []) {
                    for (const runtimeHome of asset.runtimeHome ?? []) {
                        add(delivery.sha256, {
                            worktree: worktree.label,
                            source: 'public/academy/art/ASSET-USAGE.json',
                            line: null,
                            match: 'runtime-ledger-route-home',
                            expression: delivery.path,
                            route: runtimeHome,
                        });
                    }
                }
            }
            continue;
        }
        const file = path.join(worktree.root, 'public/academy/art/asset-usage.json');
        if (!fs.existsSync(file)) continue;
        try {
            const ledger = readJson(file);
            for (const asset of ledger.assets ?? []) {
                for (const reference of asset.runtimeReferences ?? []) {
                    add(asset.sha256, {
                        worktree: worktree.label,
                        source: reference.source,
                        line: reference.line ?? null,
                        match: reference.match ?? 'historical-reference',
                        expression: reference.expression ?? asset.path,
                    });
                }
            }
        } catch {
            // A historical audit is supporting evidence; a malformed donor must not block the inventory.
        }
    }
    for (const [hash, uses] of byHash) byHash.set(hash, uses.sort(compareJson));
    return byHash;
}

function taxonomyFor(relativePath, extension, manifest = {}) {
    const lower = relativePath.toLowerCase();
    const filename = path.basename(lower, extension);
    const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
    const tagged = values => uniqueSorted(values.filter(value => {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lower);
    }));
    const characters = uniqueSorted([...(manifest.characters ?? []), ...tagged(CHARACTER_NAMES)]);
    const places = uniqueSorted([...(manifest.places ?? []), ...tagged(PLACE_NAMES)]);
    const activities = uniqueSorted([...(manifest.activities ?? []), ...tagged(ACTIVITY_TAGS)]);
    const expressions = uniqueSorted([...(manifest.expressions ?? []), ...tagged(EXPRESSIONS)]);
    const poses = uniqueSorted([...(manifest.poses ?? []), ...tagged(POSES)]);
    const items = uniqueSorted([...(manifest.items ?? []), ...tagged(ITEM_TAGS)]);
    const variants = uniqueSorted([
        ...(manifest.variants ?? []),
        ...tokens.filter(token => ['day', 'evening', 'night', 'rain', 'rainy', 'mobile', 'wide', 'thumb', 'source', 'v001', 'v002', 'v1', 'v2'].includes(token)),
    ]);
    let assetType = manifest.assetType;
    if (!assetType && (ANIMATION_EXTENSIONS.has(extension) || /(^|\/)frames?\//.test(lower))) assetType = 'animation-or-frame';
    if (!assetType && AUDIO_EXTENSIONS.has(extension)) {
        if (/ui-|sfx|confirm|focus|transition/.test(lower)) assetType = 'ui-sfx';
        else if (/music|theme|soundtrack/.test(lower)) assetType = 'music';
        else if (/ambience|ambient/.test(lower)) assetType = 'ambience';
        else assetType = /listening|soya|lesson|genki/.test(lower) ? 'lesson-listening-audio' : 'audio';
    }
    if (!assetType && /characters|sprites?/.test(lower)) assetType = /contact|checker|_chk/.test(lower) ? 'sprite-review-art' : 'character-sprite';
    if (!assetType && /cinematic|events?|key-scenes?/.test(lower)) assetType = 'event-art';
    if (!assetType && /backgrounds?|locations?|environments?/.test(lower)) assetType = /source\//.test(lower) ? 'background-source-master' : 'responsive-background';
    if (!assetType && /lesson-assets|art\/lessons|content\/lessons/.test(lower)) assetType = 'lesson-illustration';
    if (!assetType && /props?|items?|marker/.test(lower)) assetType = /ui|marker/.test(lower) ? 'ui-art' : 'prop-art';
    if (!assetType && /vendor\//.test(lower) && extension === '.svg') assetType = 'vendor-vector-data';
    if (!assetType && extension === '.svg') assetType = 'vector-art';
    if (!assetType) assetType = mediaType(extension) === 'raster' ? 'uncategorized-raster' : mediaType(extension);
    if (!activities.length && assetType === 'lesson-listening-audio') activities.push('listening');
    if (!activities.length && assetType === 'character-sprite') activities.push('conversation');
    return { assetType, characters, places, activities, items, variants, poses, expressions, filename };
}

function purposeFor(taxonomy) {
    const purposes = [];
    if (taxonomy.assetType === 'responsive-background') purposes.push('responsive scene staging and place navigation');
    if (taxonomy.assetType === 'background-source-master') purposes.push('source master for responsive scene derivatives');
    if (taxonomy.assetType === 'character-sprite') purposes.push('dialogue pose or expression swap');
    if (taxonomy.assetType === 'sprite-review-art') purposes.push('production review only; never animate or bind');
    if (taxonomy.assetType === 'event-art') purposes.push('authored story beat or event reveal');
    if (taxonomy.assetType === 'lesson-illustration') purposes.push('lesson prompt, activity, or source-grounding visual');
    if (taxonomy.assetType === 'ui-art') purposes.push('navigation or interaction affordance');
    if (taxonomy.assetType === 'prop-art') purposes.push('diegetic interaction or vocabulary object');
    if (taxonomy.assetType === 'ui-sfx') purposes.push('focus, confirm, or transition feedback');
    if (taxonomy.assetType === 'lesson-listening-audio') purposes.push('listening comprehension or lesson playback');
    if (taxonomy.assetType === 'music') purposes.push('location or event theme slot');
    if (taxonomy.assetType === 'ambience') purposes.push('location ambience loop');
    if (taxonomy.assetType === 'animation-or-frame') purposes.push('optional authored motion or state transition');
    if (taxonomy.assetType === 'vendor-vector-data') purposes.push('licensed stroke or writing data');
    return purposes.length ? purposes : ['inventory-only media; purpose requires review'];
}

function inferProvenance(relativePath, manifest) {
    const lower = relativePath.toLowerCase();
    if (manifest.generationFamily) {
        return {
            generationFamily: manifest.generationFamily,
            status: manifest.provenanceStatus,
            rightsStatus: manifest.rightsStatus,
            sourceManifests: manifest.sourceManifests,
        };
    }
    if (/claude-production-v3|codex-production-v2/.test(lower)) {
        return { generationFamily: 'pollinations-or-python-generated', status: 'known-rejected-family', rightsStatus: 'not-approved', sourceManifests: [] };
    }
    if (/characters\/claude-production\/sprites/.test(lower)) {
        return { generationFamily: 'unknown-or-generic-generation', status: 'known-rejected-family', rightsStatus: 'not-approved', sourceManifests: [] };
    }
    if (/content\/soya\/audio/.test(lower)) {
        return { generationFamily: 'imported-source-course-audio', status: 'source-linkage-known-rights-review-required', rightsStatus: 'rights-review-required', sourceManifests: [] };
    }
    if (/vendor\/kanjivg/.test(lower)) {
        return { generationFamily: 'third-party-open-data', status: 'licensed-vendor-data', rightsStatus: 'see-public/academy/vendor/kanjivg/LICENSE.txt', sourceManifests: [] };
    }
    if (/content\/lessons/.test(lower)) {
        return { generationFamily: 'lesson-source-or-derivative', status: 'source-fidelity-ledger-required', rightsStatus: 'see-lesson-provenance', sourceManifests: [] };
    }
    return { generationFamily: 'unknown-provenance', status: 'inventory-only', rightsStatus: 'review-required', sourceManifests: [] };
}

function qualityFor(relativePath, previousVerdict, provenance, runtimeUses) {
    const lower = relativePath.toLowerCase();
    if (provenance.generationFamily === 'direct-openai-image-generation') {
        if (/cinematic-events|sprites/.test(lower)) return 'review-likeness';
        return 'verified-manifest-reviewed';
    }
    if (provenance.generationFamily === 'third-party-open-data') return 'approved-licensed-data';
    if (provenance.rightsStatus === 'rights-review-required' || AUDIO_EXTENSIONS.has(path.extname(lower))) return 'rights-review-required';
    if (/pollinations|python-generated/.test(provenance.generationFamily)) return 'rejected-wrong-style';
    if (previousVerdict) return normalizePreviousVerdict(previousVerdict);
    if (runtimeUses.some(use => use.worktree === 'current')) return 'current-runtime-ledgered';
    return 'review-required';
}

function recoveryCandidates(worktrees) {
    const donor = worktrees.find(worktree => worktree.label === `release:${INITIAL_DONOR}`);
    if (!donor) return [];
    const candidates = [];
    const backgroundRoot = path.join(donor.root, 'public/academy/art/codex-production-v1/backgrounds');
    const backgroundManifest = readJson(path.join(backgroundRoot, 'manifest.json'));
    for (const asset of backgroundManifest.assets ?? []) {
        for (const variant of ['wide', 'mobile']) {
            const relative = asset.files?.[variant];
            const expectedHash = asset.technical?.[variant]?.sha256;
            if (!relative || !expectedHash) continue;
            candidates.push({
                source: path.join(backgroundRoot, relative), expectedHash,
                destination: posix(path.join('docs/academy/recovery/recovered-assets/codex-production-v1/backgrounds', relative)),
            });
        }
    }
    const lessonRoot = path.join(donor.root, 'public/academy/art/codex-production-v1/lesson-assets');
    const lessonManifest = readJson(path.join(lessonRoot, 'manifest.json'));
    for (const asset of lessonManifest.assets ?? []) {
        candidates.push({
            source: path.join(lessonRoot, asset.file), expectedHash: asset.sha256,
            destination: posix(path.join('docs/academy/recovery/recovered-assets/codex-production-v1/lesson-assets', asset.file)),
        });
    }
    return candidates.sort((a, b) => a.destination.localeCompare(b.destination, 'en'));
}

function recoverLostAssets(worktrees, activeHashes) {
    const recovered = new Map();
    for (const candidate of recoveryCandidates(worktrees)) {
        const buffer = fs.readFileSync(candidate.source);
        const actualHash = sha256(buffer);
        if (actualHash !== candidate.expectedHash) throw new Error(`Historical manifest hash mismatch: ${candidate.source}`);
        const destination = path.join(REPO_ROOT, candidate.destination);
        if (activeHashes.has(actualHash)) {
            if (fs.existsSync(destination)) {
                if (sha256(fs.readFileSync(destination)) !== actualHash) throw new Error(`Recovery archive hash mismatch: ${candidate.destination}`);
                recovered.set(actualHash, candidate.destination);
            }
            continue;
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (fs.existsSync(destination) && sha256(fs.readFileSync(destination)) !== actualHash) {
            throw new Error(`Refusing to overwrite non-matching recovery asset: ${candidate.destination}`);
        }
        if (!fs.existsSync(destination)) fs.copyFileSync(candidate.source, destination);
        recovered.set(actualHash, candidate.destination);
    }
    return recovered;
}

function buildRows(occurrences, worktrees, previousVerdicts, manifestEvidence, runtimeEvidence, recovered) {
    const grouped = new Map();
    for (const occurrence of occurrences) {
        const buffer = fs.readFileSync(occurrence.absolutePath);
        const hash = sha256(buffer);
        const group = grouped.get(hash) ?? { hash, byteSize: buffer.length, buffer, occurrences: [] };
        group.occurrences.push(occurrence);
        grouped.set(hash, group);
    }
    for (const [hash, destination] of recovered) {
        const file = path.join(REPO_ROOT, destination);
        const buffer = fs.readFileSync(file);
        const group = grouped.get(hash);
        if (!group) throw new Error(`Recovered hash missing from donor scan: ${hash}`);
        group.occurrences.push({ worktree: 'current', path: destination, role: 'recovery-archive', current: true, absolutePath: file, extension: path.extname(file).toLowerCase() });
    }

    const rows = [];
    for (const group of grouped.values()) {
        const roleRank = { 'runtime-public': 0, 'recovery-archive': 1, 'docs-mirror': 2 };
        const sortedOccurrences = group.occurrences.sort((a, b) => compareJson(
            [a.current ? 0 : 1, roleRank[a.role] ?? 9, a.worktree, a.path],
            [b.current ? 0 : 1, roleRank[b.role] ?? 9, b.worktree, b.path],
        ));
        const canonical = sortedOccurrences[0];
        const manifest = manifestEvidence.get(group.hash) ?? {};
        const runtimeUses = runtimeEvidence.get(group.hash) ?? [];
        const taxonomy = taxonomyFor(canonical.path, canonical.extension, manifest);
        const provenance = inferProvenance(canonical.path, manifest);
        const qualityVerdict = qualityFor(canonical.path, previousVerdicts.get(group.hash), provenance, runtimeUses);
        const currentRuntime = runtimeUses.some(use => use.worktree === 'current');
        const historicalRuntime = runtimeUses.some(use => use.worktree !== 'current');
        const recoveryPath = recovered.get(group.hash) ?? null;
        let orphanState = currentRuntime ? 'current-runtime' : historicalRuntime ? 'historical-runtime-only' : recoveryPath ? 'recovered-archive-only' : qualityVerdict.startsWith('rejected') ? 'rejected-reference-only' : 'never-runtime-referenced';
        let destination;
        if (currentRuntime) {
            const runtimePath = sortedOccurrences.find(item => item.current && item.role === 'runtime-public')?.path ?? null;
            destination = { status: 'current-runtime', path: runtimePath, reason: 'Explicit current runtime-ledger delivery.' };
        } else if (recoveryPath) {
            destination = { status: 'recovered-non-runtime', path: recoveryPath, reason: 'Manifest-hash-verified quality asset preserved outside runtime delivery.' };
        } else if (qualityVerdict.startsWith('rejected')) {
            destination = { status: 'blocked', path: null, reason: 'Retained as audit evidence only; do not bind or use as a generation reference.' };
        } else {
            destination = { status: 'inventory-only', path: null, reason: 'Requires provenance, rights, likeness, source-fidelity, or runtime-owner review.' };
        }
        const type = mediaType(canonical.extension);
        let dimensions = type === 'vector' ? probeSvg(group.buffer) : type === 'audio' || type === 'video' ? null : probeRaster(group.buffer, canonical.extension);
        let durationMs = null;
        let sampleRate = null;
        let channels = null;
        if (type === 'audio' || type === 'video') {
            const probe = probeAv(canonical.absolutePath);
            durationMs = probe.durationMs;
            sampleRate = probe.sampleRate;
            channels = probe.channels;
            dimensions = probe.dimensions;
        }
        rows.push({
            id: `sha256:${group.hash}`,
            sha256: group.hash,
            byteSize: group.byteSize,
            fileType: type,
            extension: canonical.extension,
            dimensions: dimensions ?? { width: null, height: null },
            durationMs,
            sampleRate,
            channels,
            assetType: taxonomy.assetType,
            characters: taxonomy.characters,
            places: taxonomy.places,
            activities: taxonomy.activities,
            itemsOrProps: taxonomy.items,
            variants: taxonomy.variants,
            poses: taxonomy.poses,
            expressions: taxonomy.expressions,
            provenance,
            runtimeUses,
            orphanState,
            qualityVerdict,
            bindingVerdict: currentRuntime ? 'runtime-authorized' : recoveryPath ? 'archive-preserved-not-authorized' : qualityVerdict.startsWith('rejected') ? 'must-not-bind' : 'review-before-binding',
            animationInteractionPurpose: purposeFor(taxonomy),
            destination,
            occurrenceCount: sortedOccurrences.length,
            occurrences: sortedOccurrences.map(({ worktree, path: occurrencePath, role, current }) => ({ worktree, path: occurrencePath, role, current })),
        });
    }
    return rows.sort((a, b) => a.sha256.localeCompare(b.sha256, 'en'));
}

function countBy(rows, key) {
    return Object.fromEntries([...rows.reduce((counts, row) => counts.set(row[key], (counts.get(row[key]) ?? 0) + 1), new Map())].sort(([a], [b]) => a.localeCompare(b, 'en')));
}

function makeCounts(assets) {
    const formatCoverage = Object.fromEntries([...MEDIA_EXTENSIONS].sort().map(extension => [extension.slice(1), assets.filter(asset => asset.extension === extension).length]));
    const recovered = assets.filter(asset => asset.occurrences.some(occurrence => occurrence.role === 'recovery-archive'));
    const recoveredNonRuntime = recovered.filter(asset => asset.destination.status === 'recovered-non-runtime');
    return {
        physicalOccurrences: assets.reduce((sum, asset) => sum + asset.occurrenceCount, 0),
        uniquePayloads: assets.length,
        bytes: assets.reduce((sum, asset) => sum + asset.byteSize, 0),
        byFileType: countBy(assets, 'fileType'),
        byAssetType: countBy(assets, 'assetType'),
        byQualityVerdict: countBy(assets, 'qualityVerdict'),
        byOrphanState: countBy(assets, 'orphanState'),
        formatCoverage,
        recoveredPayloads: recovered.length,
        recoveredNonRuntimePayloads: recoveredNonRuntime.length,
        recoveredBytes: recovered.reduce((sum, asset) => sum + asset.byteSize, 0),
    };
}

function speculativeMissingAssets() {
    return [
        { id: 'responsive-place-companions', priority: 'high', confidence: 'speculative', type: 'background', need: 'Wide/mobile and authored time-weather companions for approved places that lack a complete responsive pair.', purpose: 'Responsive scene continuity; not a runtime requirement until a scene owner binds it.', routeCandidates: ['location:home', 'location:cafe', 'location:classroom'] },
        { id: 'approved-cast-expression-matrix', priority: 'high', confidence: 'speculative', type: 'character-sprite', need: 'Owner-approved neutral anchors followed by happy, thinking, concerned, speaking, listening, seated, and action variants.', purpose: 'Dialogue expression and pose changes; likeness approval precedes generation.', routeCandidates: ['dialogue:*', 'journal:*-expression-gallery', 'scene:*'] },
        { id: 'interaction-prop-kit', priority: 'high', confidence: 'speculative', type: 'prop-and-ui-art', need: 'Original door, card, ticket, notebook, radio, camera, map-marker, and feedback-item states.', purpose: 'Diegetic activity affordances without copying third-party game UI.', routeCandidates: ['reward:*', 'activity:*', 'scene:*'] },
        { id: 'authored-motion-states', priority: 'medium', confidence: 'speculative', type: 'gif-or-frame-animation', need: 'Optional blink, page-turn, radio-tune, and transition frame sequences in an approved Academy style.', purpose: 'Subtle authored motion; static fallbacks remain valid.', routeCandidates: ['dialogue:*', 'activity:listening-shadowing', 'scene:*'] },
        { id: 'cleared-audio-slots', priority: 'medium', confidence: 'speculative', type: 'sfx-ambience-music', need: 'Rights-cleared semantic UI SFX, room/rain ambience, and location/event theme slots.', purpose: 'AudioDirector-style feedback and atmosphere; silence remains valid.', routeCandidates: ['activity:*', 'location:*', 'scene:*'] },
    ];
}

export function canonicalizeLedger(input) {
    const ledger = structuredClone(input);
    ledger.assets = [...ledger.assets].map(asset => ({
        ...asset,
        characters: uniqueSorted(asset.characters), places: uniqueSorted(asset.places), activities: uniqueSorted(asset.activities),
        itemsOrProps: uniqueSorted(asset.itemsOrProps), variants: uniqueSorted(asset.variants), poses: uniqueSorted(asset.poses),
        expressions: uniqueSorted(asset.expressions), animationInteractionPurpose: uniqueSorted(asset.animationInteractionPurpose),
        provenance: { ...asset.provenance, sourceManifests: uniqueSorted(asset.provenance.sourceManifests) },
        runtimeUses: [...asset.runtimeUses].sort(compareJson),
        occurrences: [...asset.occurrences].sort(compareJson),
    })).sort((a, b) => a.sha256.localeCompare(b.sha256, 'en'));
    ledger.speculativeMissingAssets = [...ledger.speculativeMissingAssets].sort((a, b) => a.id.localeCompare(b.id, 'en'));
    ledger.counts = makeCounts(ledger.assets);
    return ledger;
}

export function serializeLedger(ledger) {
    return `${JSON.stringify(canonicalizeLedger(ledger), null, 2)}\n`;
}

function table(counts) {
    return Object.entries(counts).map(([key, value]) => `| ${key} | ${value} |`).join('\n');
}

export function renderReport(input) {
    const ledger = canonicalizeLedger(input);
    const recovered = ledger.assets.filter(asset => asset.occurrences.some(occurrence => occurrence.role === 'recovery-archive'));
    const formats = ledger.counts.formatCoverage;
    return `# Academy Asset Ledger Report

Snapshot: ${ledger.snapshotDate}. This report is derived deterministically from \`ASSET-CARRYOVER.json\`.

## Scope and method

- Hash-deduplicated Academy media from the current repository and ${ledger.inventoryScope.worktrees.filter(label => label !== 'current').length} release worktrees.
- Included current and historical \`public/academy/**\` plus generated docs mirrors; excluded evidence screenshots, third-party reference apps, Downloads, and external generated-image stores.
- Persona-like categories may inform the vocabulary for scene, character, prop, interaction, animation, SFX, ambience, and music slots. No Persona art or audio was copied or scanned.
- \`public/academy/art/ASSET-USAGE.json\` remains the separate runtime authorization ledger. Recovery records do not authorize runtime binding.

## Inventory

${ledger.counts.uniquePayloads} unique payloads across ${ledger.counts.physicalOccurrences} physical occurrences (${ledger.counts.bytes} unique bytes).

| File type | Payloads |
| --- | ---: |
${table(ledger.counts.byFileType)}

| Quality verdict | Payloads |
| --- | ---: |
${table(ledger.counts.byQualityVerdict)}

| Orphan state | Payloads |
| --- | ---: |
${table(ledger.counts.byOrphanState)}

Format coverage explicitly includes GIF/APNG/frame animation and audio slots: GIF=${formats.gif}, APNG=${formats.apng}, MP3=${formats.mp3}, OGG=${formats.ogg}, WAV=${formats.wav}, FLAC=${formats.flac}, M4A=${formats.m4a}, video MP4/WebM=${formats.mp4 + formats.webm}. Zero means no file was found in the bounded worktree scope.

Semantic slot coverage: frame/animation=${ledger.counts.byAssetType['animation-or-frame'] ?? 0}, UI SFX=${ledger.counts.byAssetType['ui-sfx'] ?? 0}, lesson/listening audio=${ledger.counts.byAssetType['lesson-listening-audio'] ?? 0}, ambience=${ledger.counts.byAssetType.ambience ?? 0}, music=${ledger.counts.byAssetType.music ?? 0}.

## Recovery

Preserved ${recovered.length} historical payloads (${ledger.counts.recoveredBytes} bytes) in \`docs/academy/recovery/recovered-assets/\`; ${ledger.counts.recoveredNonRuntimePayloads} remain non-runtime-only and ${recovered.length - ledger.counts.recoveredNonRuntimePayloads} now also exist in current delivery. Every archive copy matches its historical manifest SHA-256 and the archive path itself remains outside runtime delivery.

- Included: direct-OpenAI, manifest-reviewed responsive background derivatives and lesson illustrations absent from the current payload set.
- Excluded from byte recovery: source masters, contact sheets, cinematic likeness art, character sprites, audio, Pollinations/Python output, and unknown-rights material.
- Recovery destinations and source-manifest evidence are recorded per hash in the JSON ledger.

## Runtime and quality gates

- Current runtime use requires an explicit current ledger/reference; physical presence alone is not authorization.
- Historical-only and never-referenced payloads remain visible as orphan states rather than being silently promoted.
- Human likeness, geography, worksheet/source fidelity, responsive composition, rights, and accessibility gates survive recovery.
- Soya/source-course audio and historical UI sounds are inventoried but not copied because their release rights are not established here.

## Speculative gaps

${ledger.speculativeMissingAssets.map(item => `- **${item.priority} / ${item.type}:** ${item.need} ${item.purpose} Candidate homes: ${item.routeCandidates.join(', ')}.`).join('\n')}

## Validation and ownership

Run \`node scripts/academy-asset-ledger.mjs validate\`. It checks schema, canonical ordering, counts, unique hashes, current/recovered bytes, optional donor bytes when available, the recovery allowlist, and this report's exact derivation. It does not require old worktrees in CI.

Runtime promotion remains separate and explicit: \`src/academy/assets.ts\` names each authorized asset and runtime home, while \`public/academy/art/ASSET-USAGE.json\` authorizes exact delivery hashes. No archived file becomes runtime merely by appearing in this report.
`;
}

function makeLedger(worktrees, assets) {
    return canonicalizeLedger({
        schemaVersion: 2,
        snapshotDate: SNAPSHOT_DATE,
        purpose: 'Portable, hash-deduplicated Academy media inventory and non-runtime recovery record; not a runtime authorization ledger.',
        taxonomyPolicy: {
            basis: 'Academy paths and manifests, with scene/character/place/prop/activity/animation/audio slot vocabulary only.',
            personaBoundary: 'Persona wiki concepts may inform taxonomy vocabulary; no Persona art, audio, UI pixels, or other copied media are included.',
        },
        inventoryScope: {
            worktrees: worktrees.map(worktree => worktree.label),
            included: ['public/academy/** media', 'docs/public/academy/** media mirrors'],
            excluded: ['docs/academy/evidence screenshots', 'third-party reference apps', 'Downloads', 'external generated-image stores'],
            extensions: [...MEDIA_EXTENSIONS].sort(),
        },
        validationRules: {
            deduplicateBy: 'sha256',
            pathStorage: 'worktree-label plus POSIX repository-relative path',
            timestamps: 'omitted; snapshotDate is fixed input metadata',
            historicalRoots: 'validated when present; not required in CI',
            recovery: 'manifest-hash-verified direct OpenAI background derivatives and lesson assets only; never runtime-bound by this ledger',
        },
        counts: {},
        speculativeMissingAssets: speculativeMissingAssets(),
        assets,
    });
}

export function validateLedger(ledger, { checkFiles = true, checkHistorical = false } = {}) {
    const errors = [];
    if (ledger.schemaVersion !== 2) errors.push('schemaVersion must be 2');
    if (ledger.snapshotDate !== SNAPSHOT_DATE) errors.push(`snapshotDate must be ${SNAPSHOT_DATE}`);
    const canonical = canonicalizeLedger(ledger);
    if (JSON.stringify(canonical) !== JSON.stringify(ledger)) errors.push('ledger is not canonically sorted or counted');
    const hashes = ledger.assets.map(asset => asset.sha256);
    if (new Set(hashes).size !== hashes.length) errors.push('asset hashes are not unique');
    for (const asset of ledger.assets) {
        const required = ['id', 'sha256', 'byteSize', 'fileType', 'extension', 'dimensions', 'assetType', 'characters', 'places', 'activities', 'itemsOrProps', 'variants', 'poses', 'expressions', 'provenance', 'runtimeUses', 'orphanState', 'qualityVerdict', 'animationInteractionPurpose', 'destination', 'occurrences'];
        for (const field of required) if (!(field in asset)) errors.push(`${asset.sha256}: missing ${field}`);
        if (asset.occurrenceCount !== asset.occurrences.length) errors.push(`${asset.sha256}: occurrenceCount mismatch`);
        if (asset.id !== `sha256:${asset.sha256}`) errors.push(`${asset.sha256}: unstable id`);
        for (const use of asset.runtimeUses) {
            if (use.worktree === 'current' && use.match === 'runtime-ledger-route-home' && !use.route) {
                errors.push(`${asset.sha256}: current runtime use is missing its route home`);
            }
        }
        const recoveryOccurrence = asset.occurrences.find(occurrence => occurrence.role === 'recovery-archive');
        if (recoveryOccurrence) {
            const allowed = /^docs\/academy\/recovery\/recovered-assets\/codex-production-v1\/(backgrounds\/(wide|mobile)|lesson-assets)\//;
            if (!allowed.test(recoveryOccurrence.path)) errors.push(`${asset.sha256}: recovery destination is outside the allowlist`);
            if (asset.provenance.generationFamily !== 'direct-openai-image-generation') errors.push(`${asset.sha256}: recovered provenance is not direct OpenAI generation`);
            if (asset.qualityVerdict !== 'verified-manifest-reviewed') errors.push(`${asset.sha256}: recovered quality is not manifest-verified`);
            if (asset.destination.status === 'recovered-non-runtime' && asset.runtimeUses.some(use => use.worktree === 'current')) errors.push(`${asset.sha256}: non-runtime recovery asset is unexpectedly current-runtime referenced`);
        }
        if (!checkFiles) continue;
        for (const occurrence of asset.occurrences) {
            if (!occurrence.current && !checkHistorical) continue;
            let root = null;
            if (occurrence.worktree === 'current') root = REPO_ROOT;
            else if (occurrence.worktree.startsWith('release:')) root = path.join(RELEASE_ROOT, occurrence.worktree.slice('release:'.length));
            if (!root || !fs.existsSync(root)) continue;
            const file = path.join(root, occurrence.path);
            if (!fs.existsSync(file)) { errors.push(`${asset.sha256}: missing ${occurrence.worktree}:${occurrence.path}`); continue; }
            if (sha256(fs.readFileSync(file)) !== asset.sha256) errors.push(`${asset.sha256}: hash mismatch ${occurrence.worktree}:${occurrence.path}`);
        }
    }
    if (checkFiles && fs.existsSync(RECOVERY_ROOT)) {
        const allowed = new Set(ledger.assets.flatMap(asset => asset.occurrences.filter(occurrence => occurrence.role === 'recovery-archive').map(occurrence => occurrence.path)));
        for (const file of walk(RECOVERY_ROOT)) {
            const relative = posix(path.relative(REPO_ROOT, file));
            if (!allowed.has(relative)) errors.push(`unledgered recovery file: ${relative}`);
        }
    }
    return errors;
}

async function build() {
    const worktrees = discoverWorktrees();
    const previousVerdicts = loadPreviousVerdicts();
    const occurrences = scanOccurrences(worktrees);
    const activeHashes = new Set(occurrences.filter(item => item.current && item.role !== 'recovery-archive').map(item => sha256(fs.readFileSync(item.absolutePath))));
    const manifestEvidence = loadManifestEvidence(worktrees);
    const runtimeEvidence = loadRuntimeEvidence(worktrees);
    const recovered = recoverLostAssets(worktrees, activeHashes);
    const assets = buildRows(occurrences, worktrees, previousVerdicts, manifestEvidence, runtimeEvidence, recovered);
    const ledger = makeLedger(worktrees, assets);
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, serializeLedger(ledger));
    fs.writeFileSync(REPORT_PATH, renderReport(ledger));
    const errors = validateLedger(ledger);
    if (errors.length) throw new Error(`Built ledger failed validation:\n${errors.join('\n')}`);
    console.log(`Built Academy asset ledger: ${ledger.counts.uniquePayloads} payloads, ${ledger.counts.recoveredPayloads} recovered.`);
}

async function validateFiles() {
    const ledger = readJson(LEDGER_PATH);
    const errors = validateLedger(ledger, { checkHistorical: process.env.YOMU_ASSET_LEDGER_VERIFY_DONORS === '1' });
    if (serializeLedger(ledger) !== fs.readFileSync(LEDGER_PATH, 'utf8')) errors.push('ledger bytes are not canonical');
    if (renderReport(ledger) !== fs.readFileSync(REPORT_PATH, 'utf8')) errors.push('report is stale or non-deterministic');
    if (errors.length) {
        console.error(errors.join('\n'));
        process.exitCode = 1;
        return;
    }
    console.log(`Academy asset ledger valid: ${ledger.counts.uniquePayloads} payloads, ${ledger.counts.recoveredPayloads} recovered.`);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
    const command = process.argv[2] ?? 'validate';
    if (command === 'build') await build();
    else if (command === 'validate') await validateFiles();
    else throw new Error(`Unknown command: ${command}. Use build or validate.`);
}
