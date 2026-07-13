# Reference-wiki pattern research for Yomu Academy

**Updated:** 2026-07-12
**Status:** `blocked-pending-fandom-written-permission`

This is a provisional research and originalisation contract, not a completed inventory. A site-wide automated run has not been performed, continuation exhaustion has not been observed, and no page-level coverage claim is made.

## Exact current state

| Measure | State |
| --- | --- |
| Namespace requested | MediaWiki namespace `0` |
| Site-info article statistic observed on 2026-07-12 | `14,481` |
| Fully enumerated namespace-0 pages | Not established |
| Enumeration continuation exhausted | `false` |
| Pages enriched and dispositioned | Not established |
| Every enumerated page has a disposition | `false` |
| Complete design synthesis | `false` |

The `14,481` figure is the API's `siteinfo.statistics.articles` value. It is not an enumeration count and must never be substituted for one: MediaWiki's article statistic and `list=allpages` can use different inclusion rules, particularly around redirects.

Limited API probes established that the site was running MediaWiki `1.43.8`, namespace `0` was the content namespace, and `siteinfo.rightsinfo` reported `CC-BY-SA` with Fandom's licensing URL. The probes also confirmed that unrestricted `pageprops` can expose article descriptions and embedded image metadata. The planned client therefore requests only the `disambiguation` page property and does not request article content, extracts, parsing, images, or infobox values.

## Access-authorisation blocker

Fandom's current [Terms of Use](https://www.fandom.com/terms-of-use), last revised 19 December 2025, prohibit automated retrieval and automated access without express written permission. Fandom also publishes [bot guidance](https://community.fandom.com/wiki/Help:Bots) and exposes the MediaWiki Action API, but those facts are not treated here as overriding the express-written-permission language.

The site-wide crawl must remain paused until the operator confirms that written permission has been obtained. The future CLI must enforce this boundary before its first fetch through an explicit `--fandom-permission-confirmed` flag. The flag records an operator assertion; it does not obtain permission or prove legal compliance.

## Rights and originalisation boundary

Fandom's [licensing policy](https://www.fandom.com/licensing) says wiki text is generally available under CC BY-SA 3.0 unless a community states otherwise. That licence does not grant rights in third-party game names, characters, settings, stories, visual identity, interface design, or art. It is also separate from the platform's access terms.

The research boundary is therefore stricter than the text licence alone requires:

- do not fetch or commit article prose, quotations, images, audio, wikitext, rendered HTML, or infobox values;
- keep source titles, canonical slug URLs, category names, and template names only in the ignored local cache;
- use numeric `curid` and `oldid` references, revision IDs, timestamps, and revision SHA-1 values for committed traceability;
- commit only abstract pattern counts and wholly original Academy wording;
- reject any synthesis containing a cached title, category, template string, protected name, source slug, or unapproved output key;
- treat a zero-signal page as `low-confidence`, and a missing, redirect, or irrelevant page as an explicit disposition instead of inventing a connection.

This file intentionally contains no source-page names, category or template strings, article wording, source UI, screenshots, or art.

## Resumable inventory contract

The authorized crawler should use two independent phases through the Action API:

1. Enumerate `list=allpages` with `apnamespace=0`, `apfilterredir=all`, and `aplimit=max`, passing the returned continuation object until a response has no `continue` member.
2. Enrich immutable batches of at most 50 page IDs with `prop=info|categories|pageprops|revisions|templates`, `inprop=url`, `rvprop=ids|timestamp|sha1`, `ppprop=disambiguation`, `tlnamespace=10`, `cllimit=max`, and `tllimit=max`. Every category/template continuation must be followed.

Requests should be serial by default, carry a descriptive contactable user agent and `maxlag=5`, respect `Retry-After`, use bounded exponential backoff, and cap optional concurrency at three. This follows [MediaWiki Action API etiquette](https://www.mediawiki.org/wiki/API:Etiquette/en), but does not replace Fandom permission.

Each run belongs under ignored `artifacts/yomu-academy/megaten-wiki/<run-id>/` and carries one immutable site/configuration fingerprint. Enumeration responses and enrichment batches are written atomically. A dedicated exhaustion proof is written only by the code path that sees a response without continuation, and it records the SHA-256 of that saved response. Mixing run IDs or site/configuration fingerprints is a hard failure.

For every enumerated page, the ignored inventory stores factual metadata and one disposition. Allowed abstract patterns are:

- `mechanic-loop`
- `item-affordance`
- `calendar-social-structure`
- `location-world-state`
- `ui-feedback`
- `lore-function`

Allowed dispositions are `pattern`, `low-confidence`, `irrelevant`, `redirect`, and `deleted-during-run`. Summaries are assembled only from allowlisted generic sentences and matched rule IDs; source expression never enters a summary.

## Completion validators

A future run is complete only when all of these are true:

- the hashed enumeration-exhaustion proof verifies;
- namespace, ordering, page-ID, and title uniqueness checks pass;
- every enumerated ID occurs in exactly one completed enrichment batch;
- every property continuation is exhausted;
- every enumerated ID occurs exactly once in the classified inventory;
- every inventory record has exactly one allowed disposition and only allowed, sorted pattern IDs;
- redirect and missing states agree with their dispositions;
- revision and canonical URL metadata is present whenever the API supplied it;
- generated totals reconcile exactly with page-level records;
- the committed synthesis contains only allowlisted fields and no cached source strings;
- the synthesis records the SHA-256 of the complete ignored inventory.

The live site-info article statistic is recorded as a comparison value, never asserted as the expected enumeration total.

## Original Academy candidate vocabulary

The following names are an original design vocabulary for later synthesis. They are not findings from the wiki and carry no evidence claim until an authorized, validated inventory maps abstract patterns to them.

### Curriculum and practice

- **Evidence Ladder:** a short practice loop that moves from cue recognition to constrained production, feedback, repair, and one immediate retry.
- **Constraint Workshop:** learners combine limited grammar and vocabulary affordances to satisfy an original campus task, with multiple valid solutions.

### Campus and world state

- **Mastery Weather:** original campus spaces change study affordances according to recent learner evidence, time, and season without punishing absence.
- **Return Routes:** unresolved errors leave optional, clearly signposted practice opportunities in places the learner already knows.

### Schedule and relationships

- **Reciprocal Appointments:** calendar invitations become paired practice commitments; rescheduling is safe and relationship progress depends on useful participation, not grinding.
- **Study Circles:** classmates contribute different scaffolds to one learning goal, making social structure a choice of support rather than a stat gate.

### Learning tools and rewards

- **Pocket Instruments:** earned, reusable study tools expose a hint, replay a sound, segment a sentence, or request a contrast without changing assessment truth.
- **Repair Kit:** recurring mistakes yield focused materials that learners assemble into an original corrective exercise.

### Feedback and navigation

- **Evidence Compass:** a compact recommendation explains which skill needs evidence next while keeping every campus route available.
- **Resonance Check:** immediate feedback separates comprehension, recall, pronunciation, and confidence so one success signal never hides another weakness.

### Narrative function

- **Learner Memory Archive:** wholly original places preserve learner-authored memories and prior evidence, turning review into continuity without borrowing lore.
- **Rumour Laboratory:** original campus rumours invite learners to verify claims through Japanese input, evidence comparison, and accountable correction.

## Resume and handover

After written permission is confirmed, implement and test the permission-gated client, then run the authorized `all` command to continuation exhaustion. Re-run classification offline to close obvious rule gaps, validate twice for deterministic output, generate the aggregate synthesis, and inspect the diff for any cached source-string leak. Until those steps pass, the Stage 5 backlog item remains open and this document must retain its blocked status.
