import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEARNER_LANGUAGE_IDS } from "../../../src/reader/locales";

describe("multilingual delivery workspace", () => {
  it("keeps an honest 0/32 closure ledger until journeys are proven", () => {
    const ledger = readFileSync("docs/multilingual/closure-ledger.md", "utf8");
    const rowIds = [...ledger.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
      (match) => match[1],
    );

    expect(rowIds).toEqual([...LEARNER_LANGUAGE_IDS]);
    expect(ledger).toContain("**Release completion: 0/32.**");
    expect(ledger.match(/\|\s*No\s*\|$/gm)).toHaveLength(32);
    expect(ledger).toContain("Academy is excluded from this ledger.");
  });

  it("records the frozen primary sources and dictionary revision", () => {
    const source = readFileSync("docs/multilingual/roster-source.md", "utf8");

    expect(source).toContain("https://yomitan.wiki/supported-languages/");
    expect(source).toContain("https://github.com/MarvNC/yomitan-dictionaries");
    expect(source).toContain("574961e823e33fb36b6b86778a0d6b606af29c25");
    expect(source).toContain("Old Irish (`sga`)");
    expect(source).toContain("does not prove");
  });
});
