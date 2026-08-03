import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  defaultManifestRoot,
  readJson,
} from './lib.mjs';

export const DEFAULT_RECOMMENDATION_TARGET_LANGUAGE = 'ja';

export function recommendationTargetLanguages(learnerLanguages) {
  assertLanguageRoster(learnerLanguages);
  return [DEFAULT_RECOMMENDATION_TARGET_LANGUAGE, ...learnerLanguages];
}

export function recommendationFilename(learnerLanguage, targetLanguage) {
  return `${learnerLanguage}-${targetLanguage}.json`;
}

export function expectedRecommendationFilenames(learnerLanguages) {
  return recommendationTargetLanguages(learnerLanguages)
    .flatMap(targetLanguage => learnerLanguages.map(learnerLanguage =>
      recommendationFilename(learnerLanguage, targetLanguage)));
}

export function parseRecommendationFilename(filename, learnerLanguages) {
  const match = /^([a-z]{2,3})-([a-z]{2,3})\.json$/.exec(filename);
  if (!match) return null;
  const targets = recommendationTargetLanguages(learnerLanguages);
  if (!learnerLanguages.includes(match[1]) || !targets.includes(match[2])) return null;
  return { learnerLanguage: match[1], targetLanguage: match[2] };
}

/**
 * Derives the non-Japanese happy-path recommendation from catalogue facts.
 *
 * Terms prefer definitions in the learner language, then the target language,
 * then English, then any remaining language. For the same definition language,
 * the complete WTY terms archive wins over its smaller gloss-only alternative,
 * followed by a stable lexical ID tie-break. Pronunciation uses the same
 * definition-language order. This function deliberately rejects Japanese:
 * that target keeps the hand-curated starter and five-role shelf.
 */
export function buildNonJapaneseRecommendationManifest(
  catalog,
  learnerLanguage,
  targetLanguage,
) {
  if (targetLanguage === DEFAULT_RECOMMENDATION_TARGET_LANGUAGE) {
    throw new Error('Japanese recommendations must come from the curated manifest and shelf policy.');
  }
  const candidates = (catalog.entries ?? []).filter(entry =>
    entry.headwordLanguages?.includes(targetLanguage)
    && ['published', 'source-only', 'upstream'].includes(entry.distribution?.state));
  const terms = selectCandidate(
    candidates.filter(entry => entry.categories?.includes('terms')),
    learnerLanguage,
    targetLanguage,
    true,
  );
  const pronunciation = selectCandidate(
    candidates.filter(entry => entry.categories?.includes('pronunciation')),
    learnerLanguage,
    targetLanguage,
    false,
  );
  const selected = [terms, pronunciation].filter(Boolean);
  const blockers = [];
  if (!terms) blockers.push('no-target-terms-dictionary');
  if (selected.some(candidate => candidate.entry.distribution?.state !== 'published')) {
    blockers.push('dictionary-objects-not-yet-mirrored');
  }
  const dictionaries = [];
  if (terms) {
    dictionaries.push({
      dictionaryId: terms.entry.id,
      role: terms.definitionLanguage === learnerLanguage ? 'primary-terms' : 'fallback-terms',
      priority: 10,
      selectedByDefault: true,
      definitionLanguage: terms.definitionLanguage,
      translationMode: translationMode(learnerLanguage, terms.definitionLanguage),
    });
  }
  if (pronunciation) {
    dictionaries.push({
      dictionaryId: pronunciation.entry.id,
      role: 'pronunciation',
      priority: 20,
      selectedByDefault: true,
      definitionLanguage: pronunciation.definitionLanguage,
      translationMode: 'off',
    });
  }
  return {
    schemaVersion: 1,
    catalogRevision: catalog.revision,
    learnerLanguage,
    targetLanguage,
    strategy: 'native-first',
    readiness: blockers.length ? 'blocked' : 'ready',
    blockers,
    dictionaries,
  };
}

export async function generateRecommendationMatrix({
  catalog,
  learnerLanguages,
  japaneseSourceDirectory,
  outputDirectory,
  write = false,
}) {
  assertLanguageRoster(learnerLanguages);
  const expected = expectedRecommendationFilenames(learnerLanguages);
  const generated = [];
  for (const targetLanguage of recommendationTargetLanguages(learnerLanguages)) {
    for (const learnerLanguage of learnerLanguages) {
      const filename = recommendationFilename(learnerLanguage, targetLanguage);
      if (targetLanguage === DEFAULT_RECOMMENDATION_TARGET_LANGUAGE) {
        const sourcePath = resolve(japaneseSourceDirectory, filename);
        const raw = await readFile(sourcePath, 'utf8');
        const manifest = JSON.parse(raw);
        assertManifestPair(manifest, filename, learnerLanguage, targetLanguage);
        if (manifest.catalogRevision !== catalog.revision) {
          throw new Error(`${filename} catalogRevision must match ${catalog.revision}.`);
        }
        if (write && resolve(outputDirectory, filename) !== sourcePath) {
          await mkdir(outputDirectory, { recursive: true });
          await writeFile(resolve(outputDirectory, filename), raw, 'utf8');
        }
        generated.push({ filename, manifest });
        continue;
      }
      const manifest = buildNonJapaneseRecommendationManifest(
        catalog,
        learnerLanguage,
        targetLanguage,
      );
      if (write) {
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(
          resolve(outputDirectory, filename),
          `${JSON.stringify(manifest, null, 2)}\n`,
          'utf8',
        );
      }
      generated.push({ filename, manifest });
    }
  }
  if (generated.length !== expected.length) {
    throw new Error(`Expected ${expected.length} recommendation manifests, generated ${generated.length}.`);
  }
  return generated;
}

function selectCandidate(entries, learnerLanguage, targetLanguage, rankTermsVariant) {
  const candidates = entries.flatMap(entry => {
    const definitionLanguage = bestDefinitionLanguage(
      entry.definitionLanguages ?? [],
      learnerLanguage,
      targetLanguage,
    );
    return definitionLanguage ? [{ entry, definitionLanguage }] : [];
  });
  candidates.sort((left, right) => {
    const languageDifference = definitionLanguageRank(
      left.definitionLanguage,
      learnerLanguage,
      targetLanguage,
    ) - definitionLanguageRank(
      right.definitionLanguage,
      learnerLanguage,
      targetLanguage,
    );
    if (languageDifference) return languageDifference;
    if (rankTermsVariant) {
      const variantDifference = termsVariantRank(
        left.entry.id,
        targetLanguage,
        left.definitionLanguage,
      ) - termsVariantRank(
        right.entry.id,
        targetLanguage,
        right.definitionLanguage,
      );
      if (variantDifference) return variantDifference;
    }
    // Content decides among equally-ranked candidates. The runtime selector in
    // src/reader/dictionaries/recommended.ts makes the same choice and a test
    // asserts the two agree, so this must stay in step with it. Cantonese is why:
    // wty-yue-en is 28,109 bytes against Words.hk's 13,578,603, and preferring the
    // canonical WTY id alone recommended the empty one.
    const bytesDifference = publishedBytes(right.entry) - publishedBytes(left.entry);
    if (bytesDifference) return bytesDifference;
    return left.entry.id.localeCompare(right.entry.id);
  });
  return candidates[0] ?? null;
}

function bestDefinitionLanguage(definitionLanguages, learnerLanguage, targetLanguage) {
  return [...definitionLanguages].sort((left, right) =>
    definitionLanguageRank(left, learnerLanguage, targetLanguage)
    - definitionLanguageRank(right, learnerLanguage, targetLanguage)
    || left.localeCompare(right))[0] ?? null;
}

function definitionLanguageRank(language, learnerLanguage, targetLanguage) {
  const preferred = [...new Set([learnerLanguage, targetLanguage, 'en'])];
  const index = preferred.indexOf(language);
  return index < 0 ? preferred.length : index;
}

function termsVariantRank(id, targetLanguage, definitionLanguage) {
  // `-gloss` archives are a different KIND of entry, so they stay behind ordinary
  // terms. The canonical `wty-<target>-<defs>` id is no longer ranked ahead of
  // everything else — that assumed WTY always carries the content, which is false
  // for Cantonese. Size breaks the remaining tie; see the comparator above.
  return id === `wty-${targetLanguage}-${definitionLanguage}-gloss` ? 1 : 0;
}

function publishedBytes(entry) {
  const distribution = entry?.distribution;
  return distribution?.state === 'published' ? distribution.object?.bytes ?? 0 : 0;
}

function translationMode(learnerLanguage, definitionLanguage) {
  return learnerLanguage === 'grc' || definitionLanguage === learnerLanguage ? 'off' : 'offer';
}

function assertLanguageRoster(learnerLanguages) {
  if (!Array.isArray(learnerLanguages) || learnerLanguages.length !== 32) {
    throw new Error(`Recommendation matrix requires exactly 32 learner languages, found ${learnerLanguages?.length ?? 0}.`);
  }
  if (new Set(learnerLanguages).size !== learnerLanguages.length) {
    throw new Error('Recommendation learner-language roster contains duplicates.');
  }
  if (learnerLanguages.includes(DEFAULT_RECOMMENDATION_TARGET_LANGUAGE)) {
    throw new Error('Japanese is a study target, not a Slice 1 learner language.');
  }
}

function assertManifestPair(manifest, filename, learnerLanguage, targetLanguage) {
  if (manifest?.learnerLanguage !== learnerLanguage || manifest?.targetLanguage !== targetLanguage) {
    throw new Error(`${filename} fields do not match its learner-target filename.`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const readOption = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index < 0 ? fallback : resolve(argv[index + 1]);
  };
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/dictionaries/recommendation-pairs.mjs [--catalog FILE] [--languages FILE] [--japanese-source DIR] [--output DIR] [--write]');
    return;
  }
  const catalogPath = readOption('--catalog', resolve(defaultManifestRoot, 'catalog.json'));
  const languagesPath = readOption('--languages', resolve(defaultManifestRoot, 'languages.json'));
  const outputDirectory = readOption('--output', resolve(defaultManifestRoot, 'recommendations'));
  const japaneseSourceDirectory = readOption('--japanese-source', outputDirectory);
  const [catalog, languages] = await Promise.all([
    readJson(catalogPath),
    readJson(languagesPath),
  ]);
  const learnerLanguages = languages.languages.map(language => language.tag);
  const generated = await generateRecommendationMatrix({
    catalog,
    learnerLanguages,
    japaneseSourceDirectory,
    outputDirectory,
    write: argv.includes('--write'),
  });
  console.log(JSON.stringify({
    mode: argv.includes('--write') ? 'write' : 'dry-run',
    catalogRevision: catalog.revision,
    learners: learnerLanguages.length,
    targets: recommendationTargetLanguages(learnerLanguages).length,
    recommendations: generated.length,
    outputDirectory,
  }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await main();
