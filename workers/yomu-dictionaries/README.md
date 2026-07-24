# Yomu dictionary distribution Worker

This Worker streams immutable, SHA-256-addressed Yomitan archives and the
versioned Slice 1 catalogue from the `yomu-dictionaries` R2 binding.

Production is served from `https://dictionaries.yomureader.com`. The frozen
2026-07-23 release contains 186 catalogue entries, 167 unique objects,
6,127,919,560 unique bytes, and 32 ready learner-language recommendation
manifests. `config/dictionaries/published/v1/` is the tracked runtime snapshot;
`config/dictionaries/manifests/v1/` remains the pre-promotion acquisition plan.

The repository does not create, deploy, or mutate Cloudflare resources during
normal tests. Provisioning and publication remain explicit operator actions:

```bash
# Validate the Worker bundle without deploying it.
npx wrangler deploy --dry-run --config workers/yomu-dictionaries/wrangler.jsonc

# Inspect the dictionary acquisition and upload plans (both are dry-run by default).
node scripts/dictionaries/acquire.mjs
node scripts/dictionaries/upload.mjs

# Prepare and publish an already verified release.
node scripts/dictionaries/prepare-release.mjs --inventory artifacts/verified-connector-inventory.v1.json --write
node scripts/dictionaries/upload.mjs --execute --bucket yomu-dictionaries --confirm-bucket yomu-dictionaries

# Verify every manifest byte, every object HEAD, and both ends of every object.
node scripts/dictionaries/verify-live.mjs --base-url https://dictionaries.yomureader.com
```

Remote uploads require both `--execute` and
`--confirm-bucket yomu-dictionaries`. The upload command never creates or
deletes a bucket. Before the first deployment, create the bucket and configure
the custom domain through the reviewed Cloudflare change process.

Wrangler's single-object upload path is used for ordinary archives. Objects
larger than 300 MiB use `upload-large-objects.mjs`, which deploys a temporary,
token-gated multipart relay, copies exact ranges from the validated source,
and always removes that temporary Worker after the upload.

## HTTP contract

- `GET|HEAD /v1/catalog.json`
- `GET|HEAD /v1/languages.json`
- `GET|HEAD /v1/recommendations/<learner>-ja.json`
- `GET|HEAD /objects/sha256/<digest>.zip`
- `GET|HEAD /healthz`

Responses support CORS, ETags, one HTTP byte range, and immutable caching for
content-addressed objects. The Worker never exposes an R2 listing endpoint.
