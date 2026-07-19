import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
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

const PROJECT_ROOT = path.resolve(process.cwd(), "../..");
const SOURCE_ROOTS = {
  "japanese-library":
    process.env.YOMU_JAPANESE_LIBRARY_ROOT ??
    path.join(os.homedir(), "Documents/Japanese"),
  "soya-research": path.join(
    PROJECT_ROOT,
    "references/soya-research/extracted-src-all",
  ),
  "yomu-academy": path.join(PROJECT_ROOT, "resources/yomu-academy"),
} as const;
const PACKAGES = N3_SOURCE_OPENING_PACKAGE_IDS.map(
  createN3SourceOpeningPackage,
);

afterEach(() => document.body.replaceChildren());

describe("N3 source-opening tranche", () => {
  it("pins every local and official source without leaking machine-specific paths", async () => {
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

    const requiredPortableSources = new Set([
      "yomu-academy:moodle-raw-manifest",
      "soya-research:n3-mock1-grammar",
      "soya-research:n3-mock1-reading",
    ]);
    const verifiedSources = new Set<string>();
    for (const source of N3_SOURCE_OPENING_SOURCE_CATALOG) {
      if (!source.relativePath || source.scope === "official-web") continue;
      const sourcePath = path.join(
        SOURCE_ROOTS[source.scope],
        source.relativePath,
      );
      if (requiredPortableSources.has(source.id)) {
        expect(existsSync(sourcePath), `${source.id} must be available`).toBe(
          true,
        );
      }
      if (!existsSync(sourcePath)) continue;
      expect(statSync(sourcePath).size, source.id).toBe(source.bytes);
      expect(await sha256File(sourcePath), source.id).toBe(source.sha256);
      verifiedSources.add(source.id);
    }
    requiredPortableSources.forEach((sourceId) =>
      expect(verifiedSources.has(sourceId), sourceId).toBe(true),
    );

    if (existsSync(SOURCE_ROOTS["japanese-library"])) {
      N3_SOURCE_OPENING_SOURCE_CATALOG.filter(
        (source) => source.scope === "japanese-library" && source.relativePath,
      ).forEach((source) =>
        expect(verifiedSources.has(source.id), source.id).toBe(true),
      );
    }

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

  it("preserves the exact selected Soya wording and disjoint item ids", () => {
    const grammarPath = path.join(
      SOURCE_ROOTS["soya-research"],
      "data/courses/jlpt_n3/mock1_grammar.js",
    );
    const readingPath = path.join(
      SOURCE_ROOTS["soya-research"],
      "data/courses/jlpt_n3/mock1_reading.js",
    );
    if (!existsSync(grammarPath) || !existsSync(readingPath)) return;
    const grammarSource = readFileSync(grammarPath, "utf8");
    const readingSource = readFileSync(readingPath, "utf8");

    for (const item of N3_SOURCE_OPENING_TOWN_FLOW_ITEMS) {
      expect(grammarSource).toContain(`id: "${item.id}"`);
      expect(grammarSource).toContain(item.display);
      item.choices.forEach((choice) => expect(grammarSource).toContain(choice));
      expect(grammarSource).toContain(item.explanation);
    }
    for (const item of N3_SOURCE_OPENING_ECO_READING.questions) {
      expect(readingSource).toContain(`id: "${item.id}"`);
      expect(readingSource).toContain(item.question);
      item.options.forEach((option) => expect(readingSource).toContain(option));
      expect(readingSource).toContain(item.explanation);
    }
    N3_SOURCE_OPENING_ECO_READING.passage.split("\n").forEach((paragraph) => {
      expect(readingSource).toContain(paragraph);
    });
  });

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

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}
