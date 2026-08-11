import { afterEach, describe, expect, it, vi } from "vitest";
import PublicProxyWorker, {
  resetProxyWorkerCacheForTests,
} from "../../workers/jpdb-public-proxy/src/index";

function expectNoCacheOrUpstream(
  backend: { match: unknown; put: unknown },
  upstream: unknown,
): void {
  expect(backend.match).not.toHaveBeenCalled();
  expect(backend.put).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
}

async function expectSensitiveRequestRejected(request: Request): Promise<void> {
  const response = await PublicProxyWorker.fetch(
    request,
    {},
    { waitUntil: vi.fn() },
  );
  expect(response.status).toBe(400);
  expect(response.headers.get("x-yomu-proxy-error")).toBe("sensitive-request");
}

describe("Yomu public proxy Worker", () => {
  afterEach(() => {
    resetProxyWorkerCacheForTests();
  });

  it("retries transient upstream failures with minimal headers", async () => {
    const fetchMock = vi.fn((_request: Request) =>
      Promise.resolve(new Response("ok", { status: 200 })),
    );
    fetchMock.mockResolvedValueOnce(
      new Response("ssl failed", { status: 525 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await PublicProxyWorker.fetch(
        new Request(
          "https://yomu-jpdb-public-proxy.example/?url=https%3A%2F%2Fjpdb.io%2Fsearch%3Fq%3D%E6%97%A5%E6%9C%AC",
          {
            headers: {
              accept: "text/html",
              origin: "https://hrussellzfac023.github.io",
            },
          },
        ),
        {},
        { waitUntil: vi.fn() },
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        (fetchMock.mock.calls[0][0] as Request).headers.has("accept"),
      ).toBe(false);
      expect(
        (fetchMock.mock.calls[1][0] as Request).headers.has("accept"),
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts Jisho search requests with minimal headers to avoid upstream TLS failures", async () => {
    const upstreamFetch = vi.fn((_request: Request) =>
      Promise.resolve(new Response("<audio></audio>", { status: 200 })),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    try {
      const response = await PublicProxyWorker.fetch(
        new Request(
          "https://yomu-jpdb-public-proxy.example/?url=https%3A%2F%2Fjisho.org%2Fsearch%2F%25E5%25AD%25A6%25E3%2581%25B6",
          {
            headers: {
              accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              origin: "https://example.com",
            },
          },
        ),
        {},
        { waitUntil: vi.fn() },
      );

      expect(response.status).toBe(200);
      expect(upstreamFetch).toHaveBeenCalledTimes(1);
      const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as Request;
      expect(upstreamRequest.url).toBe(
        "https://jisho.org/search/%E5%AD%A6%E3%81%B6",
      );
      expect(upstreamRequest.headers.has("accept")).toBe(false);
      expect(upstreamRequest.headers.has("origin")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("proxies Bunpro's public audio path while rejecting other paths on its CDN", async () => {
    const upstreamFetch = vi.fn((_request: Request) =>
      Promise.resolve(new Response("bunpro-audio", {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      })),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    const audioUrl = "https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/pronunciation/%E4%BA%BA%E9%96%93-female.mp3";

    try {
      const allowed = await PublicProxyWorker.fetch(
        new Request(`https://yomu-jpdb-public-proxy.example/?url=${encodeURIComponent(audioUrl)}`, {
          headers: { accept: "audio/mpeg", origin: "https://yomureader.com" },
        }),
        {},
        { waitUntil: vi.fn() },
      );
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("content-type")).toBe("audio/mpeg");
      expect(await allowed.text()).toBe("bunpro-audio");
      expect(upstreamFetch).toHaveBeenCalledTimes(1);
      const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as Request;
      expect(upstreamRequest.url).toBe(audioUrl);
      expect(upstreamRequest.headers.has("accept")).toBe(false);
      expect(upstreamRequest.headers.has("origin")).toBe(false);

      const rejected = await PublicProxyWorker.fetch(
        new Request(`https://yomu-jpdb-public-proxy.example/?url=${encodeURIComponent("https://dk3kgylsgq3k1.cloudfront.net/private/account.json")}`),
        {},
        { waitUntil: vi.fn() },
      );
      expect(rejected.status).toBe(400);
      expect(rejected.headers.get("x-yomu-proxy-error")).toBe("target-not-allowlisted");
      expect(upstreamFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retries transient Jisho upstream failures with minimal headers", async () => {
    const upstreamFetch = vi.fn((_request: Request) =>
      Promise.resolve(new Response("<audio></audio>", { status: 200 })),
    );
    upstreamFetch.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", upstreamFetch);

    try {
      const response = await PublicProxyWorker.fetch(
        new Request(
          "https://yomu-jpdb-public-proxy.example/?url=https%3A%2F%2Fjisho.org%2Fsearch%2F%25E8%25AA%25AD%25E3%2582%2580",
          { headers: { origin: "https://example.com" } },
        ),
        {},
        { waitUntil: vi.fn() },
      );

      expect(response.status).toBe(200);
      expect(upstreamFetch).toHaveBeenCalledTimes(2);
      for (const [request] of upstreamFetch.mock.calls) {
        expect((request as Request).url).toBe("https://jisho.org/search/%E8%AA%AD%E3%82%80");
        expect((request as Request).headers.has("origin")).toBe(false);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns CORS-safe bad gateway responses when upstream fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("TLS handshake failed"))),
    );

    try {
      const response = await PublicProxyWorker.fetch(
        new Request(
          "https://yomu-jpdb-public-proxy.example/?url=https%3A%2F%2Fjpdb.io%2Fsearch%3Fq%3D%E8%A6%8B%E3%81%9F",
          { headers: { origin: "https://hrussellzfac023.github.io" } },
        ),
        {},
        { waitUntil: vi.fn() },
      );

      expect(response.status).toBe(502);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://hrussellzfac023.github.io",
      );
      expect(response.headers.get("x-yomu-proxy-error")).toBe("upstream");
      await expect(response.text()).resolves.toContain("TLS handshake failed");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("edge-caches user-agnostic Jiten vocabulary info GETs across clients", async () => {
    const upstream = vi.fn(() =>
      Promise.resolve(
        new Response("info", {
          status: 200,
          headers: { "cache-control": "public, max-age=3600" },
        }),
      ),
    );
    vi.stubGlobal("fetch", upstream);
    const store = new Map<string, Response>();
    const backend = {
      match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        store.set(request.url, response.clone());
      }),
    };
    vi.stubGlobal("caches", { default: backend });
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://api.jiten.moe/api/vocabulary/123/0/info");
    const waitUntil = vi.fn();
    const call = () =>
      PublicProxyWorker.fetch(
        new Request(proxyUrl, {
          headers: { origin: "https://hrussellzfac023.github.io" },
        }),
        {},
        { waitUntil },
      );

    try {
      const first = await call();
      expect(first.status).toBe(200);
      await Promise.all(waitUntil.mock.calls.map((args) => args[0]));
      expect(backend.put).toHaveBeenCalledTimes(1);

      const second = await call();
      expect(second.status).toBe(200);
      expect(await second.text()).toBe("info");
      // Second lookup is served from the edge, not the upstream.
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects authenticated requests before cache or upstream fetch", async () => {
    const upstream = vi.fn(() =>
      Promise.resolve(new Response("info", { status: 200 })),
    );
    vi.stubGlobal("fetch", upstream);
    const backend = { match: vi.fn(), put: vi.fn() };
    vi.stubGlobal("caches", { default: backend });
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://api.jiten.moe/api/vocabulary/123/0/info");

    try {
      await expectSensitiveRequestRejected(
        new Request(proxyUrl, {
          headers: {
            authorization: "ApiKey secret",
            origin: "https://hrussellzfac023.github.io",
          },
        }),
      );
      expectNoCacheOrUpstream(backend, upstream);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("coalesces concurrent identical cacheable GETs into one upstream request", async () => {
    let releaseUpstream: () => void = () => {};
    const upstreamGate = new Promise<void>((resolve) => {
      releaseUpstream = resolve;
    });
    let inFlight = 0;
    const upstream = vi.fn(async () => {
      inFlight += 1;
      await upstreamGate;
      return new Response("info", {
        status: 200,
        headers: { "cache-control": "public, max-age=3600" },
      });
    });
    vi.stubGlobal("fetch", upstream);
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: async (request: Request) => store.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => {
          store.set(request.url, response.clone());
        },
      },
    });
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://api.jiten.moe/api/vocabulary/123/0/info");
    const call = () =>
      PublicProxyWorker.fetch(
        new Request(proxyUrl, {
          headers: { origin: "https://hrussellzfac023.github.io" },
        }),
        {},
        { waitUntil: vi.fn() },
      );

    try {
      const first = call();
      const second = call();
      // Let both requests reach the shared in-flight fetch, then release it.
      await new Promise((resolve) => setTimeout(resolve, 20));
      releaseUpstream();
      const [r1, r2] = await Promise.all([first, second]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(await r1.text()).toBe("info");
      expect(await r2.text()).toBe("info");
      // Two concurrent identical lookups → exactly one upstream request.
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(inFlight).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not retry an explicitly-overloaded upstream (503)", async () => {
    const upstream = vi.fn(async () => new Response("overloaded", { status: 503 }));
    vi.stubGlobal("fetch", upstream);
    try {
      const response = await PublicProxyWorker.fetch(
        new Request(
          "https://yomu-jpdb-public-proxy.example/?url=" +
            encodeURIComponent("https://jpdb.io/search?q=%E6%97%A5%E6%9C%AC"),
          { headers: { origin: "https://hrussellzfac023.github.io" } },
        ),
        {},
        { waitUntil: vi.fn() },
      );
      expect(response.status).toBe(503);
      // No retry — an overloaded server should not be hit twice.
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reuses a recent cacheable response for near-sequential identical lookups (workers.dev micro-cache)", async () => {
    const upstream = vi.fn(async () =>
      new Response("info", {
        status: 200,
        headers: { "cache-control": "public, max-age=3600" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    // No-op edge cache (as on workers.dev) so any de-duplication must come from
    // the in-isolate micro-cache, not the Cache API.
    vi.stubGlobal("caches", {
      default: { match: async () => undefined, put: async () => {} },
    });
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://api.jiten.moe/api/vocabulary/777/0/info");
    const call = () =>
      PublicProxyWorker.fetch(
        new Request(proxyUrl, {
          headers: { origin: "https://hrussellzfac023.github.io" },
        }),
        {},
        { waitUntil: vi.fn() },
      );

    try {
      const first = await call();
      const second = await call();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await first.text()).toBe("info");
      expect(await second.text()).toBe("info");
      // Two sequential identical lookups → exactly one upstream request.
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not cache a no-store response even on an allowlisted endpoint", async () => {
    const upstream = vi.fn(async () =>
      new Response("info", {
        status: 200,
        headers: { "cache-control": "no-store" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const backend = { match: vi.fn(async () => undefined), put: vi.fn() };
    vi.stubGlobal("caches", { default: backend });
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://api.jiten.moe/api/vocabulary/555/0/info");

    try {
      const response = await PublicProxyWorker.fetch(
        new Request(proxyUrl, { headers: { origin: "https://hrussellzfac023.github.io" } }),
        {},
        { waitUntil: vi.fn() },
      );
      expect(response.status).toBe(200);
      // Origin said no-store → must not be written to the shared edge cache.
      expect(backend.put).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects non-allowlisted hosts before cache or upstream fetch", async () => {
    const upstream = vi.fn(async () =>
      new Response("ok", {
        status: 200,
        headers: { "cache-control": "public, max-age=3600" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const backend = { match: vi.fn(async () => undefined), put: vi.fn() };
    vi.stubGlobal("caches", { default: backend });
    // A host the worker proxies but is NOT on the cacheable allowlist.
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://example.com/some/asset.json");
    const call = () =>
      PublicProxyWorker.fetch(
        new Request(proxyUrl, { headers: { origin: "https://hrussellzfac023.github.io" } }),
        {},
        { waitUntil: vi.fn() },
      );

    try {
      const first = await call();
      const second = await call();
      expect(first.status).toBe(400);
      expect(second.status).toBe(400);
      expectNoCacheOrUpstream(backend, upstream);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["Uchisen pages", "https://uchisen.com/kanji/%E5%9B%B3"],
    ["Uchisen ImageKit media", "https://ik.imagekit.io/uchisen/generated/saved/generated_sample.jpg"],
  ])("rejects retired %s before upstream fetch", async (_label, target) => {
    const upstream = vi.fn(async () => new Response("unexpected"));
    vi.stubGlobal("fetch", upstream);

    try {
      const response = await PublicProxyWorker.fetch(
        new Request(
          `https://yomu-jpdb-public-proxy.example/?url=${encodeURIComponent(target)}`,
          { headers: { origin: "https://yomureader.com" } },
        ),
        {},
        { waitUntil: vi.fn() },
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("x-yomu-proxy-error")).toBe("target-not-allowlisted");
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects sensitive URL parameters on otherwise allowlisted hosts", async () => {
    const upstream = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://jpdb.io/search?q=%E5%9B%B3&token=secret");

    try {
      await expectSensitiveRequestRejected(
        new Request(proxyUrl, { headers: { origin: "https://hrussellzfac023.github.io" } }),
      );
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("serves status without exposing query strings or request headers", async () => {
    const response = await PublicProxyWorker.fetch(
      new Request("https://yomu-jpdb-public-proxy.example/status", {
        headers: { origin: "https://yomureader.com" },
      }),
      { PUBLIC_PROXY_DAILY_REQUEST_LIMIT: "10", PUBLIC_PROXY_ANALYTICS_LOGS: "true" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json() as {
      status: string;
      allowlistVersion: string;
      allowedHosts: string[];
      policy: { anonymousOnly: boolean; arbitraryTargets: boolean };
      analytics: { structuredLogs: boolean; logsTargetQueries: boolean; logsRequestHeaders: boolean };
      budget: { limit: number; count: number; remaining: number };
    };
    expect(body.status).toBe("ok");
    expect(body.allowlistVersion).toBe("2026-08-10-uchisen-retired");
    expect(body.allowedHosts).toContain("dk3kgylsgq3k1.cloudfront.net");
    expect(body.allowedHosts).not.toContain("uchisen.com");
    expect(body.allowedHosts).not.toContain("ik.imagekit.io");
    expect(body.policy).toMatchObject({ anonymousOnly: true, arbitraryTargets: false });
    expect(body.analytics).toMatchObject({ structuredLogs: true, logsTargetQueries: false, logsRequestHeaders: false });
    expect(body.budget).toMatchObject({ limit: 10, count: 0, remaining: 10 });
  });

  it("can be disabled by environment kill switch", async () => {
    const upstream = vi.fn(async () => new Response("unexpected"));
    vi.stubGlobal("fetch", upstream);
    const response = await PublicProxyWorker.fetch(
      new Request(
        "https://yomu-jpdb-public-proxy.example/?url=" +
          encodeURIComponent("https://jpdb.io/search?q=%E8%AA%AD"),
      ),
      { PUBLIC_PROXY_DISABLED: "true" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-yomu-proxy-error")).toBe("disabled");
    expect(upstream).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("stops forwarding after the configured daily request budget", async () => {
    const upstream = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://jpdb.io/search?q=%E8%AA%AD");
    const env = { PUBLIC_PROXY_DAILY_REQUEST_LIMIT: "1" };

    try {
      const first = await PublicProxyWorker.fetch(
        new Request(proxyUrl),
        env,
        { waitUntil: vi.fn() },
      );
      const second = await PublicProxyWorker.fetch(
        new Request(proxyUrl),
        env,
        { waitUntil: vi.fn() },
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(second.headers.get("x-yomu-proxy-error")).toBe("budget-exhausted");
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops forwarding to an upstream after it returns 429 (honors the rate limit)", async () => {
    const upstream = vi.fn(async () =>
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "30" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const proxyUrl =
      "https://yomu-jpdb-public-proxy.example/?url=" +
      encodeURIComponent("https://api.jiten.moe/api/vocabulary/9/0/info");
    const call = () =>
      PublicProxyWorker.fetch(
        new Request(proxyUrl, { headers: { origin: "https://hrussellzfac023.github.io" } }),
        {},
        { waitUntil: vi.fn() },
      );

    try {
      const first = await call();
      expect(first.status).toBe(429); // forwarded the origin's 429

      const second = await call();
      expect(second.status).toBe(429);
      // Synthetic response — the proxy short-circuited instead of re-hitting the
      // origin that just rate-limited it.
      expect(second.headers.get("x-yomu-proxy-error")).toBe("rate-limited");
      expect(second.headers.get("retry-after")).toBeTruthy();
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
