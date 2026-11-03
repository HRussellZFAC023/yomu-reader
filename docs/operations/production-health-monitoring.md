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

## よむ Desktop downloads

The same run sends a `HEAD` to each `releases/latest/download/yomu-desktop-*`
file that yomureader.com's download buttons link (`DESKTOP_DOWNLOAD_URLS` in
`scripts/lib/hosted-install-route.cjs`). A file that does not answer 200 fails
the run, unless the latest release is under an hour old: GitHub marks a release
latest as soon as `release.yml` publishes it, and `release-gaming.yml` attaches
the desktop files a minute or two later. The workflow's own token pays for that
one release lookup.

### Before a release reaches main

Deploy Docs puts the buttons live about 20 minutes after a push to `main`. A
tag's desktop files land about 35 minutes after the tag (30 to 44 for v2.0.9 to
v2.0.12), because Release Yomu Gaming waits for `release.yml` to publish. While
the latest release already has the files, that order costs only the minute or
two above.

v2.0.12 has no `yomu-desktop-*` files. If 2.1.0 goes out in the usual order
(main, Deploy Docs, tag), every button, the homepage's included, opens a GitHub
404 from the docs deploy until v2.1.0's files land, and this check goes red.

So run `node scripts/production-health-check.mjs` before pushing `main`. If a
`desktop` row fails, do one of these first:

1. Attach copies under the stable names to the latest release. This edits a
   public release, so it is the owner's call. The copies are byte-identical to
   files `SHA256SUMS.txt` already lists.

   ```bash
   tag="$(gh release view --json tagName --jq .tagName)"
   dir="$(mktemp -d)"
   for file in win-x64.exe mac-arm64.zip mac-x64.zip linux-x86_64.AppImage; do
     gh release download "$tag" --dir "$dir" --pattern "yomu-gaming-${tag#v}-$file"
     cp "$dir/yomu-gaming-${tag#v}-$file" "$dir/yomu-desktop-$file"
   done
   gh release upload "$tag" "$dir"/yomu-desktop-*
   node scripts/production-health-check.mjs
   ```

2. Push the tag first. Push `main` once Release Yomu Gaming has finished and the
   check passes.

## Greasy Fork updates

In the listing's author **Admin → Source Syncing** form, set the code URL to
`https://yomureader.com/yomu.user.js` and select **Automatic**. This follows the
deployed Pages artifact instead of a raw `main` file that can change before
its pinned runtime and CSS are available. Keep **Manual** only if you intend
to trigger every update yourself.

If the saved mode is **Webhook**, switch it to **Automatic** or **Manual**.
[Greasy Fork matches GitHub webhook events to repository URLs](https://github.com/greasyfork-org/greasyfork/blob/94dbbdd89aba1263064b3dc8380b7156476d15d4/app/controllers/concerns/webhooks.rb#L130-L147).
A hosted source URL does not match those events, and a push does not wait for
Deploy Docs.

Before saving with **Update and sync now** or triggering a manual update:

1. Wait for **Deploy Docs** to succeed for the intended commit.
2. Fetch `https://yomureader.com/yomu.user.js` and confirm its `@version`.
3. Fetch every `@require` and `@resource` URL in that header without its hash
   fragment. Require HTTP 200 and verify each response's full SHA-256 digest
   against its `#sha256=` value. Stop if any URL or digest fails.
4. After syncing, verify the public Greasy Fork `.meta.js` and `.user.js`
   report the intended version. Check the runtime URL in both responses and
   the CSS URL in `.user.js` against the hosted header.

Reopen the author form to confirm the saved URL and mode. Public script
responses do not prove those settings.

When the author setting still follows raw `main`, deploy a release candidate
before exposing its new bootstrap there. First merge the deployment workflow
change into protected `main` and wait for that commit's Deploy Docs run to finish.
Put the candidate on a same-repository `release/*` PR into that exact main
revision, finish its canonical build, and require full CI on the final candidate.
Dispatch **Deploy Docs** from **main** with `source_commit` set to the exact
40-character candidate SHA. All 26 CI jobs must pass; the gate checks the CI
checkout log's immutable merge commit, its main/candidate parents, and equality
of its tested tree with the candidate tree. It rejects missing CI, changed
workflow bytes, forks, and moving main/PR refs. An empty input also requires
full CI on main. The run records `PAGES_SOURCE_RECEIPT` and
`PAGES_SOURCE_VERIFIED` JSON with workflow/source revisions, tree, and CI
run/attempt. Avoid intervening main pushes: Pages runs share one cancellation
group. Provenance is checked again before upload and immediately before deploy,
which records `PAGES_SOURCE_DEPLOY_VERIFIED`. API reads and Pages deployment
are separate operations, so recheck live provenance before merging.

This deploy publishes the whole candidate website. Before merging the candidate
and tagging the release, verify the deployed candidate body and every full-SRI
runtime/CSS pin, the previous release's pinned bodies and digests, and existing
userscript-manager and Study compatibility. Keep the website-first ordering
until the saved Greasy Fork author URL and mode above have been changed and
reopened to confirm persistence; this workflow does not change that account
setting. Build, browser localization, artifact verification, and same-run Pages
artifact deployment remain required. The manual route also rejects regenerated
artifact drift and compares the uploaded copies with committed candidate bytes
using the protected main revision's generated-artifact manifest.

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
