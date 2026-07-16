import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic } from './io.mjs';

export const LESSON_SOURCE_OWNERSHIP_SCHEMA = 'yomu-academy.lesson-source-ownership/v1';

export const SHARED_SOURCE_PAYLOAD_DECLARATIONS = Object.freeze([
    declaration('d3dcff38773db8f1632dc546a7bc32e8602a58a4b44e3e3127a5cda130f938b3', 'l1-l04', ['l1-l05'], 'The Chapter 2 listening PDF is paired with both the Lesson 4 keychain task and the Lesson 5 lost-and-found task.'),
    declaration('ad23b0a9e01427e364f0c15de11bbdc74bd4c021fd00dc9e88e8852732092c0e', 'l1-l06', ['l1-l08'], 'The Chapter 3 listening PDF is paired with both the counter task and the later cafe-schedule listening task.'),
    declaration('b2143f1f2ce2469fe7e54d8f778d75956ae6c060bc44e2c39421bde470b8ac0b', 'l1-l15', ['l1-l16'], 'The Chapter 10-1 grammar worksheet is retained as documented carry-forward source material in adjacent lesson archives.'),
    declaration('3eb99ed2215fe5106c78128850ba3375ea866273ea142e7525cdd3ce66dcbacb', 'l1-l16', ['l1-l17'], 'The Chapter 10-1 listening handout carries forward into Lesson 17, where it is paired with the listening activity.'),
    declaration('51b23938df7d786fafd5cfe2781ed8d7a0d1372721f7584be55ef35f18f54751', 'l1-l16', ['l1-l17'], 'The Chapter 10-2 vocabulary sheet is the stated source vocabulary reference in both adjacent lessons.'),
    declaration('b7ab822e95efc2f31a35f11725fb8e48d90348246433804434b3f2b3f200e620', 'l1-l16', ['l1-l17'], 'The Chapter 10-2 position grammar worksheet is documented carry-forward source material in adjacent lesson archives.'),
    declaration('4e6cbed78c9bac3330e0987b2f406dc7aabb90f5f5e958fb5951a7e85212e7f5', 'l1-l16', ['l1-l17'], 'The Chapter 10 pre-study vocabulary source is used by both adjacent vocabulary references.'),
    declaration('d5884154f214b8ce28ebbc1f8e69382a5ce9103c0dab43508868b61a968a79e1', 'l1-l18', ['l1-l19'], 'The Chapter 11-2 ordering handout carries into Lesson 19, where it anchors the source-authenticated activity.'),
    declaration('446606e423403c7fd638c1419611eee8da7a5bb4b97ce0fa4460f233acebffd6', 'l1-l18', ['l1-l19'], 'The Chapter 11-1 vocabulary sheet supports Lesson 18 and the explicit source review in Lesson 19.'),
    declaration('797c858bc8070541ec31bae8e631ac03d7c3a28a3409602f331020e1192002e8', 'l1-l19', ['l1-l20', 'l1-l21'], 'The Chapter 11 listening material carries through the consecutive frequency, duration, and counter lessons.'),
    declaration('9dff734cc9ce3542b9e8356f989eb38d59fa7ec4875630ad19b646f9e7474400', 'l1-l19', ['l1-l20'], 'The Chapter 11-2,3 vocabulary sheet is used by the Lesson 19 source activity and Lesson 20 frequency work.'),
    declaration('654c720b3734cb748e45cea2d9a2e6ec938668afc9d07e95451b01daa672f2db', 'l2-l02', ['l2-l03'], 'The B-21 audio is documented continuity material while Lesson 3 remains held for listening verification.'),
    declaration('6dccd9517dc4e10fb1ce3548de2c3c9d07a498f12bbf6e5b734b0e56c1490e6b', 'l2-l02', ['l2-l03'], 'The B-22 audio is documented continuity material while Lesson 3 remains held for listening verification.'),
    declaration('efa1e30112ad8ec1dd606b9d74c70b0bf315896701da851a359f8c468d950b75', 'l2-l02', ['l2-l03'], 'The Chapter 19 listening handout is shared continuity evidence across the two consecutive packages.'),
    declaration('17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a', 'l2-l02', ['l2-l03'], 'The Chapter 19-2 grammar exercise is shared continuity evidence across the two consecutive packages.'),
    declaration('5e7880ecbaa49b880eae7d78f938bb313bbd3f1eced59ccece97a221a64f0899', 'l2-l02', ['l2-l03'], 'The Chapter 19-2,3 vocabulary sheet is shared continuity evidence across the two consecutive packages.'),
]);

export function normalizeLessonSourcePayloadOwnership(roots, { log = () => {} } = {}) {
    const lessonsRoot = path.join(roots.repoRoot, 'public/academy/content/lessons');
    const changed = [];
    for (const filename of readdirSync(lessonsRoot).filter(name => name.endsWith('.json')).sort()) {
        const filePath = path.join(lessonsRoot, filename);
        const lesson = readJson(filePath);
        if (!isInCurrentConformanceScope(lesson)) continue;
        const members = lesson.sourceCoverage?.members;
        if (!Array.isArray(members)) continue;
        const normalized = uniqueMembers(members, filename);
        if (normalized.length === members.length) continue;
        lesson.sourceCoverage.members = normalized;
        writeJsonAtomic(filePath, lesson);
        changed.push(filename);
    }
    if (changed.length) log(`canonicalized duplicate source payload members in ${changed.join(', ')}`);
    return changed;
}

function isInCurrentConformanceScope(lesson) {
    return Number.isInteger(lesson.order) && lesson.order >= 2 && lesson.order <= 30;
}

export function writeLessonSourceOwnershipManifest(roots) {
    const manifest = {
        schema: LESSON_SOURCE_OWNERSHIP_SCHEMA,
        sharedPayloads: SHARED_SOURCE_PAYLOAD_DECLARATIONS,
    };
    const filePath = path.join(roots.publicRoot, 'lesson-source-ownership.v1.json');
    writeJsonAtomic(filePath, manifest);
    return filePath;
}

export function validateLessonSourceOwnershipManifest(roots) {
    const filePath = path.join(roots.publicRoot, 'lesson-source-ownership.v1.json');
    try {
        const actual = readJson(filePath);
        const expected = {
            schema: LESSON_SOURCE_OWNERSHIP_SCHEMA,
            sharedPayloads: SHARED_SOURCE_PAYLOAD_DECLARATIONS,
        };
        return JSON.stringify(actual) === JSON.stringify(expected)
            ? []
            : ['lesson-source-ownership manifest is stale; run the source pipeline ownership stage'];
    } catch {
        return ['missing lesson-source-ownership manifest; run the source pipeline ownership stage'];
    }
}

function declaration(payloadSha256, ownerPackageId, consumerPackageIds, reason) {
    return Object.freeze({ payloadSha256, ownerPackageId, consumerPackageIds: Object.freeze(consumerPackageIds), reason });
}

function uniqueMembers(members, filename) {
    const byPayload = new Map();
    for (const member of members) {
        if (!member || typeof member.payloadSha256 !== 'string') {
            throw new TypeError(`${filename} has a source member without a payload SHA-256.`);
        }
        const canonical = byPayload.get(member.payloadSha256);
        if (!canonical) {
            byPayload.set(member.payloadSha256, member);
            continue;
        }
        assertSamePayloadMetadata(canonical, member, filename);
    }
    return [...byPayload.values()];
}

function assertSamePayloadMetadata(canonical, duplicate, filename) {
    for (const key of ['title', 'kind', 'extension', 'uncompressedBytes']) {
        if (canonical[key] !== duplicate[key]) {
            throw new TypeError(`${filename} has conflicting metadata for duplicate payload ${canonical.payloadSha256}.`);
        }
    }
}
