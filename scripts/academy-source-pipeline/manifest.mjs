import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sha256Hex } from './io.mjs';

const PUBLIC_MODULE_TYPES = new Set(['folder', 'resource', 'url']);

/**
 * Loads and verifies the private Moodle raw-harvest manifest, and maps harvested
 * files (`<courseId>/<sectionId>/<NN>-<type>-<moduleId>-<slug>.<ext>`) back to
 * their manifest module. Everything returned here is PRIVATE; only aggregate
 * counts may reach public serializers.
 */
export function loadManifest(corpusRoot, expectedSha256) {
    const manifestPath = path.join(corpusRoot, 'manifest.json');
    const bytes = readFileSync(manifestPath);
    const sha256 = sha256Hex(bytes);
    if (expectedSha256 && sha256 !== expectedSha256) {
        throw new Error(`Manifest hash mismatch at ${manifestPath}: expected ${expectedSha256}, got ${sha256}`);
    }
    const manifest = JSON.parse(bytes.toString('utf8'));
    const modules = new Map();
    let sectionCount = 0;
    let moduleCount = 0;
    const moduleTypeCounts = {};
    for (const course of manifest.courses) {
        for (const section of course.sections) {
            sectionCount += 1;
            for (const module of section.modules) {
                moduleCount += 1;
                const privateType = typeof module.type === 'string' ? module.type : 'other';
                const publicType = PUBLIC_MODULE_TYPES.has(privateType) ? privateType : 'other';
                moduleTypeCounts[publicType] = (moduleTypeCounts[publicType] ?? 0) + 1;
                if (module.id !== null && module.id !== undefined) {
                    if (modules.has(module.id)) throw new Error(`Duplicate Moodle module id: ${module.id}`);
                    modules.set(module.id, {
                        courseId: course.id,
                        sectionId: section.id,
                        moduleId: module.id,
                        moduleType: privateType,
                        title: module.title,
                    });
                }
            }
        }
    }
    return {
        manifest,
        sha256,
        modules,
        aggregate: {
            sha256,
            courseCount: manifest.courses.length,
            sectionCount,
            moduleCount,
            moduleTypeCounts: sortedCounts(moduleTypeCounts),
        },
    };
}

const HARVEST_FILE_PATTERN = /^(\d+)-([a-z]+)-(\d+)-(.*)\.[a-z0-9]+$/iu;

/** Map one harvested file (relative to the corpus root) to its manifest module. */
export function mapHarvestPath(relativePath, modules) {
    const segments = relativePath.split(path.sep);
    if (segments.length !== 3) {
        return { status: 'unmapped-path-shape', relativePath };
    }
    const [courseId, sectionId, fileName] = segments;
    const match = HARVEST_FILE_PATTERN.exec(fileName);
    if (!match) return { status: 'unmapped-file-name', relativePath };
    const moduleId = Number(match[3]);
    const module = modules.get(moduleId);
    if (!module) return { status: 'unknown-module-id', relativePath, moduleId };
    if (module.courseId !== courseId || module.sectionId !== sectionId) {
        return { status: 'module-course-mismatch', relativePath, moduleId };
    }
    return { status: 'mapped', relativePath, ...module };
}

function sortedCounts(counts) {
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}
