# OpenAI Image Recovery

## Stores

- Direct Codex image outputs: `/Users/heru/.codex/generated_images/`
- Founding Academy thread: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/`
- Donor OpenAI production: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/`
- Preserved references: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/characters/claude-production/refs/`

The generated-image store currently contains 346 raster outputs across 236 task directories. A file's presence proves generation, not quality or provenance suitability.

## Approved now

The five founding-thread outputs and the three `codex-production-v1` manifest families are individually named in `ART-AND-AUDIO-LEDGER.md`. The painterly campus ensemble, rainy directions, classroom tutoring, and Rie portrait are visual anchors. The photoreal door is rejected.

`quality-2.webp`, `quality-3.webp`, `quality-4.webp`, and `quality-5.webp` are approved as the four protagonist identities. Their runtime variants must be normalized to the warm pixel-painted cast style before shipping. `quality-1.jpg` is excluded. Exact-hash scanning found no duplicate of `quality-5.webp`; the recovery index still checks perceptual similarity across all tasks.

## Recovery pass

Build `art-recovery-index.json` from task directory, output path, dimensions, hash, perceptual hash, alpha coverage, transcript/task ID, prompt excerpt, and any copied runtime destination. Then generate contact sheets grouped by task and visually review them against the anchors.

Classify each image as:

- `approved-runtime`: quality, provenance, likeness, and a scene home are all known;
- `approved-reference`: useful for composition or style but not shipped;
- `review`: promising but missing identity or prompt evidence;
- `reject`: weak, duplicate, wrong style, Python/external generation, fake alpha, or no product home.

Never approve an entire directory by name. Never delete the originals during recovery. The production app consumes only a new explicit manifest of approved paths.

## Missing production after recovery

- consistent OpenAI sprite sets for every classmate;
- protagonist portrait choices;
- Mary, Takeshi, Miller, Tawapon, and selected textbook guests;
- location variants needed by the final map geography;
- event CGs for major emotional turns from N3 through N1;
- lesson diagrams and mnemonic scenes linked to exact concepts;
- worksheet image reconstructions tracked by source region.
