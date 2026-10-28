import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';
import { filesHaveSameContent } from './helpers/hash-memo';

const PUBLIC_LESSON_DIRECTORY = path.resolve('public/academy/content/lessons');
const HOSTED_LESSON_DIRECTORY = path.resolve('docs/public/academy/content/lessons');
const SOURCE_OWNERSHIP_MANIFEST = path.resolve('public/academy/content/source-pipeline/lesson-source-ownership.v1.json');
const HOSTED_SOURCE_OWNERSHIP_MANIFEST = path.resolve('docs/public/academy/content/source-pipeline/lesson-source-ownership.v1.json');
const LESSON_ZERO_FILENAME = 'lesson-zero.v1.json';
// The 29 post-orientation packages currently occupy source orders 2 through 30.
const FIRST_AUTHORED_ORDER = 2;
const LAST_AUTHORED_ORDER = 30;

type SourcePayloadOwnership = Readonly<{
    payloadSha256: string;
    packageId: string;
    filename: string;
}>;

type SharedSourcePayloadDeclaration = Readonly<{
    payloadSha256: string;
    ownerPackageId: string;
    consumerPackageIds: readonly string[];
    reason: string;
}>;

function loadJson(filename: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC_LESSON_DIRECTORY, filename), 'utf8')) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadSharedSourcePayloadDeclarations(): readonly SharedSourcePayloadDeclaration[] {
    const manifest = JSON.parse(fs.readFileSync(SOURCE_OWNERSHIP_MANIFEST, 'utf8')) as unknown;
    if (!isRecord(manifest) || manifest.schema !== 'yomu-academy.lesson-source-ownership/v1'
        || !Array.isArray(manifest.sharedPayloads)) {
        throw new TypeError('Lesson source ownership manifest has an invalid schema.');
    }
    return manifest.sharedPayloads.map((value, index) => {
        if (!isRecord(value) || typeof value.payloadSha256 !== 'string'
            || typeof value.ownerPackageId !== 'string' || typeof value.reason !== 'string'
            || !Array.isArray(value.consumerPackageIds)
            || !value.consumerPackageIds.every(packageId => typeof packageId === 'string')) {
            throw new TypeError(`Lesson source ownership declaration ${index} is invalid.`);
        }
        return {
            payloadSha256: value.payloadSha256,
            ownerPackageId: value.ownerPackageId,
            consumerPackageIds: value.consumerPackageIds,
            reason: value.reason,
        };
    });
}

function authoredLessonFiles(): readonly string[] {
    return fs.readdirSync(PUBLIC_LESSON_DIRECTORY)
        .filter(filename => filename.endsWith('.json'))
        .filter(filename => {
            const order = loadJson(filename).order;
            return typeof order === 'number' && order >= FIRST_AUTHORED_ORDER && order <= LAST_AUTHORED_ORDER;
        })
        .sort();
}

function packageId(value: Record<string, unknown>, filename: string): string {
    if (typeof value.id !== 'string' || !value.id) {
        throw new TypeError(`Lesson package ${filename} has no string id.`);
    }
    return value.id;
}

function lessonId(value: Record<string, unknown>, filename: string): string {
    if (filename === LESSON_ZERO_FILENAME) {
        if (!isRecord(value.lesson) || typeof value.lesson.id !== 'string' || !value.lesson.id) {
            throw new TypeError('Lesson 0 has no string lessonId.');
        }
        return value.lesson.id;
    }
    return packageId(value, filename);
}

function sourcePayloadOwnership(value: Record<string, unknown>, filename: string): readonly SourcePayloadOwnership[] {
    const sourceCoverage = value.sourceCoverage;
    if (!isRecord(sourceCoverage) || !Array.isArray(sourceCoverage.members)) return [];
    const owner = packageId(value, filename);

    return sourceCoverage.members.flatMap(member => {
        if (!isRecord(member) || typeof member.payloadSha256 !== 'string') return [];
        return [{ payloadSha256: member.payloadSha256, packageId: owner, filename }];
    });
}

function duplicateValues(values: readonly string[]): readonly string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates].sort();
}

function declaredShare(
    payloadSha256: string,
    packageIds: readonly string[],
    declarations: readonly SharedSourcePayloadDeclaration[],
): SharedSourcePayloadDeclaration | undefined {
    return declarations.find(declaration =>
        declaration.payloadSha256 === payloadSha256
        && [...new Set([declaration.ownerPackageId, ...declaration.consumerPackageIds])].sort()
            .join(',') === [...packageIds].sort().join(','));
}

function sourcePayloadOwnershipViolations(
    ownership: readonly SourcePayloadOwnership[],
    declarations: readonly SharedSourcePayloadDeclaration[],
): readonly string[] {
    const ownersByPayload = new Map<string, SourcePayloadOwnership[]>();
    for (const record of ownership) {
        ownersByPayload.set(record.payloadSha256, [...(ownersByPayload.get(record.payloadSha256) ?? []), record]);
    }

    const repeatedWithinPackage = [...ownersByPayload.entries()]
        .flatMap(([payloadSha256, owners]) => duplicateValues(owners.map(owner => owner.packageId))
            .map(packageId => `Stale generated member: ${payloadSha256} is repeated in ${packageId}`));
    const sharedPayloads = new Set<string>();
    const undeclaredCrossPackageShares = [...ownersByPayload.entries()]
        .flatMap(([payloadSha256, owners]) => {
            const packageIds = [...new Set(owners.map(owner => owner.packageId))].sort();
            if (packageIds.length < 2) return [];
            sharedPayloads.add(payloadSha256);
            return declaredShare(payloadSha256, packageIds, declarations)
                ? []
                : [`Production owner action required: ${payloadSha256} is claimed by ${packageIds.join(', ')}`];
        });
    const malformedDeclarations = declarations.flatMap(declaration => {
        const packageIds = [declaration.ownerPackageId, ...declaration.consumerPackageIds];
        const errors: string[] = [];
        if (!declaration.ownerPackageId) errors.push(`${declaration.payloadSha256} has no owner package`);
        if (!declaration.reason.trim()) errors.push(`${declaration.payloadSha256} has no sharing reason`);
        if (duplicateValues(packageIds).length) errors.push(`${declaration.payloadSha256} repeats a declared package`);
        if (!sharedPayloads.has(declaration.payloadSha256)) errors.push(`${declaration.payloadSha256} does not match a shared source payload`);
        return errors.map(message => `Invalid sharing declaration: ${message}`);
    });
    const duplicateDeclarations = duplicateValues(declarations.map(declaration => declaration.payloadSha256))
        .map(payloadSha256 => `Duplicate sharing declaration: ${payloadSha256} has more than one sharing declaration`);

    return [
        ...repeatedWithinPackage,
        ...undeclaredCrossPackageShares,
        ...malformedDeclarations,
        ...duplicateDeclarations,
    ];
}

describe('Lessons 0-29 uniqueness conformance gate', () => {
    const files = authoredLessonFiles();
    const packages = files.map(filename => ({ filename, value: loadJson(filename) }));
    const scopedFiles = [LESSON_ZERO_FILENAME, ...files];
    const scopedPackages = scopedFiles.map(filename => ({ filename, value: loadJson(filename) }));
    const registryEntries = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => scopedFiles.includes(entry.filename));
    const sharedSourcePayloadDeclarations = loadSharedSourcePayloadDeclarations();

    it('has one lesson ID, package path, and canonical order per generated package', () => {
        expect(files).toHaveLength(29);
        expect(duplicateValues(scopedFiles)).toEqual([]);
        expect(duplicateValues(scopedPackages.map(({ filename, value }) => lessonId(value, filename)))).toEqual([]);
        expect(duplicateValues(packages.map(({ value }) => String(value.order)))).toEqual([]);
        expect(packages.map(({ value }) => value.order).sort((left, right) => Number(left) - Number(right)))
            .toEqual(Array.from({ length: LAST_AUTHORED_ORDER - FIRST_AUTHORED_ORDER + 1 }, (_, index) => index + FIRST_AUTHORED_ORDER));
    });

    it('has one registry key and delivery ID for each registered package', () => {
        expect(registryEntries).toHaveLength(30);
        expect(duplicateValues(registryEntries.map(entry => entry.filename))).toEqual([]);

        const authoredWeeks = registryEntries.filter(entry => entry.kind === 'authored-week');
        const completeLessons = registryEntries.filter(entry => entry.kind === 'lesson');
        expect(authoredWeeks).toHaveLength(28);
        expect(completeLessons).toHaveLength(1);
        expect(duplicateValues(authoredWeeks.map(entry => entry.packageId))).toEqual([]);
        expect(duplicateValues(completeLessons.map(entry => entry.lessonId))).toEqual([]);
        expect(duplicateValues(authoredWeeks.map(entry => entry.classWeekId))).toEqual([]);

        const deliveryIds = registryEntries.flatMap(entry => {
            if (entry.kind === 'authored-week') return [entry.classWeekId];
            if (entry.kind === 'lesson' && entry.classWeekId) return [entry.classWeekId];
            return [];
        });
        expect(duplicateValues(deliveryIds)).toEqual([]);

        for (const entry of authoredWeeks) {
            const value = loadJson(entry.filename);
            expect(packageId(value, entry.filename)).toBe(entry.packageId);
        }
        for (const entry of completeLessons) {
            const value = loadJson(entry.filename);
            expect(lessonId(value, entry.filename)).toBe(entry.lessonId);
        }
    });

    it('keeps the generated hosted lesson mirror byte-identical', () => {
        for (const filename of scopedFiles) {
            expect(filesHaveSameContent(path.join(HOSTED_LESSON_DIRECTORY, filename), path.join(PUBLIC_LESSON_DIRECTORY, filename))).toBe(true);
        }
        expect(filesHaveSameContent(HOSTED_SOURCE_OWNERSHIP_MANIFEST, SOURCE_OWNERSHIP_MANIFEST)).toBe(true);
    });

    it('accepts only exact, reasoned shared-source declarations', () => {
        const ownership: readonly SourcePayloadOwnership[] = [
            { payloadSha256: 'shared', packageId: 'l1-l01', filename: '002-l1-l01.json' },
            { payloadSha256: 'shared', packageId: 'l1-l02', filename: '003-l1-l02.json' },
        ];
        const declaration: SharedSourcePayloadDeclaration = {
            payloadSha256: 'shared',
            ownerPackageId: 'l1-l01',
            consumerPackageIds: ['l1-l02'],
            reason: 'The source owner explicitly permits this shared payload.',
        };

        expect(sourcePayloadOwnershipViolations(ownership, [declaration])).toEqual([]);
        expect(sourcePayloadOwnershipViolations(ownership, [{ ...declaration, consumerPackageIds: [] }]))
            .toEqual(['Production owner action required: shared is claimed by l1-l01, l1-l02']);
    });

    it('assigns every source payload to one package unless an exact share is declared', () => {
        const ownership = packages.flatMap(({ filename, value }) => sourcePayloadOwnership(value, filename));
        expect(sourcePayloadOwnershipViolations(ownership, sharedSourcePayloadDeclarations)).toEqual([]);
    });
});
