# ADR 0012: Reader surfaces share one Settings Authority

- Status: Accepted
- Date: 2026-08-15

## Context

Yomu exposes the same Reader settings from ordinary websites, hosted Study, and
the packaged browser-extension Study page. The UserScript Compiler stores
extension content-script GM values under a compiler-owned physical prefix in
`browser.storage.local`. Packaged Study did not load that facade, so its generic
extension fallback wrote the same logical settings keys without the prefix.
The two surfaces could each report a successful save while reading different
physical values.

Hosted Study has a separate readiness boundary. Its page-world bundle may load
before an installed userscript exposes the GM storage bridge. Awaiting first-run
target choice before subscribing to that bridge allowed provisional page-local
defaults to hold onboarding open even when authoritative chosen settings arrived
moments later.

Backup import compounded the symptoms: its multi-store work left the old form's
Save action active. A stale Save could race the import, and replacement of that
form made the stale completion deliberately silent.

## Decision

Reader settings have one **Settings Authority**:

1. Userscript managers expose it through GM storage. Browser-extension builds
   use the UserScript Compiler's prefixed logical namespace and background
   message protocol. Packaged Study installs a narrow generated storage adapter
   before its app bundle; it exposes only the GM storage functions Yomu uses,
   propagates durable failures, and receives prefixed `storage.onChanged`
   notifications. It does not emulate `GM_info`, network APIs, or the compiler's
   whole content runtime.
2. Hosted Study subscribes to the userscript storage bridge before resolving a
   learning target or waiting on onboarding. Bridge readiness triggers an
   immediate authoritative sample. Chosen persisted settings retire a
   provisional chooser without writing provisional defaults back.
3. Settings backup import is one coordinated, in-process restore. Save and
   competing actions in the current settings surface remain locked until stored
   values, dictionaries, settings, and intent are committed. An older
   permission-delayed Save is
   invalidated; a caught failure before final settings publication runs the
   compensation journal, restores the prior live settings, and unlocks
   whichever form is current.
4. The unprefixed extension Study namespace from affected releases is
   recovery-only. Within the same managed-state epoch, a chosen stranded record
   may populate an absent or unchosen canonical record. A chosen canonical
   record always wins an ambiguous dual-chosen conflict; the losing raw bytes
   remain available for explicit backup recovery rather than being merged or
   destroyed automatically.
5. Factory Reset is the only automatic destructive path for those legacy raw
   bytes. Packaged Study clears them directly; hosted Study delegates the same
   filtered purge through its installed extension/userscript bridge. The reset
   fails closed if deletion cannot be verified, and never removes unrelated or
   compiler-prefixed physical keys through the raw cleanup path.

## Consequences

- A packaged Study save is visible to already-open extension Reader tabs and to
  later page loads; website saves are likewise visible to an open Study page.
- A storage rejection cannot appear as a successful Study save.
- Fresh hosted Study may briefly paint provisional setup, but it cannot remain
  blocked after authoritative chosen settings arrive.
- Ambiguous settings from two previously independent chosen namespaces require
  an explicit learner recovery choice or backup re-import; timestamp guessing
  and field-wise merges are rejected because neither proves intent.
- Restore compensation is process-local. The learner must keep Study open until
  it reports a result; terminating the browser mid-restore cannot run the
  in-memory storage and dictionary rollback. A crash-durable journal would need
  a separately designed persistent shadow for potentially large dictionaries.
- A storage backend failure after the final settings write can make the commit
  outcome unknowable to that tab. The restore does not claim that this rare
  post-publication case was rolled back; durable commit receipts would require
  a broader storage protocol.
- The restore interlock is local to the active settings surface. Learners should
  not run another settings export, cloud sync, or dictionary mutation from a
  second tab during restore; excluding those cross-realm operations would
  require a shared restore lease and protocol.
- Extension packaging must extract the compiler prefix, include the narrow
  adapter in Chrome, Firefox, and Safari packages, load it before Study, and
  verify unpacked/archive byte parity.
- Future persistent Reader surfaces must use the Settings Authority Interface;
  adding another same-shaped browser-storage fallback is an architectural
  regression.

## Rejected Alternatives

- **Keep raw and prefixed settings synchronized:** recreates two writers and
  cannot resolve concurrent or partial transactions safely.
- **Load the entire compiler runtime in Study:** adds unrelated capabilities,
  changes cloud-sync identity through `GM_info`, and inherits swallowed write
  failures.
- **Choose the newest-looking record:** separate namespaces do not share a
  trustworthy wall-clock or sequence authority.
- **Restore public storage attributes or secrets in the DOM:** unrelated to the
  authority problem and violates the existing privacy boundary.
