import { afterEach, describe, expect, it, vi } from "vitest";
import AudioWorker from "../../workers/yomu-audio/src/index";

describe("Yomu audio Worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty Yomitan-compatible list when no upstream is configured", async () => {
    const response = await AudioWorker.fetch(
      new Request("https://audio.yomureader.com/?term=%E7%8C%AB&reading=%E3%81%AD%E3%81%93", {
        headers: { origin: "https://yomureader.com" },
      }),
      {},
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://yomureader.com");
    expect(await response.json()).toEqual({ type: "audioSourceList", audioSources: [] });
    expect(response.headers.get("x-yomu-audio-error")).toBe("unconfigured");
  });

  it("proxies configured upstream audio JSON and caches the response", async () => {
    const upstreamUrls: string[] = [];
    const upstream = vi.fn(async (input: string | Request) => {
      upstreamUrls.push(typeof input === "string" ? input : input.url);
      return Response.json({
        type: "audioSourceList",
        audioSources: [{ name: "nhk16 ネコ", url: "https://audio.example/neko.mp3" }],
      });
    });
    vi.stubGlobal("fetch", upstream);
    const store = new Map<string, Response>();
    const backend = {
      match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        store.set(request.url, response.clone());
      }),
    };
    vi.stubGlobal("caches", { default: backend });
    const waitUntil = vi.fn();
    const request = new Request("https://audio.yomureader.com/?term=%E7%8C%AB&reading=%E3%81%AD%E3%81%93");
    const env = { AUDIO_UPSTREAM_URL: "https://licensed-audio.example/" };

    const first = await AudioWorker.fetch(request, env, { waitUntil });
    await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));
    const second = await AudioWorker.fetch(request, env, { waitUntil: vi.fn() });

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      type: "audioSourceList",
      audioSources: [{ name: "nhk16 ネコ", url: "https://audio.example/neko.mp3" }],
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      type: "audioSourceList",
      audioSources: [{ name: "nhk16 ネコ", url: "https://audio.example/neko.mp3" }],
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstreamUrls).toEqual(["https://licensed-audio.example/?term=%E7%8C%AB&reading=%E3%81%AD%E3%81%93"]);
    expect(backend.put).toHaveBeenCalledTimes(1);
  });

  it("serves status for setup checks", async () => {
    const response = await AudioWorker.fetch(
      new Request("https://audio.yomureader.com/status"),
      { AUDIO_UPSTREAM_URL: "https://licensed-audio.example/" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: "yomu-audio",
      status: "ok",
      upstreamConfigured: true,
    });
  });
});
