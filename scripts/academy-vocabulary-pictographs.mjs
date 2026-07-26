#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LESSON_ROOT = resolve(ROOT, "public/academy/content/lessons");
const REGISTRY_PATH = resolve(
  ROOT,
  "src/academy/content/lesson-content-registry.ts",
);
const MANIFEST_PATH = resolve(
  ROOT,
  "public/academy/content/vocabulary-pictographs.v1.json",
);
const ADVANCED_CURRICULUM_PATH = "/src/academy/content/advanced-curriculum.ts";
const CHECK_ONLY = process.argv.includes("--check");
const PICTOGRAPH_DIMENSIONS = Object.freeze({ width: 512, height: 512 });

const BAND_ORDER = Object.freeze({
  foundation: 0,
  n5: 1,
  n4: 2,
  n3: 3,
  n2: 4,
  n1: 5,
});

const FIRST_BATCH = Object.freeze({
  なまえ: batch(
    "name.webp",
    "concrete-object",
    "A cream paper name tag with a blank portrait circle and one ink line.",
  ),
  せんせい: batch(
    "teacher.webp",
    "person",
    "A friendly language teacher beside a blank chalkboard.",
  ),
  がくせい: batch(
    "student.webp",
    "person",
    "An adult language student studying from a blank notebook.",
  ),
  ひと: batch(
    "person.webp",
    "person",
    "One friendly adult in neutral everyday clothes.",
  ),
  クラス: batch(
    "class.webp",
    "group",
    "Four adult language learners studying together with one teacher.",
  ),
  くに: batch("country.webp", "place", "A globe and an unlabelled folded map."),
  かいしゃいん: batch(
    "company-employee.webp",
    "person",
    "An office employee carrying a closed laptop and blank folder.",
  ),
});

const NON_LITERAL_READING = new Map([
  ["しごと", "scene"],
  ["にほんご", "scene"],
  ["えいご", "scene"],
  ["にほんじん", "relationship"],
  ["わたし", "relationship"],
  ["はい", "contrast"],
  ["いいえ", "contrast"],
  ["は", "relationship"],
  ["です", "relationship"],
  ["さん", "relationship"],
]);

const STANDARD_DISPLAY_EXPRESSION = new Map([
  ["がくせい", "学生"],
  ["せんせい", "先生"],
  ["ひと", "人"],
  ["くに", "国"],
  ["なまえ", "名前"],
  ["かいしゃいん", "会社員"],
  ["にほんご", "日本語"],
  ["にほんじん", "日本人"],
  ["わたし", "私"],
]);

const RELATIONSHIP_SENSE =
  /\b(?:hello|good morning|good evening|good night|goodbye|thank|sorry|excuse|welcome|meet|greet|polite|respect|please|I; me|I\b|name\?|title)\b/iu;
const CONTRAST_SENSE =
  /\b(?:yes|no|not |however|contrast|instead|different|while|whether|either|neither)\b/iu;
const PERSON_SENSE =
  /\b(?:person|teacher|student|employee|worker|doctor|nurse|friend|parent|child|customer|staff|manager)\b/iu;
const PLACE_SENSE =
  /\b(?:country|station|school|university|library|shop|store|office|hospital|hotel|room|house|home|town|city|park|restaurant|cafe|airport|temple|shrine)\b/iu;
const OBJECT_SENSE =
  /\b(?:book|notebook|pen|pencil|bag|desk|chair|table|phone|computer|laptop|ticket|card|key|umbrella|cup|bottle|food|fruit|vegetable|car|train|bicycle|clothes|shoe|clock|camera|map|letter|newspaper|dictionary)\b/iu;
const ACTION_SENSE =
  /\b(?:to |ing\b|go\b|come\b|eat\b|drink\b|read\b|write\b|listen\b|speak\b|walk\b|run\b|buy\b|sell\b|open\b|close\b|sit\b|stand\b|sleep\b|wake\b|work\b|study\b)\b/iu;

const previousManifest = readPreviousManifest();
const previousIds = new Map(
  previousManifest?.entries?.map((entry) => [entry.identityKey, entry.id]) ??
    [],
);
const occurrences = [];

collectFoundationLesson();
for (const registration of authoredWeekRegistrations())
  collectAuthoredWeek(registration);
await collectAdvancedCurriculum();

const manifest = buildManifest(occurrences);
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
const current = existsSync(MANIFEST_PATH)
  ? readFileSync(MANIFEST_PATH, "utf8")
  : "";

if (CHECK_ONLY) {
  if (serialized !== current) {
    throw new Error(
      "Vocabulary pictograph manifest is stale. Run node scripts/academy-vocabulary-pictographs.mjs.",
    );
  }
} else {
  writeFileSync(MANIFEST_PATH, serialized);
}

printSummary(manifest, CHECK_ONLY ? "verified" : "wrote");

function collectFoundationLesson() {
  const filename = "lesson-zero.v1.json";
  const root = json(filename);
  const lesson = requiredRecord(root.lesson, `${filename}.lesson`);
  const lessonId = requiredText(lesson.id, `${filename}.lesson.id`);
  const vocabulary = requiredArray(
    lesson.vocabulary,
    `${filename}.lesson.vocabulary`,
  );
  for (const [index, candidate] of vocabulary.entries()) {
    const item = requiredRecord(
      candidate,
      `${filename}.lesson.vocabulary[${index}]`,
    );
    const meaning = requiredRecord(
      item.meaning,
      `${filename}.lesson.vocabulary[${index}].meaning`,
    );
    addOccurrence({
      lessonId,
      lessonOrder: 0,
      band: "foundation",
      expression: requiredText(
        item.japanese,
        `${lessonId} vocabulary ${index} Japanese`,
      ),
      reading: requiredText(
        item.reading,
        `${lessonId} vocabulary ${index} reading`,
      ),
      englishSense: requiredText(
        meaning.en,
        `${lessonId} vocabulary ${index} English sense`,
      ),
      sourceKind: "canonical-vocabulary",
      sourceIdentity: requiredText(
        item.id,
        `${lessonId} vocabulary ${index} id`,
      ),
    });
  }
}

function collectAuthoredWeek(registration) {
  const root = json(registration.filename);
  if (root.id !== registration.packageId) {
    throw new Error(
      `${registration.filename} is registered as ${registration.packageId} but contains ${String(root.id)}.`,
    );
  }
  const lessonId = `authored-week:${registration.packageId}`;
  const lessonOrder = requiredInteger(
    root.order,
    `${registration.filename}.order`,
  );
  const identity = requiredRecord(
    root.identity,
    `${registration.filename}.identity`,
  );
  const band = normalizeBand(
    requiredText(
      identity.levelBand,
      `${registration.filename}.identity.levelBand`,
    ),
  );

  const components = requiredArray(
    root.components,
    `${registration.filename}.components`,
  );
  for (const [componentIndex, candidate] of components.entries()) {
    const component = requiredRecord(
      candidate,
      `${registration.filename}.components[${componentIndex}]`,
    );
    if (component.type !== "vocabulary") continue;
    const items = requiredArray(
      component.items,
      `${registration.filename}.components[${componentIndex}].items`,
    );
    for (const [itemIndex, rowCandidate] of items.entries()) {
      const row = requiredRecord(
        rowCandidate,
        `${registration.filename}.components[${componentIndex}].items[${itemIndex}]`,
      );
      const source = optionalRecord(row.source);
      addOccurrence({
        lessonId,
        lessonOrder,
        band,
        expression: requiredText(
          row.ja,
          `${lessonId} vocabulary row ${itemIndex} Japanese`,
        ),
        reading: requiredText(
          row.reading,
          `${lessonId} vocabulary row ${itemIndex} reading`,
        ),
        englishSense: requiredText(
          row.en,
          `${lessonId} vocabulary row ${itemIndex} English sense`,
        ),
        sourceKind: "lesson-vocabulary-row",
        sourceIdentity:
          optionalText(source?.itemId) ??
          `${registration.packageId}:component-${componentIndex}:item-${itemIndex}`,
      });
    }
  }

  const srs = optionalRecord(root.srs);
  const extracted = optionalArray(srs?.extracted);
  for (const [index, candidate] of extracted.entries()) {
    const item = requiredRecord(
      candidate,
      `${registration.filename}.srs.extracted[${index}]`,
    );
    if (item.kind !== "vocabulary") continue;
    const expression = requiredText(
      item.front,
      `${lessonId} SRS vocabulary ${index} expression`,
    );
    addOccurrence({
      lessonId,
      lessonOrder,
      band,
      expression,
      reading: optionalText(item.reading) ?? expression,
      englishSense: requiredText(
        item.back,
        `${lessonId} SRS vocabulary ${index} English sense`,
      ),
      sourceKind: "lesson-srs-vocabulary",
      sourceIdentity: `${registration.packageId}:srs:${index}`,
    });
  }
}

async function collectAdvancedCurriculum() {
  installSsrDomBoundary();
  const server = await createServer({
    configFile: false,
    root: ROOT,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false },
  });
  try {
    const module = await server.ssrLoadModule(ADVANCED_CURRICULUM_PATH);
    const curriculum = requiredArray(
      module.ADVANCED_CURRICULUM,
      "ADVANCED_CURRICULUM",
    );
    for (const [entryIndex, candidate] of curriculum.entries()) {
      const entry = requiredRecord(
        candidate,
        `ADVANCED_CURRICULUM[${entryIndex}]`,
      );
      const band = normalizeBand(
        requiredText(entry.band, `advanced entry ${entryIndex} band`),
      );
      const lessonId = requiredText(
        entry.lessonId,
        `advanced entry ${entryIndex} lessonId`,
      );
      const activity = requiredRecord(entry.activity, `${lessonId}.activity`);
      const payload = requiredRecord(
        activity.payload,
        `${lessonId}.activity.payload`,
      );
      const targets = requiredArray(
        payload.reviewTargets,
        `${lessonId}.activity.payload.reviewTargets`,
      );
      for (const [targetIndex, targetCandidate] of targets.entries()) {
        const target = requiredRecord(
          targetCandidate,
          `${lessonId}.reviewTargets[${targetIndex}]`,
        );
        const meanings = requiredArray(
          target.meanings,
          `${lessonId}.reviewTargets[${targetIndex}].meanings`,
        );
        const expression = requiredText(
          target.expression,
          `${lessonId} review ${targetIndex} expression`,
        );
        addOccurrence({
          lessonId,
          lessonOrder: 1_000 + entryIndex,
          band,
          expression,
          reading: optionalText(target.reading) ?? expression,
          englishSense: requiredText(
            meanings[0],
            `${lessonId} review ${targetIndex} English sense`,
          ),
          sourceKind: "advanced-review-expression",
          sourceIdentity: requiredText(
            target.id,
            `${lessonId} review ${targetIndex} id`,
          ),
        });
      }
    }
  } finally {
    await server.close();
  }
}

function addOccurrence(input) {
  const band = normalizeBand(input.band);
  const expression = cleanText(input.expression);
  const reading = cleanText(input.reading);
  const englishSense = cleanText(input.englishSense);
  if (!expression || !reading || !englishSense) {
    throw new Error(
      `Missing introduced vocabulary metadata in ${input.lessonId} (${input.sourceIdentity}).`,
    );
  }
  const occurrenceKey = [
    input.lessonId,
    input.sourceKind,
    input.sourceIdentity,
  ].join("\u0000");
  if (
    occurrences.some((candidate) => candidate.occurrenceKey === occurrenceKey)
  ) {
    throw new Error(`Duplicate vocabulary mapping: ${occurrenceKey}.`);
  }
  occurrences.push(
    Object.freeze({
      ...input,
      band,
      expression,
      reading,
      englishSense,
      occurrenceKey,
      identityKey: vocabularyIdentity(expression, reading, englishSense),
    }),
  );
}

function buildManifest(sourceOccurrences) {
  const grouped = new Map();
  for (const occurrence of sourceOccurrences) {
    const list = grouped.get(occurrence.identityKey) ?? [];
    list.push(occurrence);
    grouped.set(occurrence.identityKey, list);
  }

  const entries = [...grouped.entries()]
    .map(([identityKey, group]) => {
      const ordered = [...group].sort(compareOccurrences);
      const introduced = ordered[0];
      const visual = visualPlan(introduced);
      const lessonIds = [...new Set(ordered.map((item) => item.lessonId))];
      const bands = [...new Set(ordered.map((item) => item.band))].sort(
        (a, b) => BAND_ORDER[a] - BAND_ORDER[b],
      );
      const id =
        previousIds.get(identityKey) ?? stableVocabularyId(identityKey);
      const consumers = learnerFacingConsumers(id, introduced, ordered);
      return Object.freeze({
        id,
        identityKey,
        lessonIntroductionOrder: introduced.lessonOrder,
        introducedAt: Object.freeze({
          lessonId: introduced.lessonId,
          band: introduced.band,
          order: introduced.lessonOrder,
        }),
        japaneseExpression: introduced.expression,
        displayExpression: standardDisplayExpression(
          introduced.expression,
          introduced.reading,
        ),
        reading: introduced.reading,
        englishSense: introduced.englishSense,
        concretenessClass: visual.concretenessClass,
        pictographRequirement: visual.pictographRequirement,
        imagePath: visual.imagePath,
        imageStatus: visual.imageStatus,
        imageDimensions: visual.imageDimensions,
        altText: visual.altText,
        futurePrompt: visual.futurePrompt,
        sourceLessonIds: Object.freeze(lessonIds),
        bands: Object.freeze(bands),
        learnerFacingConsumers: Object.freeze(consumers),
        sourceOccurrences: Object.freeze(
          ordered.map((item) =>
            Object.freeze({
              lessonId: item.lessonId,
              sourceKind: item.sourceKind,
              sourceIdentity: item.sourceIdentity,
            }),
          ),
        ),
      });
    })
    .sort(
      (a, b) =>
        a.lessonIntroductionOrder - b.lessonIntroductionOrder ||
        compareJapanese(a.reading, b.reading) ||
        a.id.localeCompare(b.id),
    );

  assertUnique(
    entries.map((entry) => entry.id),
    "manifest vocabulary id",
  );
  assertUnique(
    entries.map((entry) => entry.identityKey),
    "manifest vocabulary identity",
  );
  assertUnique(
    entries.flatMap((entry) =>
      entry.learnerFacingConsumers.map((consumer) => consumer.consumerId),
    ),
    "learner-facing vocabulary pictograph consumer id",
  );

  const byBand = countBy(
    entries,
    (entry) => entry.introducedAt.band,
    Object.keys(BAND_ORDER),
  );
  const byStatus = countBy(entries, (entry) => entry.imageStatus, [
    "ready",
    "queued",
    "prompt-ready",
  ]);
  const byRequirement = countBy(
    entries,
    (entry) => entry.pictographRequirement,
    ["required", "scene", "relationship", "contrast"],
  );
  const lessonIds = new Set(sourceOccurrences.map((item) => item.lessonId));
  const sourceDigest = sha256(
    JSON.stringify(
      sourceOccurrences.map((item) => ({
        lessonId: item.lessonId,
        lessonOrder: item.lessonOrder,
        band: item.band,
        expression: item.expression,
        reading: item.reading,
        englishSense: item.englishSense,
        sourceKind: item.sourceKind,
        sourceIdentity: item.sourceIdentity,
      })),
    ),
  );

  return Object.freeze({
    schemaVersion: 1,
    id: "academy-vocabulary-pictographs-v1",
    sourceDigest,
    courseBandOrder: Object.freeze(Object.keys(BAND_ORDER)),
    inventory: Object.freeze({
      concepts: entries.length,
      sourceOccurrences: sourceOccurrences.length,
      sourceLessons: lessonIds.size,
      byBand: Object.freeze(byBand),
      byStatus: Object.freeze(byStatus),
      byRequirement: Object.freeze(byRequirement),
      firstBatchReady: byStatus.ready,
      firstBatchAssets: new Set(
        entries
          .filter((entry) => entry.imageStatus === "ready")
          .map((entry) => entry.imagePath),
      ).size,
      remainingQueue: entries.length - byStatus.ready,
    }),
    entries: Object.freeze(entries),
  });
}

function standardDisplayExpression(expression, reading) {
  return (
    STANDARD_DISPLAY_EXPRESSION.get(normalizeReading(reading)) ?? expression
  );
}

function visualPlan(item) {
  const readingKey = normalizeReading(item.reading);
  const firstBatch = FIRST_BATCH[readingKey];
  if (firstBatch && item.lessonOrder <= 2) {
    const imagePath = `/academy/art/vocabulary-pictographs/${firstBatch.filename}`;
    const absolute = resolve(ROOT, `public${imagePath}`);
    if (!existsSync(absolute))
      throw new Error(`Missing first-batch pictograph: ${absolute}`);
    return {
      concretenessClass: firstBatch.concretenessClass,
      pictographRequirement: "required",
      imagePath,
      imageStatus: "ready",
      imageDimensions: PICTOGRAPH_DIMENSIONS,
      altText: usefulAlt(item),
      futurePrompt: productionPrompt(item, firstBatch.subject),
    };
  }

  const requirement = classifyRequirement(item, readingKey);
  if (requirement === "required") {
    const imagePath = `/academy/art/vocabulary-pictographs/${assetSlug(item)}.webp`;
    return {
      concretenessClass: classifyConcrete(item),
      pictographRequirement: "required",
      imagePath,
      imageStatus: "queued",
      imageDimensions: null,
      altText: usefulAlt(item),
      futurePrompt: productionPrompt(item, subjectForConcrete(item)),
    };
  }

  return {
    concretenessClass: requirement,
    pictographRequirement: requirement,
    imagePath: null,
    imageStatus: "prompt-ready",
    imageDimensions: null,
    altText: usefulAlt(item),
    futurePrompt: nonLiteralPrompt(item, requirement),
  };
}

function learnerFacingConsumers(entryId, introduced, ordered) {
  const lessonIds = [...new Set(ordered.map((item) => item.lessonId))];
  return lessonIds.map((lessonId) =>
    Object.freeze({
      consumerId: `vocab-picture-consumer:${sha256(`${entryId}\u0000${lessonId}`).slice(0, 20)}`,
      lessonId,
      surface: lessonId === introduced.lessonId ? "introduction" : "review",
    }),
  );
}

function classifyRequirement(item, readingKey) {
  const readingOverride = NON_LITERAL_READING.get(readingKey);
  if (readingOverride) return readingOverride;
  if (CONTRAST_SENSE.test(item.englishSense)) return "contrast";
  if (RELATIONSHIP_SENSE.test(item.englishSense)) return "relationship";
  if (
    PERSON_SENSE.test(item.englishSense) ||
    PLACE_SENSE.test(item.englishSense) ||
    OBJECT_SENSE.test(item.englishSense)
  )
    return "required";
  return ACTION_SENSE.test(item.englishSense) ? "scene" : "scene";
}

function classifyConcrete(item) {
  if (PERSON_SENSE.test(item.englishSense)) return "person";
  if (PLACE_SENSE.test(item.englishSense)) return "place";
  return "concrete-object";
}

function subjectForConcrete(item) {
  const kind = classifyConcrete(item);
  if (kind === "person")
    return `one person visibly embodying the role “${item.englishSense}”, without stereotypes`;
  if (kind === "place")
    return `one immediately recognizable place for “${item.englishSense}”, with no signage`;
  return `one unmistakable object for “${item.englishSense}”`;
}

function productionPrompt(item, subject) {
  return [
    `Create a square Yomu Academy pictograph for ${item.expression} (${item.reading}): ${item.englishSense}.`,
    `Show ${subject}.`,
    "Use one clear subject or action, warm hand-painted anime visual-novel art, cream/teal/ink/coral palette, and a bold silhouette readable at phone size.",
    "No text, symbols, watermark, photorealism, decorative clutter, or franchise imitation.",
  ].join(" ");
}

function nonLiteralPrompt(item, requirement) {
  const direction = {
    scene: `Show one minimal everyday scene whose visible result makes “${item.englishSense}” understandable without a caption.`,
    relationship: `Show two people using posture, eye line, and one culturally neutral gesture to convey “${item.englishSense}”.`,
    contrast: `Show two plainly different states in one coherent before/after composition to convey “${item.englishSense}”.`,
  }[requirement];
  return [
    `Create a square Yomu Academy ${requirement} visual for ${item.expression} (${item.reading}).`,
    direction,
    "Use warm hand-painted anime visual-novel art, cream/teal/ink/coral palette, and shapes readable at phone size.",
    "No text, symbols, flags, stereotypes, watermark, photorealism, or decorative clutter.",
  ].join(" ");
}

function usefulAlt(item) {
  return `Learning picture for ${item.expression} (${item.reading}), meaning ${item.englishSense}.`;
}

function authoredWeekRegistrations() {
  const source = readFileSync(REGISTRY_PATH, "utf8");
  const block = source.match(
    /const AUTHORED_WEEK_FILES = \[(?<body>[\s\S]*?)\]\s+as const/u,
  )?.groups?.body;
  if (!block)
    throw new Error(
      "Unable to locate AUTHORED_WEEK_FILES in the Academy lesson registry.",
    );
  const registrations = [
    ...block.matchAll(
      /\['(?<filename>[^']+\.json)',\s*'(?<packageId>[^']+)',\s*'(?<classWeekId>[^']+)'\]/gu,
    ),
  ].map((match) => Object.freeze(match.groups));
  if (!registrations.length)
    throw new Error("Academy lesson registry contains no authored weeks.");
  assertUnique(
    registrations.map((item) => item.filename),
    "authored lesson filename",
  );
  assertUnique(
    registrations.map((item) => item.packageId),
    "authored package id",
  );
  return registrations;
}

function readPreviousManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(
      "Existing vocabulary pictograph manifest has an unsupported schema.",
    );
  }
  return parsed;
}

function json(filename) {
  return JSON.parse(readFileSync(resolve(LESSON_ROOT, filename), "utf8"));
}

function installSsrDomBoundary() {
  if (!globalThis.document) globalThis.document = { addEventListener() {} };
  if (!globalThis.Node) globalThis.Node = class Node {};
  if (!globalThis.Element) globalThis.Element = class Element {};
}

function normalizeBand(value) {
  const normalized = cleanText(value).toLowerCase();
  if (!(normalized in BAND_ORDER))
    throw new Error(`Unsupported Academy vocabulary band: ${value}`);
  return normalized;
}

function vocabularyIdentity(expression, reading, englishSense) {
  return [
    normalizeExpression(expression),
    normalizeReading(reading),
    normalizeSense(englishSense),
  ].join("|");
}

function normalizeExpression(value) {
  return cleanText(value).normalize("NFKC").replace(/\s+/gu, "");
}

function normalizeReading(value) {
  return cleanText(value)
    .normalize("NFKC")
    .replace(/[〜～~]/gu, "")
    .replace(/[()（）お]/gu, (candidate) => (candidate === "お" ? "お" : ""))
    .replace(/\s+/gu, "");
}

function normalizeSense(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\([^)]*\)/gu, "")
    .replace(/[“”"'.,;:!?/—–-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function stableVocabularyId(identityKey) {
  return `vocab:pictograph:${sha256(identityKey).slice(0, 20)}`;
}

function assetSlug(item) {
  const base =
    item.reading
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40) || "concept";
  return `${base}-${sha256(item.identityKey).slice(0, 8)}`;
}

function batch(filename, concretenessClass, subject) {
  return Object.freeze({ filename, concretenessClass, subject });
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function requiredText(value, label) {
  const text = cleanText(value);
  if (!text) throw new Error(`Missing ${label}.`);
  return text;
}

function optionalText(value) {
  const text = cleanText(value);
  return text || undefined;
}

function requiredInteger(value, label) {
  if (!Number.isInteger(value)) throw new Error(`Missing ${label}.`);
  return value;
}

function requiredRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function optionalRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Missing ${label}.`);
  return value;
}

function optionalArray(value) {
  return Array.isArray(value) ? value : [];
}

function compareOccurrences(a, b) {
  return (
    a.lessonOrder - b.lessonOrder ||
    BAND_ORDER[a.band] - BAND_ORDER[b.band] ||
    a.lessonId.localeCompare(b.lessonId) ||
    a.sourceKind.localeCompare(b.sourceKind) ||
    a.sourceIdentity.localeCompare(b.sourceIdentity)
  );
}

function compareJapanese(a, b) {
  return a.localeCompare(b, "ja");
}

function countBy(values, keyFor, seedKeys) {
  const counts = Object.fromEntries(seedKeys.map((key) => [key, 0]));
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}.`);
    seen.add(value);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function printSummary(value, verb) {
  const { inventory } = value;
  console.log(
    `Vocabulary pictographs ${verb}: ${inventory.concepts} concepts from ${inventory.sourceOccurrences} occurrences across ${inventory.sourceLessons} lessons.`,
  );
  console.log(
    `By band: ${Object.entries(inventory.byBand)
      .map(([band, count]) => `${band}=${count}`)
      .join(", ")}.`,
  );
  console.log(
    `By status: ${Object.entries(inventory.byStatus)
      .map(([status, count]) => `${status}=${count}`)
      .join(", ")}.`,
  );
  console.log(
    `First batch: ${inventory.firstBatchReady} ready concepts across ${inventory.firstBatchAssets} assets; remaining queue: ${inventory.remainingQueue}.`,
  );
}
