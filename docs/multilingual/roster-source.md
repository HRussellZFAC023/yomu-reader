<!-- Owner: multilingual-coordinator -->

# Frozen 32-language roster

## Derivation

The roster was frozen on 2026-07-23 from:

- Yomitan’s published [Supported Languages](https://yomitan.wiki/supported-languages/) list.
- MarvNC’s [Yomitan Dictionaries](https://github.com/MarvNC/yomitan-dictionaries) catalogue at commit `574961e823e33fb36b6b86778a0d6b606af29c25`.

Yomitan lists 34 supported languages. Japanese is removed because it is Slice 1’s learning target. Old Irish (`sga`) is removed because it is not represented in the frozen dictionary catalogue. The remaining 32 IDs are the immutable Slice 1 learner-language roster.

## Identities

| ID    | English name   | Native display name | Runtime locale | Default script | Other supported scripts | Direction |
| ----- | -------------- | ------------------- | -------------- | -------------- | ----------------------- | --------- |
| `sq`  | Albanian       | Shqip               | `sq`           | Latn           | —                       | LTR       |
| `grc` | Ancient Greek  | Ἑλληνιστί           | `grc`          | Grek           | —                       | LTR       |
| `ar`  | Arabic         | العربية             | `ar`           | Arab           | —                       | RTL       |
| `yue` | Cantonese      | 粵語                | `yue-Hant`     | Hant           | —                       | LTR       |
| `zh`  | Chinese        | 中文（简体）        | `zh-Hans`      | Hans           | Hant                    | LTR       |
| `da`  | Danish         | Dansk               | `da`           | Latn           | —                       | LTR       |
| `nl`  | Dutch          | Nederlands          | `nl`           | Latn           | —                       | LTR       |
| `en`  | English        | English             | `en`           | Latn           | —                       | LTR       |
| `fi`  | Finnish        | Suomi               | `fi`           | Latn           | —                       | LTR       |
| `fr`  | French         | Français            | `fr`           | Latn           | —                       | LTR       |
| `de`  | German         | Deutsch             | `de`           | Latn           | —                       | LTR       |
| `el`  | Greek          | Ελληνικά            | `el`           | Grek           | —                       | LTR       |
| `hu`  | Hungarian      | Magyar              | `hu`           | Latn           | —                       | LTR       |
| `id`  | Indonesian     | Bahasa Indonesia    | `id`           | Latn           | —                       | LTR       |
| `it`  | Italian        | Italiano            | `it`           | Latn           | —                       | LTR       |
| `km`  | Khmer          | ខ្មែរ               | `km`           | Khmr           | —                       | LTR       |
| `ko`  | Korean         | 한국어              | `ko`           | Kore           | —                       | LTR       |
| `lo`  | Lao            | ລາວ                 | `lo`           | Laoo           | —                       | LTR       |
| `la`  | Latin          | Latina              | `la`           | Latn           | —                       | LTR       |
| `mn`  | Mongolian      | Монгол              | `mn-Cyrl`      | Cyrl           | Mong                    | LTR       |
| `fa`  | Persian        | فارسی               | `fa`           | Arab           | —                       | RTL       |
| `pl`  | Polish         | Polski              | `pl`           | Latn           | —                       | LTR       |
| `pt`  | Portuguese     | Português           | `pt`           | Latn           | —                       | LTR       |
| `ro`  | Romanian       | Română              | `ro`           | Latn           | —                       | LTR       |
| `ru`  | Russian        | Русский             | `ru`           | Cyrl           | —                       | LTR       |
| `sh`  | Serbo-Croatian | Srpskohrvatski      | `sr-Latn`      | Latn           | Cyrl                    | LTR       |
| `es`  | Spanish        | Español             | `es`           | Latn           | —                       | LTR       |
| `sv`  | Swedish        | Svenska             | `sv`           | Latn           | —                       | LTR       |
| `tl`  | Tagalog        | Tagalog             | `fil`          | Latn           | —                       | LTR       |
| `th`  | Thai           | ไทย                 | `th`           | Thai           | —                       | LTR       |
| `tr`  | Turkish        | Türkçe              | `tr`           | Latn           | —                       | LTR       |
| `vi`  | Vietnamese     | Tiếng Việt          | `vi`           | Latn           | —                       | LTR       |

## Recorded uncertainty

- Yomitan support indicates that its lookup architecture recognizes a language; it does not guarantee identical morphology depth across languages.
- The catalogue is a hub of direct archives and links. Inclusion here does not prove that a high-quality Japanese-to-learner-language term dictionary exists for every row.
- Some linked dictionaries are conversions of commercial works. No archive may be mirrored until its individual provenance and redistribution rights pass the dictionary pipeline’s legal gate.
- `sh` and `tl` are retained to match Yomitan’s roster. Current `Intl`/CLDR implementations canonicalize them to `sr-Latn` and `fil`; `runtimeLocale` records that distinction.
- `grc` is a lookup language, but general-purpose UI translation services may return Modern Greek or lack Ancient Greek entirely. Its catalogue requires specialist review.
- `zh` defaults to Simplified Chinese without creating separate Simplified/Traditional roster rows. A future profile may override the script without changing the 32-language denominator.
