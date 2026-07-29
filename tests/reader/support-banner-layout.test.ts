import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hostedCss = readFileSync("docs/.vitepress/theme/custom.css", "utf8");
const hostedTheme = readFileSync("docs/.vitepress/theme/index.ts", "utf8");
const newTabCss = readFileSync("src/reader/styles/new-tab.css", "utf8");
const newTabController = readFileSync("src/reader/newtab/controller.ts", "utf8");

function rule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) return "";
  const end = source.indexOf("\n}", start);
  return end < 0 ? "" : source.slice(start, end + 2);
}

describe("support banner layout", () => {
  it("keeps the hosted banner in normal flow beneath the VitePress navigation", () => {
    const bannerRule = rule(hostedCss, ".yomu-support-banner");

    expect(bannerRule).toContain("position: static");
    expect(bannerRule).not.toMatch(/\b(?:top|z-index)\s*:/u);
    expect(hostedTheme).toContain("document.querySelector<HTMLElement>('.VPContent')");
    expect(hostedTheme).toContain("content.prepend(banner)");
  });

  it("keeps the Study/new-tab banner non-overlaying on every viewport", () => {
    const bannerRule = rule(newTabCss, ".jpdb-reader-newtab-support-banner");

    expect(bannerRule).not.toMatch(/\bposition\s*:\s*(?:fixed|sticky|absolute)/u);
  });

  it("rounds both hosted and Study fallback amounts to whole display units", () => {
    expect(hostedTheme).toContain("return `£${Math.round(value)}`");
    expect(newTabController).toContain("return `£${Math.round(value)}`");
  });
});
