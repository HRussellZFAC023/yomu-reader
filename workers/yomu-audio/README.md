# Yomu Audio Worker

Yomitan-compatible audio endpoint for `audio.yomureader.com`.

The endpoint accepts:

```text
https://audio.yomureader.com/?term=猫&reading=ねこ
```

If `AUDIO_UPSTREAM_URL` is configured, the worker forwards `term` and `reading` to that upstream, strips cookies, adds CORS, and caches successful responses at the edge. If no upstream is configured, it returns an empty Yomitan-compatible audio list quickly so Yomu falls through to the next audio source.

Set the upstream after the licensed/public audio hosting decision is final:

```bash
npx wrangler secret put AUDIO_UPSTREAM_URL --config workers/yomu-audio/wrangler.jsonc
```

Deploy:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.jsonc
```
