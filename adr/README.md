# Decisions under rebuild review

Reviewed 18 September 2026. Historical “accepted” labels are not fresh verification or a requirement to preserve the implementation. Keep a decision only when it serves the current product and survives the relevant tests. Git retains the earlier rationale and proposals.

| Decision | Rebuild disposition | Unfinished work |
| --- | --- | --- |
| 0001: learner event log | Retain shared learning identity; reconsider the claim that every Reader state already comes from one log. | Reconcile Academy events with the mutable local SRS deck and sync. Do not create duplicate review schedules. |
| 0002: sources and augmentation | Retain source provenance separate from authored teaching. | Assess pedagogical quality and licences; provenance alone is not a good lesson. |
| 0003: separate Academy delivery | Retain separation from the injected Reader. | Replace blanket offline downloads with measured, explicit content downloads; accommodate the native app. |
| 0004: route ownership | Rewritten. Existing classes and line limits are not the target. | Reduce caller coordination; prove route disposal and resume. |
| 0005: parsing and pitch | Retain evidence requirements provisionally. | Recheck actual parsing examples and pitch sources before changing the model. Do not preserve special cases without current evidence. |
| 0006: detached readings | Retain the no-host-layout-damage requirement. | Reassess the rendering approach with dense-page performance and real WebKit geometry, not node counts. |
| 0007: sentence audio | Capture proposal withdrawn; role separation retained. | Prove capture, local media ownership, playback and export across supported platforms. |
| 0008: target grammar | Retain target-scoped knowledge and honest capability claims. | Do not freeze rule counts, interface revisions or shallow multilingual coverage as product requirements. Review Japanese depth first. |
| 0009: reset | Retain stale-writer rejection and owned-data purge. | Reassess storage complexity while preserving learner data; fresh browser proof remains necessary. |
| 0010: shared dictionary host | Rewritten; timeout fallback rejected. | Installed-browser and old-page-dictionary recovery proof. |
| 0011: website locales | Rewritten; locale correctness retained, old theme/catalogue not mandated. | Rebrand and reviewed localized content. |
| 0012: settings authority | Rewritten; concurrency/crash gaps are no longer accepted user workarounds. | Durable restore recovery and cross-surface conflict handling. |
| 0013: lookup outcomes | Retain explicit failure/partial/complete results. | Real-provider recovery and browser acceptance. |
| 0014: dictionary discovery | Retain one owner and no mutation replay. | Installed-browser recovery. |
| 0015: caller reset generation | Retain immutable caller identity and scoped cleanup. | Installed-browser reset proof. |
| 0016: review ownership | Adopt task-specific destinations and provider-owned schedules; no forced Yomu queue. | Rework connections and action UX; prove each provider workflow end to end. |
| 0017: hosted page bridges | Adopt one announced installed Reader per page, single-responder bridges and v1.9.3 origin stores. | Installed-browser proof with extension, userscript and both. |
| 0018: review delivery | Adopt: claim only when deliverable, retry the certainly undelivered, hold only unknown outcomes with Check again/Discard. | Route online grades through the owner; real-provider interruption proof. |
| 0019: storage leases | Adopt: five-second, fenced leases for storage-only saves; one minute for leases held across provider requests. | Installed-browser proof of a suspended tab resuming mid-save on iOS and Safari. |
| 0020: provider-neutral word state | Adopt: ordinary-page word decoration never names Anki or a deck, card or account; the Anki colour channel paints there through the provider-neutral review lane, which marks words only while a channel paints it. | Installed-browser proof with extension and userscript; feed the status channel from the lane and stop projecting Anki state into `jpdb-*`; extend the lane, never `anki-*` classes, for new provider-specific paint. |
| 0021: grading service | Adopt: with JPDB and Jiten both connected, Automatic parsing and grades on page and subtitle words follow the chosen service; an unmatched word is not graded anywhere; Study review cards keep their owner and ⇄ switches one word. | Real-account proof that resolved grades land on the matching word. |

This review changes design guidance, not runtime completion status. Exact local test and package evidence lives in `REBUILD.md`; the full product scope remains open.
