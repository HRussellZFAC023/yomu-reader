import type { N1ContrastInferenceModel } from "./types";

export const N1_CONTRAST_INFERENCE_PACKAGE_ID =
  "n1-contrast-inference-01" as const;

export const N1_CONTRAST_INFERENCE_PROVENANCE = Object.freeze({
  packageId: N1_CONTRAST_INFERENCE_PACKAGE_ID,
  sourceScope: "japanese-library" as const,
  sourceId:
    "japanese-library:392f34d1e235ff89109ab1f71426737aeeb33a570d6f7373b05bd0d5eba9c139:pdf-page-015:contrast-summary",
  sourceFamily: "shin-kanzen" as const,
  sourceTitle: "新完全マスター読解 N1" as const,
  relativePath:
    "Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N1/新完全マスター読解, N1 Shin kanzen masutā dokkai/新完全マスター読解, N1 Shin kanzen masutā dokkai, N1.pdf",
  sourceDocumentSha256:
    "392f34d1e235ff89109ab1f71426737aeeb33a570d6f7373b05bd0d5eba9c139",
  sourceDocumentByteLength: 45967033,
  sourcePageImageSha256:
    "27ec5870be9ea54028bd0ce5aa6bf5eb17bb0b087429853f4c5ccc3b15c549fa",
  sourceLocus: Object.freeze({
    pdfPage: 15 as const,
    printedPage: 5 as const,
    section:
      "第1部: 評論・解説・エッセイなど / 1.文章のしくみを理解する" as const,
    item: "【対比】全体をつかもう" as const,
  }),
  sourceLocusSha256:
    "62550b03571ac45f106075cc6772b132e6b7f1183dad2b368e0a06053fe68558",
  rights: Object.freeze({
    state: "user-permitted-local-reference-only" as const,
    sourceTextDelivery: "not-delivered" as const,
    sourceMediaDelivery: "not-delivered" as const,
    learnerActivityText: "original-yomu-authored" as const,
  }),
  sourceMediaState: "unverified-pairing-not-delivered" as const,
}) satisfies N1ContrastInferenceModel["provenance"];

export function canonicalN1ContrastInferenceSourceLocus(): string {
  const { sourceLocus } = N1_CONTRAST_INFERENCE_PROVENANCE;
  return (
    [
      N1_CONTRAST_INFERENCE_PROVENANCE.sourceId,
      N1_CONTRAST_INFERENCE_PROVENANCE.sourceDocumentSha256,
      String(N1_CONTRAST_INFERENCE_PROVENANCE.sourceDocumentByteLength),
      N1_CONTRAST_INFERENCE_PROVENANCE.sourcePageImageSha256,
      String(sourceLocus.pdfPage),
      String(sourceLocus.printedPage),
      sourceLocus.section,
      sourceLocus.item,
    ].join("\n") + "\n"
  );
}
