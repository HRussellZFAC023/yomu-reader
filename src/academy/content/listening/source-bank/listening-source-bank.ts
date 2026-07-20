import manifestJson from './listening-source-bank.v1.json';

export type JlptListeningLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1';
export type ListeningSourceFamily = 'moodle' | 'soya' | 'minna' | 'genki' | 'jlpt-library';
export type ListeningReleaseState = 'quarantined' | 'rights-review-required' | 'approved';

export interface ListeningSourceBankPolicy {
    readonly purpose: string;
    readonly transcriptCanonicalFormat: 'speaker-tab-text-lines-v1';
    readonly releaseRule: string;
    readonly answerReveal: 'after-attempt';
    readonly transcriptReveal: 'after-attempt';
}

export interface ListeningInventoryFamily {
    readonly id: ListeningSourceFamily;
    readonly kind: 'course-archive-inventory' | 'directory' | 'archive';
    readonly rootLocator: string;
    readonly archiveSha256?: string;
    readonly facts: Readonly<Record<string, number>>;
    readonly selected: {
        readonly recordings: number;
        readonly tasks: number;
    };
    readonly rights: string;
    readonly runtime: 'inventory-only' | 'excluded-no-verified-pairing';
}

export interface ListeningSourceBankInventory {
    readonly reviewedOn: string;
    readonly inventoryRef: string;
    readonly sourceBankCoverage: {
        readonly recordings: number;
        readonly tasks: number;
    };
    readonly sourceFamilies: Readonly<Record<ListeningSourceFamily, ListeningInventoryFamily>>;
}

export interface ListeningAudioSource {
    readonly assetId: string;
    readonly localPath: string;
    readonly originRef: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly mediaType: 'audio/mpeg';
    readonly codec: 'mp3';
    readonly durationSeconds: number;
    readonly sampleRateHz: number;
    readonly channels: number;
}

export interface ListeningPairingEvidence {
    readonly kind: 'task-source' | 'transcript-source' | 'archive-container';
    readonly path: string;
    readonly sha256: string;
    readonly locus: string;
}

export interface VerifiedListeningPairing {
    readonly status: 'verified';
    readonly method: string;
    readonly evidence: readonly ListeningPairingEvidence[];
}

export interface ListeningTranscriptLine {
    readonly speaker: string;
    readonly text: string;
}

interface ListeningTranscriptCoverage {
    readonly taskId: string;
    readonly lineNumbers: readonly number[];
}

interface ListeningTranscriptBase {
    readonly format: 'speaker-tab-text-lines-v1';
    readonly sha256: string;
    readonly lineCount: number;
    readonly coverage: readonly ListeningTranscriptCoverage[];
}

export interface InlineListeningTranscript extends ListeningTranscriptBase {
    readonly storage: 'inline';
    readonly lines: readonly ListeningTranscriptLine[];
}

export interface LocalListeningTranscript extends ListeningTranscriptBase {
    readonly storage: 'local-sidecar';
    readonly localPath: string;
    readonly localFileSha256: string;
}

export type ListeningTranscript = InlineListeningTranscript | LocalListeningTranscript;

type ListeningTaskRegistry = Readonly<{
    status: 'existing-binding';
    packageId: string;
    sourceQuestionId: string;
}> | Readonly<{
    status: 'awaiting-package-placement';
}>;

interface ListeningTaskBase {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly prompt: string;
    readonly registry: ListeningTaskRegistry;
}

export interface SingleChoiceListeningTask extends ListeningTaskBase {
    readonly kind: 'single-choice';
    readonly choices: readonly Readonly<{ id: string; label: string }>[];
    readonly answer: Readonly<{ choiceId: string }>;
}

export interface ShortAnswerListeningTask extends ListeningTaskBase {
    readonly kind: 'short-answer';
    readonly answer: Readonly<{ accepted: readonly string[] }>;
}

export type ListeningSourceBankTask = SingleChoiceListeningTask | ShortAnswerListeningTask;

export type ListeningSourceRelease = Readonly<{
    state: 'quarantined' | 'rights-review-required';
    reason: string;
}> | Readonly<{
    state: 'approved';
    reason: string;
    approval: Readonly<{
        authority: string;
        approvedOn: string;
        evidenceRef: string;
    }>;
    worker: Readonly<{
        assetId: string;
        purpose: 'audio';
        access: 'academy-session-or-signed';
    }>;
}>;

export interface ListeningSourceBankEntry {
    readonly id: string;
    readonly level: JlptListeningLevel;
    readonly title: string;
    readonly sourceFamily: Exclude<ListeningSourceFamily, 'genki'>;
    readonly instruction: string;
    readonly source: ListeningAudioSource;
    readonly pairing: VerifiedListeningPairing;
    readonly learnerContract: Readonly<{
        answerReveal: 'after-attempt';
        transcriptReveal: 'after-attempt';
        hintReveal: 'after-attempt';
        grading: 'deterministic';
    }>;
    readonly transcript: ListeningTranscript;
    readonly tasks: readonly ListeningSourceBankTask[];
    readonly release: ListeningSourceRelease;
}

export interface ListeningSourceExclusion {
    readonly id: string;
    readonly sourceFamily: ListeningSourceFamily;
    readonly scope: string;
    readonly reason: string;
    readonly blockedBy: readonly string[];
}

export interface ListeningSourceBankManifest {
    readonly schema: 'yomu-academy.listening-source-bank/v1';
    readonly policy: ListeningSourceBankPolicy;
    readonly inventory: ListeningSourceBankInventory;
    readonly levels: Readonly<Record<JlptListeningLevel, ListeningSourceBankEntry>>;
    readonly exclusions: readonly ListeningSourceExclusion[];
}

export type ListeningSourceBankResolution = Readonly<{
    status: 'ready';
    entry: ListeningSourceBankEntry;
    resource: Readonly<{
        assetId: string;
        kind: 'audio';
        mediaType: 'audio/mpeg';
        readiness: Readonly<{ state: 'ready' }>;
    }>;
}> | Readonly<{
    status: 'blocked';
    entry: ListeningSourceBankEntry;
    releaseState: Exclude<ListeningReleaseState, 'approved'>;
    reason: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9:-]{0,159}$/u;
const SAFE_WORKER_ASSET_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const LEVELS = Object.freeze(['n5', 'n4', 'n3', 'n2', 'n1'] as const);
const SOURCE_FAMILIES = Object.freeze(['moodle', 'soya', 'minna', 'genki', 'jlpt-library'] as const);

export const JLPT_LISTENING_PROGRESSION: readonly JlptListeningLevel[] = LEVELS;
export const ACADEMY_LISTENING_SOURCE_BANK = parseListeningSourceBankManifest(manifestJson);

const ENTRY_BY_ID = new Map(JLPT_LISTENING_PROGRESSION.map(level => {
    const entry = ACADEMY_LISTENING_SOURCE_BANK.levels[level];
    return [entry.id, entry] as const;
}));

/** Parse and freeze a source-bank manifest. Unknown states and incomplete evidence fail closed. */
export function parseListeningSourceBankManifest(value: unknown): ListeningSourceBankManifest {
    const root = record(value, 'Listening source bank');
    if (root.schema !== 'yomu-academy.listening-source-bank/v1') {
        throw new TypeError('Listening source bank must declare the v1 schema.');
    }
    const policy = parsePolicy(root.policy);
    const inventory = parseInventory(root.inventory);
    const levels = parseLevels(root.levels);
    const exclusions = array(root.exclusions, 'exclusions').map((item, index) => parseExclusion(item, `exclusions[${index}]`));

    unique(exclusions.map(item => item.id), 'Listening source-bank exclusion ids');
    validateWholeBank(inventory, levels, exclusions);

    return deepFreeze({
        schema: 'yomu-academy.listening-source-bank/v1',
        policy,
        inventory,
        levels,
        exclusions,
    });
}

/** Return the five entries in deliberate learner progression, independent of JSON object order. */
export function listListeningSourceBankEntries(): readonly ListeningSourceBankEntry[] {
    return Object.freeze(JLPT_LISTENING_PROGRESSION.map(level => ACADEMY_LISTENING_SOURCE_BANK.levels[level]));
}

export function getListeningSourceBankEntry(level: JlptListeningLevel): ListeningSourceBankEntry {
    return ACADEMY_LISTENING_SOURCE_BANK.levels[level];
}

export function findListeningSourceBankEntry(id: string): ListeningSourceBankEntry | undefined {
    return ENTRY_BY_ID.get(id);
}

export function listListeningSourceBankExclusions(sourceFamily?: ListeningSourceFamily): readonly ListeningSourceExclusion[] {
    const exclusions = sourceFamily === undefined
        ? ACADEMY_LISTENING_SOURCE_BANK.exclusions
        : ACADEMY_LISTENING_SOURCE_BANK.exclusions.filter(item => item.sourceFamily === sourceFamily);
    return Object.freeze([...exclusions]);
}

/** Canonical UTF-8 payload used by transcript SHA-256 evidence. */
export function canonicalListeningTranscriptText(lines: readonly ListeningTranscriptLine[]): string {
    return lines.map(line => `${line.speaker}\t${line.text}`).join('\n');
}

/** Hand approved entries to the authenticated media router; blocked entries never manufacture a URL. */
export function resolveListeningSourceBankEntry(entry: ListeningSourceBankEntry): ListeningSourceBankResolution {
    if (entry.release.state !== 'approved') {
        return {
            status: 'blocked',
            entry,
            releaseState: entry.release.state,
            reason: entry.release.reason,
        };
    }
    return {
        status: 'ready',
        entry,
        resource: {
            assetId: entry.release.worker.assetId,
            kind: 'audio',
            mediaType: entry.source.mediaType,
            readiness: { state: 'ready' },
        },
    };
}

export function resolveListeningSourceBankLevel(level: JlptListeningLevel): ListeningSourceBankResolution {
    return resolveListeningSourceBankEntry(getListeningSourceBankEntry(level));
}

function parsePolicy(value: unknown): ListeningSourceBankPolicy {
    const policy = record(value, 'policy');
    if (policy.transcriptCanonicalFormat !== 'speaker-tab-text-lines-v1'
        || policy.answerReveal !== 'after-attempt'
        || policy.transcriptReveal !== 'after-attempt') {
        throw new TypeError('Listening source-bank policy has an unsupported learner or transcript contract.');
    }
    return {
        purpose: text(policy.purpose, 'policy.purpose'),
        transcriptCanonicalFormat: 'speaker-tab-text-lines-v1',
        releaseRule: text(policy.releaseRule, 'policy.releaseRule'),
        answerReveal: 'after-attempt',
        transcriptReveal: 'after-attempt',
    };
}

function parseInventory(value: unknown): ListeningSourceBankInventory {
    const inventory = record(value, 'inventory');
    const coverage = record(inventory.sourceBankCoverage, 'inventory.sourceBankCoverage');
    const families = record(inventory.sourceFamilies, 'inventory.sourceFamilies');
    exactKeys(families, SOURCE_FAMILIES, 'inventory.sourceFamilies');

    const sourceFamilies = Object.fromEntries(SOURCE_FAMILIES.map(family => [
        family,
        parseInventoryFamily(families[family], family),
    ])) as Record<ListeningSourceFamily, ListeningInventoryFamily>;

    if (sourceFamilies.genki.selected.recordings !== 0 || sourceFamilies.genki.selected.tasks !== 0) {
        throw new TypeError('Genki cannot enter the source bank without a verified task pairing.');
    }
    return {
        reviewedOn: date(inventory.reviewedOn, 'inventory.reviewedOn'),
        inventoryRef: text(inventory.inventoryRef, 'inventory.inventoryRef'),
        sourceBankCoverage: {
            recordings: positiveInteger(coverage.recordings, 'inventory.sourceBankCoverage.recordings'),
            tasks: positiveInteger(coverage.tasks, 'inventory.sourceBankCoverage.tasks'),
        },
        sourceFamilies,
    };
}

function parseInventoryFamily(value: unknown, family: ListeningSourceFamily): ListeningInventoryFamily {
    const item = record(value, `inventory.sourceFamilies.${family}`);
    if (item.id !== family) throw new TypeError(`Inventory family ${family} has a mismatched id.`);
    if (item.kind !== 'course-archive-inventory' && item.kind !== 'directory' && item.kind !== 'archive') {
        throw new TypeError(`Inventory family ${family} has an unsupported source kind.`);
    }
    if (item.runtime !== 'inventory-only' && item.runtime !== 'excluded-no-verified-pairing') {
        throw new TypeError(`Inventory family ${family} has an unsupported runtime state.`);
    }
    const factsValue = record(item.facts, `inventory.sourceFamilies.${family}.facts`);
    const factEntries = Object.entries(factsValue);
    if (factEntries.length === 0) throw new TypeError(`Inventory family ${family} must report numeric facts.`);
    const facts = Object.fromEntries(factEntries.map(([key, fact]) => [
        text(key, `inventory.sourceFamilies.${family}.facts key`),
        nonNegativeInteger(fact, `inventory.sourceFamilies.${family}.facts.${key}`),
    ]));
    const selected = record(item.selected, `inventory.sourceFamilies.${family}.selected`);
    const archiveSha256 = item.archiveSha256 === undefined
        ? undefined
        : hash(item.archiveSha256, `inventory.sourceFamilies.${family}.archiveSha256`);
    if (item.kind === 'archive' && archiveSha256 === undefined) {
        throw new TypeError(`Archive inventory family ${family} must record its archive SHA-256.`);
    }
    return {
        id: family,
        kind: item.kind,
        rootLocator: text(item.rootLocator, `inventory.sourceFamilies.${family}.rootLocator`),
        ...(archiveSha256 === undefined ? {} : { archiveSha256 }),
        facts,
        selected: {
            recordings: nonNegativeInteger(selected.recordings, `inventory.sourceFamilies.${family}.selected.recordings`),
            tasks: nonNegativeInteger(selected.tasks, `inventory.sourceFamilies.${family}.selected.tasks`),
        },
        rights: text(item.rights, `inventory.sourceFamilies.${family}.rights`),
        runtime: item.runtime,
    };
}

function parseLevels(value: unknown): Record<JlptListeningLevel, ListeningSourceBankEntry> {
    const levels = record(value, 'levels');
    exactKeys(levels, LEVELS, 'levels');
    return Object.fromEntries(LEVELS.map(level => [level, parseEntry(levels[level], level)])) as Record<JlptListeningLevel, ListeningSourceBankEntry>;
}

function parseEntry(value: unknown, level: JlptListeningLevel): ListeningSourceBankEntry {
    const item = record(value, `levels.${level}`);
    if (item.level !== level) throw new TypeError(`Listening entry ${level} has a mismatched level.`);
    if (item.sourceFamily !== 'moodle' && item.sourceFamily !== 'soya'
        && item.sourceFamily !== 'minna' && item.sourceFamily !== 'jlpt-library') {
        throw new TypeError(`Listening entry ${level} has an unsupported or unverified source family.`);
    }
    const tasks = array(item.tasks, `levels.${level}.tasks`).map((task, index) => parseTask(task, `levels.${level}.tasks[${index}]`));
    if (tasks.length === 0) throw new TypeError(`Listening entry ${level} must contain at least one task.`);
    unique(tasks.map(task => task.id), `Listening entry ${level} task ids`);
    unique(tasks.map(task => task.sourceQuestionId), `Listening entry ${level} source question ids`);

    const source = parseAudioSource(item.source, `levels.${level}.source`);
    const release = parseRelease(item.release, `levels.${level}.release`);
    if (release.state === 'approved' && release.worker.assetId !== source.assetId) {
        throw new TypeError(`Approved listening entry ${level} must use its verified source asset id.`);
    }
    return {
        id: safeId(item.id, `levels.${level}.id`),
        level,
        title: text(item.title, `levels.${level}.title`),
        sourceFamily: item.sourceFamily,
        instruction: text(item.instruction, `levels.${level}.instruction`),
        source,
        pairing: parsePairing(item.pairing, `levels.${level}.pairing`),
        learnerContract: parseLearnerContract(item.learnerContract, `levels.${level}.learnerContract`),
        transcript: parseTranscript(item.transcript, tasks, `levels.${level}.transcript`),
        tasks,
        release,
    };
}

function parseAudioSource(value: unknown, owner: string): ListeningAudioSource {
    const source = record(value, owner);
    if (source.mediaType !== 'audio/mpeg' || source.codec !== 'mp3') {
        throw new TypeError(`${owner} must identify an MP3 source.`);
    }
    const localPath = text(source.localPath, `${owner}.localPath`);
    if (!localPath.startsWith('/') || localPath.includes('\0')) {
        throw new TypeError(`${owner}.localPath must be an absolute local source path.`);
    }
    return {
        assetId: safeWorkerAssetId(source.assetId, `${owner}.assetId`),
        localPath,
        originRef: text(source.originRef, `${owner}.originRef`),
        sha256: hash(source.sha256, `${owner}.sha256`),
        bytes: positiveInteger(source.bytes, `${owner}.bytes`),
        mediaType: 'audio/mpeg',
        codec: 'mp3',
        durationSeconds: positiveNumber(source.durationSeconds, `${owner}.durationSeconds`),
        sampleRateHz: positiveInteger(source.sampleRateHz, `${owner}.sampleRateHz`),
        channels: positiveInteger(source.channels, `${owner}.channels`),
    };
}

function parsePairing(value: unknown, owner: string): VerifiedListeningPairing {
    const pairing = record(value, owner);
    if (pairing.status !== 'verified') throw new TypeError(`${owner} must be explicitly verified.`);
    const evidence = array(pairing.evidence, `${owner}.evidence`).map((item, index) => {
        const recordValue = record(item, `${owner}.evidence[${index}]`);
        if (recordValue.kind !== 'task-source' && recordValue.kind !== 'transcript-source'
            && recordValue.kind !== 'archive-container') {
            throw new TypeError(`${owner}.evidence[${index}] has an unsupported kind.`);
        }
        const kind: ListeningPairingEvidence['kind'] = recordValue.kind;
        return {
            kind,
            path: text(recordValue.path, `${owner}.evidence[${index}].path`),
            sha256: hash(recordValue.sha256, `${owner}.evidence[${index}].sha256`),
            locus: text(recordValue.locus, `${owner}.evidence[${index}].locus`),
        };
    });
    if (!evidence.some(item => item.kind === 'task-source') || !evidence.some(item => item.kind === 'transcript-source')) {
        throw new TypeError(`${owner} must cite both task and transcript evidence.`);
    }
    unique(evidence.map(item => `${item.path}#${item.locus}`), `${owner} evidence loci`);
    return { status: 'verified', method: text(pairing.method, `${owner}.method`), evidence };
}

function parseLearnerContract(value: unknown, owner: string): ListeningSourceBankEntry['learnerContract'] {
    const contract = record(value, owner);
    if (contract.answerReveal !== 'after-attempt' || contract.transcriptReveal !== 'after-attempt'
        || contract.hintReveal !== 'after-attempt' || contract.grading !== 'deterministic') {
        throw new TypeError(`${owner} must gate support until after an attempt and grade deterministically.`);
    }
    return {
        answerReveal: 'after-attempt',
        transcriptReveal: 'after-attempt',
        hintReveal: 'after-attempt',
        grading: 'deterministic',
    };
}

function parseTranscript(value: unknown, tasks: readonly ListeningSourceBankTask[], owner: string): ListeningTranscript {
    const transcript = record(value, owner);
    if (transcript.format !== 'speaker-tab-text-lines-v1') {
        throw new TypeError(`${owner} has an unsupported canonical format.`);
    }
    const lineCount = positiveInteger(transcript.lineCount, `${owner}.lineCount`);
    const coverage = array(transcript.coverage, `${owner}.coverage`).map((item, index) => {
        const coverageItem = record(item, `${owner}.coverage[${index}]`);
        const lineNumbers = array(coverageItem.lineNumbers, `${owner}.coverage[${index}].lineNumbers`)
            .map((line, lineIndex) => positiveInteger(line, `${owner}.coverage[${index}].lineNumbers[${lineIndex}]`));
        if (lineNumbers.some(line => line > lineCount)) throw new TypeError(`${owner} coverage exceeds its transcript length.`);
        unique(lineNumbers, `${owner}.coverage[${index}] line numbers`);
        return {
            taskId: safeId(coverageItem.taskId, `${owner}.coverage[${index}].taskId`),
            lineNumbers,
        };
    });
    unique(coverage.map(item => item.taskId), `${owner} task coverage`);
    const taskIds = new Set(tasks.map(task => task.id));
    if (coverage.length !== tasks.length || coverage.some(item => !taskIds.has(item.taskId))) {
        throw new TypeError(`${owner} must cover every task exactly once.`);
    }
    const base = {
        format: 'speaker-tab-text-lines-v1' as const,
        sha256: hash(transcript.sha256, `${owner}.sha256`),
        lineCount,
        coverage,
    };
    if (transcript.storage === 'inline') {
        if (transcript.localPath !== undefined || transcript.localFileSha256 !== undefined) {
            throw new TypeError(`${owner} cannot mix inline and local-sidecar storage.`);
        }
        const lines = array(transcript.lines, `${owner}.lines`).map((item, index) => {
            const line = record(item, `${owner}.lines[${index}]`);
            return {
                speaker: text(line.speaker, `${owner}.lines[${index}].speaker`),
                text: text(line.text, `${owner}.lines[${index}].text`),
            };
        });
        if (lines.length !== lineCount) throw new TypeError(`${owner}.lineCount does not match its inline lines.`);
        return { ...base, storage: 'inline', lines };
    }
    if (transcript.storage !== 'local-sidecar' || transcript.lines !== undefined) {
        throw new TypeError(`${owner} has an unsupported or mixed transcript storage mode.`);
    }
    const localPath = safeSidecarPath(transcript.localPath, `${owner}.localPath`);
    return {
        ...base,
        storage: 'local-sidecar',
        localPath,
        localFileSha256: hash(transcript.localFileSha256, `${owner}.localFileSha256`),
    };
}

function parseTask(value: unknown, owner: string): ListeningSourceBankTask {
    const task = record(value, owner);
    const base = {
        id: safeId(task.id, `${owner}.id`),
        sourceQuestionId: text(task.sourceQuestionId, `${owner}.sourceQuestionId`),
        prompt: text(task.prompt, `${owner}.prompt`),
        registry: parseTaskRegistry(task.registry, `${owner}.registry`),
    };
    const answer = record(task.answer, `${owner}.answer`);
    if (task.kind === 'single-choice') {
        const choices = array(task.choices, `${owner}.choices`).map((item, index) => {
            const choice = record(item, `${owner}.choices[${index}]`);
            return {
                id: safeId(choice.id, `${owner}.choices[${index}].id`),
                label: text(choice.label, `${owner}.choices[${index}].label`),
            };
        });
        if (choices.length < 2) throw new TypeError(`${owner} must offer at least two choices.`);
        unique(choices.map(choice => choice.id), `${owner} choice ids`);
        const choiceId = safeId(answer.choiceId, `${owner}.answer.choiceId`);
        if (!choices.some(choice => choice.id === choiceId)) throw new TypeError(`${owner} answers an unknown choice.`);
        return { ...base, kind: 'single-choice', choices, answer: { choiceId } };
    }
    if (task.kind !== 'short-answer' || task.choices !== undefined) {
        throw new TypeError(`${owner} has an unsupported task kind or choices on a short answer.`);
    }
    const accepted = stringArray(answer.accepted, `${owner}.answer.accepted`);
    unique(accepted, `${owner} accepted answers`);
    return { ...base, kind: 'short-answer', answer: { accepted } };
}

function parseTaskRegistry(value: unknown, owner: string): ListeningTaskRegistry {
    const registry = record(value, owner);
    if (registry.status === 'existing-binding') {
        return {
            status: 'existing-binding',
            packageId: text(registry.packageId, `${owner}.packageId`),
            sourceQuestionId: text(registry.sourceQuestionId, `${owner}.sourceQuestionId`),
        };
    }
    if (registry.status !== 'awaiting-package-placement'
        || registry.packageId !== undefined || registry.sourceQuestionId !== undefined) {
        throw new TypeError(`${owner} has an unsupported or incomplete registry state.`);
    }
    return { status: 'awaiting-package-placement' };
}

function parseRelease(value: unknown, owner: string): ListeningSourceRelease {
    const release = record(value, owner);
    const reason = text(release.reason, `${owner}.reason`);
    if (release.state === 'quarantined' || release.state === 'rights-review-required') {
        if (release.approval !== undefined || release.worker !== undefined) {
            throw new TypeError(`${owner} cannot carry approval or delivery while blocked.`);
        }
        return { state: release.state, reason };
    }
    if (release.state !== 'approved') throw new TypeError(`${owner} has an unknown release state.`);
    const approval = record(release.approval, `${owner}.approval`);
    const worker = record(release.worker, `${owner}.worker`);
    if (worker.purpose !== 'audio' || worker.access !== 'academy-session-or-signed') {
        throw new TypeError(`${owner} has an unsafe Worker delivery contract.`);
    }
    return {
        state: 'approved',
        reason,
        approval: {
            authority: text(approval.authority, `${owner}.approval.authority`),
            approvedOn: date(approval.approvedOn, `${owner}.approval.approvedOn`),
            evidenceRef: text(approval.evidenceRef, `${owner}.approval.evidenceRef`),
        },
        worker: {
            assetId: safeWorkerAssetId(worker.assetId, `${owner}.worker.assetId`),
            purpose: 'audio',
            access: 'academy-session-or-signed',
        },
    };
}

function parseExclusion(value: unknown, owner: string): ListeningSourceExclusion {
    const exclusion = record(value, owner);
    if (!SOURCE_FAMILIES.includes(exclusion.sourceFamily as ListeningSourceFamily)) {
        throw new TypeError(`${owner} has an unknown source family.`);
    }
    return {
        id: safeId(exclusion.id, `${owner}.id`),
        sourceFamily: exclusion.sourceFamily as ListeningSourceFamily,
        scope: text(exclusion.scope, `${owner}.scope`),
        reason: text(exclusion.reason, `${owner}.reason`),
        blockedBy: stringArray(exclusion.blockedBy, `${owner}.blockedBy`),
    };
}

function validateWholeBank(
    inventory: ListeningSourceBankInventory,
    levels: Readonly<Record<JlptListeningLevel, ListeningSourceBankEntry>>,
    exclusions: readonly ListeningSourceExclusion[],
): void {
    const entries = LEVELS.map(level => levels[level]);
    unique(entries.map(entry => entry.id), 'Listening source-bank entry ids');
    unique(entries.map(entry => entry.source.assetId), 'Listening source-bank asset ids');
    unique(entries.map(entry => entry.source.localPath), 'Listening source-bank local source paths');
    unique(entries.map(entry => entry.source.sha256), 'Listening source-bank audio hashes');
    unique(entries.flatMap(entry => entry.tasks.map(task => task.id)), 'Listening source-bank task ids');

    const selected = new Map<ListeningSourceFamily, { recordings: number; tasks: number }>(
        SOURCE_FAMILIES.map(family => [family, { recordings: 0, tasks: 0 }]),
    );
    for (const entry of entries) {
        const count = selected.get(entry.sourceFamily);
        if (!count) throw new TypeError(`Missing inventory family ${entry.sourceFamily}.`);
        count.recordings += 1;
        count.tasks += entry.tasks.length;
    }
    for (const family of SOURCE_FAMILIES) {
        const actual = selected.get(family);
        const declared = inventory.sourceFamilies[family].selected;
        if (!actual || actual.recordings !== declared.recordings || actual.tasks !== declared.tasks) {
            throw new TypeError(`Inventory selection counts do not match source-bank family ${family}.`);
        }
    }
    const taskCount = entries.reduce((total, entry) => total + entry.tasks.length, 0);
    if (inventory.sourceBankCoverage.recordings !== entries.length || inventory.sourceBankCoverage.tasks !== taskCount) {
        throw new TypeError('Listening source-bank coverage totals do not match its entries.');
    }
    const genkiExclusion = exclusions.find(item => item.sourceFamily === 'genki');
    if (!genkiExclusion || !genkiExclusion.blockedBy.includes('task-pairing-unverified')) {
        throw new TypeError('The zero-pairing Genki inventory must remain honestly excluded.');
    }
}

function safeSidecarPath(value: unknown, label: string): string {
    const result = text(value, label);
    if (!result.startsWith('tmp/listening-source-bank/transcripts/')
        || !result.endsWith('.json') || result.split('/').includes('..')) {
        throw new TypeError(`${label} must stay in the ignored local transcript directory.`);
    }
    return result;
}

function safeId(value: unknown, label: string): string {
    const result = text(value, label);
    if (!SAFE_ID.test(result)) throw new TypeError(`${label} contains unsafe characters.`);
    return result;
}

function safeWorkerAssetId(value: unknown, label: string): string {
    const result = text(value, label);
    if (!SAFE_WORKER_ASSET_ID.test(result)) throw new TypeError(`${label} is not a safe opaque Worker asset id.`);
    return result;
}

function hash(value: unknown, label: string): string {
    const result = text(value, label);
    if (!SHA256.test(result)) throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
    return result;
}

function date(value: unknown, label: string): string {
    const result = text(value, label);
    if (!ISO_DATE.test(result)) throw new TypeError(`${label} must be an ISO calendar date.`);
    return result;
}

function stringArray(value: unknown, label: string): readonly string[] {
    const values = array(value, label).map((item, index) => text(item, `${label}[${index}]`));
    if (values.length === 0) throw new TypeError(`${label} must not be empty.`);
    return values;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[], label: string): void {
    const expectedKeys = new Set(expected);
    const actualKeys = Object.keys(value);
    if (actualKeys.length !== expected.length || actualKeys.some(key => !expectedKeys.has(key))) {
        throw new TypeError(`${label} must contain exactly: ${expected.join(', ')}.`);
    }
}

function unique(values: readonly (string | number)[], label: string): void {
    if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique.`);
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value;
}

function positiveNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be positive.`);
    return value;
}

function positiveInteger(value: unknown, label: string): number {
    const result = positiveNumber(value, label);
    if (!Number.isInteger(result)) throw new TypeError(`${label} must be an integer.`);
    return result;
}

function nonNegativeInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative integer.`);
    }
    return value;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function deepFreeze<T>(value: T): T {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}
