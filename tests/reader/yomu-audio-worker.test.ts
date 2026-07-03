import { afterEach, describe, expect, it, vi } from "vitest";
import AudioWorker, { audioShardKeyForTests, resetAudioWorkerCacheForTests } from "../../workers/yomu-audio/src/index";

type MockR2Object = {
  body: ReadableStream | null;
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string };
  text?: () => Promise<string>;
  writeHttpMetadata?: (headers: Headers) => void;
};

describe("Yomu audio Worker", () => {
  afterEach(() => {
    resetAudioWorkerCacheForTests();
    vi.unstubAllGlobals();
  });

  it("falls back to a JapanesePod101 URL when no manifest entry or upstream is configured", async () => {
    // The worker must NOT probe the clip itself: JapanesePod101's CloudFront
    // origin rejects Cloudflare Worker egress, so the URL is handed to the
    // client, which filters the "not available" placeholder clip on playback.
    const jpodFetch = vi.fn();
    vi.stubGlobal("fetch", jpodFetch);

    const response = await AudioWorker.fetch(
      new Request("https://audio.yomureader.com/?term=%E4%BF%9D%E6%9C%89&reading=%E3%81%BB%E3%82%86%E3%81%86", {
        headers: { origin: "https://yomureader.com" },
      }),
      {},
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://yomureader.com");
    expect(await response.json()).toEqual({
      type: "audioSourceList",
      audioSources: [{
        name: "jpod",
        url: "https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E4%BF%9D%E6%9C%89&kana=%E3%81%BB%E3%82%86%E3%81%86",
      }],
    });
    expect(response.headers.get("x-yomu-audio-source")).toBe("jpod101-fallback");
    expect(jpodFetch).not.toHaveBeenCalled();
  });

  it("omits the kanji parameter for kana-only fallback lookups", async () => {
    const response = await AudioWorker.fetch(
      new Request("https://audio.yomureader.com/?term=%E3%81%AD%E3%81%93&reading=%E3%81%AD%E3%81%93"),
      {},
      { waitUntil: vi.fn() },
    );

    expect(await response.json()).toEqual({
      type: "audioSourceList",
      audioSources: [{
        name: "jpod",
        url: "https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kana=%E3%81%AD%E3%81%93",
      }],
    });
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

  it("returns Yomitan-compatible audio JSON from an R2 manifest before falling back to an upstream", async () => {
    const bucket = mockAudioBucket({
      "index/audio-index.json": {
        contentType: "application/json",
        body: JSON.stringify({
          entries: {
            "猫\tねこ": [
              { name: "nhk16 ネコ", path: "nhk16/media/20170726141547.mp3" },
            ],
          },
        }),
      },
    });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await AudioWorker.fetch(
      new Request("https://audio.yomureader.com/?term=%E7%8C%AB&reading=%E3%81%AD%E3%81%93", {
        headers: { origin: "https://yomureader.com" },
      }),
      { AUDIO_BUCKET: bucket, AUDIO_UPSTREAM_URL: "https://licensed-audio.example/" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://yomureader.com");
    await expect(response.json()).resolves.toEqual({
      type: "audioSourceList",
      audioSources: [{
        name: "nhk16 ネコ",
        url: "https://audio.yomureader.com/audio/nhk16/media/20170726141547.mp3",
      }],
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns Yomitan-compatible audio JSON from a sharded R2 index before using the legacy manifest or fallback", async () => {
    const bucket = mockAudioBucket({
      [audioShardKeyForTests("保有")]: {
        contentType: "application/json",
        body: JSON.stringify({
          version: 2,
          entries: {
            "保有": [
              {
                r: "ほゆう",
                s: [
                  ["daijisen ほゆう [0]", "daijisen/media/s00005904.mp3"],
                  ["nhk16 ホユー [0]", "nhk16/media/20171102163745.mp3"],
                ],
              },
              {
                r: "",
                s: [["forvo_jp akitomo", "forvo_jp/akitomo/保有.mp3"]],
              },
            ],
          },
        }),
      },
      "index/audio-index.json": {
        contentType: "application/json",
        body: JSON.stringify({
          entries: {
            "保有\tほゆう": [
              { name: "legacy duplicate", path: "jpod/media/legacy.mp3" },
            ],
          },
        }),
      },
    });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await AudioWorker.fetch(
      new Request("https://audio.yomureader.com/?term=%E4%BF%9D%E6%9C%89&reading=%E3%81%BB%E3%82%86%E3%81%86"),
      { AUDIO_BUCKET: bucket },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      type: "audioSourceList",
      audioSources: [
        { name: "daijisen ほゆう [0]", url: "https://audio.yomureader.com/audio/daijisen/media/s00005904.mp3" },
        { name: "nhk16 ホユー [0]", url: "https://audio.yomureader.com/audio/nhk16/media/20171102163745.mp3" },
        { name: "forvo_jp akitomo", url: "https://audio.yomureader.com/audio/forvo_jp/akitomo/%E4%BF%9D%E6%9C%89.mp3" },
      ],
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves R2 audio objects with CORS, cache headers, and content metadata", async () => {
    const bucket = mockAudioBucket({
      "nhk16/media/20170726141547.mp3": {
        contentType: "audio/mpeg",
        body: "mp3 bytes",
      },
    });

    const response = await AudioWorker.fetch(
      new Request("https://audio.yomureader.com/audio/nhk16/media/20170726141547.mp3", {
        headers: { origin: "https://yomureader.com" },
      }),
      { AUDIO_BUCKET: bucket },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://yomureader.com");
    await expect(response.text()).resolves.toBe("mp3 bytes");
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
      r2Configured: false,
      manifestKey: "index/audio-index.json",
    });
  });
});

function mockAudioBucket(objects: Record<string, { body: string; contentType: string }>) {
  return {
    async get(key: string): Promise<MockR2Object | null> {
      const object = objects[key];
      if (!object) return null;
      return {
        body: new Response(object.body).body,
        size: object.body.length,
        etag: `"${key}"`,
        httpMetadata: { contentType: object.contentType },
        text: async () => object.body,
        writeHttpMetadata: (headers: Headers) => {
          headers.set("content-type", object.contentType);
        },
      };
    },
  };
}
