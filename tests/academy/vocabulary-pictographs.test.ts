import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  createVocabularyPictographIndex,
  loadVocabularyPictographManifest,
  mountLessonVocabularyPictographs,
  parseVocabularyPictographManifest,
  type VocabularyPictographBand,
  type VocabularyPictographManifest,
} from "../../src/academy/content/vocabulary-pictographs";

const ROOT = path.resolve(".");
const MANIFEST_PATH = path.resolve(
  ROOT,
  "public/academy/content/vocabulary-pictographs.v1.json",
);
const ASSET_ROOT = path.resolve(
  ROOT,
  "public/academy/art/vocabulary-pictographs",
);
const SCRIPT_PATH = path.resolve(
  ROOT,
  "scripts/academy-vocabulary-pictographs.mjs",
);
const RUNTIME_PATH = path.resolve(
  ROOT,
  "src/academy/content/vocabulary-pictographs.ts",
);
const rawManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as unknown;

function manifest(): VocabularyPictographManifest {
  return parseVocabularyPictographManifest(rawManifest);
}

function filesRecursively(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesRecursively(absolute) : [absolute];
  });
}

function publicUrl(absolute: string): string {
  return `/${path.relative(path.resolve(ROOT, "public"), absolute).split(path.sep).join("/")}`;
}

afterEach(() => document.body.replaceChildren());

describe("Academy vocabulary pictograph production catalog", () => {
  it("is the deterministic exhaustive rescan of registered learner vocabulary", () => {
    const output = execFileSync(process.execPath, [SCRIPT_PATH, "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toContain(
      "819 concepts from 990 occurrences across 66 lessons",
    );

    expect(manifest().inventory).toEqual({
      concepts: 819,
      sourceOccurrences: 990,
      sourceLessons: 66,
      byBand: {
        foundation: 15,
        n5: 424,
        n4: 309,
        n3: 31,
        n2: 21,
        n1: 19,
      },
      byStatus: {
        ready: 10,
        queued: 80,
        "prompt-ready": 729,
      },
      byRequirement: {
        required: 90,
        scene: 646,
        relationship: 60,
        contrast: 23,
      },
      firstBatchReady: 10,
      firstBatchAssets: 7,
      remainingQueue: 809,
    });
  });

  it("keeps every registered occurrence complete, unique, and attached to a learner-facing lesson", () => {
    const catalog = manifest();
    const occurrenceKeys = catalog.entries.flatMap((entry) =>
      entry.sourceOccurrences.map((occurrence) =>
        [
          occurrence.lessonId,
          occurrence.sourceKind,
          occurrence.sourceIdentity,
        ].join("\u0000"),
      ),
    );
    const consumerIds = catalog.entries.flatMap((entry) =>
      entry.learnerFacingConsumers.map((consumer) => consumer.consumerId),
    );

    expect(new Set(catalog.entries.map((entry) => entry.id)).size).toBe(
      catalog.entries.length,
    );
    expect(
      new Set(catalog.entries.map((entry) => entry.identityKey)).size,
    ).toBe(catalog.entries.length);
    expect(new Set(occurrenceKeys).size).toBe(occurrenceKeys.length);
    expect(new Set(consumerIds).size).toBe(consumerIds.length);

    for (const entry of catalog.entries) {
      expect(entry.japaneseExpression).not.toBe("");
      expect(entry.reading).not.toBe("");
      expect(entry.englishSense).not.toBe("");
      expect(entry.sourceLessonIds.length).toBeGreaterThan(0);
      expect(entry.sourceOccurrences.length).toBeGreaterThan(0);
      expect(entry.learnerFacingConsumers.length).toBeGreaterThan(0);
      expect(
        entry.learnerFacingConsumers.every((consumer) =>
          entry.sourceLessonIds.includes(consumer.lessonId),
        ),
      ).toBe(true);
      expect(entry.altText).toContain(entry.japaneseExpression);
      expect(entry.altText).toContain(entry.englishSense);
      expect(entry.futurePrompt).toContain(entry.japaneseExpression);
      expect(entry.futurePrompt).toContain(entry.reading);
      expect(entry.futurePrompt).toMatch(/No text/iu);
    }
  });

  it("covers the actual registered chronology from foundation through N1", () => {
    const catalog = manifest();
    const orderedBands: readonly VocabularyPictographBand[] = [
      "foundation",
      "n5",
      "n4",
      "n3",
      "n2",
      "n1",
    ];
    const ranges = orderedBands.map((band) => {
      const orders = catalog.entries
        .filter((entry) => entry.introducedAt.band === band)
        .map((entry) => entry.lessonIntroductionOrder);
      expect(orders.length).toBeGreaterThan(0);
      return { band, min: Math.min(...orders), max: Math.max(...orders) };
    });

    expect(ranges).toEqual([
      { band: "foundation", min: 0, max: 0 },
      { band: "n5", min: 2, max: 27 },
      { band: "n4", min: 29, max: 51 },
      { band: "n3", min: 1000, max: 1009 },
      { band: "n2", min: 1010, max: 1016 },
      { band: "n1", min: 1017, max: 1020 },
    ]);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index].min).toBeGreaterThan(ranges[index - 1].max);
    }
  });

  it("has exact local 512px WebP assets and no catalog-or-disk orphans", async () => {
    const catalog = manifest();
    const diskFiles = filesRecursively(ASSET_ROOT);
    const diskUrls = diskFiles.map(publicUrl).sort();
    const catalogUrls = [
      ...new Set(
        catalog.entries
          .filter((entry) => entry.imageStatus === "ready")
          .map((entry) => entry.imagePath!),
      ),
    ].sort();

    expect(diskUrls).toEqual(catalogUrls);
    expect(diskUrls).toHaveLength(7);
    for (const url of diskUrls) {
      expect(url).toMatch(
        /^\/academy\/art\/vocabulary-pictographs\/[^/]+\.webp$/u,
      );
      expect(url).not.toMatch(/(?:https?:|data:|\.\.)/iu);
      const absolute = path.resolve(ROOT, `public${url}`);
      expect(statSync(absolute).size).toBeGreaterThan(1_000);
      const metadata = await sharp(absolute).metadata();
      expect(metadata).toMatchObject({
        format: "webp",
        width: 512,
        height: 512,
      });
    }

    for (const entry of catalog.entries) {
      if (entry.imagePath) {
        expect(entry.imagePath).toMatch(
          /^\/academy\/art\/vocabulary-pictographs\/[^/]+\.webp$/u,
        );
        expect(entry.imagePath).not.toMatch(/(?:https?:|data:|\.\.)/iu);
      }
      if (entry.imageStatus === "ready") {
        expect(entry.imageDimensions).toEqual({ width: 512, height: 512 });
        expect(entry.learnerFacingConsumers.length).toBeGreaterThan(0);
      } else {
        expect(entry.imageDimensions).toBeNull();
      }
    }
  });

  it("renders every generated image through a registered lesson consumer", () => {
    const catalog = manifest();
    const index = createVocabularyPictographIndex(catalog);
    const expectedPaths = new Set(
      catalog.entries
        .filter((entry) => entry.imageStatus === "ready")
        .map((entry) => entry.imagePath!),
    );
    const lessonIds = [
      ...new Set(
        catalog.entries
          .filter((entry) => entry.imageStatus === "ready")
          .flatMap((entry) =>
            entry.learnerFacingConsumers.map((consumer) => consumer.lessonId),
          ),
      ),
    ];
    const renderedPaths = new Set<string>();

    for (const lessonId of lessonIds) {
      const host = document.createElement("main");
      document.body.append(host);
      const mounted = mountLessonVocabularyPictographs(host, index, lessonId, {
        heading: "Today’s words",
      });
      expect(mounted.element.dataset.lessonId).toBe(lessonId);
      for (const image of mounted.element.querySelectorAll<HTMLImageElement>(
        "img",
      )) {
        renderedPaths.add(image.getAttribute("src")!);
        expect(image.alt.length).toBeGreaterThan(20);
        expect(image.width).toBe(512);
        expect(image.height).toBe(512);
        expect(image.loading).toBe("lazy");
      }
      expect(mounted.element.querySelectorAll("figure").length).toBe(
        mounted.imagePaths.length,
      );
      expect(
        mounted.element.querySelector("[data-consumer-ids]"),
      ).not.toBeNull();
      mounted.dispose();
      expect(host.childElementCount).toBe(0);
      host.remove();
    }

    expect(renderedPaths).toEqual(expectedPaths);
  });

  it("ships all concrete Foundation and Lesson 1 concepts while leaving abstractions honest", () => {
    const early = manifest().entries.filter(
      (entry) => entry.lessonIntroductionOrder <= 2,
    );
    const concrete = early.filter(
      (entry) => entry.pictographRequirement === "required",
    );
    const abstract = early.filter(
      (entry) => entry.pictographRequirement !== "required",
    );

    expect(concrete).toHaveLength(10);
    expect(
      concrete.every(
        (entry) =>
          entry.imageStatus === "ready" && entry.imagePath?.endsWith(".webp"),
      ),
    ).toBe(true);
    expect(abstract.length).toBeGreaterThan(0);
    expect(
      abstract.every(
        (entry) =>
          entry.imageStatus === "prompt-ready" && entry.imagePath === null,
      ),
    ).toBe(true);
  });

  it("loads and queries the public manifest without importing curriculum source modules", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => rawManifest,
    })) as unknown as typeof fetch;
    const loaded = await loadVocabularyPictographManifest(
      fetcher,
      "/catalog.json",
    );
    const index = createVocabularyPictographIndex(loaded);
    const teacher = index.findByExpression("先生", "せんせい")[0];
    const country = index.findByExpression("くに", "くに")[0];

    expect(fetcher).toHaveBeenCalledWith("/catalog.json");
    expect(teacher).toMatchObject({
      englishSense: "teacher",
      imagePath: "/academy/art/vocabulary-pictographs/teacher.webp",
      imageStatus: "ready",
    });
    expect(country).toMatchObject({
      japaneseExpression: "くに",
      displayExpression: "国",
      reading: "くに",
      englishSense: "country",
    });
    expect(index.getById(teacher.id)).toBe(teacher);
    expect(index.readyForLesson("lesson:foundation-00").length).toBeGreaterThan(
      0,
    );

    const host = document.createElement("main");
    const mounted = mountLessonVocabularyPictographs(
      host,
      index,
      country.introducedAt.lessonId,
    );
    const countryFigure = mounted.element.querySelector<HTMLElement>(
      `[data-vocabulary-ids~="${country.id}"]`,
    );
    expect(
      countryFigure?.querySelector(".academy-vocabulary-pictograph__expression")
        ?.textContent,
    ).toBe("国");
    expect(
      countryFigure?.querySelector(".academy-vocabulary-pictograph__reading")
        ?.textContent,
    ).toBe("くに");
    mounted.dispose();

    const runtimeSource = readFileSync(RUNTIME_PATH, "utf8");
    expect(runtimeSource).not.toMatch(
      /\/Users\/|Documents\/Japanese|lesson-content-registry|advanced-curriculum/iu,
    );
    expect(runtimeSource).not.toMatch(
      /from\s+['"][^'"]*(?:genki|minna|moodle)/iu,
    );
  });

  it("rejects remote image paths and catalog entries without consumers", () => {
    const remote = structuredClone(rawManifest) as {
      entries: Array<{
        imagePath: string | null;
        learnerFacingConsumers: unknown[];
      }>;
    };
    const readyIndex = remote.entries.findIndex(
      (entry) => entry.imagePath !== null,
    );
    remote.entries[readyIndex].imagePath = "https://example.com/orphan.webp";
    expect(() => parseVocabularyPictographManifest(remote)).toThrow(
      "not a safe Academy pictograph path",
    );

    const orphaned = structuredClone(rawManifest) as {
      entries: Array<{
        imageStatus: string;
        learnerFacingConsumers: unknown[];
      }>;
    };
    const generatedIndex = orphaned.entries.findIndex(
      (entry) => entry.imageStatus === "ready",
    );
    orphaned.entries[generatedIndex].learnerFacingConsumers = [];
    expect(() => parseVocabularyPictographManifest(orphaned)).toThrow(
      "no learner-facing consumer",
    );
  });
});
