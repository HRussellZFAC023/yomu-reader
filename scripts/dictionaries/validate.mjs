import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  contentAddressedObjectKey,
  defaultAcquisitionPath,
  defaultManifestRoot,
  readJson,
} from './lib.mjs';
import { SLICE1_LANGUAGES } from './build-frozen-manifests.mjs';
import { assertDictionaryCoverage } from './coverage.mjs';

export async function validateDictionaryManifests({
  manifestRoot = defaultManifestRoot,
  acquisitionPath = defaultAcquisitionPath,
} = {}) {
  const catalog = await readJson(resolve(manifestRoot, 'catalog.json'));
  const languages = await readJson(resolve(manifestRoot, 'languages.json'));
  const acquisition = await readJson(acquisitionPath);
  assert(catalog.schemaVersion === 1, 'catalog schemaVersion must equal 1');
  assert(catalog.targetLanguage === 'ja', 'catalog targetLanguage must equal ja');
  assert(/^https:\/\//.test(catalog.objectsBaseUrl), 'catalog objectsBaseUrl must use HTTPS');
  assert(/^[a-f0-9]{40}$/.test(catalog.sourceSnapshot?.catalogueCommit ?? ''), 'catalog source commit must be frozen');
  assert(languages.schemaVersion === 1, 'language schemaVersion must equal 1');
  assert(languages.targetLanguage === 'ja', 'language targetLanguage must equal ja');
  assert(languages.count === 32, 'language count must equal 32');
  assert(languages.languages?.length === 32, 'language manifest must contain exactly 32 records');
  const expectedTags = SLICE1_LANGUAGES.map(language => language.tag);
  const actualTags = languages.languages.map(language => language.tag);
  assert(JSON.stringify(actualTags) === JSON.stringify(expectedTags), `language roster/order must be ${expectedTags.join(', ')}`);
  assertUnique(actualTags, 'language tag');
  const acquisitionIds = new Set((acquisition.sources ?? []).map(source => source.id));
  const catalogIds = catalog.entries.map(entry => entry.id);
  assertUnique(catalogIds, 'catalog dictionary id');
  for (const entry of catalog.entries) {
    assert(acquisitionIds.has(entry.source?.acquisitionId), `catalog ${entry.id} references missing acquisition source`);
    assert(/^https:\/\//.test(entry.source?.url ?? ''), `catalog ${entry.id} source URL must use HTTPS`);
    if (entry.distribution?.state === 'published') {
      assert(entry.license?.redistribution === 'allowed', `catalog ${entry.id} cannot publish without approved redistribution`);
      const object = entry.distribution.object;
      assert(object?.key === contentAddressedObjectKey(object?.sha256 ?? ''), `catalog ${entry.id} object key must match SHA-256`);
      assert(Number.isSafeInteger(object.bytes) && object.bytes > 0, `catalog ${entry.id} object size must be positive`);
    }
  }
  const recommendationDirectory = resolve(manifestRoot, 'recommendations');
  const files = (await readdir(recommendationDirectory)).filter(name => name.endsWith('-ja.json')).sort();
  assert(files.length === 32, `expected 32 recommendation manifests, found ${files.length}`);
  const catalogIdSet = new Set(catalogIds);
  for (const tag of expectedTags) {
    const filename = `${tag}-ja.json`;
    assert(files.includes(filename), `missing recommendation manifest ${filename}`);
    const recommendation = await readJson(resolve(recommendationDirectory, filename));
    assert(recommendation.schemaVersion === 1, `${filename} schemaVersion must equal 1`);
    assert(recommendation.learnerLanguage === tag, `${filename} learnerLanguage must equal ${tag}`);
    assert(recommendation.targetLanguage === 'ja', `${filename} targetLanguage must equal ja`);
    assert(recommendation.catalogRevision === catalog.revision, `${filename} catalogRevision must match the catalog`);
    assert(recommendation.strategy === 'native-first', `${filename} must use native-first strategy`);
    assertUnique(recommendation.dictionaries.map(item => item.dictionaryId), `${filename} dictionary id`);
    let lastPriority = -1;
    for (const item of recommendation.dictionaries) {
      assert(catalogIdSet.has(item.dictionaryId), `${filename} references unknown dictionary ${item.dictionaryId}`);
      assert(item.priority >= lastPriority, `${filename} recommendations must be ordered by priority`);
      lastPriority = item.priority;
    }
    if (recommendation.readiness === 'ready') {
      assert(recommendation.blockers.length === 0, `${filename} is ready but still has blockers`);
      for (const item of recommendation.dictionaries) {
        const entry = catalog.entries.find(candidate => candidate.id === item.dictionaryId);
        assert(entry?.distribution?.state === 'published', `${filename} is ready but ${item.dictionaryId} is not published`);
      }
    } else {
      assert(recommendation.blockers.length > 0, `${filename} is blocked without an explanation`);
    }
  }
  return {
    revision: catalog.revision,
    languages: actualTags.length,
    dictionaries: catalog.entries.length,
    recommendations: files.length,
    publishedObjects: catalog.entries.filter(entry => entry.distribution?.state === 'published').length,
  };
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const result = await validateDictionaryManifests();
  // validateDictionaryManifests only ever sees the pre-release manifests, which
  // publish nothing; the catalogue Settings actually reads is the published
  // snapshot. Coverage is checked against that one, and against the record of
  // which objects the mirror is known to serve.
  const coverage = await assertDictionaryCoverage();
  console.log(JSON.stringify({ status: 'valid', ...result, coverage }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
