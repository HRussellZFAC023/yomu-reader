import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve('src/academy/content/story-sources');
const outputFile = path.resolve('docs/academy/art/STORY-ASSET-INVENTORY.json');
const lowerMapFile = path.resolve('docs/academy/story/ASSET-INTEGRATION-MAP.json');
const upperMapFile = path.resolve('docs/academy/art/ASSET-GAPS-CH25-48.json');
const promotionsFile = path.resolve('docs/academy/art/STORY-ART-PROMOTIONS.json');
const propManifestFile = path.resolve('src/academy/content/story-prop-manifest.v1.json');

const lowerMap = readJson(lowerMapFile);
const upperMap = readJson(upperMapFile);
const promotions = readJson(promotionsFile);
const propManifest = readJson(propManifestFile);
const promotedByNode = new Map(promotions.promotions.map(promotion => [promotion.nodeId, promotion]));
const runtimePropByScene = new Map(propManifest.scenes.map(definition => [definition.sceneId, definition]));
const sourceFiles = fs.readdirSync(sourceRoot)
    .filter(file => /^s(?:1|3|4)e\d{2}-.+\.v2\.json$/u.test(file))
    .sort(chapterFileOrder);

const lowerScenes = new Map(
    lowerMap.chapters.flatMap(chapter => chapter.scenes.map(scene => [scene.sceneId, scene])),
);
const upperScenes = new Map(
    upperMap.chapters.flatMap(chapter => chapter.scenes.map(scene => [scene.id, scene])),
);

const authored = sourceFiles.map(file => {
    const source = readJson(path.join(sourceRoot, file));
    return {
        chapter: chapterNumber(file),
        id: source.id,
        title: source.title,
        sourceFile: `src/academy/content/story-sources/${file}`,
        scenes: source.scenes.map(scene => sceneInventory(scene)),
    };
});

const chapters = authored.sort((left, right) => left.chapter - right.chapter);
const generationQueue = chapters.flatMap(chapter => chapter.scenes.flatMap(scene => {
    const items = [];
    if (scene.background.status === 'missing') {
        items.push(queueItem(chapter, scene, 'background', scene.background.description ?? `${scene.locationId} at ${scene.timeState}`));
    }
    if (scene.openingImage.status !== 'bound') {
        items.push(queueItem(
            chapter,
            scene,
            'opening-image',
            scene.openingImage.description ?? scene.goal ?? scene.sceneId,
            scene.openingImage.cueId,
        ));
    }
    if (scene.exitImage && scene.exitImage.status !== 'bound') {
        items.push(queueItem(
            chapter,
            scene,
            'exit-image',
            scene.exitImage.description,
            scene.exitImage.cueId,
        ));
    }
    for (const prop of scene.propCues.filter(cue => !isResolved(cue))) {
        items.push(queueItem(chapter, scene, 'prop-or-overlay', prop.description, prop.cueId));
    }
    return items;
}));

const sceneCount = chapters.reduce((total, chapter) => total + chapter.scenes.length, 0);
const cast = [...new Set(chapters.flatMap(chapter => chapter.scenes.flatMap(scene => scene.cast.map(member => member.id))))].sort();
const inventory = {
    schemaVersion: 2,
    generatedBy: 'npm run academy:art:story-inventory',
    authority: 'Canonical production queue derived from every authored story package. Existing candidate art is not treated as integrated unless a runtime home is explicit.',
    sources: {
        authoredStoryPackages: sourceFiles.length,
        openingPackage: 'src/academy/content/story-sources/s1e01-the-blank-atlas.v2.json',
        retainedLowerChapterBindings: path.relative(process.cwd(), lowerMapFile),
        retainedUpperChapterCandidates: path.relative(process.cwd(), upperMapFile),
        runtimeStoryProps: path.relative(process.cwd(), propManifestFile),
    },
    rules: [
        'Every scene owns one opening image and may own one changed exit image.',
        'A near-match is a reference candidate, not a completed scene asset.',
        'Every generated file must declare a sceneId runtime home before production.',
        'Cast sprites resolve through the canonical cast identity lock; filenames never infer identity.',
        'Props and overlays are reusable only when their manifest lists every runtime home.',
        'A stage cue covered by the runtime story-prop manifest is complete living-paper interaction, not queued bitmap art.',
    ],
    summary: {
        chapters: chapters.length,
        scenes: sceneCount,
        cast,
        castCount: cast.length,
        backgroundGaps: chapters.flatMap(chapter => chapter.scenes).filter(scene => scene.background.status === 'missing').length,
        openingImageGaps: chapters.flatMap(chapter => chapter.scenes).filter(scene => scene.openingImage.status !== 'bound').length,
        exitImageGaps: chapters.flatMap(chapter => chapter.scenes).filter(scene => scene.exitImage?.status !== 'bound').length,
        propOrOverlayGaps: chapters.flatMap(chapter => chapter.scenes.flatMap(scene => scene.propCues)).filter(cue => !isResolved(cue)).length,
        generationQueue: generationQueue.length,
    },
    chapters,
    generationQueue,
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
    `Wrote ${chapters.length} chapters, ${sceneCount} scenes, and ${generationQueue.length} runtime-bound generation requests to ${path.relative(process.cwd(), outputFile)}.`,
);

function sceneInventory(scene) {
    const lower = lowerScenes.get(scene.id);
    const upper = upperScenes.get(scene.id);
    const lineNodes = scene.nodes.filter(node => node.kind === 'line');
    const stageNodes = scene.nodes.filter(node => node.kind === 'stage');
    const castById = new Map();
    for (const line of lineNodes) {
        const current = castById.get(line.speakerId) ?? {
            id: line.speakerId,
            lineIds: [],
            performanceNeeds: new Set(),
            intents: [],
        };
        current.lineIds.push(line.id);
        current.performanceNeeds.add(inferExpression(line.intent));
        current.intents.push(line.intent);
        castById.set(line.speakerId, current);
    }

    const openingNode = stageNodes[0];
    const exitNode = stageNodes.at(-1);
    const middleStageNodes = stageNodes.slice(1, Math.max(1, stageNodes.length - 1));
    const upperEvent = upper?.eventArt;
    const exactEvent = upperEvent?.resolution === 'existing-candidate';
    const eventCandidates = upperEvent?.candidatePaths ?? [];
    const promotedOpening = openingNode ? promotedByNode.get(openingNode.id) : undefined;
    const promotedExit = exitNode ? promotedByNode.get(exitNode.id) : undefined;

    return {
        sceneId: scene.id,
        locationId: scene.locationId,
        timeState: scene.timeState,
        goal: scene.goal,
        dramaticQuestion: scene.dramaticQuestion,
        learnerNeed: scene.learnerNeed,
        cast: [...castById.values()].map(member => ({
            ...member,
            performanceNeeds: [...member.performanceNeeds].sort(),
        })),
        background: upper ? upperBackground(upper) : lower ? lowerBackground(lower) : {
            description: `${scene.locationId} at ${scene.timeState}`,
            status: 'missing',
            candidatePaths: [],
        },
        openingImage: {
            cueId: openingNode?.cueId ?? null,
            description: openingNode?.description ?? scene.goal,
            status: promotedOpening || exactEvent ? 'bound' : eventCandidates.length ? 'candidate-only' : 'missing',
            runtimeHome: scene.id,
            candidatePaths: promotedOpening
                ? [promotedOpening.wide, promotedOpening.mobile]
                : eventCandidates,
        },
        exitImage: exitNode && exitNode !== openingNode ? {
            cueId: exitNode.cueId ?? null,
            description: exitNode.description,
            status: promotedExit ? 'bound' : 'missing',
            runtimeHome: scene.id,
            candidatePaths: promotedExit ? [promotedExit.wide, promotedExit.mobile] : [],
        } : null,
        propCues: middleStageNodes.map(node => propInventory(scene.id, node)),
    };
}

function propInventory(sceneId, node) {
    const runtimeProp = runtimePropByScene.get(sceneId);
    const coverage = runtimeProp?.stageCoverage;
    const covered = coverage === 'all'
        || (Array.isArray(coverage) && coverage.includes(node.id));
    return {
        cueId: node.cueId ?? node.id,
        nodeId: node.id,
        description: node.description,
        status: covered ? 'runtime-prop' : 'missing',
        runtimeHome: sceneId,
        runtimeRenderer: covered ? runtimeProp.rendererId : null,
        candidatePaths: [],
    };
}

function isResolved(item) {
    return item.status === 'bound' || item.status === 'runtime-prop';
}

function lowerBackground(scene) {
    return {
        description: scene.background?.assetId ?? `${scene.locationId} at ${scene.timeState}`,
        status: scene.background?.status === 'exists' ? 'bound' : 'missing',
        candidatePaths: [],
    };
}

function upperBackground(scene) {
    return {
        description: `${scene.background.requiredLocation} at ${scene.background.state}`,
        status: scene.background.resolution === 'existing-candidate' ? 'bound' : 'missing',
        candidatePaths: scene.background.candidatePaths ?? [],
    };
}

function queueItem(chapter, scene, kind, brief, cueId = null) {
    return {
        priority: kind === 'opening-image' ? 'scene-critical' : kind === 'exit-image' ? 'payoff-critical' : 'supporting',
        chapter: chapter.chapter,
        chapterId: chapter.id,
        sceneId: scene.sceneId,
        cueId,
        kind,
        brief,
        locationId: scene.locationId,
        timeState: scene.timeState,
        castIds: scene.cast.map(member => member.id),
        runtimeHome: scene.sceneId,
        status: 'queued',
    };
}

function inferExpression(intent = '') {
    const value = intent.toLowerCase();
    if (/surpris|shock|realise|realize|startl/u.test(value)) return 'surprised-shocked';
    if (/sad|hurt|vulnerab|apolog|regret|grief|worr/u.test(value)) return 'sad-vulnerable';
    if (/laugh|smile|delight|warm|celebrat|joke|teas/u.test(value)) return 'happy';
    if (/listen|hear|invite|encourag|welcome|wait/u.test(value)) return 'encouraging-listening';
    if (/decid|firm|defend|refus|insist|commit|challenge/u.test(value)) return 'determined';
    if (/think|consider|ask|wonder|uncertain|notice|infer|read/u.test(value)) return 'thoughtful';
    return 'neutral';
}

function chapterFileOrder(left, right) {
    return chapterNumber(left) - chapterNumber(right);
}

function chapterNumber(file) {
    const match = file.match(/^s([134])e(\d{2})/u);
    if (!match) throw new Error(`Unrecognised story package filename: ${file}`);
    const season = Number(match[1]);
    const episode = Number(match[2]);
    if (season === 1) return episode;
    if (season === 3) return 24 + episode;
    return 36 + episode;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
