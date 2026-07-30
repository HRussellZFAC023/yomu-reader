export interface RecommendationShelfSlot {
  role: string;
  priority: number;
  dictionaryId: string;
  selectedByDefault: boolean;
  offerTranslation: boolean;
}

export interface DictionaryRecommendationRow {
  dictionaryId: string;
  role: string;
  priority: number;
  selectedByDefault: boolean;
  definitionLanguage: string;
  translationMode: 'off' | 'offer';
}

export interface DictionaryRecommendationManifestJson {
  learnerLanguage: string;
  targetLanguage: string;
  dictionaries: DictionaryRecommendationRow[];
  [key: string]: unknown;
}

export const defaultRecommendationShelfPath: string;

export function parseRecommendationShelf(policy: unknown): RecommendationShelfSlot[];

export function applyRecommendationShelf(
  recommendation: DictionaryRecommendationManifestJson,
  catalog: { targetLanguage: string; entries: Array<Record<string, unknown>> },
  slots: readonly RecommendationShelfSlot[],
): DictionaryRecommendationManifestJson;

export interface RecommendationShelfIntegrity {
  shelfStage: 'pre-release' | 'released';
  shelfSlotsPerLanguage: number;
}

export function assertRecommendationShelfIntact(
  recommendations: ReadonlyArray<{ filename: string; manifest: DictionaryRecommendationManifestJson }>,
  catalog: { targetLanguage: string; entries: Array<Record<string, unknown>> },
  slots: readonly RecommendationShelfSlot[],
): RecommendationShelfIntegrity;

export function mergePublishedBase(
  published: { entries?: Array<Record<string, any>> },
  staged: { entries?: Array<Record<string, any>>; [key: string]: any },
): { entries: Array<{ id: string; [key: string]: any }>; [key: string]: any };

export function applyLanguageReadiness(
  languages: { languages?: Array<Record<string, any>>; [key: string]: any },
  catalog: { entries?: Array<Record<string, any>>; [key: string]: any },
  wtySnapshot?: {
    artifacts?: Array<Record<string, any>>;
    missingExpectedPaths?: string[];
  } | null,
): { languages: Array<Record<string, any>>; [key: string]: any };

export function prepareDictionaryRelease(options?: {
  manifestRoot?: string;
  stagingRoot?: string;
  releaseRoot?: string;
  publishedBaseRoot?: string | null;
  shelfPath?: string;
  connectorInventory?: unknown;
  write?: boolean;
}): Promise<{
  mode: 'write' | 'dry-run';
  releaseRoot: string;
  catalogEntries: number;
  promotedObjects: number;
  recommendationCount: number;
  targetLanguageCount: number;
  shelfRecommendationRows: number;
  shelfStage: 'pre-release' | 'released';
  shelfSlotsPerLanguage: number;
  readyLanguages: number;
  blockedLanguages: number;
  readyRecommendations: number;
  blockedRecommendations: number;
}>;
