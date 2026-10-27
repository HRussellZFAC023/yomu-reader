import languageConfig from "../../../config/multilingual/languages.json";
import { LEARNER_LANGUAGE_IDS } from "./types";
import type { LearnerLanguage, LearnerLanguageId } from "./types";

const configuredLanguages = languageConfig.languages as LearnerLanguage[];

export const LEARNER_LANGUAGES: readonly LearnerLanguage[] = Object.freeze(
  configuredLanguages.map((language) =>
    Object.freeze({
      ...language,
      scripts: Object.freeze([...language.scripts]),
    }),
  ),
);

const LANGUAGE_BY_ID = new Map<LearnerLanguageId, LearnerLanguage>(
  LEARNER_LANGUAGES.map((language) => [language.id, language]),
);

export function learnerLanguageById(id: LearnerLanguageId): LearnerLanguage {
  const language = LANGUAGE_BY_ID.get(id);
  if (!language) throw new Error(`Unknown Slice 1 learner language: ${id}`);
  return language;
}

export function isLearnerLanguageId(value: string): value is LearnerLanguageId {
  return (LEARNER_LANGUAGE_IDS as readonly string[]).includes(value);
}
