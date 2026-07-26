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

export function prepareDictionaryRelease(options?: {
  manifestRoot?: string;
  stagingRoot?: string;
  releaseRoot?: string;
  shelfPath?: string;
  connectorInventory?: unknown;
  write?: boolean;
}): Promise<{
  mode: 'write' | 'dry-run';
  releaseRoot: string;
  catalogEntries: number;
  promotedObjects: number;
  shelfRecommendationRows: number;
  readyLanguages: number;
  blockedLanguages: number;
}>;
