# Production health monitoring

Five Workers serve yomureader.com. Publication is an explicit operator action —
no workflow runs `wrangler deploy` — and until 2026-07-30 nothing checked the
deployed result either, so a Worker could answer errors indefinitely and a user
would be the one to report it.

## What runs

`.github/workflows/production-health.yml` runs `node
scripts/production-health-check.mjs` every 30 minutes and on demand
(`workflow_dispatch`). The job installs no dependencies: the probe is plain Node
with `fetch`, so a lockfile or registry problem can never be the reason the
monitor stops reporting. A failed scheduled run on the default branch emails the
repository owner.

The endpoint table is in the script:

| Worker | Health URL |
| --- | --- |
| `yomu-dictionaries` | `https://dictionaries.yomureader.com/healthz` |
| `yomu-audio` | `https://audio.yomureader.com/status` |
| `yomu-support` | `https://support.yomureader.com/status` |
| `yomu-academy` | `https://yomureader.com/academy/api/health` |
| `yomu-jpdb-public-proxy` | `https://edge.yomureader.com/healthz` |

`tests/workers/production-health.test.ts` fails when a Worker in the repository
has no probe, and when a probe URL names a host its own wrangler config does not
route. A new Worker therefore cannot ship unwatched.

Use `/healthz` for the `edge` Worker, not `/health`. `/health` is an ordinary
proxy request path and answers `400 Missing url parameter.`; a 2026-07-29 sweep
read that 400 as a broken route.

## What fails the run, and what only gets reported

Fails: a non-200, a 200 whose body is not JSON, or a payload whose
`status`/`ok` says the service is disabled, unconfigured or in error. Each
endpoint is retried three times with a backoff, so one dropped connection is not
an alert.

Reported without failing: build drift. Deployment is manual, so a Worker
legitimately runs an older version until the owner redeploys — a red run for that
would train everyone to ignore red runs. The output names any Worker running a
version other than the checkout's, and any Worker whose payload has no version at
all.

## Which build is live

Every health payload carries a `revision` block from
`workers/shared/service-revision.ts`:

```json
{ "version": "1.8.42", "deploymentId": "55ca3c2a-…", "deployedAt": "2026-07-30T12:00:00Z" }
```

`version` is the repository version the bundle was built from, read from
package.json at build time, so it can be compared to `main` with no Cloudflare
API call. `deploymentId` and `deployedAt` come from Cloudflare's
`version_metadata` binding, so two deploys of the same source stay
distinguishable and the payload says when the running code was pushed. Both are
`null` when the binding is absent, which makes a missing binding visible instead
of silently identical to a Worker that has never been redeployed.

Before this, only the Academy named a build, as `workerVersionId` — an opaque
Cloudflare UUID that cannot be compared to anything in the repository.

A Worker reports `"version": null` until it is next deployed. To stamp it:

```bash
npx wrangler deploy --config workers/yomu-audio/wrangler.jsonc
npx wrangler deploy --config workers/yomu-dictionaries/wrangler.jsonc
npx wrangler deploy --config workers/yomu-support/wrangler.jsonc
npx wrangler deploy --config workers/jpdb-public-proxy/wrangler.toml
npx wrangler deploy --config wrangler.academy.jsonc
```
