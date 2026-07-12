# Academy engine references

These repositories are read-only design references for Yomu Academy. Their working trees are shallow local clones and are intentionally ignored; Academy copies only small, reviewed mechanisms behind Yomu-owned interfaces.

| Repository | Pinned commit |
| --- | --- |
| ink | `35c63e52f1d36060930dc7ed3cfba38ea224b528` |
| inkjs | `1b17540a619021b551ecc4bc5bf873758e6b509b` |
| monogatari | `86659baf065178071f0956092f754e1d76be0072` |
| howler | `1d3053576a860e9854645493ad6c4a72c6cc6e45` |
| workbox | `62b9d8ba8eb3c1a2ab8aac9d84c90cda7865d6a3` |
| ts-fsrs | `cdec8d2f8340f8e62ced596c1da02e20e70073f0` |

Recreate the clones from the already-audited local mirrors:

```sh
for repository in ink inkjs monogatari howler workbox ts-fsrs; do
  git clone --depth 1 --no-local \
    "file:///Users/heru/Documents/Projects/yomu/references/academy-engine/${repository}" \
    "references/academy-engine/${repository}"
done
```

Verify every checkout against the table before using it. Adoption boundaries and exact files to inspect are in [`docs/academy/discovery/REFERENCE-CODE-HARVEST.md`](../../docs/academy/discovery/REFERENCE-CODE-HARVEST.md).
