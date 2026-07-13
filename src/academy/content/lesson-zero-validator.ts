import { createSourceLibrary } from '../domain/source-library';
import { getAcademyCastMember, isAcademyCastMemberId } from '../domain/cast-registry';
import { assertHealthyAuthoredCastUsage, type AuthoredCastReference } from '../domain/authored-cast';
import {
    LESSON_ZERO_RESPONSE_MODES,
    type AssessedSupportContract,
    type LessonZeroActivity,
    type LessonZeroAudioAsset,
    type LessonZeroDefinition,
    type LessonZeroInputScript,
    type LessonZeroMission,
    type LessonZeroPackageData,
    type LessonZeroReleaseBlocker,
    type LessonZeroSection,
    type LessonZeroResponseMode,
    type VersionedSourceLibraryData,
} from './lesson-zero-schema';

const REQUIRED_SECTION_IDS = [
    'arrival-greetings', 'sound-script-map', 'classroom-survival',
    'sentence-frames', 'useful-vocabulary', 'multi-speaker-input',
    'reading-writing', 'transfer', 'close',
] as const;

const REQUIRED_SENTENCE_FRAMES = [
    'N は N です', 'N は N じゃありません', 'N は N ですか', 'N の N', 'N も N です',
] as const;

const EXPECTED_MISSIONS = {
    sound: { hosts: ['xingyu', 'mika'], locationId: 'location:language-lab' },
    text: { hosts: ['sophie', 'ruparna'], locationId: 'location:library' },
    speaking: { hosts: ['aakash', 'sam'], locationId: 'location:classroom-entrance' },
} as const;

const ASSESSED_SUPPORT: AssessedSupportContract = {
    reading: 'learner-controlled',
    pitch: 'learner-controlled',
    englishMeaning: 'after-commit',
    transcript: 'after-commit',
    modelAnswer: 'after-first-attempt',
};

export function validateLessonZeroPackage(value: unknown): LessonZeroPackageData {
    const data = record(value, 'Lesson 0 package') as unknown as LessonZeroPackageData;
    if (data.schemaVersion !== 1) fail('Lesson 0 package must use schemaVersion 1.');
    if (data.sourceLibrary?.schemaVersion !== 1) fail('Lesson 0 source library must use schemaVersion 1.');
    createSourceLibrary(data.sourceLibrary);
    validateSourceScope(data.sourceLibrary);

    const questionIds = new Set(data.sourceLibrary.questions.map(question => question.id));
    const lesson = record(data.lesson, 'lesson') as unknown as LessonZeroDefinition;
    validateLessonIdentity(lesson);
    const sectionById = validateSections(lesson);
    const activityById = validateActivities(lesson, sectionById, questionIds);
    const scripts = validateScripts(lesson);
    validateAudio(lesson.audioAssets, lesson.releaseBlockers, scripts);
    validateMissions(lesson.missions, activityById);
    validateLessonZeroCastUsage(lesson.missions, scripts);
    return structuredClone(data);
}

function validateLessonIdentity(lesson: LessonZeroDefinition): void {
    if (lesson.id !== 'lesson:foundation-00') fail('Lesson 0 has the wrong lesson id.');
    text(lesson.contentVersion, 'lesson.contentVersion');
    if (lesson.levelBand !== 'foundation') fail('Lesson 0 must use the foundation band.');
    if (lesson.estimatedMinutes.minimum !== 60 || lesson.estimatedMinutes.maximum !== 90) {
        fail('Lesson 0 must retain the authored 60–90 minute scope.');
    }
    exactList(lesson.sectionIds, REQUIRED_SECTION_IDS, 'lesson.sectionIds');
    exactList(lesson.sentenceFrames, REQUIRED_SENTENCE_FRAMES, 'lesson.sentenceFrames');
    nonEmpty(lesson.vocabulary, 'lesson.vocabulary');
}

function validateSections(lesson: LessonZeroDefinition): Map<string, LessonZeroSection> {
    const sections = array(lesson.sections, 'lesson.sections') as readonly LessonZeroSection[];
    const sectionById = uniqueIndex(sections, 'section');
    exactList([...sectionById.keys()], REQUIRED_SECTION_IDS, 'lesson.sections');
    for (const [index, section] of sections.entries()) {
        if (section.order !== index + 1) fail(`Section ${section.id} has the wrong order.`);
        if (!section.resumableAfter) fail(`Section ${section.id} must be a resumable boundary.`);
        nonEmpty(section.activityIds, `section ${section.id} activityIds`);
        nonEmpty(section.outcomeIds, `section ${section.id} outcomeIds`);
    }
    return sectionById;
}

function validateActivities(
    lesson: LessonZeroDefinition,
    sections: ReadonlyMap<string, LessonZeroSection>,
    questionIds: ReadonlySet<string>,
): Map<string, LessonZeroActivity> {
    const activities = array(lesson.activities, 'lesson.activities') as readonly LessonZeroActivity[];
    const activityById = uniqueIndex(activities, 'activity');
    const allowedModes = new Set<string>(LESSON_ZERO_RESPONSE_MODES);
    const usedModes = new Set<LessonZeroResponseMode>();
    for (const activity of activities) {
        if (!sections.has(activity.sectionId)) fail(`Activity ${activity.id} references an unknown section.`);
        if (!allowedModes.has(activity.responseMode)) fail(`Activity ${activity.id} has an unsupported response mode.`);
        usedModes.add(activity.responseMode);
        nonEmpty(activity.conceptIds, `activity ${activity.id} conceptIds`);
        for (const sourceQuestionId of activity.sourceQuestionIds) {
            if (!questionIds.has(sourceQuestionId)) fail(`Activity ${activity.id} references unknown source question ${sourceQuestionId}.`);
        }
        if (activity.assessed && JSON.stringify(activity.support) !== JSON.stringify(ASSESSED_SUPPORT)) {
            fail(`Activity ${activity.id} exposes assessed support before commitment.`);
        }
    }
    exactSet(usedModes, LESSON_ZERO_RESPONSE_MODES, 'lesson activity response modes');
    for (const section of sections.values()) {
        for (const activityId of section.activityIds) {
            const activity = activityById.get(activityId);
            if (!activity) fail(`Section ${section.id} references unknown activity ${activityId}.`);
            if (activity.sectionId !== section.id) fail(`Activity ${activityId} is assigned to two sections.`);
        }
    }
    validateProductionCoverage(activities);
    return activityById;
}

function validateScripts(lesson: LessonZeroDefinition): readonly LessonZeroInputScript[] {
    const scripts = array(lesson.inputScripts, 'lesson.inputScripts') as readonly LessonZeroInputScript[];
    const scriptById = uniqueIndex(scripts, 'input script');
    for (const script of scripts) {
        if (script.transcriptReveal !== 'after-commit') fail(`Script ${script.id} reveals its transcript too early.`);
        nonEmpty(script.lines, `script ${script.id} lines`);
        if (new Set(script.lines.map(line => line.speakerId)).size < 2) fail(`Script ${script.id} is not multi-speaker input.`);
        for (const line of script.lines) {
            if (!isAcademyCastMemberId(line.speakerId)) fail(`Script ${script.id} invents cast id ${line.speakerId}.`);
            text(line.japanese, `script ${script.id} Japanese line`);
            text(line.english, `script ${script.id} English line`);
            const member = getAcademyCastMember(line.speakerId);
            if (!line.japanese.includes(`${member.firstName}です`) || !line.reading.includes(`${member.firstName}です`)) {
                fail(`Script ${script.id} does not use the canonical first name ${member.firstName} for ${member.id}.`);
            }
        }
    }
    for (const activity of lesson.activities) {
        if (activity.inputScriptId && !scriptById.has(activity.inputScriptId)) {
            fail(`Activity ${activity.id} references unknown script ${activity.inputScriptId}.`);
        }
    }
    return scripts;
}

function validateLessonZeroCastUsage(
    missions: readonly LessonZeroMission[],
    scripts: readonly LessonZeroInputScript[],
): void {
    const requirements = {
        sound: ['sound', 'pronunciation'],
        text: ['reading', 'inference'],
        speaking: ['directions', 'invitations'],
    } as const;
    const scriptByMission = new Map(scripts.map(script => [
        script.id.replace(/^input:lesson-zero-|-hosts$/gu, ''),
        script,
    ]));
    assertHealthyAuthoredCastUsage(missions.map(mission => {
        const script = scriptByMission.get(mission.id);
        const cast: AuthoredCastReference[] = script
            ? script.lines.map(line => ({ id: line.speakerId, firstName: getAcademyCastMember(line.speakerId).firstName }))
            : mission.hostIds.map(id => ({ id }));
        return {
            id: `lesson:foundation-00:${mission.id}`,
            cast,
            requiredSpecialties: requirements[mission.id],
        };
    }));
}

function validateSourceScope(data: VersionedSourceLibraryData): void {
    const documentId = 'document:moodle-1e58967e';
    if (data.documents.length !== 1 || data.documents[0]?.id !== documentId) fail('Lesson 0 must preserve the audited classroom-phrase document.');
    if (data.documents[0]?.sha256 !== '1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba') {
        fail('Lesson 0 classroom-phrase source hash changed.');
    }
    if (data.questions.length !== 14) fail('Lesson 0 must preserve all fourteen classroom-expression records.');
    for (let number = 1; number <= 14; number += 1) {
        const suffix = String(number).padStart(2, '0');
        const question = data.questions.find(candidate => candidate.id === `source-question:classroom-phrase-${suffix}`);
        if (!question) fail(`Lesson 0 is missing classroom-expression source record ${suffix}.`);
        if (question.locus.page !== (number <= 8 ? 1 : 2) || question.locus.printedNumber !== String(number)) {
            fail(`Classroom-expression ${suffix} has the wrong source locus.`);
        }
        if (question.documentId !== documentId) fail(`Classroom-expression ${suffix} crosses source documents.`);
    }
}

function validateProductionCoverage(activities: readonly LessonZeroActivity[]): void {
    const productions = activities.filter(activity => activity.production);
    const productionModes = new Set(productions.map(activity => activity.responseMode));
    for (const required of ['voice', 'ime', 'doodle'] as const) {
        if (!productionModes.has(required)) fail(`Lesson 0 lacks ${required} production evidence.`);
    }
    const transfer = productions.filter(activity => activity.sectionId === 'transfer');
    if (!transfer.some(activity => activity.responseMode === 'voice') || !transfer.some(activity => activity.responseMode === 'ime')) {
        fail('Lesson 0 transfer must include matched spoken and written production.');
    }
}

function validateAudio(
    assets: readonly LessonZeroAudioAsset[],
    blockers: readonly LessonZeroReleaseBlocker[],
    scripts: readonly LessonZeroInputScript[],
): void {
    const assetById = uniqueIndex(array(assets, 'lesson.audioAssets') as readonly LessonZeroAudioAsset[], 'audio asset');
    const blockerById = uniqueIndex(array(blockers, 'lesson.releaseBlockers') as readonly LessonZeroReleaseBlocker[], 'release blocker');
    for (const asset of assetById.values()) {
        if (asset.browserTtsAllowed !== false || asset.learnerVisiblePlaceholder !== false) fail(`Audio ${asset.id} permits a fake or learner-visible fallback.`);
        if (asset.state === 'ready') {
            if (!asset.runtimeUrl || asset.verifiedPairing !== true) fail(`Ready audio ${asset.id} lacks a verified pairing.`);
        } else {
            if (asset.runtimeUrl) fail(`Blocked audio ${asset.id} must not expose an unverified runtime file.`);
            if (!asset.blockerId || !blockerById.has(asset.blockerId)) fail(`Blocked audio ${asset.id} lacks an internal blocker.`);
        }
    }
    for (const script of scripts) if (!assetById.has(script.audioAssetId)) fail(`Script ${script.id} references unknown audio ${script.audioAssetId}.`);
    for (const blocker of blockerById.values()) {
        if (blocker.kind !== 'audio' || blocker.learnerVisible !== false) fail(`Release blocker ${blocker.id} is not internal audio state.`);
        for (const assetId of blocker.assetIds) if (!assetById.has(assetId)) fail(`Release blocker ${blocker.id} references unknown audio ${assetId}.`);
    }
}

function validateMissions(missions: readonly LessonZeroMission[], activities: ReadonlyMap<string, LessonZeroActivity>): void {
    const missionById = uniqueIndex(array(missions, 'lesson.missions') as readonly LessonZeroMission[], 'mission');
    exactSet(missionById.keys(), Object.keys(EXPECTED_MISSIONS), 'lesson mission ids');
    const signatures = new Set<string>();
    const locations = new Set<string>();
    const mementos = new Set<string>();
    for (const [missionId, expected] of Object.entries(EXPECTED_MISSIONS)) {
        const mission = missionById.get(missionId);
        if (!mission) fail(`Lesson 0 is missing ${missionId} mission.`);
        exactList(mission.hostIds, expected.hosts, `${missionId} mission hosts`);
        if (mission.locationId !== expected.locationId) fail(`${missionId} mission uses the wrong location.`);
        for (const hostId of mission.hostIds) if (!isAcademyCastMemberId(hostId)) fail(`${missionId} mission invents cast id ${hostId}.`);
        if (!activities.has(mission.openingActivityId) || !activities.has(mission.transferActivityId)) fail(`${missionId} mission references an unknown activity.`);
        signatures.add(text(mission.signature, `${missionId} mission signature`));
        locations.add(mission.locationId);
        mementos.add(mission.mementoId);
    }
    if (signatures.size !== 3 || locations.size !== 3 || mementos.size !== 3) fail('Sound, Text, and Speaking missions must have distinct places, structures, and results.');
}

function uniqueIndex<T extends { readonly id: string }>(values: readonly T[], label: string): Map<string, T> {
    const result = new Map<string, T>();
    for (const value of values) {
        text(value.id, `${label}.id`);
        if (result.has(value.id)) fail(`Duplicate ${label} id: ${value.id}`);
        result.set(value.id, value);
    }
    return result;
}

function exactList(actual: readonly string[], expected: readonly string[], label: string): void {
    if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) fail(`${label} does not match the authored contract.`);
}

function exactSet(actual: Iterable<string>, expected: readonly string[], label: string): void {
    exactList([...actual].sort(), [...expected].sort(), label);
}

function nonEmpty(values: readonly unknown[], label: string): void {
    if (!Array.isArray(values) || !values.length) fail(`${label} must not be empty.`);
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) fail(`${label} must be an array.`);
    return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(`${label} must be non-empty.`);
    return value.trim();
}

function fail(message: string): never {
    throw new TypeError(message);
}
