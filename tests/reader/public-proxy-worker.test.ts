import { describe, expect, it, vi } from "vitest";
import PublicProxyWorker from "../../workers/jpdb-public-proxy/src/index";

describe("Yomu public proxy Worker", () => {
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
});
