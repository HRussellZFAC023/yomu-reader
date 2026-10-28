import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createN3SourceOpeningPackage,
  N3_SOURCE_OPENING_PACKAGE_IDS,
} from "../../src/academy/content/n3-source-opening/package";
import {
  canonicalN3SourceOpeningEcoReadingPayload,
  canonicalN3SourceOpeningTobiraEvidencePayload,
  canonicalN3SourceOpeningTownFlowPayload,
  N3_SOURCE_OPENING_ECO_READING,
  N3_SOURCE_OPENING_ITEM_HASHES,
  N3_SOURCE_OPENING_SOURCE_CATALOG,
  N3_SOURCE_OPENING_STAGE_PROVENANCE,
  N3_SOURCE_OPENING_TOBIRA_EVIDENCE,
  N3_SOURCE_OPENING_TOWN_FLOW_ITEMS,
} from "../../src/academy/content/n3-source-opening/source";
import {
  createN3SourceOpeningRuntime,
  n3SourceOpeningPlugin,
} from "../../src/academy/content/n3-source-opening/plugin";
import type {
  N3SourceOpeningModel,
  N3SourceOpeningResponse,
} from "../../src/academy/content/n3-source-opening/types";

const SOURCE_ROOTS: Partial<
  Record<(typeof N3_SOURCE_OPENING_SOURCE_CATALOG)[number]["scope"], string>
> = {
  ...(process.env.YOMU_JAPANESE_LIBRARY_ROOT
    ? {
        "japanese-library": path.resolve(
          process.env.YOMU_JAPANESE_LIBRARY_ROOT,
        ),
      }
    : {}),
  ...(process.env.ACADEMY_SOYA_ROOT
    ? {
        "soya-research": path.join(
          path.resolve(process.env.ACADEMY_SOYA_ROOT),
          "extracted-src-all",
        ),
      }
    : {}),
  ...(process.env.ACADEMY_SOURCE_CORPUS_ROOT
    ? {
        "yomu-academy": path.resolve(process.env.ACADEMY_SOURCE_CORPUS_ROOT),
      }
    : {}),
} as const;
const EXPLICIT_SOURCE_ROOTS = [
  ["japanese-library", process.env.YOMU_JAPANESE_LIBRARY_ROOT],
  ["soya-research", process.env.ACADEMY_SOYA_ROOT],
  ["yomu-academy", process.env.ACADEMY_SOURCE_CORPUS_ROOT],
] as const;
const REQUIRE_SOURCE_FIDELITY =
  process.env.ACADEMY_REQUIRE_N3_SOURCE_FIDELITY === "1";
const PACKAGES = N3_SOURCE_OPENING_PACKAGE_IDS.map(
  createN3SourceOpeningPackage,
);

afterEach(() => document.body.replaceChildren());

describe("N3 source-opening tranche", () => {
  it("treats a configured Moodle corpus directory as the manifest root", () => {
    const sourceRoot = path.resolve("tmp", "custom-academy-corpus");
    expect(
      localSourcePath("yomu-academy", sourceRoot, "moodle-raw/manifest.json"),
    ).toBe(path.join(sourceRoot, "manifest.json"));
  });

  it("keeps every resolved local source path inside its configured root", () => {
    const sourceRoot = path.resolve("tmp", "configured-source-root");
    const nested = localSourcePath(
      "soya-research",
      sourceRoot,
      "data/courses/mock.js",
    );
    expect(nested).toBe(path.join(sourceRoot, "data/courses/mock.js"));
    expect(path.relative(sourceRoot, nested)).toBe("data/courses/mock.js");

    [
      "/tmp/absolute.js",
      "C:\\private\\absolute.js",
      "../outside.js",
      "data/../../outside.js",
      "data\\..\\..\\outside.js",
    ].forEach((candidate) =>
      expect(() =>
        localSourcePath("soya-research", sourceRoot, candidate),
      ).toThrow(/relative path|escapes configured root/u),
    );
  });

  it("rejects a strict source target that escapes through a nested symlink", () => {
    const fixtureRoot = mkdtempSync(
      path.join(tmpdir(), "yomu-n3-source-fidelity-"),
    );
    const sourceRoot = path.join(fixtureRoot, "configured-root");
    const outsideRoot = path.join(fixtureRoot, "outside-root");

    try {
      mkdirSync(path.join(sourceRoot, "data"), { recursive: true });
      mkdirSync(path.join(outsideRoot, "courses"), { recursive: true });
      writeFileSync(path.join(outsideRoot, "courses", "mock.js"), "escape");
      symlinkSync(
        path.join(outsideRoot, "courses"),
        path.join(sourceRoot, "data", "courses"),
        "dir",
      );

      expect(() =>
        verifiedLocalSourcePath(
          "soya-research",
          sourceRoot,
          "data/courses/mock.js",
        ),
      ).toThrow(/resolves outside configured root/u);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("pins every source and verifies each configured local corpus", async () => {
    expect(sha256(canonicalN3SourceOpeningTownFlowPayload())).toBe(
      N3_SOURCE_OPENING_ITEM_HASHES.townFlow,
    );
    expect(sha256(canonicalN3SourceOpeningTobiraEvidencePayload())).toBe(
      N3_SOURCE_OPENING_ITEM_HASHES.tobiraEvidence,
    );
    expect(sha256(canonicalN3SourceOpeningEcoReadingPayload())).toBe(
      N3_SOURCE_OPENING_ITEM_HASHES.ecoReading,
    );
    expect(JSON.stringify(N3_SOURCE_OPENING_SOURCE_CATALOG)).not.toContain(
      "/Users/",
    );
    expect(sourceRecord("yomu-academy:moodle-raw-manifest")).toMatchObject({
      relativePath: "moodle-raw/manifest.json",
      sha256:
        "1dd65b2a8ec6894610dfc05e989f7fd7e2acf8fe511a267e943d775f784e9835",
      bytes: 17136,
      delivery: "not-delivered",
    });
    expect(sourceRecord("soya-research:n3-mock1-grammar")).toMatchObject({
      relativePath: "data/courses/jlpt_n3/mock1_grammar.js",
      sha256:
        "f70938aba899028c5712a2f05fcac54bca4bec5353c5e13bf0f04cb4fb655281",
      bytes: 11012,
      delivery: "reviewed-excerpts",
    });
    expect(sourceRecord("soya-research:n3-mock1-reading")).toMatchObject({
      relativePath: "data/courses/jlpt_n3/mock1_reading.js",
      sha256:
        "b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35",
      bytes: 25924,
      delivery: "reviewed-excerpts",
    });
    if (REQUIRE_SOURCE_FIDELITY) {
      EXPLICIT_SOURCE_ROOTS.forEach(([scope, configuredRoot]) =>
        expect(
          configuredRoot,
          `${scope} must be explicitly configured for N3 source-fidelity proof`,
        ).toBeTruthy(),
      );
    }
    EXPLICIT_SOURCE_ROOTS.forEach(([scope, configuredRoot]) => {
      if (!configuredRoot) return;
      expect(
        existsSync(SOURCE_ROOTS[scope] ?? ""),
        `${scope} configured root must be available`,
      ).toBe(true);
    });

    const verifiedSources = new Set<string>();
    for (const source of N3_SOURCE_OPENING_SOURCE_CATALOG) {
      if (!source.relativePath || source.scope === "official-web") continue;
      const sourceRoot = SOURCE_ROOTS[source.scope];
      if (!sourceRoot || !existsSync(sourceRoot)) continue;
      const sourcePath = localSourcePath(
        source.scope,
        sourceRoot,
        source.relativePath,
      );
      expect(existsSync(sourcePath), `${source.id} must be available`).toBe(
        true,
      );
      const verifiedSourcePath = verifiedLocalSourcePath(
        source.scope,
        sourceRoot,
        source.relativePath,
      );
      expect(statSync(verifiedSourcePath).size, source.id).toBe(source.bytes);
      expect(await sha256File(verifiedSourcePath), source.id).toBe(
        source.sha256,
      );
      verifiedSources.add(source.id);
    }
    N3_SOURCE_OPENING_SOURCE_CATALOG.filter((source) => {
      const sourceRoot = SOURCE_ROOTS[source.scope];
      return source.relativePath && sourceRoot && existsSync(sourceRoot);
    }).forEach((source) =>
      expect(verifiedSources.has(source.id), source.id).toBe(true),
    );

    const localAudio = N3_SOURCE_OPENING_SOURCE_CATALOG.find(
      (source) => source.id === "japanese-library:tobira-l01-reading-audio",
    );
    const officialAudio = N3_SOURCE_OPENING_SOURCE_CATALOG.find(
      (source) => source.id === "official-web:tobira-l01-reading-audio",
    );
    expect(localAudio?.sha256).toBe(officialAudio?.sha256);
    expect(localAudio?.bytes).toBe(officialAudio?.bytes);
    expect(officialAudio).toMatchObject({
      delivery: "official-remote",
      role: "delivered-remote-media",
    });
    N3_SOURCE_OPENING_SOURCE_CATALOG.filter((source) =>
      source.id.startsWith("official-jlpt:"),
    ).forEach((source) =>
      expect(source).toMatchObject({
        originPageUrl: "https://www.jlpt.jp/e/samples/sample09.html?mode=pc",
        retrievedAt: "2026-07-18",
        role: "task-calibration",
        delivery: "not-delivered",
      }),
    );
  }, 30_000);

  it.skipIf(!process.env.ACADEMY_SOYA_ROOT)(
    "preserves the exact selected Soya wording and disjoint item ids",
    () => {
      const soyaSourceRoot = SOURCE_ROOTS["soya-research"]!;
      const grammarPath = localSourcePath(
        "soya-research",
        soyaSourceRoot,
        "data/courses/jlpt_n3/mock1_grammar.js",
      );
      const readingPath = localSourcePath(
        "soya-research",
        soyaSourceRoot,
        "data/courses/jlpt_n3/mock1_reading.js",
      );
      expect(existsSync(grammarPath), "Soya N3 grammar source must exist").toBe(
        true,
      );
      expect(existsSync(readingPath), "Soya N3 reading source must exist").toBe(
        true,
      );
      const grammarSource = readFileSync(grammarPath, "utf8");
      const readingSource = readFileSync(readingPath, "utf8");

      for (const item of N3_SOURCE_OPENING_TOWN_FLOW_ITEMS) {
        expect(grammarSource).toContain(`id: "${item.id}"`);
        expect(grammarSource).toContain(item.display);
        item.choices.forEach((choice) =>
          expect(grammarSource).toContain(choice),
        );
        expect(grammarSource).toContain(item.explanation);
      }
      for (const item of N3_SOURCE_OPENING_ECO_READING.questions) {
        expect(readingSource).toContain(`id: "${item.id}"`);
        expect(readingSource).toContain(item.question);
        item.options.forEach((option) =>
          expect(readingSource).toContain(option),
        );
        expect(readingSource).toContain(item.explanation);
      }
      N3_SOURCE_OPENING_ECO_READING.passage
        .split("\n")
        .forEach((paragraph) => expect(readingSource).toContain(paragraph));
    },
  );

  it("keeps provenance package-local and exports the unregistered plugin surface", () => {
    expect(n3SourceOpeningPlugin.kind).toBe("academy-n3-source-opening");
    for (const packageRecord of PACKAGES) {
      expect(packageRecord.activity.provenance).toBe(
        N3_SOURCE_OPENING_STAGE_PROVENANCE[
          packageRecord.activity.payload.stage
        ],
      );
      expect(packageRecord.activity.provenance.sourceRecord).toBe(
        "module-local:n3-source-opening/source.ts",
      );
      expect(
        packageRecord.activity.provenance.sourceRefs.every((sourceRef) =>
          N3_SOURCE_OPENING_SOURCE_CATALOG.some(
            (source) => source.id === sourceRef,
          ),
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(N3_SOURCE_OPENING_STAGE_PROVENANCE)).not.toMatch(
      /correctOptionId|modelAnswer|\/Users\//u,
    );
  });

  it("orders three n+1 packages with explicit prerequisite handoffs and varied grading modes", () => {
    expect(PACKAGES.map((packageRecord) => packageRecord.id)).toEqual(
      N3_SOURCE_OPENING_PACKAGE_IDS,
    );
    expect(PACKAGES.map((packageRecord) => packageRecord.sequence)).toEqual([
      { ordinal: 1 },
      { ordinal: 2, previousPackageId: "n3-source-opening-01" },
      { ordinal: 3, previousPackageId: "n3-source-opening-02" },
    ]);
    const [town, geography, evidence] = PACKAGES;
    expect(geography.prerequisites.map((item) => item.conceptId)).toEqual(
      expect.arrayContaining([
        "grammar:n3-te-kuru-viewpoint",
        "discourse:n3-sono-ue",
      ]),
    );
    expect(evidence.prerequisites.map((item) => item.conceptId)).toEqual(
      geography.activity.conceptIds,
    );
    expect(
      town.activity.payload.questions.map((question) => question.activityMode),
    ).toEqual(Array(5).fill("cloze-select"));
    expect(
      geography.activity.payload.questions.map(
        (question) => question.activityMode,
      ),
    ).toEqual(["listening-gist", "map-evidence-match", "source-status-choice"]);
    expect(
      evidence.activity.payload.questions.map(
        (question) => question.activityMode,
      ),
    ).toEqual([
      "cause-choice",
      "source-claim-choice",
      "hygiene-evidence-choice",
      "main-claim-choice",
    ]);
    expect(evidence.activity.payload.production?.authorship).toBe(
      "original-yomu-n3-source-transfer",
    );
    N3_SOURCE_OPENING_PACKAGE_IDS.forEach((id) =>
      expect(createN3SourceOpeningPackage(id).id).toBe(id),
    );
    expect(() => createN3SourceOpeningPackage("unknown" as never)).toThrow(
      /Unknown N3 source-opening package/,
    );
  });

  it("grades recognition and bounded production deterministically with targeted repairs", () => {
    const runtime = createN3SourceOpeningRuntime();
    for (const packageRecord of PACKAGES) {
      expect(
        runtime.validate(packageRecord.activity),
        packageRecord.id,
      ).toEqual([]);
      const pass = runtime.evaluate(
        packageRecord.activity,
        correctResponse(packageRecord.activity),
      );
      expect(pass.result).toMatchObject({
        outcome: "pass",
        score: 1,
        errorTags: [],
      });
      expect(
        pass.reviewSeeds.every((seed) => seed.reason === "new-learning"),
      ).toBe(true);
    }

    const town = createN3SourceOpeningPackage("n3-source-opening-01");
    const townResponse = correctResponse(town.activity);
    const townLapse = runtime.evaluate(town.activity, {
      ...townResponse,
      answers: townResponse.answers.map((answer, index) =>
        index < 2
          ? {
              ...answer,
              optionId: town.activity.payload.questions[index].options[1].id,
            }
          : answer,
      ),
    });
    expect(townLapse.result).toMatchObject({ outcome: "lapse", score: 0.6 });
    expect(townLapse.result.errorTags).toEqual(
      expect.arrayContaining(["town-viewpoint", "town-addition"]),
    );
    expect(
      townLapse.reviewSeeds.map((seed) => seed.content.expression),
    ).toEqual(["きました", "そのうえ"]);

    const evidence = createN3SourceOpeningPackage("n3-source-opening-03");
    const evidenceResponse = correctResponse(evidence.activity);
    const productionLapse = runtime.evaluate(evidence.activity, {
      ...evidenceResponse,
      production: "店が増えています。",
    });
    expect(productionLapse.result).toMatchObject({
      outcome: "lapse",
      score: 0.8,
    });
    expect(productionLapse.result.errorTags).toEqual(
      expect.arrayContaining([
        "transfer-attribution",
        "transfer-boundary",
        "transfer-substance",
      ]),
    );
    expect(
      productionLapse.reviewSeeds.map((seed) => seed.content.expression),
    ).toEqual([
      "ある研究によると",
      "調査によると〜かもしれません",
      "使い捨てカップ／洗浄に使う水",
    ]);
    const offTopicLapse = runtime.evaluate(evidence.activity, {
      ...evidenceResponse,
      production: "地域の調査によると、結果は場所によって違うかもしれません。",
    });
    expect(offTopicLapse.result.errorTags).toEqual(["transfer-substance"]);
    expect(() => runtime.evaluate(evidence.activity, { answers: [] })).toThrow(
      /Every N3 source-opening question/,
    );
  });

  it("keeps keys, translations, Tobira excerpts, and the production model out of the DOM until attempt", async () => {
    const runtime = createN3SourceOpeningRuntime();
    for (const packageRecord of PACKAGES) {
      const hostElement = document.createElement("main");
      document.body.replaceChildren(hostElement);
      const registered: HTMLElement[] = [];
      const onEvaluation = vi.fn();
      const controller = runtime.mount(
        packageRecord.activity,
        {
          replace(view) {
            hostElement.replaceChildren(view);
          },
          announce() {},
          registerReadingSurface(surface) {
            registered.push(surface);
            return () => undefined;
          },
        },
        onEvaluation,
      );

      expect(
        hostElement.querySelector("[data-answer-key]"),
        packageRecord.id,
      ).toBeNull();
      expect(
        hostElement.querySelector("[data-source-transcript]"),
        packageRecord.id,
      ).toBeNull();
      expect(
        hostElement.querySelector("[data-model-answer]"),
        packageRecord.id,
      ).toBeNull();
      expect(hostElement.innerHTML).not.toContain("correctOptionId");
      packageRecord.activity.payload.questions.forEach((question) => {
        expect(hostElement.textContent).not.toContain(question.explanation.en);
      });

      if (packageRecord.id === "n3-source-opening-02") {
        const audio = hostElement.querySelector<HTMLAudioElement>(
          'audio[data-source-media="official-remote"]',
        );
        expect(audio?.getAttribute("src")).toBe(
          "https://tobiraweb.9640.jp/wp-content/uploads/2015/02/L01-1_yomimono.mp3",
        );
        N3_SOURCE_OPENING_TOBIRA_EVIDENCE.forEach((excerpt) =>
          expect(hostElement.textContent).not.toContain(excerpt.japanese),
        );
        expect(
          hostElement.querySelectorAll(
            '[data-activity-control="map-evidence-match"] button[aria-pressed]',
          ),
        ).toHaveLength(3);
      }
      if (packageRecord.id === "n3-source-opening-03") {
        expect(hostElement.textContent).toContain(
          N3_SOURCE_OPENING_ECO_READING.passage.split("\n")[0],
        );
        expect(hostElement.textContent).not.toContain(
          packageRecord.activity.payload.production?.modelAnswer,
        );
      }

      completeForm(hostElement, packageRecord.activity);
      if (packageRecord.id === "n3-source-opening-02") {
        expect(
          hostElement.querySelectorAll(
            '[data-activity-control="map-evidence-match"] button[aria-pressed="true"]',
          ),
        ).toHaveLength(1);
      }
      hostElement.querySelector<HTMLFormElement>("form")?.requestSubmit();
      await vi.waitFor(() =>
        expect(onEvaluation, packageRecord.id).toHaveBeenCalledOnce(),
      );
      await vi.waitFor(() =>
        expect(
          hostElement.querySelector('[data-answer-key="after-attempt"]'),
        ).not.toBeNull(),
      );
      expect(hostElement.textContent).toContain(
        packageRecord.activity.payload.questions[0].explanation.en,
      );
      if (packageRecord.id === "n3-source-opening-02") {
        expect(
          hostElement.querySelector('[data-source-transcript="after-attempt"]'),
        ).not.toBeNull();
        expect(hostElement.textContent).toContain(
          N3_SOURCE_OPENING_TOBIRA_EVIDENCE[0].japanese,
        );
      }
      if (packageRecord.id === "n3-source-opening-03") {
        expect(
          hostElement.querySelector('[data-model-answer="after-attempt"]'),
        ).not.toBeNull();
        expect(hostElement.textContent).toContain(
          packageRecord.activity.payload.production?.modelAnswer,
        );
      }
      expect(registered.length).toBeGreaterThanOrEqual(3);
      controller.dispose();
    }
  });

  it("projects Reader and SRS data without private paths", () => {
    for (const packageRecord of PACKAGES) {
      expect(
        packageRecord.readerSrs.readerSurfaceIds.every((id) =>
          id.includes(packageRecord.id),
        ),
      ).toBe(true);
      expect(packageRecord.readerSrs.miningRequests.length).toBeGreaterThan(0);
      expect(JSON.stringify(packageRecord.readerSrs)).not.toContain("/Users/");
      expect(
        packageRecord.readerSrs.miningRequests.every((request) =>
          request.conceptIds.every((conceptId) =>
            packageRecord.activity.conceptIds.includes(conceptId),
          ),
        ),
      ).toBe(true);
    }
  });
});

function correctResponse(model: N3SourceOpeningModel): N3SourceOpeningResponse {
  return {
    answers: model.payload.questions.map((question) => ({
      questionId: question.id,
      optionId: question.correctOptionId,
    })),
    ...(model.payload.production
      ? { production: model.payload.production.modelAnswer }
      : {}),
  };
}

function completeForm(host: HTMLElement, model: N3SourceOpeningModel): void {
  for (const question of model.payload.questions) {
    const radio = host.querySelector<HTMLInputElement>(
      `input[name="${question.id}"][value="${question.correctOptionId}"]`,
    );
    const select = host.querySelector<HTMLSelectElement>(
      `select[name="${question.id}"]`,
    );
    const match = host.querySelector<HTMLButtonElement>(
      `button[data-option-id="${question.correctOptionId}"]`,
    );
    if (radio) radio.checked = true;
    if (select) select.value = question.correctOptionId;
    if (match) match.click();
  }
  const production = host.querySelector<HTMLTextAreaElement>(
    'textarea[name="production"]',
  );
  if (production && model.payload.production)
    production.value = model.payload.production.modelAnswer;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRecord(id: string) {
  const matches = N3_SOURCE_OPENING_SOURCE_CATALOG.filter(
    (source) => source.id === id,
  );
  expect(matches, id).toHaveLength(1);
  return matches[0];
}

function localSourcePath(
  scope: (typeof N3_SOURCE_OPENING_SOURCE_CATALOG)[number]["scope"],
  sourceRoot: string,
  relativePath: string,
): string {
  const portablePath = relativePath.replaceAll("\\", "/");
  if (
    !portablePath ||
    path.posix.isAbsolute(portablePath) ||
    path.win32.isAbsolute(relativePath) ||
    portablePath.split("/").includes("..")
  ) {
    throw new Error(`Local source requires a relative path: ${relativePath}`);
  }
  const root = path.resolve(sourceRoot);
  const corpusRelativePath =
    scope === "yomu-academy"
      ? portablePath.replace(/^moodle-raw\//u, "")
      : portablePath;
  const resolvedPath = path.resolve(root, ...corpusRelativePath.split("/"));
  const containment = path.relative(root, resolvedPath);
  if (
    !containment ||
    containment.startsWith(`..${path.sep}`) ||
    path.isAbsolute(containment)
  ) {
    throw new Error(
      `Local source path escapes configured root: ${relativePath}`,
    );
  }
  return resolvedPath;
}

function verifiedLocalSourcePath(
  scope: (typeof N3_SOURCE_OPENING_SOURCE_CATALOG)[number]["scope"],
  sourceRoot: string,
  relativePath: string,
): string {
  const resolvedPath = localSourcePath(scope, sourceRoot, relativePath);
  let canonicalRoot: string;
  let canonicalPath: string;

  try {
    canonicalRoot = realpathSync(sourceRoot);
  } catch (cause) {
    throw new Error(
      `Configured source root cannot be resolved: ${sourceRoot}`,
      { cause },
    );
  }
  try {
    canonicalPath = realpathSync(resolvedPath);
  } catch (cause) {
    throw new Error(`Local source cannot be resolved: ${relativePath}`, {
      cause,
    });
  }

  const containment = path.relative(canonicalRoot, canonicalPath);
  if (
    !containment ||
    containment.startsWith(`..${path.sep}`) ||
    path.isAbsolute(containment)
  ) {
    throw new Error(
      `Local source resolves outside configured root: ${relativePath}`,
    );
  }
  if (!statSync(canonicalPath).isFile()) {
    throw new Error(
      `Local source must resolve to a regular file: ${relativePath}`,
    );
  }
  return canonicalPath;
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}
