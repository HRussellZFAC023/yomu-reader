import type { PrivacySafeLibraryResource } from '../../media/library-media-types';
import manifestJson from '../../../../public/academy/content/listening/listening-crosswalk.v1.json';

export type ListeningAvailability = 'source-verified' | 'unavailable';

export interface ListeningSourceEvidence {
    readonly corpus: 'soya' | 'moodle' | 'minna';
    readonly repositoryRelativePath: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly mediaType: 'audio/mpeg';
    readonly codec: 'mp3';
    readonly durationSeconds: number;
    readonly sampleRateHz: number;
    readonly channels: number;
    readonly questionMapRef: string;
}

export interface WorkerListeningDelivery {
    readonly assetId: string;
    readonly purpose: 'audio';
    readonly access: 'academy-session-or-signed';
}

export interface PackagedStaticListeningDelivery {
    readonly mode: 'packaged-static';
    readonly url: string;
}

interface ListeningEntryBase {
    readonly locator: string;
    readonly authoredAssetId: string;
    readonly provenance: readonly string[];
}

export interface SourceVerifiedListeningEntry extends ListeningEntryBase {
    readonly availability: 'source-verified';
    readonly source: ListeningSourceEvidence;
    readonly worker: WorkerListeningDelivery;
    readonly delivery?: PackagedStaticListeningDelivery;
}

export interface UnavailableListeningEntry extends ListeningEntryBase {
    readonly availability: 'unavailable';
    readonly reason: 'no-recording-matching-authored-script' | 'authored-locator-no-runtime-source';
    readonly authoredScriptSha256?: string;
    readonly expectedDurationSeconds?: number;
}

export type ListeningCrosswalkEntry = SourceVerifiedListeningEntry | UnavailableListeningEntry;

export interface ListeningCrosswalkManifest {
    readonly schema: 'yomu-academy.listening-crosswalk.v1';
    readonly entries: readonly ListeningCrosswalkEntry[];
}

export type ListeningLocatorResolution =
    | Readonly<{
        status: 'source-verified';
        entry: SourceVerifiedListeningEntry;
        resource: PrivacySafeLibraryResource;
    }>
    | Readonly<{
        status: 'unavailable';
        entry: UnavailableListeningEntry;
    }>
    | Readonly<{
        status: 'unavailable';
        locator: string;
        reason: 'locator-not-authored';
    }>;

export type PackagedListeningResolution =
    | Readonly<{ status: 'ready'; entry: SourceVerifiedListeningEntry; url: string }>
    | Readonly<{ status: 'unavailable'; locator: string }>;

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_WORKER_ASSET_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function parseListeningCrosswalk(value: unknown): ListeningCrosswalkManifest {
    if (!isRecord(value) || value.schema !== 'yomu-academy.listening-crosswalk.v1' || !Array.isArray(value.entries)) {
        throw new TypeError('Listening crosswalk must declare the v1 schema and an entries array.');
    }
    const entries = value.entries.map(parseEntry);
    const locators = entries.map(entry => entry.locator);
    if (new Set(locators).size !== locators.length) throw new TypeError('Listening crosswalk locators must be unique.');
    return { schema: 'yomu-academy.listening-crosswalk.v1', entries };
}

export const ACADEMY_LISTENING_CROSSWALK = parseListeningCrosswalk(manifestJson);

const ENTRY_BY_LOCATOR = new Map(ACADEMY_LISTENING_CROSSWALK.entries.map(entry => [entry.locator, entry]));

/** Resolve an authored locator without inventing a URL or silently substituting unrelated audio. */
export function resolveAcademyListeningLocator(locator: string): ListeningLocatorResolution {
    const entry = ENTRY_BY_LOCATOR.get(locator);
    if (!entry) return { status: 'unavailable', locator, reason: 'locator-not-authored' };
    if (entry.availability === 'unavailable') return { status: 'unavailable', entry };
    return {
        status: 'source-verified',
        entry,
        resource: {
            assetId: entry.worker.assetId,
            kind: 'audio',
            mediaType: entry.source.mediaType,
            readiness: { state: 'ready' },
        },
    };
}

/** Resolve only explicitly packaged local media; source identity alone never enables a browser URL. */
export function resolvePackagedAcademyListeningLocator(locator: string): PackagedListeningResolution {
    const resolved = resolveAcademyListeningLocator(locator);
    if (resolved.status !== 'source-verified' || !resolved.entry.delivery) return { status: 'unavailable', locator };
    return { status: 'ready', entry: resolved.entry, url: resolved.entry.delivery.url };
}

function parseEntry(value: unknown): ListeningCrosswalkEntry {
    if (!isRecord(value)) throw new TypeError('Listening crosswalk entry must be an object.');
    const locator = requiredText(value.locator, 'locator');
    const authoredAssetId = requiredText(value.authoredAssetId, `${locator}.authoredAssetId`);
    const provenance = stringArray(value.provenance, `${locator}.provenance`);
    if (value.availability === 'unavailable') {
        if (value.reason !== 'no-recording-matching-authored-script' && value.reason !== 'authored-locator-no-runtime-source') {
            throw new TypeError(`Unavailable listening entry ${locator} has an unsupported reason.`);
        }
        if (value.reason === 'authored-locator-no-runtime-source') {
            return { locator, authoredAssetId, availability: 'unavailable', reason: value.reason, provenance };
        }
        return {
            locator,
            authoredAssetId,
            availability: 'unavailable',
            reason: value.reason,
            authoredScriptSha256: hash(value.authoredScriptSha256, `${locator}.authoredScriptSha256`),
            expectedDurationSeconds: positiveNumber(value.expectedDurationSeconds, `${locator}.expectedDurationSeconds`),
            provenance,
        };
    }
    if (value.availability !== 'source-verified' || !isRecord(value.source) || !isRecord(value.worker)) {
        throw new TypeError(`Listening entry ${locator} has invalid availability or missing source delivery data.`);
    }
    const workerAssetId = requiredText(value.worker.assetId, `${locator}.worker.assetId`);
    if (!SAFE_WORKER_ASSET_ID.test(workerAssetId)) throw new TypeError(`Listening entry ${locator} has an unsafe Worker asset id.`);
    if (value.worker.purpose !== 'audio' || value.worker.access !== 'academy-session-or-signed') {
        throw new TypeError(`Listening entry ${locator} has an invalid Worker delivery contract.`);
    }
    if (
        (value.source.corpus !== 'soya' && value.source.corpus !== 'moodle' && value.source.corpus !== 'minna')
        || value.source.mediaType !== 'audio/mpeg'
        || value.source.codec !== 'mp3'
    ) throw new TypeError(`Listening entry ${locator} has an unsupported source format.`);
    return {
        locator,
        authoredAssetId,
        availability: 'source-verified',
        source: {
            corpus: value.source.corpus,
            repositoryRelativePath: safeRelativePath(value.source.repositoryRelativePath, locator),
            sha256: hash(value.source.sha256, `${locator}.source.sha256`),
            bytes: positiveInteger(value.source.bytes, `${locator}.source.bytes`),
            mediaType: 'audio/mpeg',
            codec: 'mp3',
            durationSeconds: positiveNumber(value.source.durationSeconds, `${locator}.source.durationSeconds`),
            sampleRateHz: positiveInteger(value.source.sampleRateHz, `${locator}.source.sampleRateHz`),
            channels: positiveInteger(value.source.channels, `${locator}.source.channels`),
            questionMapRef: requiredText(value.source.questionMapRef, `${locator}.source.questionMapRef`),
        },
        worker: { assetId: workerAssetId, purpose: 'audio', access: 'academy-session-or-signed' },
        ...(value.delivery === undefined ? {} : { delivery: parsePackagedDelivery(value.delivery, locator) }),
        provenance,
    };
}

function parsePackagedDelivery(value: unknown, owner: string): PackagedStaticListeningDelivery {
    if (!isRecord(value) || value.mode !== 'packaged-static') {
        throw new TypeError(`Listening entry ${owner} has an invalid packaged delivery.`);
    }
    const url = requiredText(value.url, `${owner}.delivery.url`);
    if (!/^\/academy\/content\/listening\/media\/[a-z0-9-]+\.mp3$/u.test(url)) {
        throw new TypeError(`Listening entry ${owner} has an unsafe packaged delivery URL.`);
    }
    return { mode: 'packaged-static', url };
}

function safeRelativePath(value: unknown, owner: string): string {
    const result = requiredText(value, `${owner}.source.repositoryRelativePath`);
    if (result.startsWith('/') || result.split('/').includes('..')) throw new TypeError(`Listening entry ${owner} has an unsafe source path.`);
    return result;
}

function hash(value: unknown, label: string): string {
    const result = requiredText(value, label);
    if (!SHA256.test(result)) throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
    return result;
}

function stringArray(value: unknown, label: string): readonly string[] {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a non-empty string array.`);
    return value.map((item, index) => requiredText(item, `${label}[${index}]`));
}

function requiredText(value: unknown, label: string): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
