import { getOrderedAudioSources } from "../../src/reader/audio/source-resolution";
import { contextOccurrenceCount } from "../../src/reader/cards/frequency-ranks";
import {
  effectiveTokenRubies,
  nonOverlappingTokens,
} from "../../src/reader/dom/token-text-rendering";
import { sentenceAroundRange } from "../../src/reader/dom/reader-word";
import {
  targetCanHandwriteText,
  targetCanLookupCharacter,
  targetCanLookupWritingUnit,
} from "../../src/reader/languages/character-lookup";
import {
  resetActiveLearningTargetLanguage,
  setActiveLearningTargetLanguage,
} from "../../src/reader/languages/active";
import { languageSubtag } from "../../src/reader/languages/locale";
import { registeredLearningTargetModules } from "../../src/reader/languages/registry";
import {
  LEARNING_TARGET_ROSTER,
  learningTargetRosterIdForTag,
  type LearningTargetRosterEntry,
  type LearningTargetRosterId,
} from "../../src/reader/languages/roster";
import {
  targetOcrLanguageHint,
  targetOcrLanguageTag,
  targetSpeechSynthesisLocale,
  targetSubtitleLanguageTag,
} from "../../src/reader/languages/resolve";
import {
  LEARNING_TARGET_CAPABILITY_IDS,
  type LearningTargetCapability,
  type LearningTargetModule,
} from "../../src/reader/languages/types";
import { extractIpaPronunciations } from "../../src/reader/lookup/ipa-pronunciation";
import { bareFallbackCardFromText } from "../../src/reader/lookup/japanese-segments";
import { pitchEnrichmentTokenForCard } from "../../src/reader/lookup/text-helpers";
import {
  normalizeLearningTargetAnswer,
  normalizeLearningTargetInput,
} from "../../src/reader/newtab/typing-input";
import { DEFAULT_SETTINGS } from "../../src/reader/settings";
import { createImmersionKitExampleSource } from "../../src/reader/sources/examples/immersion-kit";
import { createTatoebaExampleSource } from "../../src/reader/sources/examples/tatoeba";
import { renderFrequencyPill } from "../../src/reader/sources/definition-render";
import { googleTranslationLanguageCapability } from "../../src/reader/translation/google";
import {
  createYomuLocalSrsAdapter,
  type LocalYomuSrsRepository,
} from "../../src/reader/srs/local-yomu";
import { canonicalStudyCardIdentity } from "../../src/reader/srs/shared";
import type {
  YomuSrsMiningRequest,
  YomuSrsReviewRequest,
  YomuSrsReviewable,
} from "../../src/reader/srs/types";
import { inferSubtitleLanguage } from "../../src/reader/subtitles/subtitle-language";
import { isTargetLanguageSubtitleTrack } from "../../src/reader/subtitles/subtitle-track-metadata";
import {
  TARGET_AUDIT_FIXTURES,
  type TargetAuditFixture,
} from "./multilingual-capability-audit-fixtures";

const EXPECTED_TARGET_COUNT = 33;

type AuditEvidenceValue = string | number | boolean | null | readonly string[];
export type AuditEvidence = Readonly<Record<string, AuditEvidenceValue>>;
export type CapabilityEvidenceKind =
  | "core-delivered"
  | "target-adapted"
  | "data-backed"
  | "fallback"
  | "unavailable";

export interface MultilingualCapabilityAuditFailure {
  readonly targetId: LearningTargetRosterId | "registry";
  readonly capability: LearningTargetCapability | null;
  readonly code: string;
  readonly message: string;
}

export interface MultilingualCapabilityAuditCheck {
  readonly status: "pass" | "fail";
  /** What this row actually proves. `pass` never implies full feature depth. */
  readonly evidenceKind: CapabilityEvidenceKind;
  readonly declaredSupported: boolean;
  readonly evidence: AuditEvidence;
  readonly failure?: MultilingualCapabilityAuditFailure;
}

export interface MultilingualTargetCapabilityAudit {
  readonly id: LearningTargetRosterId;
  readonly language: string;
  readonly moduleId: string | null;
  readonly status: "pass" | "fail";
  readonly readiness: MultilingualReadinessAuditCheck;
  readonly capabilities: Readonly<
    Record<LearningTargetCapability, MultilingualCapabilityAuditCheck>
  >;
}

export interface MultilingualReadinessAuditCheck {
  readonly status: "pass" | "fail";
  readonly evidenceKind: "readiness";
  readonly evidence: AuditEvidence;
  readonly failure?: MultilingualCapabilityAuditFailure;
}

export interface MultilingualCapabilityAuditReport {
  readonly schemaVersion: 2;
  readonly status: "pass" | "fail";
  readonly targetCount: number;
  readonly capabilityCount: number;
  readonly summary: {
    readonly capabilityChecks: number;
    readonly passedCapabilityChecks: number;
    readonly failedCapabilityChecks: number;
    readonly supportedCapabilityRows: number;
    readonly fallbackCapabilityRows: number;
    readonly unavailableCapabilityRows: number;
    readonly readinessChecks: number;
    readonly passedReadinessChecks: number;
    readonly failedReadinessChecks: number;
    readonly contractFailures: number;
  };
  readonly targets: readonly MultilingualTargetCapabilityAudit[];
  readonly failures: readonly MultilingualCapabilityAuditFailure[];
}

export interface MultilingualCapabilityAuditOptions {
  /** Test seam for proving that missing declarations and behavior fail closed. */
  readonly modules?: readonly LearningTargetModule[];
}

class CapabilityProbeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CapabilityProbeError";
  }
}

export async function runMultilingualCapabilityAudit(
  options: MultilingualCapabilityAuditOptions = {},
): Promise<MultilingualCapabilityAuditReport> {
  const modules = options.modules ?? registeredLearningTargetModules();
  const contractFailures = registryContractFailures(modules);
  const modulesByTarget = moduleMap(modules, contractFailures);

  const targets: MultilingualTargetCapabilityAudit[] = [];
  try {
    // Active-target resolvers are intentionally global runtime state. Run
    // target probes in roster order so one capability cannot observe the
    // target another concurrent probe just activated.
    for (const rosterTarget of LEARNING_TARGET_ROSTER) {
      const target = modulesByTarget.get(rosterTarget.id);
      targets.push(
        target
          ? await auditTarget(rosterTarget, target)
          : missingTargetAudit(rosterTarget),
      );
    }
  } finally {
    resetActiveLearningTargetLanguage();
  }

  const capabilityFailures = targets.flatMap((target) =>
    Object.values(target.capabilities).flatMap((check) =>
      check.failure ? [check.failure] : [],
    ),
  );
  const readinessFailures = targets.flatMap((target) =>
    target.readiness.failure ? [target.readiness.failure] : [],
  );
  const failures = [...contractFailures, ...capabilityFailures, ...readinessFailures];
  const capabilityChecks =
    targets.length * LEARNING_TARGET_CAPABILITY_IDS.length;
  const failedCapabilityChecks = capabilityFailures.length;
  const capabilityRows = targets.flatMap((target) => Object.values(target.capabilities));
  const fallbackCapabilityRows = capabilityRows.filter(
    (check) => check.evidenceKind === "fallback",
  ).length;
  const unavailableCapabilityRows = capabilityRows.filter(
    (check) => check.evidenceKind === "unavailable",
  ).length;

  return {
    schemaVersion: 2,
    status: failures.length ? "fail" : "pass",
    targetCount: targets.length,
    capabilityCount: LEARNING_TARGET_CAPABILITY_IDS.length,
    summary: {
      capabilityChecks,
      passedCapabilityChecks: capabilityChecks - failedCapabilityChecks,
      failedCapabilityChecks,
      supportedCapabilityRows: capabilityRows.filter((check) => check.declaredSupported).length,
      fallbackCapabilityRows,
      unavailableCapabilityRows,
      readinessChecks: targets.length,
      passedReadinessChecks: targets.length - readinessFailures.length,
      failedReadinessChecks: readinessFailures.length,
      contractFailures: contractFailures.length,
    },
    targets,
    failures,
  };
}

async function auditTarget(
  rosterTarget: LearningTargetRosterEntry,
  target: LearningTargetModule,
): Promise<MultilingualTargetCapabilityAudit> {
  const fixture = TARGET_AUDIT_FIXTURES[rosterTarget.id];
  const entries: Array<
    readonly [LearningTargetCapability, MultilingualCapabilityAuditCheck]
  > = [];
  for (const capability of LEARNING_TARGET_CAPABILITY_IDS) {
    entries.push([
      capability,
      await auditCapability(rosterTarget, target, fixture, capability),
    ]);
  }
  const capabilities = Object.fromEntries(entries) as Record<
    LearningTargetCapability,
    MultilingualCapabilityAuditCheck
  >;
  const readiness = auditReadiness(rosterTarget);
  return {
    id: rosterTarget.id,
    language: target.language,
    moduleId: target.id,
    status: readiness.status === "pass" && Object.values(capabilities).every(
      (check) => check.status === "pass",
    )
      ? "pass"
      : "fail",
    readiness,
    capabilities,
  };
}

async function auditCapability(
  rosterTarget: LearningTargetRosterEntry,
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
  capability: LearningTargetCapability,
): Promise<MultilingualCapabilityAuditCheck> {
  const evidenceKind = capabilityEvidenceKind(target, capability);
  const declaredSupported = target.capabilities[capability] === true;

  try {
    ensure(
      declaredSupported === (evidenceKind !== "unavailable"),
      "support-declaration-mismatch",
      `Target ${rosterTarget.id} declares ${capability}=${String(declaredSupported)} but its evidence is ${evidenceKind}.`,
    );
    const active = setActiveLearningTargetLanguage(target.language);
    ensure(
      active?.id === target.id,
      "inactive-module",
      `Target ${rosterTarget.id} did not activate module ${target.id}.`,
    );
    return {
      status: "pass",
      evidenceKind,
      declaredSupported,
      evidence: await probeCapability(
        capability,
        rosterTarget,
        target,
        fixture,
      ),
    };
  } catch (error) {
    const failure =
      error instanceof CapabilityProbeError
        ? error
        : new CapabilityProbeError(
            "probe-threw",
            error instanceof Error ? error.message : String(error),
          );
    return failedCheck(
      rosterTarget.id,
      capability,
      failure.code,
      failure.message,
      evidenceKind,
      declaredSupported,
    );
  }
}

function capabilityEvidenceKind(
  target: LearningTargetModule,
  capability: LearningTargetCapability,
): CapabilityEvidenceKind {
  switch (capability) {
    case "mining":
    case "srs":
    case "grading":
      return "core-delivered";
    case "segmentation":
    case "text-to-speech":
    case "ocr":
    case "subtitles":
    case "typing":
      return "target-adapted";
    case "morphology":
      return target.experiences.morphology === "dictionary-forms"
        ? "unavailable"
        : "target-adapted";
    case "character-lookup":
      return target.experiences.characterLookup === "character-dictionary"
        ? "data-backed"
        : "fallback";
    case "frequency":
      // Rank dictionaries are optional data. The universally executable path
      // is the explicitly labelled count of exact occurrences in this context.
      return "fallback";
    case "audio":
      return target.audio.recordedWordAudio ? "data-backed" : "fallback";
    case "handwriting":
      return target.experiences.handwriting === "stroke-feedback"
        ? "data-backed"
        : "fallback";
    case "term-lookup":
    case "reading-annotation":
    case "pronunciation":
    case "examples":
    case "grammar":
      return "data-backed";
  }
}

async function probeCapability(
  capability: LearningTargetCapability,
  rosterTarget: LearningTargetRosterEntry,
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): Promise<AuditEvidence> {
  return CAPABILITY_PROBES[capability](rosterTarget, target, fixture);
}

type CapabilityProbe = (
  rosterTarget: LearningTargetRosterEntry,
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
) => AuditEvidence | Promise<AuditEvidence>;

const CAPABILITY_PROBES = {
  "term-lookup": (_roster, target, fixture) => probeTermLookup(target, fixture),
  "character-lookup": (_roster, target, fixture) =>
    probeCharacterLookup(target, fixture),
  segmentation: (_roster, target, fixture) =>
    probeSegmentation(target, fixture),
  morphology: (_roster, target, fixture) => probeMorphology(target, fixture),
  "reading-annotation": (_roster, target, fixture) =>
    probeReadingAnnotation(target, fixture),
  pronunciation: (_roster, target, fixture) =>
    probePronunciation(target, fixture),
  frequency: (_roster, target, fixture) => probeFrequency(target, fixture),
  examples: (_roster, target, fixture) => probeExamples(target, fixture),
  grammar: (_roster, target, fixture) => probeGrammar(target, fixture),
  audio: (_roster, target) => probeAudio(target),
  "text-to-speech": (_roster, target) => probeTextToSpeech(target),
  ocr: (_roster, target) => probeOcr(target),
  subtitles: (roster, target) => probeSubtitles(roster, target),
  mining: (_roster, target, fixture) => probeMining(target, fixture),
  srs: (_roster, target, fixture) => probeSrs(target, fixture),
  grading: (_roster, target, fixture) => probeGrading(target, fixture),
  typing: (_roster, target, fixture) => probeTyping(target, fixture),
  handwriting: (_roster, target, fixture) => probeHandwriting(target, fixture),
} satisfies Record<LearningTargetCapability, CapabilityProbe>;

function probeTermLookup(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const normalized = target.normalizeText(fixture.probe);
  const candidates = target.lookupCandidates(fixture.probe);
  ensure(
    Boolean(normalized),
    "empty-normalized-term",
    "Term normalization returned an empty string.",
  );
  ensure(
    target.isLookupableText(normalized),
    "term-not-lookupable",
    "The native-script term is not lookupable.",
  );
  ensure(
    candidates.some(
      (candidate) => candidate.depth === 0 && candidate.term === normalized,
    ),
    "surface-candidate-missing",
    "Lookup candidates do not contain the normalized surface at depth 0.",
  );
  return {
    normalized,
    surfaceCandidate: normalized,
    candidateCount: candidates.length,
  };
}

function probeCharacterLookup(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const unit = firstGrapheme(fixture.probe);
  ensure(
    targetCanLookupWritingUnit(unit, target),
    "writing-unit-not-lookupable",
    "The first native grapheme cannot use character lookup through its declared Adapter.",
  );
  const dedicated = targetCanLookupCharacter(unit);
  const expectsDedicated =
    target.experiences.characterLookup === "character-dictionary";
  ensure(
    dedicated === expectsDedicated,
    "character-adapter-mismatch",
    `Character lookup resolved dedicated=${String(dedicated)} for ${target.experiences.characterLookup}.`,
  );
  return { unit, adapter: target.experiences.characterLookup, dedicated };
}

function probeSegmentation(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const segments = target.segment(fixture.probe);
  const pointerSegments = target.pointerWordSegments(fixture.probe);
  ensure(
    segments.length > 0,
    "segments-missing",
    "Target segmentation returned no native-script spans.",
  );
  ensure(
    pointerSegments.length > 0,
    "pointer-segments-missing",
    "Pointer lookup returned no native-script spans.",
  );
  for (const segment of [...segments, ...pointerSegments]) {
    ensure(
      segment.start >= 0 &&
        segment.end > segment.start &&
        segment.end <= fixture.probe.length,
      "segment-range-invalid",
      `Segment ${segment.start}:${segment.end} is outside the probe.`,
    );
    ensure(
      fixture.probe.slice(segment.start, segment.end) === segment.text,
      "segment-text-mismatch",
      "A segment does not preserve the exact source range.",
    );
  }
  return {
    segmentCount: segments.length,
    pointerSegmentCount: pointerSegments.length,
    segments: segments.map((segment) => segment.text),
  };
}

function probeMorphology(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const surfaceCandidates = target.lookupCandidates(fixture.probe);
  ensure(
    surfaceCandidates.some((candidate) => candidate.depth === 0),
    "morphology-surface-missing",
    "Morphology omitted the literal surface analysis.",
  );

  const morphology = fixture.morphology;
  if (!morphology) {
    ensure(
      target.experiences.morphology === "dictionary-forms",
      "morphology-fixture-missing",
      `Adapter ${target.experiences.morphology} needs a checked rewrite fixture.`,
    );
    ensure(
      surfaceCandidates.every((candidate) => candidate.depth === 0),
      "undeclared-morphology-rewrite",
      "A dictionary-forms-only target produced a rewrite without checked morphology evidence.",
    );
    return {
      adapter: target.experiences.morphology,
      surfaceAnalyses: surfaceCandidates.length,
      limitation: "literal dictionary-form lookup only; no morphology Adapter",
    };
  }

  ensure(
    target.experiences.morphology !== "dictionary-forms",
    "morphology-adapter-missing",
    "A checked rewrite fixture exists but the target declares only dictionary forms.",
  );

  const results =
    morphology.via === "subsegments"
      ? (target.lookupSubsegments?.(morphology.input, 40) ?? [])
      : target
          .lookupCandidates(morphology.input)
          .map((candidate) => candidate.term);
  ensure(
    results.includes(morphology.expected),
    "morphology-rewrite-missing",
    `Morphology did not derive ${morphology.expected} from ${morphology.input}.`,
  );
  return {
    adapter: target.experiences.morphology,
    input: morphology.input,
    expected: morphology.expected,
    results,
  };
}

function probeReadingAnnotation(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const reading = `reading-${rosterId(target)}`;
  const token = dictionaryReadingToken(target, fixture, reading);
  ensure(
    nonOverlappingTokens([token], fixture.probe).length === 1,
    "reading-token-rejected",
    "The exact dictionary token was rejected by target-aware rendering.",
  );
  const rubies = effectiveTokenRubies(fixture.probe, token);
  ensure(
    rubies.length === 1 && rubies[0]?.text === reading,
    "dictionary-reading-missing",
    "The dictionary reading did not become an annotation span.",
  );
  return {
    adapter: target.experiences.readingAnnotation,
    mode: target.typography.readingAnnotationMode,
    reading: rubies[0]?.text ?? null,
  };
}

function probePronunciation(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  if (target.featureSemantics.pronunciation === "pitch-accent") {
    const reading = target.normalizeReading("猫", "ねこ");
    ensure(
      reading === "ねこ",
      "pitch-reading-normalization-failed",
      "Japanese pronunciation did not preserve the dictionary reading.",
    );
    return { adapter: "pitch-accent", reading };
  }

  ensure(
    target.featureSemantics.pronunciation === "ipa",
    "pronunciation-adapter-unsupported",
    `No behavior probe exists for ${target.featureSemantics.pronunciation}.`,
  );
  const ipa = `/${rosterId(target)}/`;
  const pronunciations = extractIpaPronunciations(
    [
      {
        expression: fixture.probe,
        mode: "ipa",
        data: { reading: fixture.probe, transcriptions: [{ ipa }] },
        dictionary: `${rosterId(target)} pronunciation`,
      },
    ],
    { expression: fixture.probe, reading: fixture.probe },
  );
  ensure(
    pronunciations.some((value) => value.ipa === ipa),
    "ipa-extraction-failed",
    "A target-matched Yomitan IPA row did not produce pronunciation evidence.",
  );
  return { adapter: "ipa", ipa, source: pronunciations[0]?.dictionary ?? null };
}

function probeFrequency(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const token = dictionaryReadingToken(target, fixture, fixture.probe);
  const pill = renderFrequencyPill(
    {
      expression: fixture.probe,
      mode: "freq",
      data: 123,
      dictionary: `${rosterId(target)} frequency`,
    },
    (value) => value,
  );
  const occurrences = contextOccurrenceCount(
    token.card,
    `${fixture.probe} · ${fixture.probe}`,
  );
  ensure(
    pill.includes("#123"),
    "dictionary-frequency-missing",
    "A target-matched dictionary rank did not render.",
  );
  ensure(
    occurrences === 2,
    "context-frequency-missing",
    "The target-normalized context occurrence fallback did not count both surfaces.",
  );
  return {
    adapter: target.experiences.frequency,
    dictionaryRank: 123,
    contextOccurrences: occurrences,
  };
}

async function probeExamples(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): Promise<AuditEvidence> {
  const controller = new AbortController();
  if (target.language === "ja") {
    const searchedTerms: string[] = [];
    const adapter = createImmersionKitExampleSource(async (term) => {
      searchedTerms.push(term);
      return [
        {
          id: "capability-audit",
          sentence: fixture.probe,
          sentenceWithFurigana: fixture.probe,
          translation: "behavior audit",
          sourceTitle: "Capability audit fixture",
          titleSlug: "capability-audit",
          category: "fixture",
          soundFile: "",
          imageFile: "",
          soundUrl: "",
          imageUrl: "",
        },
      ];
    });
    const capabilities = adapter.supports(target.language);
    const result = await adapter.search({
      term: fixture.probe,
      targetLanguage: target.language,
      outputLanguage: "en",
      signal: controller.signal,
      limit: 1,
    });
    ensure(
      capabilities.supported && capabilities.text.availability === "available",
      "example-adapter-unsupported",
      "The Immersion Kit Adapter does not support Japanese sentence text.",
    );
    ensure(
      result.availability === "loaded" &&
        result.items[0]?.text.language === target.language,
      "example-search-failed",
      "The Immersion Kit Adapter did not return target-language sentence text.",
    );
    ensure(
      searchedTerms[0] === fixture.probe,
      "example-term-routing-failed",
      "The Immersion Kit Adapter did not receive the target term.",
    );
    return {
      source: adapter.id,
      availability: result.availability,
      targetLanguage: result.items[0]?.text.language ?? null,
      searchedTerm: searchedTerms[0] ?? null,
    };
  }

  const requestedUrls: string[] = [];
  const adapter = createTatoebaExampleSource({
    requestAudio: false,
    fetchJson: async (url) => {
      requestedUrls.push(url);
      return { data: [] };
    },
  });
  const capabilities = adapter.supports(target.language);
  const result = await adapter.search({
    term: fixture.probe,
    targetLanguage: target.language,
    outputLanguage: "en",
    signal: controller.signal,
    limit: 1,
  });
  const requestedLanguages = requestedUrls.map(
    (url) => new URL(url).searchParams.get("lang") ?? "",
  );
  ensure(
    capabilities.supported && capabilities.text.availability === "available",
    "example-adapter-unsupported",
    "The Tatoeba Adapter does not support target-language sentence text.",
  );
  ensure(
    result.availability === "empty",
    "example-search-failed",
    "The deterministic empty Tatoeba response did not complete as an empty search.",
  );
  ensure(
    requestedLanguages.length > 0 && requestedLanguages.every(Boolean),
    "example-language-routing-failed",
    "The Tatoeba Adapter did not issue a target-language corpus query.",
  );
  ensure(
    requestedUrls.every(
      (url) => new URL(url).searchParams.get("q") === `"${fixture.probe}"`,
    ),
    "example-term-routing-failed",
    "The Tatoeba Adapter did not quote and route the target term.",
  );
  return {
    source: adapter.id,
    availability: result.availability,
    requestCount: requestedUrls.length,
    requestedLanguages,
  };
}

function probeGrammar(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  ensure(
    target.grammar.rules.length > 0,
    "grammar-rules-missing",
    "The target has no checked grammar rules.",
  );
  ensure(
    /^https:\/\//u.test(target.grammar.referenceUrl),
    "grammar-reference-missing",
    "The target grammar Adapter has no HTTPS reference.",
  );
  const declared = target.grammar.rules.find(
    (rule) => rule.ruleId === fixture.grammar.ruleId,
  );
  ensure(
    Boolean(declared),
    "grammar-rule-missing",
    `Checked grammar rule ${fixture.grammar.ruleId} is absent from the target inventory.`,
  );
  const detected = target.grammar.detect(fixture.grammar.sentence);
  ensure(
    detected.some((match) => match.ruleId === fixture.grammar.ruleId),
    "grammar-detection-missing",
    `Checked sentence did not detect grammar rule ${fixture.grammar.ruleId}.`,
  );
  return {
    ruleId: fixture.grammar.ruleId,
    ruleCount: target.grammar.rules.length,
    levelScale: target.grammar.levelScale?.id ?? null,
    detected: detected.map((match) => match.ruleId),
  };
}

function probeAudio(target: LearningTargetModule): AuditEvidence {
  const sources = getOrderedAudioSources({
    ...DEFAULT_SETTINGS,
    audioSources: [],
  });
  const sourceTypes = sources.map((source) => source.type);
  if (target.audio.recordedWordAudio) {
    ensure(
      sourceTypes.includes("custom-json"),
      "recorded-audio-source-missing",
      "The recorded-audio target did not resolve the hosted source.",
    );
  } else {
    ensure(
      sourceTypes.includes("text-to-speech"),
      "speech-audio-source-missing",
      "The target did not resolve its speech-synthesis source.",
    );
  }
  return { adapter: target.experiences.audio, sourceTypes };
}

function probeTextToSpeech(target: LearningTargetModule): AuditEvidence {
  const locale = targetSpeechSynthesisLocale();
  ensure(
    locale === target.audio.speechSynthesisLocale,
    "tts-locale-routing-failed",
    "The active TTS resolver did not return the target-owned locale.",
  );
  let canonical = "";
  try {
    canonical = new Intl.Locale(locale).toString();
  } catch {
    throw new CapabilityProbeError(
      "tts-locale-invalid",
      `TTS locale ${locale} is not valid BCP-47.`,
    );
  }
  ensure(
    languageSubtag(canonical) === languageSubtag(target.language),
    "tts-language-mismatch",
    `TTS locale ${locale} does not speak target ${target.language}.`,
  );
  return { locale, canonical };
}

function probeOcr(target: LearningTargetModule): AuditEvidence {
  const languageTag = targetOcrLanguageTag();
  const languageHint = targetOcrLanguageHint();
  ensure(
    languageTag === target.ocr.defaultLanguage,
    "ocr-locale-routing-failed",
    "The OCR resolver did not return the target-owned default locale.",
  );
  ensure(
    languageHint === target.ocr.languageHint,
    "ocr-hint-routing-failed",
    "The OCR provider hint did not return the target-owned engine code.",
  );
  ensure(
    Boolean(languageHint),
    "ocr-hint-missing",
    "The target has no OCR engine hint.",
  );
  return { adapter: target.experiences.ocr, languageTag, languageHint };
}

function probeSubtitles(
  rosterTarget: LearningTargetRosterEntry,
  target: LearningTargetModule,
): AuditEvidence {
  const routedTag = targetSubtitleLanguageTag();
  const inferred = inferSubtitleLanguage(
    `${rosterTarget.englishName} subtitles`,
  );
  const expected = languageSubtag(target.language) ?? target.language;
  ensure(
    routedTag === target.subtitles.languageTag,
    "subtitle-tag-routing-failed",
    "The subtitle destination did not resolve through the active target.",
  );
  ensure(
    isTargetLanguageSubtitleTrack({
      label: `${rosterTarget.englishName} subtitles`,
      kind: "youtube",
      language: routedTag,
    }),
    "subtitle-track-selection-failed",
    "A target-language track was not recognized as primary.",
  );
  ensure(
    inferred === expected,
    "subtitle-label-inference-failed",
    `The roster label inferred ${String(inferred)} instead of ${expected}.`,
  );
  const translation = googleTranslationLanguageCapability(routedTag);
  return {
    languageTag: routedTag,
    inferredFromLabel: inferred ?? null,
    translationAvailable: translation.supported,
    translationProviderLanguage: translation.providerLanguage,
  };
}

async function probeMining(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): Promise<AuditEvidence> {
  const terminator = target.sentenceBoundaries.terminators[0];
  ensure(
    Boolean(terminator),
    "sentence-terminator-missing",
    "The target has no mining sentence terminator.",
  );
  const source = `${fixture.probe}${terminator}${fixture.probe}${terminator}`;
  const start = fixture.probe.length + terminator.length;
  const sentence = sentenceAroundRange(
    source,
    start,
    start + fixture.probe.length,
  );
  ensure(
    sentence === `${fixture.probe}${terminator}`,
    "mining-boundary-failed",
    `Mining extracted ${JSON.stringify(sentence)} instead of the target-bounded sentence.`,
  );

  const captured: { request: YomuSrsMiningRequest | null } = { request: null };
  const repository = {
    mine: async (request: YomuSrsMiningRequest) => {
      captured.request = request;
      return { card: reviewableFor(target, fixture), raw: { imported: 1 } };
    },
  } as unknown as LocalYomuSrsRepository;
  const adapter = createYomuLocalSrsAdapter(repository);
  await adapter.mine({
    expression: fixture.probe,
    reading: fixture.probe,
    language: target.language,
    sentence,
  });
  ensure(
    adapter.capabilities.mine,
    "mining-adapter-disabled",
    "The local Study Adapter does not allow mining.",
  );
  ensure(
    captured.request?.language === target.language,
    "mining-language-lost",
    "The mining Adapter did not receive the target language.",
  );
  ensure(
    captured.request?.sentence === sentence,
    "mining-sentence-lost",
    "The mining Adapter did not receive the target-bounded sentence.",
  );
  return {
    adapter: adapter.id,
    terminator,
    sentence,
    language: captured.request?.language ?? null,
    whitespaceIsBoundary: target.sentenceBoundaries.whitespaceIsBoundary,
  };
}

function probeSrs(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const identity = canonicalStudyCardIdentity(fixture.probe, fixture.probe, {
    language: target.language,
  });
  ensure(
    identity.language === target.language,
    "srs-language-lost",
    "Canonical Study identity did not retain the target language.",
  );
  if (target.language === "ja") {
    ensure(
      !identity.key.endsWith("\u0000ja"),
      "srs-japanese-key-changed",
      "The Japanese identity no longer preserves the legacy elided-language key.",
    );
  } else {
    ensure(
      identity.key.endsWith(`\u0000${target.language}`),
      "srs-language-key-missing",
      "The non-Japanese Study identity is not language-scoped.",
    );
  }
  return { identity: identity.key, language: identity.language };
}

async function probeGrading(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): Promise<AuditEvidence> {
  const captured: { request: YomuSrsReviewRequest | null } = { request: null };
  const repository = {
    review: async (request: YomuSrsReviewRequest) => {
      captured.request = request;
      return {
        card: { ...request.card, state: ["learning"] as const },
        raw: { grade: request.grade },
      };
    },
  } as unknown as LocalYomuSrsRepository;
  const adapter = createYomuLocalSrsAdapter(repository);
  const card = reviewableFor(target, fixture);
  const result = await adapter.review({ card, grade: "good" });
  ensure(
    adapter.capabilities.review,
    "grading-adapter-disabled",
    "The local Study Adapter does not allow review.",
  );
  ensure(
    captured.request?.card.language === target.language,
    "grading-language-lost",
    "The grading Adapter did not receive the target-scoped card.",
  );
  ensure(
    result.card?.state.includes("learning"),
    "grading-result-missing",
    "The grading Adapter did not return an updated reviewable.",
  );
  return {
    adapter: adapter.id,
    grade: captured.request?.grade ?? null,
    language: captured.request?.card.language ?? null,
  };
}

function probeTyping(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  const inputProbe =
    target.typing.inputNormalizer === "romaji-kana" ? "neko" : fixture.probe;
  const input = normalizeLearningTargetInput(target, inputProbe);
  const answer = normalizeLearningTargetAnswer(target, fixture.probe);
  ensure(
    Boolean(input),
    "typing-input-empty",
    "Target input normalization returned an empty value.",
  );
  ensure(
    Boolean(answer),
    "typing-answer-empty",
    "Target answer normalization returned an empty value.",
  );
  ensure(
    normalizeLearningTargetAnswer(target, answer) === answer,
    "typing-answer-not-idempotent",
    "Target answer normalization is not idempotent.",
  );
  if (target.typing.inputNormalizer === "preserve") {
    ensure(
      input === fixture.probe,
      "typing-input-mutated",
      "A preserve-mode target rewrote learner input.",
    );
  } else {
    ensure(
      input !== inputProbe,
      "typing-input-method-inactive",
      "The declared input method did not transform its probe.",
    );
  }
  return {
    inputNormalizer: target.typing.inputNormalizer,
    answerNormalizer: target.typing.answerNormalizer,
    normalizedInput: input,
    normalizedAnswer: answer,
  };
}

function probeHandwriting(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): AuditEvidence {
  ensure(
    targetCanHandwriteText(fixture.probe, target),
    "handwriting-text-rejected",
    "The target handwriting Adapter rejected native-script text.",
  );
  return { adapter: target.experiences.handwriting, accepted: true };
}

function registryContractFailures(
  modules: readonly LearningTargetModule[],
): MultilingualCapabilityAuditFailure[] {
  const failures: MultilingualCapabilityAuditFailure[] = [];
  const rosterIds = LEARNING_TARGET_ROSTER.map((target) => target.id);
  const fixtureIds = Object.keys(TARGET_AUDIT_FIXTURES).sort();
  const expectedRosterIds = [...new Set(rosterIds)].sort();
  if (LEARNING_TARGET_ROSTER.length !== EXPECTED_TARGET_COUNT) {
    failures.push(
      registryFailure(
        "target-count-drift",
        `The fixed roster contains ${LEARNING_TARGET_ROSTER.length} targets; expected ${EXPECTED_TARGET_COUNT}.`,
      ),
    );
  }
  if (expectedRosterIds.length !== rosterIds.length) {
    failures.push(
      registryFailure(
        "duplicate-roster-target",
        "The learning-target roster contains duplicate IDs.",
      ),
    );
  }
  if (fixtureIds.join("\u0000") !== expectedRosterIds.join("\u0000")) {
    failures.push(
      registryFailure(
        "fixture-roster-drift",
        "Behavior fixtures and the learning-target roster do not contain the same target IDs.",
      ),
    );
  }
  if (modules.length !== LEARNING_TARGET_ROSTER.length) {
    failures.push(
      registryFailure(
        "module-count-drift",
        `The registry exposes ${modules.length} modules for ${LEARNING_TARGET_ROSTER.length} roster targets.`,
      ),
    );
  }
  return failures;
}

function moduleMap(
  modules: readonly LearningTargetModule[],
  failures: MultilingualCapabilityAuditFailure[],
): Map<LearningTargetRosterId, LearningTargetModule> {
  const result = new Map<LearningTargetRosterId, LearningTargetModule>();
  for (const target of modules) {
    const id = learningTargetRosterIdForTag(target.language);
    if (!id) {
      failures.push(
        registryFailure(
          "unmapped-module",
          `Module ${target.id} (${target.language}) is outside the fixed roster.`,
        ),
      );
      continue;
    }
    if (result.has(id)) {
      failures.push(
        registryFailure(
          "duplicate-module",
          `More than one active module maps to target ${id}.`,
        ),
      );
      continue;
    }
    result.set(id, target);
    const declared = Object.keys(target.capabilities).sort();
    const expected = [...LEARNING_TARGET_CAPABILITY_IDS].sort();
    if (declared.join("\u0000") !== expected.join("\u0000")) {
      failures.push({
        targetId: id,
        capability: null,
        code: "capability-shape-drift",
        message: `Module ${target.id} does not declare exactly the supported capability IDs.`,
      });
    }
  }
  return result;
}

function missingTargetAudit(
  rosterTarget: LearningTargetRosterEntry,
): MultilingualTargetCapabilityAudit {
  const capabilities = Object.fromEntries(
    LEARNING_TARGET_CAPABILITY_IDS.map((capability) => [
      capability,
      failedCheck(
        rosterTarget.id,
        capability,
        "module-missing",
        `No registered module serves target ${rosterTarget.id}.`,
        "unavailable",
        false,
      ),
    ]),
  ) as Record<LearningTargetCapability, MultilingualCapabilityAuditCheck>;
  return {
    id: rosterTarget.id,
    language: rosterTarget.runtimeLocale,
    moduleId: null,
    status: "fail",
    readiness: failedReadinessCheck(
      rosterTarget,
      "module-missing",
      `No registered module serves target ${rosterTarget.id}.`,
    ),
    capabilities,
  };
}

function failedCheck(
  targetId: LearningTargetRosterId,
  capability: LearningTargetCapability,
  code: string,
  message: string,
  evidenceKind: CapabilityEvidenceKind,
  declaredSupported: boolean,
): MultilingualCapabilityAuditCheck {
  return {
    status: "fail",
    evidenceKind,
    declaredSupported,
    evidence: {},
    failure: { targetId, capability, code, message },
  };
}

function auditReadiness(
  rosterTarget: LearningTargetRosterEntry,
): MultilingualReadinessAuditCheck {
  const expected = rosterTarget.id === "ja" ? "full" : "reading-only";
  if (rosterTarget.studyTargetReadiness !== expected) {
    return failedReadinessCheck(
      rosterTarget,
      "readiness-overclaim",
      `Target ${rosterTarget.id} is ${rosterTarget.studyTargetReadiness}; the audited decision is ${expected}.`,
    );
  }
  return {
    status: "pass",
    evidenceKind: "readiness",
    evidence: {
      declared: rosterTarget.studyTargetReadiness,
      basis: rosterTarget.id === "ja"
        ? "Japanese depth remains the full-readiness reference"
        : "reading, lookup, mining and review; target/data depth remains constrained",
    },
  };
}

function failedReadinessCheck(
  rosterTarget: LearningTargetRosterEntry,
  code: string,
  message: string,
): MultilingualReadinessAuditCheck {
  return {
    status: "fail",
    evidenceKind: "readiness",
    evidence: { declared: rosterTarget.studyTargetReadiness },
    failure: { targetId: rosterTarget.id, capability: null, code, message },
  };
}

function registryFailure(
  code: string,
  message: string,
): MultilingualCapabilityAuditFailure {
  return { targetId: "registry", capability: null, code, message };
}

function dictionaryReadingToken(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
  reading: string,
) {
  const card = bareFallbackCardFromText(fixture.probe, target.language);
  return pitchEnrichmentTokenForCard({ ...card, reading });
}

function reviewableFor(
  target: LearningTargetModule,
  fixture: TargetAuditFixture,
): YomuSrsReviewable {
  const identity = canonicalStudyCardIdentity(fixture.probe, fixture.probe, {
    language: target.language,
  });
  return {
    providerId: "yomu-local",
    providerCardId: identity.key,
    kind: "vocabulary",
    expression: fixture.probe,
    reading: fixture.probe,
    language: target.language,
    meanings: [],
    state: ["new"],
  };
}

function rosterId(target: LearningTargetModule): LearningTargetRosterId {
  const id = learningTargetRosterIdForTag(target.language);
  if (!id)
    throw new CapabilityProbeError(
      "target-not-in-roster",
      `Target ${target.language} is not in the roster.`,
    );
  return id;
}

function firstGrapheme(value: string): string {
  return (
    Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
    )[0]?.segment ?? ""
  );
}

function ensure(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new CapabilityProbeError(code, message);
}
