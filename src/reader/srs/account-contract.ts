export type YomuClassRole = 'learner' | 'sensei';

export interface YomuClassIdentity {
    readonly displayName: string;
    readonly discriminator: string;
    readonly label: string;
}

export interface AcademyAccountClass {
    readonly classId: string;
    readonly name: string;
    readonly role: YomuClassRole;
    readonly boardHidden: boolean;
}

export interface AcademyAccountView {
    readonly accountId: string;
    readonly identity: YomuClassIdentity;
    readonly nameChosen: boolean;
    readonly avatarKey: string | null;
    readonly boardVisible: boolean;
    readonly shareAvatar: boolean;
    readonly classes: readonly AcademyAccountClass[];
}

export interface AcademyClassBoardMember {
    readonly accountId: string;
    readonly displayTag: string;
    readonly avatarKey?: string;
    readonly role: YomuClassRole;
    readonly currentStreak: number;
    readonly longestStreak: number;
    readonly knownWordCount: number;
    readonly reviews: { readonly completed: number; readonly due: number };
    readonly lessons: { readonly completed: number; readonly total: number };
}

export interface AcademyClassBoardView {
    readonly classId: string;
    readonly members: readonly AcademyClassBoardMember[];
}

export type AcademyClassLeaderboardMetricId = 'streak' | 'review-activity' | 'known-words' | 'lesson-progress';

export interface AcademyClassLeaderboardMetric {
    readonly id: AcademyClassLeaderboardMetricId;
    readonly meaning: string;
    readonly unit: 'days' | 'words' | 'lessons';
    readonly window: 'current-streak' | 'rolling-7-utc-days' | 'all-time';
    readonly startsOn?: string;
    readonly endsOn?: string;
    readonly asOf?: string;
}

export interface AcademyClassLeaderboardEntry {
    readonly rank: number;
    readonly accountId: string;
    readonly displayTag: string;
    readonly avatarKey?: string;
    readonly role: YomuClassRole;
    readonly value: number;
    readonly updatedAt: number | null;
}

export interface AcademyClassLeaderboardView {
    readonly classId: string;
    readonly metric: AcademyClassLeaderboardMetric;
    readonly entries: readonly AcademyClassLeaderboardEntry[];
    readonly me: AcademyClassLeaderboardEntry | null;
    readonly pagination: {
        readonly page: number;
        readonly limit: number;
        readonly visibleEntries: number;
        readonly pages: number;
    };
    readonly updatedAt: number | null;
    readonly freshness: {
        readonly generatedAt: number;
        readonly mode: 'server-snapshot';
        readonly realTime: false;
    };
}

export interface AcademyProfileView {
    readonly profileId: string;
    readonly deviceId: string;
    readonly accountId: string | null;
    readonly keyVersion: number;
    readonly createdAt: number;
}

export type AcademyEntitlementView =
    | { readonly entitlement: 'none' }
    | { readonly entitlement: 'academy'; readonly status: 'active'; readonly redeemedAt: number };

export interface AcademyPairingKeyEnvelope {
    readonly keyVersion: number;
    readonly salt: string;
    readonly nonce: string;
    readonly ciphertext: string;
}

export interface AcademyPairingTicket {
    readonly pairingId: string;
    readonly code: string;
    readonly expiresAt: number;
}

export interface AcademyPairingClaim {
    readonly pairingId: string;
    readonly profileId: string;
    readonly deviceId: string;
    readonly keyEnvelope: AcademyPairingKeyEnvelope;
}

/** The plaintext learner event is inside ciphertext and never crosses this boundary. */
export interface AcademyEncryptedSyncEventInput {
    readonly id: string;
    readonly occurredAt: number;
    readonly keyVersion: number;
    readonly nonce: string;
    readonly ciphertext: string;
}

export interface AcademyEncryptedSyncEvent extends AcademyEncryptedSyncEventInput {
    readonly cursor: number;
    readonly sourceDeviceId: string | null;
    readonly receivedAt: number;
}

export interface AcademySyncPage {
    readonly events: readonly AcademyEncryptedSyncEvent[];
    readonly nextCursor: number;
    readonly hasMore: boolean;
}

export interface AcademySyncPushResult {
    readonly accepted: number;
    readonly inserted: number;
    readonly duplicates: number;
    readonly conflicts: readonly string[];
}

function normalizeClassDisplayName(value: string): string {
    const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (!normalized || [...normalized].length > 32 || /[#\p{Cc}\p{Cf}\p{Cs}]/u.test(normalized)) {
        throw new TypeError('Class display name is invalid.');
    }
    return normalized;
}

export function classIdentity(displayName: string, discriminator: string): YomuClassIdentity {
    const name = normalizeClassDisplayName(displayName);
    if (!/^\d{6}$/u.test(discriminator)) throw new TypeError('Class discriminator is invalid.');
    return { displayName: name, discriminator, label: `${name}#${discriminator}` };
}

/** Strict client projection: unknown/private response fields are discarded. */
export function parseAcademyAccountView(value: unknown): AcademyAccountView {
    const record = object(value, 'Academy account');
    const identity = classIdentity(text(record.displayName, 'displayName'), discriminatorFromTag(text(record.displayTag, 'displayTag')));
    if (identity.label !== record.displayTag) throw new TypeError('Academy displayTag is invalid.');
    return {
        accountId: uuid(record.accountId, 'accountId'),
        identity,
        nameChosen: boolean(record.nameChosen, 'nameChosen'),
        avatarKey: nullableAvatar(record.avatarKey),
        boardVisible: boolean(record.boardVisible, 'boardVisible'),
        shareAvatar: boolean(record.shareAvatar, 'shareAvatar'),
        classes: array(record.classes, 'classes').map(parseAccountClass),
    };
}

/** Strict client projection: raw events, answers, and word lists have no output field. */
export function parseAcademyClassBoardView(value: unknown): AcademyClassBoardView {
    const record = object(value, 'Class Board');
    return {
        classId: classId(record.classId),
        members: array(record.members, 'members').map(parseBoardMember),
    };
}

/** Strict ranking projection: private progress detail has no client field. */
export function parseAcademyClassLeaderboardView(value: unknown): AcademyClassLeaderboardView {
    const record = object(value, 'Class leaderboard');
    const pagination = object(record.pagination, 'pagination');
    const freshness = object(record.freshness, 'freshness');
    if (freshness.mode !== 'server-snapshot' || freshness.realTime !== false) {
        throw new TypeError('Class leaderboard freshness is invalid.');
    }
    return {
        classId: classId(record.classId),
        metric: parseLeaderboardMetric(record.metric),
        entries: array(record.entries, 'entries').map(parseLeaderboardEntry),
        me: record.me === null ? null : parseLeaderboardEntry(record.me),
        pagination: {
            page: integer(pagination.page, 'pagination.page', 1, 1_000),
            limit: integer(pagination.limit, 'pagination.limit', 1, 50),
            visibleEntries: count(pagination.visibleEntries, 'pagination.visibleEntries'),
            pages: count(pagination.pages, 'pagination.pages'),
        },
        updatedAt: nullableTimestamp(record.updatedAt, 'updatedAt'),
        freshness: {
            generatedAt: integer(freshness.generatedAt, 'freshness.generatedAt', 0, Number.MAX_SAFE_INTEGER),
            mode: 'server-snapshot',
            realTime: false,
        },
    };
}

export function parseAcademyProfileView(value: unknown): AcademyProfileView {
    const record = object(value, 'Academy profile');
    return {
        profileId: uuid(record.profileId, 'profileId'),
        deviceId: uuid(record.deviceId, 'deviceId'),
        accountId: record.accountId === null ? null : uuid(record.accountId, 'accountId'),
        keyVersion: integer(record.keyVersion, 'keyVersion', 1, 1_000_000),
        createdAt: integer(record.createdAt, 'createdAt', 0, Number.MAX_SAFE_INTEGER),
    };
}

export function parseAcademyEntitlementView(value: unknown): AcademyEntitlementView {
    const record = object(value, 'Academy entitlement');
    if (record.entitlement === 'none') return { entitlement: 'none' };
    if (record.entitlement !== 'academy' || record.status !== 'active') {
        throw new TypeError('Academy entitlement is invalid.');
    }
    return {
        entitlement: 'academy',
        status: 'active',
        redeemedAt: integer(record.redeemedAt, 'redeemedAt', 0, Number.MAX_SAFE_INTEGER),
    };
}

export function parseAcademyPairingTicket(value: unknown): AcademyPairingTicket {
    const record = object(value, 'Academy pairing ticket');
    const code = text(record.code, 'code');
    if (!/^[023456789A-HJ-KM-NP-Z]{4}(?:-[023456789A-HJ-KM-NP-Z]{4}){4}$/u.test(code)) {
        throw new TypeError('Academy pairing code is invalid.');
    }
    return {
        pairingId: uuid(record.pairingId, 'pairingId'),
        code,
        expiresAt: integer(record.expiresAt, 'expiresAt', 0, Number.MAX_SAFE_INTEGER),
    };
}

export function parseAcademyPairingClaim(value: unknown): AcademyPairingClaim {
    const record = object(value, 'Academy pairing claim');
    return {
        pairingId: uuid(record.pairingId, 'pairingId'),
        profileId: uuid(record.profileId, 'profileId'),
        deviceId: uuid(record.deviceId, 'deviceId'),
        keyEnvelope: parseKeyEnvelope(record.keyEnvelope),
    };
}

export function parseAcademySyncPage(value: unknown): AcademySyncPage {
    const record = object(value, 'Academy sync page');
    return {
        events: array(record.events, 'events').map(parseEncryptedEvent),
        nextCursor: integer(record.nextCursor, 'nextCursor', 0, Number.MAX_SAFE_INTEGER),
        hasMore: boolean(record.hasMore, 'hasMore'),
    };
}

export function parseAcademySyncPushResult(value: unknown): AcademySyncPushResult {
    const record = object(value, 'Academy sync result');
    const result = {
        accepted: count(record.accepted, 'accepted'),
        inserted: count(record.inserted, 'inserted'),
        duplicates: count(record.duplicates, 'duplicates'),
        conflicts: array(record.conflicts, 'conflicts').map((item, index) => uuidV4(item, `conflicts[${index}]`)),
    };
    if (result.accepted !== result.inserted + result.duplicates) throw new TypeError('Academy sync counts are inconsistent.');
    return result;
}

function parseKeyEnvelope(value: unknown): AcademyPairingKeyEnvelope {
    const record = object(value, 'Academy key envelope');
    return {
        keyVersion: integer(record.keyVersion, 'keyVersion', 1, 1_000_000),
        salt: base64UrlBytes(record.salt, 'salt', 16, 16),
        nonce: base64UrlBytes(record.nonce, 'nonce', 12, 12),
        ciphertext: base64UrlBytes(record.ciphertext, 'ciphertext', 48, 48),
    };
}

function parseEncryptedEvent(value: unknown): AcademyEncryptedSyncEvent {
    const record = object(value, 'Academy encrypted event');
    return {
        cursor: integer(record.cursor, 'cursor', 1, Number.MAX_SAFE_INTEGER),
        id: uuidV4(record.id, 'id'),
        occurredAt: integer(record.occurredAt, 'occurredAt', 0, Number.MAX_SAFE_INTEGER),
        keyVersion: integer(record.keyVersion, 'keyVersion', 1, 1_000_000),
        nonce: base64UrlBytes(record.nonce, 'nonce', 12, 12),
        ciphertext: base64UrlBytes(record.ciphertext, 'ciphertext', 17, 16 * 1024),
        sourceDeviceId: record.sourceDeviceId === null ? null : uuid(record.sourceDeviceId, 'sourceDeviceId'),
        receivedAt: integer(record.receivedAt, 'receivedAt', 0, Number.MAX_SAFE_INTEGER),
    };
}

function parseAccountClass(value: unknown): AcademyAccountClass {
    const record = object(value, 'Academy class');
    return {
        classId: classId(record.classId),
        name: text(record.name, 'name'),
        role: role(record.role),
        boardHidden: boolean(record.boardHidden, 'boardHidden'),
    };
}

function parseBoardMember(value: unknown): AcademyClassBoardMember {
    const record = object(value, 'Class Board member');
    const reviews = object(record.reviews, 'reviews');
    const lessons = object(record.lessons, 'lessons');
    const completedLessons = count(lessons.completed, 'lessons.completed');
    const totalLessons = count(lessons.total, 'lessons.total');
    if (completedLessons > totalLessons) throw new TypeError('Class Board lesson totals are invalid.');
    return {
        accountId: uuid(record.accountId, 'accountId'),
        displayTag: validDisplayTag(record.displayTag),
        ...(record.avatarKey === undefined ? {} : { avatarKey: avatar(record.avatarKey) }),
        role: role(record.role),
        currentStreak: count(record.currentStreak, 'currentStreak'),
        longestStreak: count(record.longestStreak, 'longestStreak'),
        knownWordCount: count(record.knownWordCount, 'knownWordCount'),
        reviews: {
            completed: count(reviews.completed, 'reviews.completed'),
            due: count(reviews.due, 'reviews.due'),
        },
        lessons: { completed: completedLessons, total: totalLessons },
    };
}

function parseLeaderboardMetric(value: unknown): AcademyClassLeaderboardMetric {
    const record = object(value, 'metric');
    const id = oneOf(record.id, ['streak', 'review-activity', 'known-words', 'lesson-progress'] as const, 'metric.id');
    const unit = oneOf(record.unit, ['days', 'words', 'lessons'] as const, 'metric.unit');
    const window = oneOf(record.window, ['current-streak', 'rolling-7-utc-days', 'all-time'] as const, 'metric.window');
    const expected = {
        streak: { unit: 'days', window: 'current-streak' },
        'review-activity': { unit: 'days', window: 'rolling-7-utc-days' },
        'known-words': { unit: 'words', window: 'all-time' },
        'lesson-progress': { unit: 'lessons', window: 'all-time' },
    } as const;
    if (unit !== expected[id].unit || window !== expected[id].window) {
        throw new TypeError('metric metadata does not match metric.id.');
    }
    const startsOn = record.startsOn === undefined ? undefined : isoDay(record.startsOn, 'metric.startsOn');
    const endsOn = record.endsOn === undefined ? undefined : isoDay(record.endsOn, 'metric.endsOn');
    const asOf = record.asOf === undefined ? undefined : isoDay(record.asOf, 'metric.asOf');
    if ((id === 'streak' && (!asOf || startsOn || endsOn))
        || (id === 'review-activity' && (!startsOn || !endsOn || asOf))
        || ((id === 'known-words' || id === 'lesson-progress') && (startsOn || endsOn || asOf))) {
        throw new TypeError('metric date metadata does not match metric.id.');
    }
    return {
        id,
        meaning: text(record.meaning, 'metric.meaning'),
        unit,
        window,
        ...(startsOn === undefined ? {} : { startsOn }),
        ...(endsOn === undefined ? {} : { endsOn }),
        ...(asOf === undefined ? {} : { asOf }),
    };
}

function parseLeaderboardEntry(value: unknown): AcademyClassLeaderboardEntry {
    const record = object(value, 'leaderboard entry');
    return {
        rank: integer(record.rank, 'rank', 1, Number.MAX_SAFE_INTEGER),
        accountId: uuid(record.accountId, 'accountId'),
        displayTag: validDisplayTag(record.displayTag),
        ...(record.avatarKey === undefined ? {} : { avatarKey: avatar(record.avatarKey) }),
        role: role(record.role),
        value: count(record.value, 'value'),
        updatedAt: nullableTimestamp(record.updatedAt, 'entry.updatedAt'),
    };
}

function nullableTimestamp(value: unknown, field: string): number | null {
    return value === null ? null : integer(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function isoDay(value: unknown, field: string): string {
    const day = text(value, field);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
    const at = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
    if (!match || Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== day) {
        throw new TypeError(`${field} is invalid.`);
    }
    return day;
}

function oneOf<const Values extends readonly string[]>(value: unknown, values: Values, field: string): Values[number] {
    if (typeof value !== 'string' || !values.includes(value)) throw new TypeError(`${field} is invalid.`);
    return value as Values[number];
}

function validDisplayTag(value: unknown): string {
    const tag = text(value, 'displayTag');
    const split = /^(.*)#(\d{6})$/u.exec(tag);
    if (!split) throw new TypeError('displayTag is invalid.');
    const identity = classIdentity(split[1] ?? '', split[2] ?? '');
    if (identity.label !== tag) throw new TypeError('displayTag is invalid.');
    return tag;
}

function discriminatorFromTag(tag: string): string {
    const match = /#(\d{6})$/u.exec(tag);
    if (!match) throw new TypeError('displayTag is invalid.');
    return match[1] ?? '';
}

function object(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
    return value;
}

function text(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be text.`);
    return value;
}

function boolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
    return value;
}

function count(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000_000) {
        throw new TypeError(`${field} must be a non-negative integer.`);
    }
    return value as number;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        throw new TypeError(`${field} must be an integer from ${minimum} to ${maximum}.`);
    }
    return value as number;
}

function uuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new TypeError(`${field} must be a UUID.`);
    }
    return value;
}

function uuidV4(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new TypeError(`${field} must be a UUIDv4.`);
    }
    return value;
}

function base64UrlBytes(value: unknown, field: string, minimumBytes: number, maximumBytes: number): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError(`${field} must be base64url text.`);
    try {
        const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
        const byteLength = atob(padded).length;
        if (byteLength < minimumBytes || byteLength > maximumBytes) throw new TypeError(`${field} has an invalid byte length.`);
    } catch (error) {
        if (error instanceof TypeError) throw error;
        throw new TypeError(`${field} must be base64url text.`);
    }
    return value;
}

function role(value: unknown): YomuClassRole {
    if (value !== 'learner' && value !== 'sensei') throw new TypeError('Unknown Academy class role.');
    return value;
}

function classId(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(value)) throw new TypeError('classId is invalid.');
    return value;
}

function avatar(value: unknown): string {
    if (typeof value !== 'string' || !/^quality-[2-5]$/u.test(value)) throw new TypeError('avatarKey is invalid.');
    return value;
}

function nullableAvatar(value: unknown): string | null {
    return value === null ? null : avatar(value);
}
