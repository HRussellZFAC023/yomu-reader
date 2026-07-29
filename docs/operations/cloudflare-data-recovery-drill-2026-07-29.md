# Cloudflare recovery drill: 2026-07-29

This drill used Wrangler 4.112.0, named scratch D1 databases, and a named scratch R2 bucket. Every D1 and R2
object operation included `--remote`.

## What the first attempt caught

Importing the one-file Academy export into an empty scratch database failed:

```text
Executing on remote database yomu-academy-restore-drill-20260729
ERROR no such table: main.classes: SQLITE_ERROR
```

The export placed `invites` rows before the referenced `classes` table and later placed session rows before
their account/profile parents. A schema-first import still failed when the unordered data file reached the
end-of-import foreign-key check. `scripts/order-d1-restore-data.mjs` now orders inserts from the exported
schema's foreign-key graph. The scheduled backup stores the schema and restore-ordered data separately.

## `yomu-support` result

The clean scratch database accepted the exported schema and ordered data:

```text
schema: Processed 7 queries; 13 rows written; database size 0.05 MB; success true
data:   Processed 7 queries; 16 rows written; database size 0.05 MB; success true
```

The production and restored critical counts matched:

```text
donation_events: 0
provider_donation_events: 2
PRAGMA foreign_key_check: 0 rows
```

The zero in `donation_events` is the observed production value, not a seeded expectation. The two current
provider-ledger rows were present in the restored copy.

## `yomu-academy` result

The clean scratch database accepted the exported schema and restore-ordered data:

```text
schema: Processed 56 queries; 138 rows written; 28 tables; success true
data:   Processed 458 queries; 2,936 rows written; database size 0.61 MB; success true
```

Production and restored counts matched for the payment/account tables sampled after import:

```text
accounts: 3
payment_entitlements: 1
purchases: 17
payment_code_deliveries: 1
profiles: 4
srs_events: 0
PRAGMA foreign_key_check: 0 rows
```

No learner identifiers, email addresses, invite codes, session tokens, or payment references were printed by
the comparison.

## `yomu-dictionaries` R2 result

One content-addressed object was copied through the whole recovery route:

```text
yomu-dictionaries (remote)
  -> yomu-dictionaries-backup (remote)
  -> yomu-dictionaries-restore-drill-20260729 (remote)

source SHA-256:   4e15250659268f5470fd5e8ab848fc9b259c94876d3027716481f9f83303f4b8
backup SHA-256:   4e15250659268f5470fd5e8ab848fc9b259c94876d3027716481f9f83303f4b8
restored SHA-256: 4e15250659268f5470fd5e8ab848fc9b259c94876d3027716481f9f83303f4b8
```

The scheduled job verifies every source key and size after its incremental mirror. The drill used one object
to prove the download/upload/checksum restore path without transferring the 6.1 GB corpus through the local
machine.
