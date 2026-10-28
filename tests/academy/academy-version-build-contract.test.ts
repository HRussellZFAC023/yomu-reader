import fs from "node:fs";
import path from "node:path";

describe("Academy Reader version build contract", () => {
  it("stamps the package version into the Academy bundle", () => {
    const config = fs.readFileSync(
      path.resolve("config/vite/academy.config.ts"),
      "utf8",
    );

    expect(config).toContain('import pkg from "../../package.json"');
    expect(config).toContain("__YOMU_VERSION__: JSON.stringify(pkg.version)");
  });
});
