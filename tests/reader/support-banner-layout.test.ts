import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hostedCss = readFileSync("docs/.vitepress/theme/custom.css", "utf8");
const hostedTheme = readFileSync("docs/.vitepress/theme/index.ts", "utf8");
const newTabCss = readFileSync("src/reader/styles/new-tab.css", "utf8");
const newTabController = readFileSync("src/reader/newtab/controller.ts", "utf8");
const supportDocs = readFileSync("docs/support.md", "utf8");
const operatingForecast = JSON.parse(
  readFileSync("workers/yomu-support/operating-forecast.json", "utf8"),
) as {
  floorGBP: number;
  lineItems: Array<{ label: string; monthlyGBP: number }>;
};

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
    expect(bannerRule).toContain("margin-top: 0");
    expect(hostedCss).toContain("@media (min-width: 960px)");
    expect(hostedCss).toContain("margin-top: var(--vp-nav-height)");
    expect(hostedCss).toContain("flex-direction: column");
    expect(bannerRule).not.toMatch(/(?:^|\n)\s*(?:top|z-index)\s*:/u);
    expect(hostedTheme).toContain("document.querySelector<HTMLElement>('.VPContent')");
    expect(hostedTheme).toContain("content.prepend(banner)");
  });

  it("keeps the Study/new-tab banner non-overlaying on every viewport", () => {
    const bannerRule = rule(newTabCss, ".jpdb-reader-newtab-support-banner");
    const actionsRule = rule(newTabCss, ".jpdb-reader-newtab-support-actions");

    expect(bannerRule).not.toMatch(/\bposition\s*:\s*(?:fixed|sticky|absolute)/u);
    expect(actionsRule).toContain("flex-wrap: wrap");
  });

  it("rounds both hosted and Study fallback amounts to whole display units", () => {
    expect(hostedTheme).toContain("return formatHostedLocalCurrency(value, 'GBP')");
    expect(hostedTheme).toContain("minimumFractionDigits: 0");
    expect(hostedTheme).toContain("maximumFractionDigits: 0");
    expect(newTabController).toContain("new Intl.NumberFormat(navigator.language || 'en-GB'");
    expect(newTabController).toContain("minimumFractionDigits: 0");
    expect(newTabController).toContain("maximumFractionDigits: 0");
  });

  it("keeps hosted fallback copy short and aligned with the positive Worker copy", () => {
    expect(hostedTheme).toContain("This month's support keeps fast word and shadowing audio running.");
    expect(hostedTheme).toContain("This month's fast audio bill is covered. Thank you.");
    expect(hostedTheme).not.toContain("Donation goal: ${goalText}/month");
  });

  it("never invents a donate link that the support Worker omitted", () => {
    expect(hostedTheme).toContain("if (hostedReadySupportProviders(status).length === 0) return false");
    expect(hostedTheme).not.toContain("const YOMU_SUPPORT_DONATE_URL");
    expect(newTabController).toContain("if (newTabReadySupportProviders(status).length === 0) return false");
    expect(newTabController).not.toContain("function newTabSupportDonateUrl");
  });

  it("never invents a fixed goal when status omits the forecast", () => {
    expect(hostedTheme).toContain("if (!hostedSupportGoalAvailable(status)) return false");
    expect(newTabController).toContain("if (!newTabSupportGoalAvailable(status)) return false");
    expect(hostedTheme).not.toContain("estimatedMonthlyCostGbp ?? 10");
    expect(newTabController).not.toContain("estimatedMonthlyCostGbp ?? 10");
  });

  it("re-renders an existing hosted banner when the interface language changes", () => {
    expect(hostedTheme).toContain("existing.replaceWith(renderHostedSupportBanner(hostedSupportBannerStatus))");
    expect(hostedTheme).not.toContain("status.banner?.ctaLabel || 'Donate'");
  });

  it("shows every checked-in forecast input and the exact derived total to readers", () => {
    for (const item of operatingForecast.lineItems) {
      expect(supportDocs).toContain(`| ${item.label} | £${item.monthlyGBP.toFixed(2)} |`);
    }
    const forecast = operatingForecast.lineItems.reduce((sum, item) => sum + item.monthlyGBP, 0);
    const exactGoal = Math.max(operatingForecast.floorGBP, forecast);
    expect(supportDocs).toContain(`| **Exact forecast** | **£${exactGoal.toFixed(2)}** |`);
  });
});
