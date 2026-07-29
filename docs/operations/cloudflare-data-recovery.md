# Cloudflare data backup and recovery

The `Cloudflare Data Backup` GitHub Actions workflow runs every day at 02:43 UTC and can also be started
manually. A GitHub Actions schedule fits this repository better than a Worker Cron Trigger because a full D1
export is a Wrangler control-plane operation. The job also has the command-line environment needed to mirror
R2 without routing 6 GB of dictionary data through a Worker.

The job:

- exports the remote `yomu-support` and `yomu-academy` database schema and data as SQL, then orders data
  inserts by foreign-key dependency;
- compresses each export, records its SHA-256 digest, and writes dated objects plus `d1/latest.json` to the
  private `yomu-durability-backups` R2 bucket;
- incrementally copies every remote `yomu-dictionaries` object into the private
  `yomu-dictionaries-backup` R2 bucket; and
- compares every source key, byte count, and ETag with the backup before reporting success.

The backup job requires these GitHub Actions secrets:

| Secret | Access |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `CLOUDFLARE_API_TOKEN` | D1 read and R2 object write for the named resources |
| `R2_BACKUP_ACCESS_KEY_ID` | R2 S3 read/write access limited to `yomu-dictionaries` and `yomu-dictionaries-backup` |
| `R2_BACKUP_SECRET_ACCESS_KEY` | Secret paired with the R2 backup access key |

Every Wrangler object and database command below says `--remote`. Omitting it can operate on an empty local
store and produce a success-looking result without touching Cloudflare.

## Restore `yomu-support`

Do not import over the production database. Create a replacement, verify it, then change the reviewed binding.

```bash
npx wrangler r2 object get \
  yomu-durability-backups/d1/latest.json \
  --remote \
  --file /tmp/yomu-d1-latest.json

# Read the yomu-support schema and data objectKey/sha256 pairs from the manifest.
npx wrangler r2 object get \
  yomu-durability-backups/<yomu-support-schema-objectKey> \
  --remote \
  --file /tmp/yomu-support.schema.sql.gz
npx wrangler r2 object get \
  yomu-durability-backups/<yomu-support-data-objectKey> \
  --remote \
  --file /tmp/yomu-support.data.sql.gz
shasum -a 256 /tmp/yomu-support.schema.sql.gz /tmp/yomu-support.data.sql.gz
gunzip -k /tmp/yomu-support.schema.sql.gz
gunzip -k /tmp/yomu-support.data.sql.gz

npx wrangler d1 create yomu-support-restore-YYYYMMDD --location weur
npx wrangler d1 execute yomu-support-restore-YYYYMMDD \
  --remote \
  --file /tmp/yomu-support.schema.sql
npx wrangler d1 execute yomu-support-restore-YYYYMMDD \
  --remote \
  --file /tmp/yomu-support.data.sql
npx wrangler d1 execute yomu-support-restore-YYYYMMDD \
  --remote \
  --command "SELECT COUNT(*) AS donation_events FROM donation_events;"
```

Compare the digest with the manifest and verify the expected tables and donation count. Update
`workers/yomu-support/wrangler.jsonc` to the replacement database ID, deploy, check `/status`, and retain the
old database until payment reconciliation has passed.

## Restore `yomu-academy`

Use a new database so the current account and entitlement records remain available during verification.

```bash
# Read the yomu-academy schema and data objectKey/sha256 pairs from the manifest.
npx wrangler r2 object get \
  yomu-durability-backups/<yomu-academy-schema-objectKey> \
  --remote \
  --file /tmp/yomu-academy.schema.sql.gz
npx wrangler r2 object get \
  yomu-durability-backups/<yomu-academy-data-objectKey> \
  --remote \
  --file /tmp/yomu-academy.data.sql.gz
shasum -a 256 /tmp/yomu-academy.schema.sql.gz /tmp/yomu-academy.data.sql.gz
gunzip -k /tmp/yomu-academy.schema.sql.gz
gunzip -k /tmp/yomu-academy.data.sql.gz

npx wrangler d1 create yomu-academy-restore-YYYYMMDD --location weur
npx wrangler d1 execute yomu-academy-restore-YYYYMMDD \
  --remote \
  --file /tmp/yomu-academy.schema.sql
npx wrangler d1 execute yomu-academy-restore-YYYYMMDD \
  --remote \
  --file /tmp/yomu-academy.data.sql
npx wrangler d1 execute yomu-academy-restore-YYYYMMDD \
  --remote \
  --command "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;"
```

Verify account, entitlement, issued-code, migration, and SRS row counts against the incident record. Update
the database ID in `wrangler.academy.jsonc`, deploy, and run the account/payment proof before directing traffic
to the replacement.

## Restore `yomu-dictionaries`

Create a replacement bucket and copy from the backup. Do not use `--delete` in either direction.

```bash
npx wrangler r2 bucket create yomu-dictionaries-restore-YYYYMMDD
aws s3 sync \
  s3://yomu-dictionaries-backup/ \
  s3://yomu-dictionaries-restore-YYYYMMDD/ \
  --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --only-show-errors

aws s3api list-objects-v2 \
  --bucket yomu-dictionaries-backup \
  --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --output json > /tmp/dictionary-backup.json
aws s3api list-objects-v2 \
  --bucket yomu-dictionaries-restore-YYYYMMDD \
  --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --output json > /tmp/dictionary-restore.json
node scripts/verify-r2-mirror.mjs /tmp/dictionary-backup.json /tmp/dictionary-restore.json
```

Bind the replacement bucket only after `scripts/dictionaries/verify-live.mjs` passes against a temporary,
non-public Worker route.

## D1 Time Travel

D1 Time Travel is always on for production D1 databases. It can restore the same database to a minute-level
bookmark within the plan's retention window (currently 30 days on Workers Paid and 7 days on Workers Free).
It is the quickest response to a bad migration or accidental `UPDATE`/`DELETE`.

Time Travel is not an independent backup. It overwrites the database in place, cannot currently clone a
database, and its history is unavailable after that database or the Cloudflare account is deleted. The dated
SQL exports provide the separate restore path and longer-lived history, although R2 in the same account also
does not survive account deletion. Account-loss coverage requires an independently owned off-account copy.

Official references:

- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [R2 S3 API](https://developers.cloudflare.com/r2/get-started/s3/)
