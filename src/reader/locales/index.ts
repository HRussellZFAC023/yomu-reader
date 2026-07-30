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
  interfaceDirectionOf,
  isRtlInterface,
  isolate,
} from "./direction";
export { JAPANESE_SETUP_MESSAGES } from "./japanese-setup";
export {
  ENGLISH_INTERFACE_LOCALE,
  INTERFACE_LOCALES,
  INTERFACE_LOCALE_LEDGER,
  RTL_GATE_ITEMS,
  RTL_INTERFACE_LOCALES,
  availableInterfaceLocales,
  blockedInterfaceLocales,
  directionForScript,
  interfaceLocaleByTag,
  rtlGatePasses,
  scriptFontStack,
} from "./manifest";
export type {
  InterfaceLocale,
  InterfaceLocaleBlocker,
  RtlGateItem,
} from "./manifest";
export {
  MESSAGE_NAMESPACES,
  docsMessageId,
  isMessageId,
  legacyChromeMessageId,
  legacyDocsMessageId,
  messageNamespaceOf,
} from "./message-ids";
export type { MessageId, MessageNamespace } from "./message-ids";
export {
  claimedAvailableTags,
  measureLocaleCoverage,
  registerChromeMessages,
  registerMessages,
  registerSetupMessages,
  reviewStatusOf,
  setupMessageIdFor,
  setupMessageIds,
  setupPackFor,
} from "./registry";
export type { LocaleCoverage, RegisteredMessage } from "./registry";
export {
  localeChain,
  resolveInterfaceLocale,
  resolveMessage,
} from "./resolve";
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
