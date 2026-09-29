# One dictionary store per extension installation

Reconsidered 18 September 2026. Retain shared ownership; reject the former timeout fallback. [ADR-0014](0014-dictionary-probe-failure-does-not-change-ownership.md) defines discovery failure, and [ADR-0015](0015-dictionary-calls-retain-the-callers-reset-generation.md) defines reset safety.

Imported dictionaries belong to the extension, not every website it visits. A page-local fallback recreates storage duplication and inconsistent lookups. If the host is unavailable, the operation fails visibly. It is never replayed against another store. Userscripts without an extension runtime retain their direct store; that is a separate distribution constraint.

The current host uses the extension-origin database and compiler-prefixed storage directly. It must not recurse through the content-side GM bridge or pull page-only storage into the background bundle. Long operations retain an active Port and are serialized, including deferred index work. Every request retains its caller's learning target and reset generation.

The compiler integration and proxy are replaceable choices. Keep one owner, bounded transfers, explicit failures and ordered mutations; do not preserve reflection or compiler adapters for their own sake.

## Acceptance still required

- One import is available in Study and ordinary Reader tabs without a page database copy.
- Worker suspension, failed discovery and lost connections cannot split ownership or silently replay a mutation.
- Reset rejects stale callers while fresh tabs can import and read again.
- Existing page-local dictionaries have an explicit recovery path before any retirement purge.

Compiled-host and package tests cover parts of this contract. They do not substitute for an installed-browser run.
