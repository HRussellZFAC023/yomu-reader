export interface RecommendationPair {
  learnerLanguage: string;
  targetLanguage: string;
}

export interface RecommendationManifestJson extends RecommendationPair {
  schemaVersion: 1;
  catalogRevision: string;
  strategy: 'native-first';
  readiness: 'ready' | 'blocked';
  blockers: string[];
  dictionaries: Array<{
    dictionaryId: string;
    role: string;
    priority: number;
    selectedByDefault: boolean;
    definitionLanguage: string;
    translationMode: 'off' | 'offer';
  }>;
}

export const DEFAULT_RECOMMENDATION_TARGET_LANGUAGE: 'ja';
export function recommendationTargetLanguages(learnerLanguages: readonly string[]): string[];
export function recommendationFilename(learnerLanguage: string, targetLanguage: string): string;
export function expectedRecommendationFilenames(learnerLanguages: readonly string[]): string[];
export function parseRecommendationFilename(
  filename: string,
  learnerLanguages: readonly string[],
): RecommendationPair | null;
export function buildNonJapaneseRecommendationManifest(
  catalog: { revision: string; entries?: Array<Record<string, any>> },
  learnerLanguage: string,
  targetLanguage: string,
): RecommendationManifestJson;
export function generateRecommendationMatrix(options: {
  catalog: { revision: string; entries?: Array<Record<string, any>> };
  learnerLanguages: readonly string[];
  japaneseSourceDirectory: string;
  outputDirectory: string;
  write?: boolean;
}): Promise<Array<{ filename: string; manifest: RecommendationManifestJson }>>;
