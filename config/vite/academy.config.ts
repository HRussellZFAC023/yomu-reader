import path from "node:path";
import { availableParallelism } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
import { configDefaults } from "vitest/config";
import {
  academyCookieForRemote,
  academySetCookieForLocal,
} from "./academy-cookie-proxy";
import { academyLocalMedia } from "./academy-local-media";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const MOCK_ISOLATED_TESTS = [
  "tests/academy/entrypoint-lifecycle.test.ts",
  "tests/academy/library-srs-early-batch-conformance.test.ts",
];

function academyForkHeapMb(): number {
  const override = Number.parseInt(
    process.env.YOMU_VITEST_FORK_HEAP_MB ?? "",
    10,
  );
  return Number.isInteger(override) && override >= 256 ? override : 2304;
}

function academyMaxForks(): number {
  const override = Number.parseInt(process.env.VITEST_MAX_FORKS ?? "", 10);
  if (Number.isInteger(override) && override >= 1) return override;
  return Math.max(2, Math.min(8, availableParallelism() - 2));
}

function remoteAcademyProxy(): ProxyOptions {
  return {
    target: "https://yomureader.com",
    changeOrigin: true,
    // The Worker intentionally rejects mutating cross-origin requests.
    // This proxy is the local same-site test boundary, so present its
    // upstream leg as the production origin rather than 127.0.0.1.
    headers: {
      origin: "https://yomureader.com",
      "sec-fetch-site": "same-origin",
    },
    configure(proxy) {
      proxy.on("proxyRes", (response) => {
        const setCookie = response.headers["set-cookie"];
        if (setCookie)
          response.headers["set-cookie"] = setCookie.map(
            academySetCookieForLocal,
          );
      });
      proxy.on("proxyReq", (request, incoming) => {
        const cookie = incoming.headers.cookie;
        if (cookie) request.setHeader("cookie", academyCookieForRemote(cookie));
      });
    },
  };
}

function academyRootRedirect(): Plugin {
  const redirect = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    const pathname = new URL(request.url ?? "/", "http://academy.local")
      .pathname;
    if (pathname !== "/") {
      next();
      return;
    }
    response.statusCode = 302;
    response.setHeader("location", "/academy/");
    response.end();
  };
  return {
    name: "academy-root-redirect",
    configureServer(server) {
      server.middlewares.use(redirect);
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect);
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, root, "");
  return {
    plugins: [
      academyLocalMedia({
        persona:
          process.env.ACADEMY_PERSONA_AUDIO_ROOT ??
          env.ACADEMY_PERSONA_AUDIO_ROOT,
        shinday:
          process.env.ACADEMY_SHINDAY_SFX_ROOT ?? env.ACADEMY_SHINDAY_SFX_ROOT,
      }),
      academyRootRedirect(),
    ],
    // Dev serves the same hosted Reader + Academy tree as GitHub Pages so the
    // real annotation runtime is exercised during browser acceptance.
    publicDir: command === "serve" ? path.join(root, "docs/public") : false,
    server: {
      host: "127.0.0.1",
      port: Number(process.env.ACADEMY_PORT ?? 5174),
      strictPort: true,
      // Local Academy acceptance uses the deployed access/media boundary so
      // HttpOnly invite sessions and protected range audio behave exactly
      // as they do on the hosted origin. Build output is unaffected.
      proxy: {
        "/academy/api": remoteAcademyProxy(),
        "/academy/media": remoteAcademyProxy(),
      },
    },
    build: {
      outDir: path.join(root, "dist/academy"),
      emptyOutDir: true,
      target: "es2022",
      minify: false,
      cssMinify: false,
      lib: {
        entry: path.join(root, "src/academy/entrypoint.ts"),
        name: "YomuAcademy",
        formats: ["iife"],
        fileName: () => "app.js",
      },
    },
    test: {
      environment: "jsdom",
      include: ["tests/academy/**/*.test.ts"],
      // vi.mock registrations leak across files in a reused fork, so the
      // vi.mock-using files are excluded from the shared-fork pass and run in
      // a second isolated invocation (see test:academy in package.json). The
      // vi-mock-isolation-conformance test keeps this list honest.
      exclude:
        process.env.VITEST_ISOLATE === "1"
          ? [...configDefaults.exclude]
          : [...configDefaults.exclude, ...MOCK_ISOLATED_TESTS],
      globals: true,
      pool: "forks",
      poolOptions: {
        forks: {
          minForks: 1,
          // Leave two cores for whatever else check runs alongside; the old
          // hard 4 idled most of a 10-core machine. VITEST_MAX_FORKS overrides
          // for hand-tuned (e.g. 4-core CI) runners.
          maxForks: academyMaxForks(),
          // Reuse forks across files: 265 academy files each re-evaluating the
          // multi-MB src/academy content graph in a fresh jsdom fork was the
          // dominant fixed cost. VITEST_ISOLATE=1 restores per-file isolation.
          // vi.mock registrations leak across files in a reused fork, so the
          // two vi.mock-using files run in a separate isolated pass (see
          // test:academy in package.json) — any new vi.mock file must join it.
          isolate: process.env.VITEST_ISOLATE === "1",
          execArgv: [`--max-old-space-size=${academyForkHeapMb()}`],
        },
      },
    },
  };
});
