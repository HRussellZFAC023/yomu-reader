# Cloudflare data recovery

The scheduled GitHub Actions backup pipeline was removed on 2026-08-05: it exported full
production databases through a CI runner (blocking D1 requests during each export), depended
on two long-lived credentials that rotted, and stored the copies in the same Cloudflare
account it was protecting. Recovery now uses Cloudflare's built-in mechanisms.

## D1 databases (`yomu-support`, `yomu-academy`)

D1 Time Travel keeps automatic point-in-time restore for the last **30 days** with no
configuration, no export downtime, and no credentials to maintain.

Inspect the current bookmark:

```bash
npx wrangler d1 time-travel info yomu-support --config workers/yomu-support/wrangler.jsonc
npx wrangler d1 time-travel info yomu-academy --config wrangler.academy.jsonc
```

Restore to a timestamp or bookmark:

```bash
npx wrangler d1 time-travel restore yomu-support --timestamp=<unix-or-RFC3339> --config workers/yomu-support/wrangler.jsonc
```

Restores are themselves bookmarked, so a bad restore can be rolled forward again.

## Known limits

- Time Travel covers 30 days. Anything older is gone. If long-retention copies become a
  requirement, run a small scheduled Worker inside the account (export → R2) rather than
  reviving the CI pipeline.
- Time Travel does not protect against account-level loss (closure, compromise with
  deletion). Accepting that risk was a deliberate owner decision on 2026-08-05.

## R2 dictionary data (`yomu-dictionaries`)

The dictionary bucket's contents are re-derivable: every object is a published upstream
dictionary (WTY, Jitendex, etc.) re-uploadable by the catalogue tooling. Restore path is
re-running the dictionary publication scripts, not a bucket copy.
