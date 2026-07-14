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
    validateOverview(lesson, activityById, questionIds);
    const scripts = validateScripts(lesson);
    validateAudio(lesson.audioAssets, lesson.releaseBlockers, scripts);
    validateMissions(lesson.missions, activityById);
    validateLessonZeroCastUsage(lesson.missions, scripts);
    return structuredClone(data);
}

function validateOverview(
    lesson: LessonZeroDefinition,
    activities: ReadonlyMap<string, LessonZeroActivity>,
    questionIds: ReadonlySet<string>,
): void {
    const overview = record(lesson.overview, 'lesson.overview') as unknown as LessonZeroDefinition['overview'];
    validateOverviewCopy(overview);
    validateOverviewPeopleAndLocations(overview);
    validateOverviewMaterials(overview, activities, questionIds);
}

function validateOverviewCopy(overview: LessonZeroDefinition['overview']): void {
    localized(overview.title, 'lesson.overview.title');
    localized(overview.summary, 'lesson.overview.summary');
    const goals = array(overview.goals, 'lesson.overview.goals');
    if (goals.length < 3) fail('Lesson 0 overview needs concrete learning goals.');
    goals.forEach((goal, index) => localized(goal, `lesson.overview.goals.${index}`));
}

function validateOverviewPeopleAndLocations(overview: LessonZeroDefinition['overview']): void {
    nonEmpty(overview.peopleIds, 'lesson.overview.peopleIds');
    for (const personId of overview.peopleIds) {
        if (!isAcademyCastMemberId(personId)) fail(`Lesson 0 overview invents cast id ${personId}.`);
    }
    if (new Set(overview.peopleIds).size !== overview.peopleIds.length) fail('Lesson 0 overview repeats a person.');
    nonEmpty(overview.locationIds, 'lesson.overview.locationIds');
    if (new Set(overview.locationIds).size !== overview.locationIds.length) fail('Lesson 0 overview repeats a location.');
}

function validateOverviewMaterials(
    overview: LessonZeroDefinition['overview'],
    activities: ReadonlyMap<string, LessonZeroActivity>,
    questionIds: ReadonlySet<string>,
): void {
    const materials = array(overview.materials, 'lesson.overview.materials') as LessonZeroDefinition['overview']['materials'];
    const materialIds = new Set<string>();
    for (const material of materials) {
        validateOverviewMaterial(material, materialIds, activities, questionIds);
    }
}

function validateOverviewMaterial(
    material: LessonZeroDefinition['overview']['materials'][number],
    materialIds: Set<string>,
    activities: ReadonlyMap<string, LessonZeroActivity>,
    questionIds: ReadonlySet<string>,
): void {
    validateOverviewMaterialIdentity(material, materialIds);
    validateOverviewMaterialReferences(material, activities, questionIds);
    validateOverviewMaterialBlocker(material);
}

function validateOverviewMaterialIdentity(
    material: LessonZeroDefinition['overview']['materials'][number],
    materialIds: Set<string>,
): void {
    text(material.id, 'lesson.overview.material.id');
    if (materialIds.has(material.id)) fail(`Lesson 0 overview repeats material ${material.id}.`);
    materialIds.add(material.id);
    localized(material.title, `lesson.overview material ${material.id}`);
    if (!['source-handout', 'writing-surface', 'kana-surface', 'dialogue-audio'].includes(material.kind)) {
        fail(`Lesson 0 overview material ${material.id} has an invalid kind.`);
    }
    if (!['ready', 'release-blocked'].includes(material.state)) {
        fail(`Lesson 0 overview material ${material.id} has an invalid state.`);
    }
}

function validateOverviewMaterialReferences(
    material: LessonZeroDefinition['overview']['materials'][number],
    activities: ReadonlyMap<string, LessonZeroActivity>,
    questionIds: ReadonlySet<string>,
): void {
    nonEmpty(material.activityIds, `lesson.overview material ${material.id} activityIds`);
    for (const activityId of material.activityIds) {
        if (!activities.has(activityId)) {
            fail(`Lesson 0 overview material ${material.id} references unknown activity ${activityId}.`);
        }
    }
    for (const questionId of material.sourceQuestionIds ?? []) {
        if (!questionIds.has(questionId)) {
            fail(`Lesson 0 overview material ${material.id} references unknown source question ${questionId}.`);
        }
    }
}

function validateOverviewMaterialBlocker(
    material: LessonZeroDefinition['overview']['materials'][number],
): void {
    if (material.state === 'release-blocked') {
        if (!material.blockerId) fail(`Blocked material ${material.id} needs a blocker.`);
        return;
    }
    if (material.blockerId) fail(`Ready material ${material.id} cannot retain a blocker.`);
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
        validateActivity(activity, sections, questionIds, allowedModes);
        usedModes.add(activity.responseMode);
    }
    exactSet(usedModes, LESSON_ZERO_RESPONSE_MODES, 'lesson activity response modes');
    validateSectionActivityReferences(sections, activityById);
    validateProductionCoverage(activities);
    return activityById;
}

function validateActivity(
    activity: LessonZeroActivity,
    sections: ReadonlyMap<string, LessonZeroSection>,
    questionIds: ReadonlySet<string>,
    allowedModes: ReadonlySet<string>,
): void {
    if (!sections.has(activity.sectionId)) fail(`Activity ${activity.id} references an unknown section.`);
    if (!allowedModes.has(activity.responseMode)) fail(`Activity ${activity.id} has an unsupported response mode.`);
    nonEmpty(activity.conceptIds, `activity ${activity.id} conceptIds`);
    for (const sourceQuestionId of activity.sourceQuestionIds) {
        if (!questionIds.has(sourceQuestionId)) fail(`Activity ${activity.id} references unknown source question ${sourceQuestionId}.`);
    }
    if (activity.assessed && !hasAssessedSupport(activity.support)) {
        fail(`Activity ${activity.id} exposes assessed support before commitment.`);
    }
}

function validateSectionActivityReferences(
    sections: ReadonlyMap<string, LessonZeroSection>,
    activityById: ReadonlyMap<string, LessonZeroActivity>,
): void {
    for (const section of sections.values()) {
        for (const activityId of section.activityIds) {
            const activity = activityById.get(activityId);
            if (!activity) fail(`Section ${section.id} references unknown activity ${activityId}.`);
            if (activity.sectionId !== section.id) fail(`Activity ${activityId} is assigned to two sections.`);
        }
    }
}

function validateScripts(lesson: LessonZeroDefinition): readonly LessonZeroInputScript[] {
    const scripts = array(lesson.inputScripts, 'lesson.inputScripts') as readonly LessonZeroInputScript[];
    const scriptById = uniqueIndex(scripts, 'input script');
    for (const script of scripts) {
        validateInputScript(script, lesson.activities);
    }
    validateScriptActivityReferences(lesson.activities, scriptById);
    validateSpeechActivityContracts(lesson, scriptById);
    return scripts;
}

function validateInputScript(
    script: LessonZeroInputScript,
    activities: readonly LessonZeroActivity[],
): void {
    if (script.kind !== 'dialogue' && script.kind !== 'sound-sequence') {
        fail(`Script ${script.id} has an unsupported input kind.`);
    }
    if (script.transcriptReveal !== 'after-commit') fail(`Script ${script.id} reveals its transcript too early.`);
    nonEmpty(script.lines, `script ${script.id} lines`);
    const lineIds = validateScriptLines(script);
    validateDialogueSpeakers(script);
    validateScriptLearnerTurns(script, lineIds, activities);
}

function validateScriptLines(script: LessonZeroInputScript): ReadonlySet<string> {
    const lineIds = new Set<string>();
    for (const line of script.lines) {
        text(line.id, `script ${script.id} line id`);
        if (lineIds.has(line.id)) fail(`Script ${script.id} repeats line id ${line.id}.`);
        lineIds.add(line.id);
        if (!isAcademyCastMemberId(line.speakerId)) fail(`Script ${script.id} invents cast id ${line.speakerId}.`);
        text(line.japanese, `script ${script.id} Japanese line`);
        text(line.reading, `script ${script.id} reading line`);
        text(line.english, `script ${script.id} English line`);
    }
    return lineIds;
}

function validateDialogueSpeakers(script: LessonZeroInputScript): void {
    if (script.kind !== 'dialogue') return;
    const speakers = new Set(script.lines.map(line => line.speakerId));
    if (speakers.size < 2) fail(`Dialogue script ${script.id} is not multi-speaker input.`);
    for (const speakerId of speakers) {
        const member = getAcademyCastMember(speakerId);
        const speakerLines = script.lines.filter(line => line.speakerId === speakerId);
        if (!speakerLines.some(line =>
            line.japanese.includes(`${member.firstName}です`)
            && line.reading.includes(`${member.firstName}です`))) {
            fail(`Script ${script.id} does not use the canonical first name ${member.firstName} for ${member.id}.`);
        }
    }
}

function validateScriptLearnerTurns(
    script: LessonZeroInputScript,
    lineIds: ReadonlySet<string>,
    activities: readonly LessonZeroActivity[],
): void {
    const learnerTurns = script.learnerTurns ?? [];
    const learnerTurnIds = new Set<string>();
    for (const turn of learnerTurns) {
        validateScriptLearnerTurn(script, turn, learnerTurnIds, lineIds);
    }
    if (script.kind === 'sound-sequence' && learnerTurns.length) {
        fail(`Sound sequence ${script.id} cannot contain a learner speaking turn.`);
    }
    if (learnerTurns.length && !activities.some(activity =>
        activity.inputScriptId === script.id
        && activity.expectedEvidence.kind === 'spoken-turn')) {
        fail(`Script ${script.id} has a learner turn without a spoken-turn activity.`);
    }
}

function validateScriptLearnerTurn(
    script: LessonZeroInputScript,
    turn: NonNullable<LessonZeroInputScript['learnerTurns']>[number],
    learnerTurnIds: Set<string>,
    lineIds: ReadonlySet<string>,
): void {
    text(turn.id, `script ${script.id} learner turn id`);
    if (learnerTurnIds.has(turn.id)) fail(`Script ${script.id} repeats learner turn id ${turn.id}.`);
    learnerTurnIds.add(turn.id);
    if (!lineIds.has(turn.afterLineId)) {
        fail(`Script ${script.id} learner turn ${turn.id} references unknown line ${turn.afterLineId}.`);
    }
    if (turn.capture?.kind !== 'microphone-recording' || turn.capture.evidenceKind !== 'spoken-turn') {
        fail(`Script ${script.id} learner turn ${turn.id} lacks spoken response capture.`);
    }
    if (!Number.isFinite(turn.capture.windowMs) || turn.capture.windowMs <= 0) {
        fail(`Script ${script.id} learner turn ${turn.id} has an invalid capture window.`);
    }
    if (!hasAssessedSupport(turn.support)) {
        fail(`Script ${script.id} learner turn ${turn.id} exposes support before commitment.`);
    }
}

function validateScriptActivityReferences(
    activities: readonly LessonZeroActivity[],
    scriptById: ReadonlyMap<string, LessonZeroInputScript>,
): void {
    for (const activity of activities) {
        if (activity.inputScriptId && !scriptById.has(activity.inputScriptId)) {
            fail(`Activity ${activity.id} references unknown script ${activity.inputScriptId}.`);
        }
        if (activity.expectedEvidence.kind === 'spoken-turn' && activity.inputScriptId) {
            const script = scriptById.get(activity.inputScriptId)!;
            if (!script.learnerTurns?.some(turn => turn.capture.evidenceKind === activity.expectedEvidence.kind)) {
                fail(`Activity ${activity.id} has no authored learner speaking turn.`);
            }
        }
    }
}

function validateSpeechActivityContracts(
    lesson: LessonZeroDefinition,
    scriptById: ReadonlyMap<string, LessonZeroInputScript>,
): void {
    validateVowelActivityContract(lesson, scriptById);
    validateSpeakingActivityContract(lesson, scriptById);
}

function validateVowelActivityContract(
    lesson: LessonZeroDefinition,
    scriptById: ReadonlyMap<string, LessonZeroInputScript>,
): void {
    const vowelScript = activityInputScript(lesson, 'activity:lesson-zero-vowel-listen', scriptById);
    if (!vowelScript || vowelScript.kind !== 'sound-sequence') {
        fail('Lesson 0 vowel listening must use its own sound-sequence script.');
    }
    const vowelTranscript = vowelScript.lines.map(line => line.japanese).join('')
        .replace(/[\s・、。]/gu, '');
    if (vowelTranscript !== 'あいうえお') fail('Lesson 0 vowel script must contain the exact ordered vowel row.');
}

function validateSpeakingActivityContract(
    lesson: LessonZeroDefinition,
    scriptById: ReadonlyMap<string, LessonZeroInputScript>,
): void {
    const speakingScript = requiredSpeakingScript(
        activityInputScript(lesson, 'activity:lesson-zero-speaking-input', scriptById),
    );
    const learnerTurn = speakingScript.learnerTurns?.find(turn => turn.capture.evidenceKind === 'spoken-turn');
    if (!learnerTurn) fail('Lesson 0 speaking input needs an Aakash cue followed by an authored learner turn.');
    const cueLine = speakingScript.lines.find(line => line.id === learnerTurn.afterLineId);
    if (!cueLine || cueLine.speakerId !== 'aakash') {
        fail('Lesson 0 speaking input needs an Aakash cue followed by an authored learner turn.');
    }
}

function requiredSpeakingScript(script: LessonZeroInputScript | undefined): LessonZeroInputScript {
    if (!script) fail('Lesson 0 speaking input needs an Aakash cue followed by an authored learner turn.');
    return script;
}

function activityInputScript(
    lesson: LessonZeroDefinition,
    activityId: string,
    scriptById: ReadonlyMap<string, LessonZeroInputScript>,
): LessonZeroInputScript | undefined {
    const activity = lesson.activities.find(candidate => candidate.id === activityId);
    return activity?.inputScriptId ? scriptById.get(activity.inputScriptId) : undefined;
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
        validateAudioAsset(asset, blockerById);
    }
    for (const script of scripts) if (!assetById.has(script.audioAssetId)) fail(`Script ${script.id} references unknown audio ${script.audioAssetId}.`);
    for (const blocker of blockerById.values()) {
        validateAudioBlocker(blocker, assetById);
    }
}

function validateAudioAsset(
    asset: LessonZeroAudioAsset,
    blockerById: ReadonlyMap<string, LessonZeroReleaseBlocker>,
): void {
    if (asset.browserTtsAllowed !== false || asset.learnerVisiblePlaceholder !== false) fail(`Audio ${asset.id} permits a fake or learner-visible fallback.`);
    if (asset.state === 'ready') {
        if (!asset.runtimeUrl || asset.verifiedPairing !== true) fail(`Ready audio ${asset.id} lacks a verified pairing.`);
        return;
    }
    if (asset.runtimeUrl) fail(`Blocked audio ${asset.id} must not expose an unverified runtime file.`);
    if (!asset.blockerId || !blockerById.has(asset.blockerId)) fail(`Blocked audio ${asset.id} lacks an internal blocker.`);
}

function validateAudioBlocker(
    blocker: LessonZeroReleaseBlocker,
    assetById: ReadonlyMap<string, LessonZeroAudioAsset>,
): void {
    if (blocker.kind !== 'audio' || blocker.learnerVisible !== false) fail(`Release blocker ${blocker.id} is not internal audio state.`);
    for (const assetId of blocker.assetIds) {
        if (!assetById.has(assetId)) fail(`Release blocker ${blocker.id} references unknown audio ${assetId}.`);
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

function localized(value: unknown, label: string): void {
    const copy = record(value, label) as Readonly<Record<'en' | 'ja', unknown>>;
    text(copy.en, `${label}.en`);
    text(copy.ja, `${label}.ja`);
}

function hasAssessedSupport(value: unknown): value is AssessedSupportContract {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const support = value as Partial<Record<keyof AssessedSupportContract, unknown>>;
    const keys = Object.keys(ASSESSED_SUPPORT) as Array<keyof AssessedSupportContract>;
    return Object.keys(value).length === keys.length
        && keys.every(key => support[key] === ASSESSED_SUPPORT[key]);
}

function fail(message: string): never {
    throw new TypeError(message);
}
