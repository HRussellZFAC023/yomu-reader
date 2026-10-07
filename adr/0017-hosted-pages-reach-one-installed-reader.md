# Hosted pages reach one installed Reader

Status: implemented locally, 30 September 2026. Installed-browser proof remains separate.

## Context

Hosted Yomu pages (Study, Academy, the PDF and video readers) run in the page world and reach an installed Reader through DOM-event bridges for GM storage and HTTP. The packaged extension's userscript body starts only after its storage hydrates (`__USC_READY`), so it arrived after a userscript manager and often after page scripts. The page then pinned the userscript or its own website store and epoch. When the extension took over, saves failed, reads fell back to defaults, reset and backup threw "owner changed", and with both installed every hosted HTTP request (JPDB reviews, Anki `answerCards`) ran twice.

## Decision

1. The packaged content script announces the extension synchronously at `document_start`, before any page script, by writing the installed-runtime marker (`scripts/lib/extension-runtime-hardening.mjs`). A later userscript never demotes that announcement.
2. On a trusted hosted page, an announced installed Reader is the page's only storage authority. Page requests wait, bounded, for that Reader's responder; they never fall back to the website store. The first ready responder stays pinned; a later change rejects with "reload to reconnect".

   HTTP requests wait only while the announced Reader starts, that is until its storage responder is ready. `entry.ts` installs the HTTP responder only once a Learning Target is chosen. A Reader that has started without one therefore has no target yet, and requests take the no-bridge fetch path, as in v1.9.3, until it announces an HTTP responder. The onboarding sample lookups on a fresh install are the main example.

   7 October 2026: ADR-0024 removed the target gate. There is no learning-target choice or onboarding, so `entry.ts` always installs the HTTP responder.
3. Each bridge publishes its responder's owner id and kind. Requests carry the owner id and every other responder ignores them. A userscript responder stands down when the extension is announced, and an extension responder takes over a userscript one. A v1.9.3 page or responder without owner ids still works; an unaddressed request is served only by the current owner.
4. The Website-only Store (what a visitor saved on a Yomu website without an install) is adopted into an installed store as v1.9.3 did, within limits. Adoption happens only while that store holds no settings, or settings with `learningTargetChosen: false`; a record without the flag is left alone rather than judged. It fills only keys the store lacks, takes only records of the same epoch, and adopts settings and intent ledger together, into a store that has neither. Nothing is written back to the website store.

   7 October 2026: ADR-0024 restates the first limit. Adoption happens only while the installed store holds no learner choice: no settings, no recorded settings intent, or settings with the explicit `learningTargetChosen: false` that builds before 2.1 wrote. The other limits are unchanged.

   This reverses an earlier decision. It supersedes the ADR-0012 sentence "Page-local hosted storage is still not promoted into an installed userscript or extension store", and the 18 September removal of read-time promotion recorded in REBUILD.md ("Generic isolation repair" and "No-legacy model handoff integrated"). It restores v1.9.3's `hostedStoragePromotionValue` behaviour within the limits above. Without it, a visitor who installs after the update finds hosted Study empty. The earlier removal was aimed at merging and mirroring between stores, and the limits above still rule both out.
5. Factory reset, from any runtime, erases every Yomu key in the origin's page storage and every registered database there, as v1.9.3 did.

## Consequences

- A broken extension body now shows a visible storage failure on hosted pages instead of a silent website-store fallback.
- The website store and installed owners keep separate page-cache namespaces. An installed owner reads a v1.9.3 raw page record it has not written yet, while the raw area is certified for its epoch; off the Yomu website its first write supersedes that record.
- Loopback app routes and synthetic-event test seams are trusted only in development and test builds.
