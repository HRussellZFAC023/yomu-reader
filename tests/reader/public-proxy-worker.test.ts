import { afterEach, describe, expect, it, vi } from "vitest";
import PublicProxyWorker, {
  resetProxyWorkerCacheForTests,
} from "../../workers/jpdb-public-proxy/src/index";

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
        (fetchMock.mock.calls[0][0] as Request).headers.get("accept"),
      ).toBe("text/html");
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

  it("never edge-caches authenticated (per-user) requests", async () => {
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
      await PublicProxyWorker.fetch(
        new Request(proxyUrl, {
          headers: {
            authorization: "ApiKey secret",
            origin: "https://hrussellzfac023.github.io",
          },
        }),
        {},
        { waitUntil: vi.fn() },
      );
      expect(backend.match).not.toHaveBeenCalled();
      expect(backend.put).not.toHaveBeenCalled();
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

  it("does not cache or coalesce non-allowlisted hosts", async () => {
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
      await call();
      await call();
      // Non-allowlisted host: never cached, never coalesced → each call hits origin.
      expect(backend.match).not.toHaveBeenCalled();
      expect(backend.put).not.toHaveBeenCalled();
      expect(upstream).toHaveBeenCalledTimes(2);
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
