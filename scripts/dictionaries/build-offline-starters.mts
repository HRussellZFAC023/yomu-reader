import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SLICE1_LEARNER_LANGUAGES, SLICE1_TARGET_LANGUAGES } from '../../src/reader/dictionaries/catalog/types';
import { FROZEN_DICTIONARY_CATALOG } from '../../src/reader/dictionaries/catalog/runtime';
import { dictionaryObjectKey } from '../../src/reader/dictionaries/catalog/integrity';
import { catalogOfflineStarterPlan } from '../../src/reader/dictionaries/offline-starters-catalog';
import type { OfflineStarterArchive } from '../../src/reader/dictionaries/offline-starter-types';

// Derive only install data from the existing licensed catalogue and selection
// policy. Shared archives are stored once; profile lists preserve exact order.
export function offlineStarterProjectionText(): string {
    const dictionaries: Record<string, OfflineStarterArchive> = {};
    const objectsBaseUrl = FROZEN_DICTIONARY_CATALOG.objectsBaseUrl;
    const profiles: Record<string, string[]> = {};
    for (const learner of SLICE1_LEARNER_LANGUAGES) {
        for (const target of SLICE1_TARGET_LANGUAGES) {
            profiles[`${learner}-${target}`] = catalogOfflineStarterPlan(learner, target).map(({ id: key, dictionary }) => {
                const installedIdentity = dictionary.installedIdentity;
                const options = dictionary.integrity ? { integrity: dictionary.integrity } : undefined;
                const derivedUrl = options?.integrity
                    ? new URL(dictionaryObjectKey(options.integrity.sha256), objectsBaseUrl).href
                    : undefined;
                const entry: OfflineStarterArchive = {
                    name: dictionary.name,
                    ...(dictionary.downloadUrl !== derivedUrl ? { downloadUrl: dictionary.downloadUrl! } : {}),
                    ...(installedIdentity !== key ? { installedIdentity } : {}),
                    ...options,
                };
                if (dictionaries[key] && JSON.stringify(dictionaries[key]) !== JSON.stringify(entry)) {
                    throw new Error(`Conflicting offline archive identity: ${key}`);
                }
                dictionaries[key] = entry;
                return key;
            });
        }
    }
    return `${JSON.stringify({ objectsBaseUrl, dictionaries, profiles }, null, 2)}\n`;
}

{
    // Both standalone modes must reject a stale upstream projection. The
    // runtime generator owns that projection policy; do not duplicate it here.
    execFileSync(process.execPath, [
        fileURLToPath(new URL('./build-runtime-catalog.mjs', import.meta.url)),
        '--check',
    ], { stdio: 'pipe' });
    const output = offlineStarterProjectionText();
    const target = new URL('../../config/dictionaries/published/v1/offline-starters.json', import.meta.url);
    if (process.argv.includes('--check')) {
        if (readFileSync(target, 'utf8') !== output) throw new Error('Offline starters are stale. Run npm run dictionaries:starters:generate.');
    } else {
        writeFileSync(target, output);
    }
}
