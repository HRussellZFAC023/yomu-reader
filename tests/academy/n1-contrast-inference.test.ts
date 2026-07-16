import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalN1ContrastInferenceSourceLocus,
  createN1ContrastInferencePackage,
  createN1ContrastInferenceRuntime,
  N1_CONTRAST_INFERENCE_PACKAGES,
  N1_CONTRAST_INFERENCE_PROVENANCE,
  resolveN1ContrastInferencePackage,
} from "../../src/academy/content/n1-contrast-inference";

const LIBRARY_ROOT =
  process.env.ACADEMY_LIBRARY_ROOT ?? "/Users/heru/Documents/Japanese";

afterEach(() => document.body.replaceChildren());

describe("N1 contrast-inference progression package", () => {
  it("pins a permitted N1 Shin Kanzen source locus without publishing a local path", () => {
    const sourceFile = path.join(
      LIBRARY_ROOT,
      N1_CONTRAST_INFERENCE_PROVENANCE.relativePath,
    );
    expect(sha256(canonicalN1ContrastInferenceSourceLocus())).toBe(
      N1_CONTRAST_INFERENCE_PROVENANCE.sourceLocusSha256,
    );
    expect(N1_CONTRAST_INFERENCE_PROVENANCE).toMatchObject({
      sourceScope: "japanese-library",
      sourceFamily: "shin-kanzen",
      sourceTitle: "新完全マスター読解 N1",
      sourceDocumentSha256:
        "392f34d1e235ff89109ab1f71426737aeeb33a570d6f7373b05bd0d5eba9c139",
      sourceDocumentByteLength: 45967033,
      sourcePageImageSha256:
        "27ec5870be9ea54028bd0ce5aa6bf5eb17bb0b087429853f4c5ccc3b15c549fa",
      sourceLocus: {
        pdfPage: 15,
        printedPage: 5,
        item: "【対比】全体をつかもう",
      },
    });
    expect(JSON.stringify(N1_CONTRAST_INFERENCE_PROVENANCE)).not.toContain(
      "/Users/",
    );
    if (existsSync(sourceFile)) {
      const bytes = readFileSync(sourceFile);
      expect(sha256(bytes)).toBe(
        N1_CONTRAST_INFERENCE_PROVENANCE.sourceDocumentSha256,
      );
      expect(statSync(sourceFile).size).toBe(
        N1_CONTRAST_INFERENCE_PROVENANCE.sourceDocumentByteLength,
      );
    }
  });

  it("owns N2 prerequisites, local package resolution, and rights-safe media state", () => {
    const lesson = createN1ContrastInferencePackage();
    expect(lesson.band).toBe("N1");
    expect(lesson.prerequisites.map((item) => item.conceptId)).toEqual([
      "grammar:n2-contrast-tokoroga",
      "reading:n2-claim-and-evidence",
      "reading:n2-qualified-conclusion",
    ]);
    expect(
      lesson.prerequisites.every(
        (item) => item.minimumEvidence === "introduced-and-attempted",
      ),
    ).toBe(true);
    expect(N1_CONTRAST_INFERENCE_PACKAGES).toEqual([lesson]);
    expect(resolveN1ContrastInferencePackage(lesson.id)).toBe(
      N1_CONTRAST_INFERENCE_PACKAGES[0],
    );
    expect(() => resolveN1ContrastInferencePackage("unknown")).toThrow(
      /Unknown N1 contrast-inference package/,
    );
    expect(lesson.activity.provenance.rights).toMatchObject({
      state: "user-permitted-local-reference-only",
      sourceTextDelivery: "not-delivered",
      sourceMediaDelivery: "not-delivered",
    });
    expect(lesson.activity.provenance.sourceMediaState).toBe(
      "unverified-pairing-not-delivered",
    );
    expect(JSON.stringify(lesson)).not.toMatch(/https?:|\.mp3|\.wav/u);
  });

  it("grades the five choice judgments while preserving an ungraded production response and targeting repair SRS", () => {
    const runtime = createN1ContrastInferenceRuntime();
    const { activity } = createN1ContrastInferencePackage();
    expect(runtime.validate(activity)).toEqual([]);
    const correct = response(
      activity.payload.questions.map((question) => [
        question.id,
        question.correctOptionId,
      ]),
    );
    const pass = runtime.evaluate(activity, correct);
    expect(pass.result).toMatchObject({
      outcome: "pass",
      score: 1,
      errorTags: [],
    });
    expect(pass.reviewSeeds).toHaveLength(4);
    expect(
      pass.reviewSeeds.every((seed) => seed.reason === "new-learning"),
    ).toBe(true);
    const missed = response(
      activity.payload.questions.map((question) => [
        question.id,
        question.id === "qualified"
          ? "sales-certain"
          : question.correctOptionId,
      ]),
    );
    const lapse = runtime.evaluate(activity, missed);
    expect(lapse.result).toMatchObject({
      outcome: "lapse",
      score: 0.8,
      errorTags: ["qualified-inference"],
    });
    expect(
      lapse.reviewSeeds.map((seed) => [seed.content.expression, seed.reason]),
    ).toEqual([["必ず伸びるとは言えない", "repair"]]);
    expect(() =>
      runtime.evaluate(activity, { answers: [], production: "" }),
    ).toThrow(/Every N1 contrast-inference question/);
  });

  it("renders original reading and synthesized rehearsal, with a distinct ungraded production field", async () => {
    const runtime = createN1ContrastInferenceRuntime();
    const { activity } = createN1ContrastInferencePackage();
    const host = document.createElement("main");
    document.body.append(host);
    const registered: HTMLElement[] = [];
    const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
    const onEvaluation = vi.fn();
    const controller = runtime.mount(
      activity,
      {
        replace(view) {
          host.replaceChildren(view);
        },
        announce() {},
        registerReadingSurface(surface) {
          registered.push(surface);
          return () => undefined;
        },
        playPronunciation,
      },
      onEvaluation,
    );
    expect(host.textContent).toContain("unverified pairings are not delivered");
    expect(host.querySelectorAll("fieldset")).toHaveLength(5);
    expect(
      host.querySelector('textarea[data-production="ungraded"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain("not automatically scored");
    expect(registered).toHaveLength(5);
    host.querySelector<HTMLButtonElement>("[data-transfer-playback]")?.click();
    await vi.waitFor(() =>
      expect(playPronunciation).toHaveBeenCalledWith(
        activity.payload.transfer.playbackText,
      ),
    );
    host.querySelector<HTMLTextAreaElement>("textarea")!.value =
      "観察はあるが、売り上げはまだ確定していない。";
    for (const question of activity.payload.questions)
      host.querySelector<HTMLInputElement>(
        `input[name="${question.id}"][value="${question.correctOptionId}"]`,
      )!.checked = true;
    host.querySelector<HTMLFormElement>("form")?.requestSubmit();
    await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
    expect(onEvaluation.mock.calls[0][0].attempt.responseKind).toBe(
      "n1-contrast-inference-v1",
    );
    controller.dispose();
  });

  it("projects original Reader/SRS data only, with no source-media URL", () => {
    const lesson = createN1ContrastInferencePackage();
    expect(lesson.readerSrs.readerSurfaceIds).toEqual([
      "reader:n1-contrast-inference-01:transfer:paragraph-1",
      "reader:n1-contrast-inference-01:transfer:paragraph-2",
    ]);
    expect(lesson.readerSrs.miningRequests).toEqual([
      expect.objectContaining({
        expression: "少なくないことが分かった",
        conceptIds: [
          "reading:n1-observation-and-claim",
          "reading:n1-contrast-structure",
        ],
      }),
      expect.objectContaining({
        expression: "必ず伸びるとは言えない",
        conceptIds: [
          "reading:n1-qualified-inference",
          "production:n1-evidence-bound-summary",
        ],
      }),
    ]);
    expect(
      lesson.readerSrs.miningRequests.every(
        (request) => request.sourceUrl === undefined,
      ),
    ).toBe(true);
  });
});

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function response(items: readonly (readonly [string, string])[]) {
  return {
    answers: items.map(([questionId, optionId]) => ({ questionId, optionId })),
    production: "根拠を超えない要約。",
  };
}
