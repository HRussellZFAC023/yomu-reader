# U46 lookup-link verification — 2026-07-30

These checks used the live result pages in Chrome. A link passed only when the
page rendered a result for the queried word. A homepage, search shell, access
wall, bot page, quota page or no-result page did not pass.

## YouGlish

| Link | Language | Word | Page showed |
| --- | --- | --- | --- |
| `youglish` | Arabic (`ar`) | `كتاب` | Bot detection page; no lookup result |
| `youglish` | Chinese (`zh`) | `水` | Bot detection page; no lookup result |
| `youglish` | Dutch (`nl`) | `huis` | Bot detection page; no lookup result |
| `youglish` | English (`en`) | `water` | Bot detection page; no lookup result |
| `youglish` | French (`fr`) | `eau` | Bot detection page; no lookup result |
| `youglish` | German (`de`) | `Haus` | Bot detection page; no lookup result |
| `youglish` | Greek (`el`) | `νερό` | Bot detection page; no lookup result |
| `youglish` | Indonesian (`id`) | `air` | Bot detection page; no lookup result |
| `youglish` | Italian (`it`) | `acqua` | Bot detection page; no lookup result |
| `youglish` | Korean (`ko`) | `물` | Bot detection page; no lookup result |
| `youglish` | Persian (`fa`) | `کتاب` | Bot detection page; no lookup result |
| `youglish` | Polish (`pl`) | `woda` | Bot detection page; no lookup result |
| `youglish` | Portuguese (`pt`) | `água` | Bot detection page; no lookup result |
| `youglish` | Romanian (`ro`) | `apă` | Bot detection page; no lookup result |
| `youglish` | Russian (`ru`) | `вода` | Bot detection page; no lookup result |
| `youglish` | Spanish (`es`) | `agua` | Bot detection page; no lookup result |
| `youglish` | Swedish (`sv`) | `vatten` | Bot detection page; no lookup result |
| `youglish` | Thai (`th`) | `น้ำ` | Bot detection page; no lookup result |
| `youglish` | Turkish (`tr`) | `kitap` | Quota exceeded page; no lookup result |
| `youglish` | Vietnamese (`vi`) | `nước` | Quota exceeded page; no lookup result |

The shared YouGlish link was removed because none of its 20 configured routes
showed a word result.

## Linguee

| Link | Language | Word | Page showed |
| --- | --- | --- | --- |
| `linguee` | Chinese (`zh`) | `水` | Chinese-English dictionary result, `水` noun and “water” |
| `linguee` | Danish (`da`) | `hund` | Danish external-source translation rows for `hund` |
| `linguee` | Dutch (`nl`) | `huis` | Dutch-English dictionary results for “house” and “home” |
| `linguee` | Finnish (`fi`) | `vesi` | Finnish external-source translation rows for `vesi` |
| `linguee` | French (`fr`) | `eau` | French-English “water” result with an example sentence |
| `linguee` | German (`de`) | `Haus` | Request-block page; no lookup result |
| `linguee` | Hungarian (`hu`) | `víz` | Hungarian external-source translation rows for `víz` |
| `linguee` | Italian (`it`) | `acqua` | Italian-English “water” result |
| `linguee` | Polish (`pl`) | `woda` | Polish-English “water” result |
| `linguee` | Portuguese (`pt`) | `água` | Portuguese-English “water” result with an example |
| `linguee` | Romanian (`ro`) | `apă` | Romanian external-source translation rows for `apă` |
| `linguee` | Spanish (`es`) | `agua` | Spanish-English “water” result with an example |
| `linguee` | Swedish (`sv`) | `vatten` | Swedish external-source translation rows for `vatten` |

The twelve result-backed routes remain. The German route was removed while it
returns a request block.

## Native dictionaries

| Link | Language | Word | Page showed |
| --- | --- | --- | --- |
| `maajim` | Arabic (`ar`) | `كِتاب` | Arabic dictionary heading and several definitions for `كتاب` |
| `khmerdict` | Khmer (`km`) | `ទឹក` | Several Khmer definitions and usage examples for `ទឹក` |
| `laoswords` | Lao (`lo`) | `ເສືອ` | Lao definition, pronunciation and English “tiger” translation |
| `longdo` | Thai (`th`) | `น้ำ` | Thai heading, 34 dictionary results, definitions and examples |

All four links place the query in the URL path. The existing path-template test
formats these exact words and verifies that each decoded path preserves its
diacritics.
