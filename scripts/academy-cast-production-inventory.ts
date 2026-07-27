import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_CAST_IDENTITY_LOCKS,
    ACADEMY_CAST_HOUSE_STYLE,
    REQUIRED_CAST_PERFORMANCES,
    type AcademyCastPerformance,
} from '../src/academy/domain/cast-identity-locks';
import {
    ACADEMY_CAST_STANDARDIZATION_MANIFEST,
} from '../src/academy/domain/cast-standardization-manifest';

const outputFile = path.resolve('docs/academy/art/CAST-PRODUCTION-INVENTORY.json');
const storyInventory = JSON.parse(
    fs.readFileSync(path.resolve('docs/academy/art/STORY-ASSET-INVENTORY.json'), 'utf8'),
) as {
    chapters: readonly {
        scenes: readonly {
            cast: readonly { id: string; lineIds: readonly string[] }[];
        }[];
    }[];
};

const storyLinesByCast = new Map<string, number>();
for (const chapter of storyInventory.chapters) {
    for (const scene of chapter.scenes) {
        for (const cast of scene.cast) {
            storyLinesByCast.set(cast.id, (storyLinesByCast.get(cast.id) ?? 0) + cast.lineIds.length);
        }
    }
}

const preferredAngles: Readonly<Record<AcademyCastPerformance, string>> = {
    neutral: 'front-near-front',
    'encouraging-listening': 'right-three-quarter',
    happy: 'front-near-front',
    thoughtful: 'left-three-quarter',
    determined: 'left-three-quarter',
    'surprised-shocked': 'right-three-quarter',
    'sad-vulnerable': 'left-three-quarter',
};
const ownerFlagged = new Set([
    'aakash',
    'angel',
    'christian',
    'henry',
    'jenny',
    'mika',
    'mira',
    'nanako',
    'robert',
    'rose',
    'ruparna',
    'sam',
    'stasi',
    'tom2',
    'xingyu',
]);

const cast = Object.entries(ACADEMY_CAST_IDENTITY_LOCKS).map(([castId, lock]) => {
    const slots = ACADEMY_CAST_STANDARDIZATION_MANIFEST.filter(slot => slot.castId === castId);
    const performances = REQUIRED_CAST_PERFORMANCES.map(expression => {
        const accepted = slots.find(slot =>
            slot.expression === expression
            && slot.status === 'approved'
            && (lock.disposition === 'retain-anchor'
                ? ['retained-good', 'regenerated-house-style'].includes(slot.sourceKind)
                : slot.sourceKind === 'regenerated-house-style'),
        );
        return {
            expression,
            preferredAngle: preferredAngles[expression],
            status: accepted ? 'integrated' : 'missing',
            assetId: accepted?.assetId ?? null,
            assetPath: accepted?.assetPath ?? null,
            runtimeHomes: accepted?.runtimeHomes ?? [],
        };
    });
    const integrated = performances.filter(performance => performance.status === 'integrated').length;
    const storyLines = storyLinesByCast.get(castId) ?? 0;
    return {
        castId,
        displayName: lock.displayName,
        identityKey: lock.identityKey,
        assetFolder: lock.assetFolder,
        visualLock: lock.visualLock,
        wardrobeLock: lock.wardrobeLock,
        reject: lock.reject,
        source: lock.source,
        disposition: lock.disposition,
        storyLines,
        priority: ownerFlagged.has(castId) ? 'owner-correction'
            : storyLines > 0 ? 'story-critical'
                : 'roster-completion',
        summary: {
            required: REQUIRED_CAST_PERFORMANCES.length,
            integrated,
            missing: REQUIRED_CAST_PERFORMANCES.length - integrated,
        },
        performances,
    };
});

const generationQueue = cast.flatMap(member =>
    member.performances
        .filter(performance => performance.status === 'missing')
        .map(performance => ({
            key: `${member.castId}:${performance.expression}`,
            castId: member.castId,
            displayName: member.displayName,
            identityKey: member.identityKey,
            expression: performance.expression,
            angle: performance.preferredAngle,
            priority: member.priority,
            storyLines: member.storyLines,
            visualLock: member.visualLock,
            wardrobeLock: member.wardrobeLock,
            reject: [
                ...member.reject,
                ...ACADEMY_CAST_HOUSE_STYLE.reject,
            ],
            runtimeHomes: runtimeHomes(member.castId, performance.expression),
            status: 'queued',
        })),
);

const inventory = {
    schemaVersion: 1,
    generatedBy: 'npm run academy:cast:production-inventory',
    authority: 'Canonical production matrix. A legacy or review-preview sprite cannot satisfy a required performance.',
    houseStyle: ACADEMY_CAST_HOUSE_STYLE,
    rules: [
        'Internal cast IDs are stable save keys; display names come from the identity lock.',
        'Every non-anchor cast member must be regenerated in the current house style.',
        'A performance is complete only after visual QA, promotion, runtime binding, and mirrored delivery.',
        'No file may satisfy two character identities.',
        'No generated sprite may remain without a gallery, lesson, story, or People runtime home.',
    ],
    summary: {
        cast: cast.length,
        requiredPerformancesPerCast: REQUIRED_CAST_PERFORMANCES.length,
        requiredSlots: cast.length * REQUIRED_CAST_PERFORMANCES.length,
        integratedSlots: cast.reduce((total, member) => total + member.summary.integrated, 0),
        missingSlots: generationQueue.length,
        ownerCorrectionQueue: generationQueue.filter(item => item.priority === 'owner-correction').length,
        storyCriticalQueue: generationQueue.filter(item => item.priority === 'story-critical').length,
        rosterCompletionQueue: generationQueue.filter(item => item.priority === 'roster-completion').length,
    },
    cast,
    generationQueue,
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
    `Wrote ${inventory.summary.requiredSlots} required cast performances: `
    + `${inventory.summary.integratedSlots} integrated, ${inventory.summary.missingSlots} queued.`,
);

function runtimeHomes(castId: string, expression: AcademyCastPerformance): string[] {
    if (expression === 'neutral') {
        return [
            `journal:${castId}`,
            'class:people',
            'lesson-overview:roster',
            `story:cast:${castId}`,
        ];
    }
    return [
        `journal:${castId}-expression-gallery`,
        `story:cast:${castId}:${expression}`,
    ];
}
