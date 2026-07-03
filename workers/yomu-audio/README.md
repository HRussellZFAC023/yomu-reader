# Yomu Audio Worker

Yomitan-compatible audio endpoint for `audio.yomureader.com`.

The endpoint accepts:

```text
https://audio.yomureader.com/?term=猫&reading=ねこ
```

The worker has three serving modes:

1. R2 sharded-index mode: hash the requested term, read one small object from `index/v2/shards/<hash>.json`, return matching Yomitan-compatible audio JSON, and serve stored files from `/audio/<key>`.
2. Legacy R2 manifest mode: read `index/audio-index.json` from the `AUDIO_BUCKET` binding. This keeps the original small seed manifest working while the full index is uploaded.
3. Upstream mode: if `AUDIO_UPSTREAM_URL` is configured and no R2 index has a match, forward `term` and `reading` to that upstream, strip cookies, add CORS, and cache successful responses at the edge.

If neither R2 nor an upstream is configured, it returns a JapanesePod101 fallback URL for Japanese terms so Yomu can still try a public clip and filter JapanesePod101's fixed "not available" placeholder client-side.

## Bootstrap before R2 is enabled

Cloudflare accounts must enable R2 before Wrangler can deploy a Worker with an R2 binding. To attach `audio.yomureader.com` while that account-level switch is still pending, deploy the disabled bootstrap config:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.bootstrap.jsonc
```

That deploys the same Worker without the `AUDIO_BUCKET` binding and with `AUDIO_DISABLED=true`, so `/status` works and audio lookups return an empty Yomitan-compatible list. After R2 is enabled and the bucket is uploaded, redeploy the canonical config:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.jsonc
```

## Export the full local audio collection

The local collection lives at `/Users/heru/Applications/yomichan-audio-server`. The full hosted export uses `entries.db` as the source of term/reading aliases and skips non-Japanese collections. By default it includes:

```text
daijisen, nhk16, shinmeikai8, forvo_jp, jpod
```

Generate the v2 shard index:

```bash
npm run audio:export -- --full --out tmp/yomu-audio-export
```

The command writes:

```text
tmp/yomu-audio-export/index/v2/shards/*.json
tmp/yomu-audio-export/index/v2/manifest.json
tmp/yomu-audio-export/rclone-audio-filter.txt
tmp/yomu-audio-export/upload-plan.txt
```

Upload through R2's S3 API. `wrangler r2 object put` works for a few seed files, but it is too slow for hundreds of thousands of audio objects.

Using `rclone`:

```bash
rclone copy /Users/heru/Applications/yomichan-audio-server/audio r2:yomu-audio \
  --filter-from tmp/yomu-audio-export/rclone-audio-filter.txt \
  --fast-list --transfers 32 --checkers 64 --progress
rclone copy tmp/yomu-audio-export/index r2:yomu-audio/index \
  --fast-list --transfers 32 --checkers 64 --progress
```

Using `aws-cli` with R2 credentials:

```bash
aws s3 sync /Users/heru/Applications/yomichan-audio-server/audio s3://yomu-audio/ \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --exclude "*" \
  --include "daijisen/*" \
  --include "nhk16/*" \
  --include "shinmeikai8/*" \
  --include "forvo_jp/*" \
  --include "jpod/*" \
  --only-show-errors
aws s3 sync tmp/yomu-audio-export/index s3://yomu-audio/index \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --only-show-errors
```

Create the bucket once, if needed:

```bash
npx wrangler r2 bucket create yomu-audio
```

### Seed export for local testing

Create a TSV of terms to seed:

```text
猫	ねこ
図鑑	ずかん
```

Run the local server on `localhost:9090`, then export the legacy manifest plus seed files:

```bash
npm run audio:export -- --words ./audio-seed.tsv --out tmp/yomu-audio-seed
```

Set the upstream after the licensed/public audio hosting decision is final:

```bash
npx wrangler secret put AUDIO_UPSTREAM_URL --config workers/yomu-audio/wrangler.jsonc
```

Deploy:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.jsonc
```
