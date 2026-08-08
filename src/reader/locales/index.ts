export {
  ENGLISH_FALLBACK_MESSAGES,
  extractMessagePlaceholders,
  validateLocaleCatalog,
} from "./catalog";
export type { LocaleMessageKey, LocaleMessages } from "./catalog";
export { LOCALE_CATALOGS } from "./catalogs";
export {
  COPY_TIER_RULE_NAMES,
  HUMAN_TIER_ESCALATION_PHRASES,
  copyTierOf,
  escalatesToHumanTier,
} from "./copy-tiers";
export type { CopyTier, CopyTierCategory, CopyTierDecision } from "./copy-tiers";
export {
  READER_INTERFACE_DIR_ATTRIBUTE,
  READER_INTERFACE_LOCALE_ATTRIBUTE,
  applyInterfaceLocaleToDocument,
  applyInterfaceLocaleToRoot,
  formatIsolated,
  isRtlInterface,
  isolate,
} from "./direction";
export {
  ENGLISH_INTERFACE_LOCALE,
  INTERFACE_LOCALES,
  RTL_GATE_ITEMS,
  RTL_INTERFACE_LOCALES,
  availableInterfaceLocales,
  blockedInterfaceLocales,
  interfaceLocaleByTag,
  rtlGatePasses,
} from "./manifest";
export type {
  InterfaceLocale,
  InterfaceLocaleBlocker,
  RtlGateItem,
} from "./manifest";
export {
  isMessageId,
  legacyChromeMessageId,
  legacyDocsMessageId,
} from "./message-ids";
export type { MessageId, MessageNamespace } from "./message-ids";
export {
  measureLocaleCoverage,
  registerChromeMessages,
  registerSetupMessages,
  setupMessageIdFor,
  setupMessageIds,
  setupPackFor,
} from "./registry";
export type { LocaleCoverage, RegisteredMessage } from "./registry";
export { resolveInterfaceLocale, resolveMessage } from "./resolve";
export type {
  InterfaceLocaleResolution,
  MessageLookup,
  MessagePack,
} from "./resolve";
export {
  LEARNER_LANGUAGES,
  SLICE_ONE_LEARNER_LANGUAGE_COUNT,
  SLICE_ONE_TARGET_LANGUAGE,
  isLearnerLanguageId,
  learnerLanguageById,
  resolveLearnerLanguage,
} from "./roster";
export { LEARNER_LANGUAGE_IDS } from "./types";
export type {
  LearnerLanguageId,
  TextDirection,
  TranslationReviewStatus,
} from "./types";
