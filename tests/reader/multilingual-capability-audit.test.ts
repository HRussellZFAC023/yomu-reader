import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runMultilingualCapabilityAudit } from "../../scripts/lib/multilingual-capability-audit";
import { registeredLearningTargetModules } from "../../src/reader/languages/registry";
import { LEARNING_TARGET_ROSTER } from "../../src/reader/languages/roster";
import {
  LEARNING_TARGET_CAPABILITY_IDS,
  type LearningTargetModule,
} from "../../src/reader/languages/types";

describe("33-target behavior audit", () => {
  it("executes every capability for every fixed-roster target", async () => {
    const report = await runMultilingualCapabilityAudit();

    expect(report.status).toBe("pass");
    expect(report.targetCount).toBe(33);
    expect(report.capabilityCount).toBe(18);
    expect(report.summary).toEqual({
      capabilityChecks: 594,
      passedCapabilityChecks: 594,
      failedCapabilityChecks: 0,
      contractFailures: 0,
    });
    expect(report.failures).toEqual([]);
    expect(report.targets.map((target) => target.id)).toEqual(
      LEARNING_TARGET_ROSTER.map((target) => target.id),
    );
    for (const target of report.targets) {
      expect(target.status, target.id).toBe("pass");
      expect(Object.keys(target.capabilities), target.id).toEqual([
        ...LEARNING_TARGET_CAPABILITY_IDS,
      ]);
      for (const [capability, check] of Object.entries(target.capabilities)) {
        expect(check.status, `${target.id}/${capability}`).toBe("pass");
        expect(
          Object.keys(check.evidence).length,
          `${target.id}/${capability} evidence`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("fails closed when a target module disappears", async () => {
    const modules = registeredLearningTargetModules().filter(
      (target) => target.language !== "es",
    );
    const report = await runMultilingualCapabilityAudit({ modules });
    const spanish = report.targets.find((target) => target.id === "es");

    expect(report.status).toBe("fail");
    expect(report.failures).toContainEqual(
      expect.objectContaining({
        targetId: "registry",
        code: "module-count-drift",
      }),
    );
    expect(spanish?.moduleId).toBeNull();
    expect(
      Object.values(spanish?.capabilities ?? {}).every(
        (check) => check.status === "fail",
      ),
    ).toBe(true);
  });

  it("rejects a support declaration with no supported capability", async () => {
    const modules = replaceTarget("es", (target) => ({
      ...target,
      capabilities: { ...target.capabilities, ocr: false },
    }));
    const report = await runMultilingualCapabilityAudit({ modules });

    expect(report.failures).toContainEqual(
      expect.objectContaining({
        targetId: "es",
        capability: "ocr",
        code: "unsupported-declaration",
      }),
    );
  });

  it("rejects a true declaration whose behavior has disappeared", async () => {
    const modules = replaceTarget("es", (target) => ({
      ...target,
      lookupCandidates: () => [],
    }));
    const report = await runMultilingualCapabilityAudit({ modules });

    expect(report.failures).toContainEqual(
      expect.objectContaining({
        targetId: "es",
        capability: "term-lookup",
        code: "surface-candidate-missing",
      }),
    );
  });

  it("rejects a grammar inventory whose checked surface no longer detects", async () => {
    const modules = replaceTarget("ko", (target) => ({
      ...target,
      grammar: { ...target.grammar, detect: () => [] },
    }));
    const report = await runMultilingualCapabilityAudit({ modules });

    expect(report.failures).toContainEqual(
      expect.objectContaining({
        targetId: "ko",
        capability: "grammar",
        code: "grammar-detection-missing",
      }),
    );
  });

  it("keeps the deterministic CLI and its developer runbook wired", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const manualDocs = readFileSync("scripts/manual/README.md", "utf8");
    const developerDocs = readFileSync(
      "docs/dev/multilingual-capability-audit.md",
      "utf8",
    );

    expect(pkg.scripts["quality:multilingual-capabilities"]).toBe(
      "vite-node scripts/manual/multilingual-capability-audit.ts",
    );
    expect(manualDocs).toContain("`quality:multilingual-capabilities`");
    expect(developerDocs).toContain("594 target/capability checks");
    expect(developerDocs).toContain(
      "npm run quality:multilingual-capabilities",
    );
  });
});

function replaceTarget(
  language: string,
  transform: (target: LearningTargetModule) => LearningTargetModule,
): LearningTargetModule[] {
  return registeredLearningTargetModules().map((target) =>
    target.language === language ? transform(target) : target,
  );
}
