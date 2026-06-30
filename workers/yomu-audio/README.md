# Yomu Audio Worker

Yomitan-compatible audio endpoint for `audio.yomureader.com`.

The endpoint accepts:

```text
https://audio.yomureader.com/?term=猫&reading=ねこ
```

The worker has two serving modes:

1. R2 manifest mode: read `index/audio-index.json` from the `AUDIO_BUCKET` binding, return matching Yomitan-compatible audio JSON, and serve stored files from `/audio/<key>`.
2. Upstream mode: if `AUDIO_UPSTREAM_URL` is configured and the manifest has no match, forward `term` and `reading` to that upstream, strip cookies, add CORS, and cache successful responses at the edge.

If neither R2 nor an upstream is configured, it returns an empty Yomitan-compatible audio list quickly so Yomu falls through to the next audio source.

## Bootstrap before R2 is enabled

Cloudflare accounts must enable R2 before Wrangler can deploy a Worker with an R2 binding. To attach `audio.yomureader.com` while that account-level switch is still pending, deploy the disabled bootstrap config:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.bootstrap.jsonc
```

That deploys the same Worker without the `AUDIO_BUCKET` binding and with `AUDIO_DISABLED=true`, so `/status` works and audio lookups return an empty Yomitan-compatible list. After R2 is enabled and the bucket is uploaded, redeploy the canonical config:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.jsonc
```

## Export from the local audio server

Create a TSV of terms to seed:

```text
猫	ねこ
図鑑	ずかん
```

Run the local server on `localhost:9090`, then export:

```bash
npm run audio:export -- --words ./audio-seed.tsv --out tmp/yomu-audio-export
```

Upload the manifest and files:

```bash
npx wrangler r2 bucket create yomu-audio
npx wrangler r2 object put yomu-audio/index/audio-index.json --file tmp/yomu-audio-export/index/audio-index.json
find tmp/yomu-audio-export -type f ! -path '*/index/audio-index.json' -print0 | while IFS= read -r -d '' file; do
  key="${file#tmp/yomu-audio-export/}"
  npx wrangler r2 object put "yomu-audio/$key" --file "$file"
done
```

Set the upstream after the licensed/public audio hosting decision is final:

```bash
npx wrangler secret put AUDIO_UPSTREAM_URL --config workers/yomu-audio/wrangler.jsonc
```

Deploy:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.jsonc
```
