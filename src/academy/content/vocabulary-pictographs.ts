export type VocabularyPictographBand =
  "foundation" | "n5" | "n4" | "n3" | "n2" | "n1";
export type VocabularyPictographRequirement =
  "required" | "scene" | "relationship" | "contrast";
export type VocabularyPictographStatus = "ready" | "queued" | "prompt-ready";
export type VocabularyPictographConsumerSurface = "introduction" | "review";
export type VocabularyConcretenessClass =
  | "concrete-object"
  | "person"
  | "place"
  | "group"
  | "scene"
  | "relationship"
  | "contrast";

export interface VocabularyPictographOccurrence {
  readonly lessonId: string;
  readonly sourceKind:
    | "canonical-vocabulary"
    | "lesson-vocabulary-row"
    | "lesson-srs-vocabulary"
    | "advanced-review-expression";
  readonly sourceIdentity: string;
}

export interface VocabularyPictographConsumer {
  readonly consumerId: string;
  readonly lessonId: string;
  readonly surface: VocabularyPictographConsumerSurface;
}

export interface VocabularyPictographEntry {
  readonly id: string;
  readonly identityKey: string;
  readonly lessonIntroductionOrder: number;
  readonly introducedAt: Readonly<{
    lessonId: string;
    band: VocabularyPictographBand;
    order: number;
  }>;
  readonly japaneseExpression: string;
  readonly displayExpression: string;
  readonly reading: string;
  readonly englishSense: string;
  readonly concretenessClass: VocabularyConcretenessClass;
  readonly pictographRequirement: VocabularyPictographRequirement;
  readonly imagePath: string | null;
  readonly imageStatus: VocabularyPictographStatus;
  readonly imageDimensions: Readonly<{ width: number; height: number }> | null;
  readonly altText: string;
  readonly futurePrompt: string;
  readonly sourceLessonIds: readonly string[];
  readonly bands: readonly VocabularyPictographBand[];
  readonly learnerFacingConsumers: readonly VocabularyPictographConsumer[];
  readonly sourceOccurrences: readonly VocabularyPictographOccurrence[];
}

export interface VocabularyPictographManifest {
  readonly schemaVersion: 1;
  readonly id: "academy-vocabulary-pictographs-v1";
  readonly sourceDigest: string;
  readonly courseBandOrder: readonly VocabularyPictographBand[];
  readonly inventory: Readonly<{
    concepts: number;
    sourceOccurrences: number;
    sourceLessons: number;
    byBand: Readonly<Record<VocabularyPictographBand, number>>;
    byStatus: Readonly<Record<VocabularyPictographStatus, number>>;
    byRequirement: Readonly<Record<VocabularyPictographRequirement, number>>;
    firstBatchReady: number;
    firstBatchAssets: number;
    remainingQueue: number;
  }>;
  readonly entries: readonly VocabularyPictographEntry[];
}

export interface VocabularyPictographIndex {
  readonly manifest: VocabularyPictographManifest;
  getById(id: string): VocabularyPictographEntry | undefined;
  findByExpression(
    expression: string,
    reading?: string,
  ): readonly VocabularyPictographEntry[];
  forLesson(lessonId: string): readonly VocabularyPictographEntry[];
  forBand(band: VocabularyPictographBand): readonly VocabularyPictographEntry[];
  readyForLesson(lessonId: string): readonly VocabularyPictographEntry[];
}

export interface VocabularyPictographMountOptions {
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly heading?: string;
  readonly showEnglish?: boolean;
  readonly showReading?: boolean;
}

export interface VocabularyPictographLessonMount {
  readonly element: HTMLElement;
  readonly entries: readonly VocabularyPictographEntry[];
  readonly imagePaths: readonly string[];
  dispose(): void;
}

const DEFAULT_MANIFEST_URL = "/academy/content/vocabulary-pictographs.v1.json";
const COURSE_BANDS: readonly VocabularyPictographBand[] = Object.freeze([
  "foundation",
  "n5",
  "n4",
  "n3",
  "n2",
  "n1",
]);
const REQUIREMENTS = new Set<VocabularyPictographRequirement>([
  "required",
  "scene",
  "relationship",
  "contrast",
]);
const STATUSES = new Set<VocabularyPictographStatus>([
  "ready",
  "queued",
  "prompt-ready",
]);
const CONCRETENESS = new Set<VocabularyConcretenessClass>([
  "concrete-object",
  "person",
  "place",
  "group",
  "scene",
  "relationship",
  "contrast",
]);

let defaultManifest: Promise<VocabularyPictographManifest> | undefined;

export function loadVocabularyPictographManifest(
  fetcher: typeof fetch = fetch,
  url = DEFAULT_MANIFEST_URL,
): Promise<VocabularyPictographManifest> {
  if (fetcher === fetch && url === DEFAULT_MANIFEST_URL) {
    defaultManifest ??= fetchManifest(fetcher, url);
    return defaultManifest;
  }
  return fetchManifest(fetcher, url);
}

export function parseVocabularyPictographManifest(
  value: unknown,
): VocabularyPictographManifest {
  const root = record(value, "vocabulary pictograph manifest");
  if (
    root.schemaVersion !== 1 ||
    root.id !== "academy-vocabulary-pictographs-v1"
  ) {
    throw new TypeError("Unsupported vocabulary pictograph manifest.");
  }
  const sourceDigest = digest(root.sourceDigest, "manifest sourceDigest");
  const courseBandOrder = strings(
    root.courseBandOrder,
    "manifest courseBandOrder",
  ).map((band, index) =>
    vocabularyBand(band, `manifest courseBandOrder[${index}]`),
  );
  if (courseBandOrder.join("|") !== COURSE_BANDS.join("|")) {
    throw new TypeError("Vocabulary pictograph course bands are out of order.");
  }
  const entries = array(root.entries, "manifest entries").map(
    (candidate, index) => parseEntry(candidate, index),
  );
  assertUnique(
    entries.map((entry) => entry.id),
    "vocabulary pictograph id",
  );
  assertUnique(
    entries.map((entry) => entry.identityKey),
    "vocabulary pictograph identity",
  );
  assertUnique(
    entries.flatMap((entry) =>
      entry.learnerFacingConsumers.map((consumer) => consumer.consumerId),
    ),
    "learner-facing vocabulary pictograph consumer id",
  );

  const inventory = parseInventory(root.inventory);
  const readyEntries = entries.filter((entry) => entry.imageStatus === "ready");
  const sourceLessons = new Set(
    entries.flatMap((entry) => entry.sourceLessonIds),
  );
  if (
    inventory.concepts !== entries.length ||
    inventory.sourceOccurrences !==
      entries.reduce(
        (total, entry) => total + entry.sourceOccurrences.length,
        0,
      ) ||
    inventory.sourceLessons !== sourceLessons.size ||
    inventory.firstBatchReady !== readyEntries.length ||
    inventory.firstBatchAssets !==
      new Set(readyEntries.map((entry) => entry.imagePath)).size ||
    inventory.remainingQueue !== entries.length - readyEntries.length ||
    COURSE_BANDS.some(
      (band) =>
        inventory.byBand[band] !==
        entries.filter((entry) => entry.introducedAt.band === band).length,
    ) ||
    [...STATUSES].some(
      (statusValue) =>
        inventory.byStatus[statusValue] !==
        entries.filter((entry) => entry.imageStatus === statusValue).length,
    ) ||
    [...REQUIREMENTS].some(
      (requirementValue) =>
        inventory.byRequirement[requirementValue] !==
        entries.filter(
          (entry) => entry.pictographRequirement === requirementValue,
        ).length,
    )
  ) {
    throw new TypeError(
      "Vocabulary pictograph inventory totals do not match its entries.",
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    id: "academy-vocabulary-pictographs-v1",
    sourceDigest,
    courseBandOrder: Object.freeze(courseBandOrder),
    inventory,
    entries: Object.freeze(entries),
  });
}

export function createVocabularyPictographIndex(
  manifest: VocabularyPictographManifest,
): VocabularyPictographIndex {
  const byId = new Map(manifest.entries.map((entry) => [entry.id, entry]));
  const normalizedEntries = manifest.entries.map((entry) => ({
    entry,
    expression: normalizeJapanese(entry.japaneseExpression),
    reading: normalizeJapanese(entry.reading),
  }));

  const forLesson = (lessonId: string) =>
    Object.freeze(
      manifest.entries.filter((entry) =>
        entry.learnerFacingConsumers.some(
          (consumer) => consumer.lessonId === lessonId,
        ),
      ),
    );
  return Object.freeze({
    manifest,
    getById: (id: string) => byId.get(id),
    findByExpression: (expression: string, reading?: string) => {
      const normalizedExpression = normalizeJapanese(expression);
      const normalizedReading = reading
        ? normalizeJapanese(reading)
        : undefined;
      return Object.freeze(
        normalizedEntries
          .filter(
            (candidate) =>
              candidate.expression === normalizedExpression &&
              (normalizedReading === undefined ||
                candidate.reading === normalizedReading),
          )
          .map((candidate) => candidate.entry),
      );
    },
    forLesson,
    forBand: (band: VocabularyPictographBand) =>
      Object.freeze(
        manifest.entries.filter((entry) => entry.bands.includes(band)),
      ),
    readyForLesson: (lessonId: string) =>
      Object.freeze(
        forLesson(lessonId).filter((entry) => entry.imageStatus === "ready"),
      ),
  });
}

export function mountLessonVocabularyPictographs(
  container: Element,
  index: VocabularyPictographIndex,
  lessonId: string,
  options: VocabularyPictographMountOptions = {},
): VocabularyPictographLessonMount {
  const documentRef = container.ownerDocument;
  const entries = index.readyForLesson(lessonId);
  const groups = groupReadyEntriesByImage(entries);
  const section = documentRef.createElement("section");
  section.className =
    options.className?.trim() || "academy-vocabulary-pictographs";
  section.dataset.lessonId = lessonId;
  section.tabIndex = 0;
  section.setAttribute(
    "aria-label",
    options.ariaLabel?.trim() || "Vocabulary pictures",
  );

  if (options.heading?.trim()) {
    const heading = documentRef.createElement("h2");
    heading.className = "academy-vocabulary-pictographs__heading";
    heading.textContent = options.heading.trim();
    section.append(heading);
  }

  for (const group of groups) {
    section.append(
      createVocabularyPictographFigure(documentRef, group, options),
    );
  }
  container.append(section);

  return Object.freeze({
    element: section,
    entries,
    imagePaths: Object.freeze(groups.map((group) => group.imagePath)),
    dispose: () => section.remove(),
  });
}

async function fetchManifest(
  fetcher: typeof fetch,
  url: string,
): Promise<VocabularyPictographManifest> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(
      `Unable to load Academy vocabulary pictographs (${response.status}).`,
    );
  }
  return parseVocabularyPictographManifest(await response.json());
}

function parseEntry(value: unknown, index: number): VocabularyPictographEntry {
  const item = record(value, `manifest entries[${index}]`);
  const introducedAt = record(
    item.introducedAt,
    `manifest entries[${index}].introducedAt`,
  );
  const imageStatus = status(
    item.imageStatus,
    `manifest entries[${index}].imageStatus`,
  );
  const imagePath =
    item.imagePath === null
      ? null
      : localImagePath(item.imagePath, `manifest entries[${index}].imagePath`);
  const imageDimensions =
    item.imageDimensions === null
      ? null
      : parseImageDimensions(
          item.imageDimensions,
          `manifest entries[${index}].imageDimensions`,
        );
  if (imageStatus !== "prompt-ready" && imagePath === null) {
    throw new TypeError(
      `Vocabulary pictograph ${String(item.id)} has no catalog image path.`,
    );
  }
  if (imageStatus === "prompt-ready" && imagePath !== null) {
    throw new TypeError(
      `Non-literal vocabulary visual ${String(item.id)} must not claim an image.`,
    );
  }
  if ((imageStatus === "ready") !== (imageDimensions !== null)) {
    throw new TypeError(
      `Vocabulary pictograph ${String(item.id)} has invalid ready-image dimensions.`,
    );
  }

  const sourceLessonIds = Object.freeze(
    strings(item.sourceLessonIds, `manifest entries[${index}].sourceLessonIds`),
  );
  const learnerFacingConsumers = Object.freeze(
    array(
      item.learnerFacingConsumers,
      `manifest entries[${index}].learnerFacingConsumers`,
    ).map((candidate, consumerIndex) =>
      parseConsumer(
        candidate,
        `manifest entries[${index}].learnerFacingConsumers[${consumerIndex}]`,
      ),
    ),
  );
  if (!learnerFacingConsumers.length) {
    throw new TypeError(
      `Vocabulary pictograph ${String(item.id)} has no learner-facing consumer.`,
    );
  }
  for (const consumer of learnerFacingConsumers) {
    if (!sourceLessonIds.includes(consumer.lessonId)) {
      throw new TypeError(
        `Vocabulary pictograph consumer ${consumer.consumerId} has no source lesson.`,
      );
    }
  }

  return Object.freeze({
    id: text(item.id, `manifest entries[${index}].id`),
    identityKey: text(
      item.identityKey,
      `manifest entries[${index}].identityKey`,
    ),
    lessonIntroductionOrder: integer(
      item.lessonIntroductionOrder,
      `manifest entries[${index}].lessonIntroductionOrder`,
    ),
    introducedAt: Object.freeze({
      lessonId: text(
        introducedAt.lessonId,
        `manifest entries[${index}].introducedAt.lessonId`,
      ),
      band: vocabularyBand(
        introducedAt.band,
        `manifest entries[${index}].introducedAt.band`,
      ),
      order: integer(
        introducedAt.order,
        `manifest entries[${index}].introducedAt.order`,
      ),
    }),
    japaneseExpression: text(
      item.japaneseExpression,
      `manifest entries[${index}].japaneseExpression`,
    ),
    displayExpression: text(
      item.displayExpression ?? item.japaneseExpression,
      `manifest entries[${index}].displayExpression`,
    ),
    reading: text(item.reading, `manifest entries[${index}].reading`),
    englishSense: text(
      item.englishSense,
      `manifest entries[${index}].englishSense`,
    ),
    concretenessClass: concreteness(
      item.concretenessClass,
      `manifest entries[${index}].concretenessClass`,
    ),
    pictographRequirement: requirement(
      item.pictographRequirement,
      `manifest entries[${index}].pictographRequirement`,
    ),
    imagePath,
    imageStatus,
    imageDimensions,
    altText: text(item.altText, `manifest entries[${index}].altText`),
    futurePrompt: text(
      item.futurePrompt,
      `manifest entries[${index}].futurePrompt`,
    ),
    sourceLessonIds,
    bands: Object.freeze(
      strings(item.bands, `manifest entries[${index}].bands`).map(
        (band, bandIndex) =>
          vocabularyBand(
            band,
            `manifest entries[${index}].bands[${bandIndex}]`,
          ),
      ),
    ),
    learnerFacingConsumers,
    sourceOccurrences: Object.freeze(
      array(
        item.sourceOccurrences,
        `manifest entries[${index}].sourceOccurrences`,
      ).map((candidate, occurrenceIndex) =>
        parseOccurrence(
          candidate,
          `manifest entries[${index}].sourceOccurrences[${occurrenceIndex}]`,
        ),
      ),
    ),
  });
}

function parseConsumer(
  value: unknown,
  label: string,
): VocabularyPictographConsumer {
  const item = record(value, label);
  const surface = text(item.surface, `${label}.surface`);
  if (surface !== "introduction" && surface !== "review") {
    throw new TypeError(`Unsupported ${label}.surface.`);
  }
  return Object.freeze({
    consumerId: text(item.consumerId, `${label}.consumerId`),
    lessonId: text(item.lessonId, `${label}.lessonId`),
    surface,
  });
}

function parseOccurrence(
  value: unknown,
  label: string,
): VocabularyPictographOccurrence {
  const item = record(value, label);
  const sourceKind = text(item.sourceKind, `${label}.sourceKind`);
  if (
    sourceKind !== "canonical-vocabulary" &&
    sourceKind !== "lesson-vocabulary-row" &&
    sourceKind !== "lesson-srs-vocabulary" &&
    sourceKind !== "advanced-review-expression"
  )
    throw new TypeError(`Unsupported ${label}.sourceKind.`);
  return Object.freeze({
    lessonId: text(item.lessonId, `${label}.lessonId`),
    sourceKind,
    sourceIdentity: text(item.sourceIdentity, `${label}.sourceIdentity`),
  });
}

function parseInventory(
  value: unknown,
): VocabularyPictographManifest["inventory"] {
  const item = record(value, "manifest inventory");
  const byBand = exactCounts(
    item.byBand,
    COURSE_BANDS,
    "manifest inventory.byBand",
  );
  const byStatus = exactCounts(
    item.byStatus,
    [...STATUSES],
    "manifest inventory.byStatus",
  );
  const byRequirement = exactCounts(
    item.byRequirement,
    [...REQUIREMENTS],
    "manifest inventory.byRequirement",
  );
  return Object.freeze({
    concepts: integer(item.concepts, "manifest inventory.concepts"),
    sourceOccurrences: integer(
      item.sourceOccurrences,
      "manifest inventory.sourceOccurrences",
    ),
    sourceLessons: integer(
      item.sourceLessons,
      "manifest inventory.sourceLessons",
    ),
    byBand: Object.freeze(byBand) as Readonly<
      Record<VocabularyPictographBand, number>
    >,
    byStatus: Object.freeze(byStatus) as Readonly<
      Record<VocabularyPictographStatus, number>
    >,
    byRequirement: Object.freeze(byRequirement) as Readonly<
      Record<VocabularyPictographRequirement, number>
    >,
    firstBatchReady: integer(
      item.firstBatchReady,
      "manifest inventory.firstBatchReady",
    ),
    firstBatchAssets: integer(
      item.firstBatchAssets,
      "manifest inventory.firstBatchAssets",
    ),
    remainingQueue: integer(
      item.remainingQueue,
      "manifest inventory.remainingQueue",
    ),
  });
}

function parseImageDimensions(
  value: unknown,
  label: string,
): Readonly<{ width: number; height: number }> {
  const item = record(value, label);
  return Object.freeze({
    width: positiveInteger(item.width, `${label}.width`),
    height: positiveInteger(item.height, `${label}.height`),
  });
}

interface VocabularyPictographRenderGroup {
  readonly imagePath: string;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly entries: readonly VocabularyPictographEntry[];
}

function groupReadyEntriesByImage(
  entries: readonly VocabularyPictographEntry[],
): readonly VocabularyPictographRenderGroup[] {
  const grouped = new Map<string, VocabularyPictographEntry[]>();
  for (const entry of entries) {
    if (!entry.imagePath || !entry.imageDimensions) continue;
    const group = grouped.get(entry.imagePath) ?? [];
    group.push(entry);
    grouped.set(entry.imagePath, group);
  }
  return Object.freeze(
    [...grouped.entries()].map(([imagePath, group]) =>
      Object.freeze({
        imagePath,
        dimensions: group[0].imageDimensions!,
        entries: Object.freeze(group),
      }),
    ),
  );
}

function createVocabularyPictographFigure(
  documentRef: Document,
  group: VocabularyPictographRenderGroup,
  options: VocabularyPictographMountOptions,
): HTMLElement {
  const primary = group.entries[0];
  const figure = documentRef.createElement("figure");
  figure.className = "academy-vocabulary-pictograph";
  figure.dataset.vocabularyIds = group.entries
    .map((entry) => entry.id)
    .join(" ");
  figure.dataset.consumerIds = group.entries
    .flatMap((entry) =>
      entry.learnerFacingConsumers.map((consumer) => consumer.consumerId),
    )
    .join(" ");

  const image = documentRef.createElement("img");
  image.className = "academy-vocabulary-pictograph__image";
  image.src = group.imagePath;
  image.alt = primary.altText;
  image.width = group.dimensions.width;
  image.height = group.dimensions.height;
  image.loading = "lazy";
  image.decoding = "async";
  figure.append(image);

  const caption = documentRef.createElement("figcaption");
  caption.className = "academy-vocabulary-pictograph__caption";
  const expressions = unique(
    group.entries.map((entry) => entry.displayExpression),
  );
  appendCaptionPart(
    documentRef,
    caption,
    expressions.join(" / "),
    "ja",
    "expression",
  );

  if (options.showReading !== false) {
    const readings = unique(group.entries.map((entry) => entry.reading)).filter(
      (reading) => !expressions.includes(reading),
    );
    if (readings.length)
      appendCaptionPart(
        documentRef,
        caption,
        readings.join(" / "),
        "ja",
        "reading",
      );
  }
  if (options.showEnglish !== false) {
    appendCaptionPart(
      documentRef,
      caption,
      unique(group.entries.map((entry) => entry.englishSense)).join("; "),
      "en",
      "meaning",
    );
  }
  figure.append(caption);
  return figure;
}

function appendCaptionPart(
  documentRef: Document,
  caption: HTMLElement,
  value: string,
  language: string,
  part: string,
): void {
  const span = documentRef.createElement("span");
  span.className = `academy-vocabulary-pictograph__${part}`;
  span.lang = language;
  span.textContent = value;
  caption.append(span);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function exactCounts(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, number> {
  const item = record(value, label);
  const result: Record<string, number> = {};
  for (const key of keys) result[key] = integer(item[key], `${label}.${key}`);
  return result;
}

function normalizeJapanese(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function localImagePath(value: unknown, label: string): string {
  const path = text(value, label);
  if (
    !path.startsWith("/academy/art/vocabulary-pictographs/") ||
    path.includes("..") ||
    /^https?:|^data:/iu.test(path)
  ) {
    throw new TypeError(`${label} is not a safe Academy pictograph path.`);
  }
  return path;
}

function vocabularyBand(
  value: unknown,
  label: string,
): VocabularyPictographBand {
  const band = text(value, label);
  if (!COURSE_BANDS.includes(band as VocabularyPictographBand)) {
    throw new TypeError(`Unsupported ${label}: ${band}.`);
  }
  return band as VocabularyPictographBand;
}

function requirement(
  value: unknown,
  label: string,
): VocabularyPictographRequirement {
  const result = text(value, label) as VocabularyPictographRequirement;
  if (!REQUIREMENTS.has(result))
    throw new TypeError(`Unsupported ${label}: ${result}.`);
  return result;
}

function status(value: unknown, label: string): VocabularyPictographStatus {
  const result = text(value, label) as VocabularyPictographStatus;
  if (!STATUSES.has(result))
    throw new TypeError(`Unsupported ${label}: ${result}.`);
  return result;
}

function concreteness(
  value: unknown,
  label: string,
): VocabularyConcretenessClass {
  const result = text(value, label) as VocabularyConcretenessClass;
  if (!CONCRETENESS.has(result))
    throw new TypeError(`Unsupported ${label}: ${result}.`);
  return result;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`Missing ${label}.`);
  return value.trim();
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0)
    throw new TypeError(`Invalid ${label}.`);
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result === 0) throw new TypeError(`Invalid ${label}.`);
  return result;
}

function strings(value: unknown, label: string): string[] {
  return array(value, label).map((candidate, index) =>
    text(candidate, `${label}[${index}]`),
  );
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`Missing ${label}.`);
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Missing ${label}.`);
  }
  return value as Record<string, unknown>;
}

function digest(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`Invalid ${label}.`);
  return result;
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new TypeError(`Duplicate ${label}: ${value}.`);
    seen.add(value);
  }
}
