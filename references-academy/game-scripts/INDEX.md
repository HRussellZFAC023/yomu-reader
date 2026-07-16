# Japanese game-script research index

**Accessed:** 2026-07-14

**Purpose:** private development research for Yomu Academy narrative craft.

**Product boundary:** none of the dialogue in this directory may be copied, adapted, translated, or surfaced in Yomu. Only abstract craft findings may cross into product authoring.

## Downloaded sources

These are the only script copies stored locally. Each publisher states a licence that permits redistribution or use of the dataset. Archives are pinned to immutable commits; extracted copies retain their upstream README and licence.

| ID | Local archive | Extracted source | Upstream and revision | Rights statement | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `character-conversation` | `characterconversationdataset-b7f185a.tar.gz` | `sources/characterconversationdataset-b7f185a89d9f39b06f2d11a0040ca6956e4dbd78/` | [matsuvr/characterconversationdataset](https://github.com/matsuvr/characterconversationdataset/tree/b7f185a89d9f39b06f2d11a0040ca6956e4dbd78) | Apache-2.0; README identifies it as dialogue extracted from the author's former doujin game and permits any use | `1772f55f598105db0bf9758ff901d8afd3bbb9c42d28d5439bee494c52c7bd80` |
| `ojousama-talk` | `ojousama-talk-589f3b5.tar.gz` | `sources/OjousamaTalkScriptDataset-589f3b52324cc12ad3fb0b2ebe1520bbffce4087/` | [matsuvr/OjousamaTalkScriptDataset](https://github.com/matsuvr/OjousamaTalkScriptDataset/tree/589f3b52324cc12ad3fb0b2ebe1520bbffce4087) | MIT; original character-conversation prompts and responses | `7015a09ad949b16fcb4a25c42b5ee273917192f559fee9a397e76fd4eca2dce1` |
| `rosebleu` | `rosebleu-b8a1698.tar.gz` | `sources/Rosebleu-b8a169893c87611c7c1c76d78acd1cbe3273a146/` | [open_contents_datasets/Rosebleu](https://gitlab.com/open_contents_datasets/Rosebleu/-/tree/b8a169893c87611c7c1c76d78acd1cbe3273a146) | Apache-2.0; the project says the former rights-holder supplied ten game scenarios for unrestricted commercial/non-commercial dataset use; copyright notice `(C)Rosebleu` | `34d5633cd39af0a724fd6566022292561a50df7bb4f3990df753b6a6e59ea1a3` |

The [Japanese Open Content Datasets project](https://open_contents_datasets.gitlab.io/project_home/) says its scenarios are distributed with rights-holder permission and commercial-friendly licences. The Rosebleu corpus includes adult-game material. Files whose basename ends in `h_converted` are excluded from Yomu research and all aggregate measurements.

## Citation-only sources

These sources are publicly readable and useful for structural study, but their underlying game dialogue is not licensed for repository redistribution. No local transcript copy is stored.

| Reference | What was studied | Copy decision |
| --- | --- | --- |
| [Pokemon Red/Blue/Yellow game script by mtkennerly](https://gamefaqs.gamespot.com/gameboy/367023-pokemon-red-version/faqs/48982) | location-sized encounters, repeated utility language, NPC role compression, progression callbacks | The document wrapper is CC-BY-SA 4.0, but its own notice excludes verbatim game dialogue and characters. Citation only. |
| [pret/pokered](https://github.com/pret/pokered) | event/text separation, map-scoped script organization, state-gated dialogue | Public reverse-engineering repository with no repository licence file at the inspected revision. Citation only. |
| [Persona 3 Social Link Script](https://gamefaqs.gamespot.com/ps2/932312-shin-megami-tensei-persona-3/faqs/50317) | rank cadence, recurring locations, choice placement, bond escalation | No reusable transcript licence found. Citation only. |
| [Persona 4 Golden Social Link Script](https://gamefaqs.gamespot.com/vita/641695-persona-4-golden/faqs/65710) | ten-rank relationship arcs, optional scenes, callback payoffs | No reusable transcript licence found. Citation only. |
| [Persona 5 Royal: Sojiro Confidant](https://megamitensei.fandom.com/wiki/Confidant/Sojiro_Sakura) and [Yusuke Confidant](https://megamitensei.fandom.com/wiki/Confidant/Yusuke_Kitagawa) | activity-linked bonding, gate conditions, choice-to-affinity distinction, mechanical rewards | Wiki contribution terms do not grant rights in quoted Atlus dialogue. Citation only. |
| [Video Game Dialogue Corpus](https://github.com/seannyD/VideoGameDialogueCorpusPublic) | machine-readable representation of speakers, actions, aliases, nested choices, provenance, and error checks | Useful research method, but the repository does not include a top-level content licence and fetches third-party scripts. No corpus build or transcript copy stored. |

## Handling rules

1. Keep downloaded research under `references-academy/game-scripts`; never import it into `src`, `public`, lesson shards, prompts, tests, or generated assets.
2. Use no source sentence, close paraphrase, named plot device, proprietary character, location, UI wording, or distinctive joke in Academy.
3. Record only aggregate measurements and generalized craft observations in `RESEARCH-SYNTHESIS.md` and `docs/academy/story/`.
4. A new source enters `sources/` only after a pinned revision, explicit content licence, retained attribution, archive hash, and adult/private-data review.
5. Citation-only references remain links. Public accessibility alone is not permission to mirror.
