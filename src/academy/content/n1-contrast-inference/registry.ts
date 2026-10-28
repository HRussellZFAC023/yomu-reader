import { createN1ContrastInferencePackage } from "./package";
import { validateN1ContrastInference } from "./plugin";
import type { N1ContrastInferencePackage } from "./types";

const packageRecord = createN1ContrastInferencePackage();
const validationIssues = validateN1ContrastInference(packageRecord.activity);
if (validationIssues.length)
  throw new TypeError(
    `Invalid N1 contrast-inference package: ${validationIssues.map((issue) => issue.path).join(", ")}`,
  );

export const N1_CONTRAST_INFERENCE_PACKAGES: readonly N1ContrastInferencePackage[] =
  Object.freeze([packageRecord]);
export function resolveN1ContrastInferencePackage(
  id: string,
): N1ContrastInferencePackage {
  const found = N1_CONTRAST_INFERENCE_PACKAGES.find(
    (candidate) => candidate.id === id,
  );
  if (!found)
    throw new TypeError(`Unknown N1 contrast-inference package: ${id}`);
  return found;
}
