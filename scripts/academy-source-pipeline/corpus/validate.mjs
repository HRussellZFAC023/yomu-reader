import { existsSync, readdirSync } from 'node:fs';
import { CORPUS_SCHEMAS, SOURCE_SCOPES } from './paths.mjs';
import { readJson } from '../io.mjs';

const LESSON_FILE = /^\d{3}-l[12]-l\d{2}\.json$/u;
const ALLOWED_SOURCE_ID = /^(?:moodle-(?:module|vocabulary|audio|pdf-media|digitized-media)|moodle-digitized|japanese-(?:minna|genki|library)(?:-media)?|soya-question|provided-story|audio|image):/u;
const PRIVATE_KEY = /^(?:path|relativePath|title|label|question|answer|surface|reading|meaning|ref)$/u;

export function validateCorpusOutputs(roots) {
    const violations = [];
    for (const filePath of Object.values(roots.publicFiles)) {
        if (!existsSync(filePath)) violations.push(`missing public corpus output: ${filePath}`);
    }
    if (violations.length > 0) return violations;
    const manifest = readJson(roots.publicFiles.manifest);
    const curriculum = readJson(roots.publicFiles.curriculum);
    const vocabulary = readJson(roots.publicFiles.vocabulary);
    const media = readJson(roots.publicFiles.media);
    checkSchemas({ manifest, curriculum, vocabulary, media }, violations);
    checkManifest(manifest, violations);
    checkCoverage(roots, curriculum, vocabulary, violations);
    checkVocabulary(vocabulary, violations);
    checkMedia(media, violations);
    checkPublicShape({ manifest, curriculum, vocabulary, media }, violations);
    return violations;
}

function checkSchemas(outputs, violations) {
    for (const [name, expected] of Object.entries(CORPUS_SCHEMAS)) {
        if (outputs[name]?.schema !== expected) violations.push(`${name}: expected schema ${expected}`);
    }
}

function checkManifest(manifest, violations) {
    const actualScopes = manifest.sources.map(source => source.id);
    const expectedScopes = SOURCE_SCOPES.map(source => source.id);
    if (JSON.stringify(actualScopes) !== JSON.stringify(expectedScopes)) {
        violations.push('permitted source scope list changed or reordered');
    }
    if (manifest.policy.answerGate !== 'after-attempt') violations.push('corpus answer gate must be after-attempt');
    if (manifest.policy.progressionOrder[0] !== 'moodle-raw') violations.push('Moodle must remain foundation chronology authority');
    const advancedScopes = ['japanese-library', 'soya-research', 'provided-stories'];
    if (JSON.stringify(manifest.policy.advancedProgressionScopes) !== JSON.stringify(advancedScopes)) {
        violations.push('advanced progression scopes must cover the vetted post-N4 corpus');
    }
    for (const scope of advancedScopes) {
        if (!manifest.policy.progressionOrder.includes(scope)) {
            violations.push(`${scope}: advanced source is missing from progression order`);
        }
    }
    for (const source of manifest.sources) {
        if (source.role === 'enrichment' && source.sequenceAuthority !== null) {
            violations.push(`${source.id}: enrichment source may not carry sequence authority`);
        }
    }
}

function checkCoverage(roots, curriculum, vocabulary, violations) {
    const lessonCount = readdirSync(roots.lessonsRoot).filter(name => LESSON_FILE.test(name)).length;
    if (curriculum.lessons.length !== lessonCount) violations.push('curriculum crosswalk does not cover every lesson');
    if (vocabulary.lessons.length !== lessonCount) violations.push('vocabulary parity does not cover every lesson');
    const curriculumIds = new Set(curriculum.lessons.map(lesson => lesson.lessonId));
    const vocabularyIds = new Set(vocabulary.lessons.map(lesson => lesson.lessonId));
    if (curriculumIds.size !== lessonCount) violations.push('curriculum crosswalk contains duplicate lesson ids');
    if (vocabularyIds.size !== lessonCount) violations.push('vocabulary parity contains duplicate lesson ids');
    for (const id of curriculumIds) if (!vocabularyIds.has(id)) violations.push(`${id}: missing vocabulary parity record`);
    checkCurriculumOrder(curriculum.lessons, violations);
    for (const lesson of curriculum.lessons) {
        if (!lesson.moodle?.sourceId) violations.push(`${lesson.lessonId}: missing Moodle chronology source id`);
        if (lesson.status !== 'anchored' && lesson.gaps.length === 0) violations.push(`${lesson.lessonId}: anchor gap is not declared`);
        if (lesson.enrichmentPolicy !== 'introduced-prerequisites-only') {
            violations.push(`${lesson.lessonId}: enrichment may not advance prerequisites`);
        }
    }
}

function checkCurriculumOrder(lessons, violations) {
    const lessonOrders = new Set();
    const classOrderStateByGroup = new Map();
    for (const lesson of lessons) {
        if (!Number.isInteger(lesson.lessonOrder) || lesson.lessonOrder <= 0) {
            violations.push(`${lesson.lessonId}: lesson order must be a positive integer`);
        } else if (lessonOrders.has(lesson.lessonOrder)) {
            violations.push(`${lesson.lessonId}: lesson order is duplicated`);
        }
        lessonOrders.add(lesson.lessonOrder);

        const progressionGroup = lesson.progressionGroup;
        const classOrder = lesson.moodle?.classOrder;
        if (typeof progressionGroup !== 'string' || !progressionGroup || !Number.isInteger(classOrder)) {
            violations.push(`${lesson.lessonId}: missing progression group or canonical Moodle class order`);
            continue;
        }
        const state = classOrderStateByGroup.get(progressionGroup) ?? {
            seen: new Set(),
            previous: null,
        };
        if (state.seen.has(classOrder)) {
            violations.push(`${lesson.lessonId}: canonical class order is duplicated within ${progressionGroup}`);
        }
        if (state.previous !== null && classOrder <= state.previous) {
            violations.push(`${lesson.lessonId}: canonical class order regresses within ${progressionGroup}`);
        }
        state.seen.add(classOrder);
        state.previous = classOrder;
        classOrderStateByGroup.set(progressionGroup, state);
    }
}

function checkVocabulary(vocabulary, violations) {
    if (vocabulary.contract.sourceAnswerGate !== 'after-attempt') violations.push('vocabulary answers must be attempt-gated');
    for (const lesson of vocabulary.lessons) {
        if (lesson.parityStatus === 'exact') {
            const match = lesson.sheets.find(sheet => sheet.sourceId === lesson.matchedSourceId);
            if (!match) violations.push(`${lesson.lessonId}: exact parity has no matched source sheet`);
            if (JSON.stringify(match?.orderedRowFingerprints) !== JSON.stringify(lesson.orderedLessonRowFingerprints)) {
                violations.push(`${lesson.lessonId}: exact parity fingerprints differ in content or order`);
            }
            if (lesson.gaps.length > 0) violations.push(`${lesson.lessonId}: exact parity cannot carry gaps`);
        } else if (lesson.gaps.length === 0) {
            violations.push(`${lesson.lessonId}: non-exact vocabulary parity requires an honest gap`);
        }
        for (const sheet of lesson.sheets) {
            if (sheet.answerGate !== null && sheet.answerGate !== 'after-attempt') {
                violations.push(`${sheet.sourceId}: vocabulary answer is not attempt-gated`);
            }
            if (sheet.extractionStatus === 'complete' && sheet.completeRowCount !== sheet.rowCount) {
                violations.push(`${sheet.sourceId}: complete extraction has incomplete rows`);
            }
            if (sheet.modelAnswerCount > 0 && sheet.answerGate !== 'after-attempt') {
                violations.push(`${sheet.sourceId}: model answers must be attempt-gated`);
            }
        }
    }
}

function checkMedia(media, violations) {
    if (media.reusePolicy.answerGate !== 'after-attempt') violations.push('media answers must be attempt-gated');
    if (media.reusePolicy.enrichmentOnly.some(scope => !SOURCE_SCOPES.some(source => source.id === scope))) {
        violations.push('media crosswalk references an unpermitted enrichment scope');
    }
    if (media.scopes.soya.answerGated > media.scopes.soya.mappingCount) {
        violations.push('Soya gated-answer count exceeds mappings');
    }
    if (media.scopes.soya.rightsReviewRequired !== media.scopes.soya.mappingCount) {
        violations.push('Every Soya item must remain rights-review-required');
    }
}

function checkPublicShape(outputs, violations) {
    visit(outputs, [], (key, value, trail) => {
        if (PRIVATE_KEY.test(key)) violations.push(`private field leaked at ${[...trail, key].join('.')}`);
        if (key === 'sourceId' && typeof value === 'string' && !ALLOWED_SOURCE_ID.test(value)) {
            violations.push(`unpermitted source id: ${value}`);
        }
        if (typeof value === 'string' && (value.startsWith('/Users/') || value.includes('\\Users\\'))) {
            violations.push(`absolute private path leaked at ${[...trail, key].join('.')}`);
        }
    });
}

function visit(value, trail, callback) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, [...trail, String(index)], callback));
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        callback(key, child, trail);
        visit(child, [...trail, key], callback);
    }
}
