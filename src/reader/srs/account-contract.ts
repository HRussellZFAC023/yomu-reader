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

function uuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new TypeError(`${field} must be a UUID.`);
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
