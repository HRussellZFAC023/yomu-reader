
export type { LocaleMessageKey, LocaleMessages } from "./catalog";
export { LOCALE_CATALOGS } from "./catalogs";

export type { CopyTier, CopyTierCategory, CopyTierDecision } from "./copy-tiers";

export { INTERFACE_LOCALES } from "./manifest";
export type {
  InterfaceLocale,
  InterfaceLocaleBlocker,
  RtlGateItem,
} from "./manifest";

export type { MessageId, MessageNamespace } from "./message-ids";

export type { LocaleCoverage, RegisteredMessage } from "./registry";

export type { InterfaceLocaleResolution, MessageLookup } from "./resolve";
export { LEARNER_LANGUAGES, isLearnerLanguageId, learnerLanguageById } from "./roster";

export type {
  LearnerLanguageId,
  TextDirection,
  TranslationReviewStatus,
} from "./types";

export { copyTierOf } from "./copy-tiers";

export { RTL_GATE_ITEMS, rtlGatePasses } from "./manifest";

export { legacyChromeMessageId } from "./message-ids";

export { measureLocaleCoverage, registerChromeMessages, registerSetupMessages, setupPackFor } from "./registry";
