# Character Art Dossier

This document explains how cast art enters Yomu Academy. The executable identity
authority is `src/academy/domain/cast-identity-locks.ts`; the sprite ownership
authority is `src/academy/domain/cast-standardization-manifest.ts`.

## House style

Rie-sensei is the ensemble anchor. Every cast member uses the same warm,
hand-drawn animated-adventure rendering:

- clean tapered ink lines and readable silhouettes;
- simplified painted colour planes rather than photographic skin detail;
- adult, expressive faces with restrained proportions;
- deep navy, moss, coral, paper cream, teal, and small gold accents;
- transparent full- or three-quarter-body cutouts with visible hands;
- one purposeful action per pose, grounded in a real story beat.

Reject photorealism, uncanny skin, 3D lighting, fashion-catalogue poses, baked
checkerboards, clipped limbs, text, signatures, and decorative identity props
that replace the person.

## Identity locks

The following corrections are fixed and may not be inferred from filenames:

| Runtime ID | Learner-facing identity | Non-negotiable lock |
| --- | --- | --- |
| `rie` | Rie-sensei | dark bun, fine glasses, navy and cream teacher outfit, notebook |
| `aakash` | Aakash | short black hair, neat beard, burgundy hoodie and indigo jacket; less realistic than the old portrait |
| `tom` | Tom | blond, fuller friendly face, clean-shaven |
| `sam` | Sam | very close-cropped chestnut crew cut with minimal crown and side volume |
| `francis` | Francis | soft sand-brown hair, gentle face, no glasses; never Tom |
| `christian` | Christian | Black man with tied-back hair and an athletic presence |
| `jenny` | Jenny | brown hair and a visibly round, warm face |
| `robert` | Robert | side-parted brown hair and square glasses |
| `mika` | Mika | blond man with black headphones, dark overshirt, moss knit |
| `xingyu` | Xingyu | East Asian woman with short hair or undercut, round glasses, singing energy |
| `angel` | Onke | learner-facing name is always Onke; long straight dark hair and organised presence |
| `stasi` | Stasi | auburn wavy hair, round glasses, expressive illustrated face |
| `ruparna` | Ruparna | South Asian woman with long dark hair; never the stale v1 caricature |
| `rose` | Rose | restore the original auburn headband and pink-cardigan identity; never use a held rose as her identity |
| `tom2` | the second Tom | tall, dark-brown hair, reserved, black notebook; clearly distinct from blond Tom |
| `nanako` | Nanako | distinct from Rose and Mira |
| `mira` | Mira | warm-blond hair, black cap, oversized blue hoodie, cream trousers, clear umbrella |
| `miller` | Miller | original textbook-legend office worker; never Mira |

All remaining locks, including Henry, Alex, Shin, Jodi, Sophie, Peter, Felix,
Shaun, Steve, Tawapon, Mary, and Takeshi, live in the executable identity table.
The old carry-over names and old worktree paths are not casting authority.

## Required performance set

Every person receives the same baseline performance coverage before their art is
called complete:

1. neutral;
2. encouraging/listening;
3. happy;
4. thoughtful;
5. determined;
6. surprised/shocked;
7. sad/vulnerable.

Story-specific poses are then added from
`docs/academy/art/STORY-ASSET-INVENTORY.json`. That inventory is generated from
all 48 chapter packages and records the exact scene, intent, prop, setting, and
runtime home. A generated image without a runtime home is unfinished work.

## Production sequence

1. Lock the neutral identity against the executable brief and approved anchor.
2. Render the neutral beside Rie-sensei at the same scale and lighting.
3. Reject identity or style drift before making variants.
4. Generate variants from the accepted neutral, never from another character.
5. Record each file under that character's folder and manifest ownership.
6. Bind the file to People, lesson, story, bond, or replay surfaces.
7. Mirror the production asset, hash it, and run the identity/orphan gates.
8. Verify ensemble staging on mobile and desktop before release.

The manifest tests fail when a path is under the wrong character folder, an
asset ID names a different person, identical bytes are assigned to two people,
the learner-facing name Angel appears, or a production sprite lacks a mirrored,
hash-matched runtime file.
