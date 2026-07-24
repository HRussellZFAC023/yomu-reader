import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../..');
const snapshotPath = resolve(repositoryRoot, 'config/dictionaries/source-snapshot.v1.json');
const acquisitionPath = resolve(repositoryRoot, 'config/dictionaries/acquisition.v1.json');
const outputRoot = resolve(repositoryRoot, 'config/dictionaries/manifests/v1');

export const SLICE1_LANGUAGES = [
  { tag: 'sq', englishName: 'Albanian', nativeName: 'Shqip', direction: 'ltr', evidence: 'kaikki-to-yomitan' },
  { tag: 'grc', englishName: 'Ancient Greek', nativeName: 'Ἑλληνική', direction: 'ltr', evidence: 'kaikki-to-yomitan' },
  { tag: 'ar', englishName: 'Arabic', nativeName: 'العربية', direction: 'rtl', defaultScript: 'Arab', evidence: 'Lingoes and Apple bilingual collections' },
  { tag: 'yue', englishName: 'Cantonese', nativeName: '粵語', direction: 'ltr', defaultScript: 'Hant', evidence: 'Cantonese dictionary collection' },
  { tag: 'zh', englishName: 'Chinese', nativeName: '中文', direction: 'ltr', defaultScript: 'Hans', evidence: 'Mandarin dictionary collection' },
  { tag: 'da', englishName: 'Danish', nativeName: 'Dansk', direction: 'ltr', evidence: 'Leipzig language collection' },
  { tag: 'nl', englishName: 'Dutch', nativeName: 'Nederlands', direction: 'ltr', evidence: 'Apple bilingual collection and JMdict' },
  { tag: 'en', englishName: 'English', nativeName: 'English', direction: 'ltr', evidence: 'Japanese-English dictionary collection' },
  { tag: 'fi', englishName: 'Finnish', nativeName: 'Suomi', direction: 'ltr', evidence: 'Leipzig language collection' },
  { tag: 'fr', englishName: 'French', nativeName: 'Français', direction: 'ltr', evidence: 'French-Japanese, Apple, and JMdict collections' },
  { tag: 'de', englishName: 'German', nativeName: 'Deutsch', direction: 'ltr', evidence: 'Japanese-German, Apple, and JMdict collections' },
  { tag: 'el', englishName: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr', evidence: 'kaikki and Lingoes collections' },
  { tag: 'hu', englishName: 'Hungarian', nativeName: 'Magyar', direction: 'ltr', evidence: 'JMdict multilingual collection' },
  { tag: 'id', englishName: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr', evidence: 'Indonesian and Apple collections' },
  { tag: 'it', englishName: 'Italian', nativeName: 'Italiano', direction: 'ltr', evidence: 'kaikki, Lingoes, and Apple collections' },
  { tag: 'km', englishName: 'Khmer', nativeName: 'ខ្មែរ', direction: 'ltr', defaultScript: 'Khmr', evidence: 'Leipzig language collection' },
  { tag: 'ko', englishName: 'Korean', nativeName: '한국어', direction: 'ltr', evidence: 'Korean dictionary collection' },
  { tag: 'lo', englishName: 'Lao', nativeName: 'ລາວ', direction: 'ltr', defaultScript: 'Laoo', evidence: 'Lao dictionary collection' },
  { tag: 'la', englishName: 'Latin', nativeName: 'Latina', direction: 'ltr', evidence: 'kaikki and Lingoes collections' },
  { tag: 'mn', englishName: 'Mongolian', nativeName: 'Монгол', direction: 'ltr', defaultScript: 'Cyrl', evidence: 'Japanese-Mongolian and Korean collections' },
  { tag: 'fa', englishName: 'Persian', nativeName: 'فارسی', direction: 'rtl', defaultScript: 'Arab', evidence: 'kaikki-to-yomitan' },
  { tag: 'pl', englishName: 'Polish', nativeName: 'Polski', direction: 'ltr', evidence: 'kaikki and Apple collections' },
  { tag: 'pt', englishName: 'Portuguese', nativeName: 'Português', direction: 'ltr', evidence: 'Japanese-Portuguese, Lingoes, and Apple collections' },
  { tag: 'ro', englishName: 'Romanian', nativeName: 'Română', direction: 'ltr', evidence: 'Converted Migaku collection' },
  { tag: 'ru', englishName: 'Russian', nativeName: 'Русский', direction: 'ltr', evidence: 'Russian, Lingoes, Apple, and JMdict collections' },
  { tag: 'sh', englishName: 'Serbo-Croatian', nativeName: 'Srpskohrvatski', direction: 'ltr', defaultScript: 'Latn', evidence: 'kaikki-to-yomitan' },
  { tag: 'es', englishName: 'Spanish', nativeName: 'Español', direction: 'ltr', evidence: 'Migaku, Apple, and JMdict collections' },
  { tag: 'sv', englishName: 'Swedish', nativeName: 'Svenska', direction: 'ltr', evidence: 'JMdict multilingual collection' },
  { tag: 'tl', englishName: 'Tagalog', nativeName: 'Tagalog', direction: 'ltr', evidence: 'Leipzig language collection' },
  { tag: 'th', englishName: 'Thai', nativeName: 'ไทย', direction: 'ltr', defaultScript: 'Thai', evidence: 'Thai, Korean, and Apple collections' },
  { tag: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', evidence: 'Leipzig language collection' },
  { tag: 'vi', englishName: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr', evidence: 'Vietnamese, Korean, and Apple collections' },
];

const nativeTermDictionary = {
  nl: 'jmdict-nl',
  en: 'jmdict-en',
  fr: 'jmdict-fr',
  de: 'jmdict-de',
  hu: 'jmdict-hu',
  ru: 'jmdict-ru',
  es: 'jmdict-es',
  sv: 'jmdict-sv',
};
const nativeKanjiDictionary = {
  en: 'kanjidic-en',
  fr: 'kanjidic-fr',
  pt: 'kanjidic-pt',
  es: 'kanjidic-es',
};
const dictionaryLanguage = {
  'jmdict-nl': 'nl',
  'jmdict-en': 'en',
  'jmdict-fr': 'fr',
  'jmdict-de': 'de',
  'jmdict-hu': 'hu',
  'jmdict-ru': 'ru',
  'jmdict-es': 'es',
  'jmdict-sv': 'sv',
  jmnedict: 'en',
  'kanjidic-en': 'en',
  'kanjidic-fr': 'fr',
  'kanjidic-pt': 'pt',
  'kanjidic-es': 'es',
};

export async function buildFrozenManifests() {
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  const acquisition = JSON.parse(await readFile(acquisitionPath, 'utf8'));
  if (SLICE1_LANGUAGES.length !== 32) throw new Error(`Slice 1 roster must contain 32 languages, found ${SLICE1_LANGUAGES.length}.`);
  const sourceById = new Map(acquisition.sources.map(source => [source.id, source]));
  const catalog = {
    schemaVersion: 1,
    revision: snapshot.revision,
    generatedAt: snapshot.capturedAt,
    targetLanguage: 'ja',
    objectsBaseUrl: 'https://dictionaries.yomureader.com/',
    sourceSnapshot: {
      catalogueRepository: snapshot.catalogueRepository,
      catalogueCommit: snapshot.catalogueCommit,
      catalogueFile: snapshot.catalogueFile,
      driveFolderUrl: snapshot.driveFolderUrl,
      capturedAt: snapshot.capturedAt,
    },
    entries: Object.entries(dictionaryLanguage).map(([id, definitionLanguage]) =>
      catalogEntry(id, definitionLanguage, sourceById.get(id))),
  };
  const languages = {
    schemaVersion: 1,
    revision: snapshot.revision,
    generatedAt: snapshot.capturedAt,
    targetLanguage: 'ja',
    count: 32,
    languages: SLICE1_LANGUAGES.map(language => ({
      tag: language.tag,
      englishName: language.englishName,
      nativeName: language.nativeName,
      direction: language.direction,
      ...(language.defaultScript ? { defaultScript: language.defaultScript } : {}),
      targetLanguage: 'ja',
      status: 'slice1',
      catalogueEvidence: [language.evidence],
    })),
  };
  await writeJson(resolve(outputRoot, 'catalog.json'), catalog);
  await writeJson(resolve(outputRoot, 'languages.json'), languages);
  for (const language of SLICE1_LANGUAGES) {
    await writeJson(
      resolve(outputRoot, 'recommendations', `${language.tag}-ja.json`),
      recommendationManifest(language.tag, snapshot.revision),
    );
  }
}

function catalogEntry(id, definitionLanguage, source) {
  if (!source) throw new Error(`Acquisition source ${id} is missing.`);
  const isNames = id === 'jmnedict';
  const isKanji = id.startsWith('kanjidic-');
  const family = isNames ? 'JMnedict' : isKanji ? 'KANJIDIC' : 'JMdict';
  return {
    id,
    title: `${family} (${definitionLanguage})`,
    format: 'yomitan',
    version: '2026-07-23',
    categories: [isNames ? 'names' : isKanji ? 'kanji' : 'terms'],
    headwordLanguages: ['ja'],
    definitionLanguages: [definitionLanguage],
    source: {
      acquisitionId: id,
      url: source.url,
      projectUrl: 'https://github.com/yomidevs/jmdict-yomitan',
      catalogueSection: isKanji ? 'Japanese / Kanji / KANJIDIC' : 'Japanese / Terms',
    },
    license: {
      spdx: 'CC-BY-SA-4.0',
      attribution: 'Electronic Dictionary Research and Development Group (EDRDG) and jmdict-yomitan contributors',
      sourceUrl: 'https://github.com/yomidevs/jmdict-yomitan',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      redistribution: 'allowed',
      reviewNote: 'The generated dictionaries are published by jmdict-yomitan under CC BY-SA 4.0.',
    },
    distribution: { state: 'source-only' },
  };
}

function recommendationManifest(learnerLanguage, catalogRevision) {
  const primary = nativeTermDictionary[learnerLanguage] ?? 'jmdict-en';
  const kanji = nativeKanjiDictionary[learnerLanguage] ?? 'kanjidic-en';
  const primaryLanguage = dictionaryLanguage[primary];
  const kanjiLanguage = dictionaryLanguage[kanji];
  const lacksNativeTerms = primaryLanguage !== learnerLanguage;
  const translationMode = (definitionLanguage) => (
    learnerLanguage === 'grc' || definitionLanguage === learnerLanguage ? 'off' : 'offer'
  );
  return {
    schemaVersion: 1,
    catalogRevision,
    learnerLanguage,
    targetLanguage: 'ja',
    strategy: 'native-first',
    readiness: 'blocked',
    blockers: ['dictionary-objects-not-yet-mirrored'],
    dictionaries: [
      {
        dictionaryId: primary,
        role: lacksNativeTerms ? 'fallback-terms' : 'primary-terms',
        priority: 10,
        selectedByDefault: true,
        definitionLanguage: primaryLanguage,
        translationMode: translationMode(primaryLanguage),
      },
      {
        dictionaryId: 'jmnedict',
        role: 'names',
        priority: 20,
        selectedByDefault: true,
        definitionLanguage: 'en',
        translationMode: translationMode('en'),
      },
      {
        dictionaryId: kanji,
        role: 'kanji',
        priority: 30,
        selectedByDefault: true,
        definitionLanguage: kanjiLanguage,
        translationMode: translationMode(kanjiLanguage),
      },
    ],
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await buildFrozenManifests();
}
