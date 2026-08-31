# Shared search-to-point sequence

The 2D `Dog` simulation remains authoritative for hunting behavior. The 2D
`FieldScene` and the Three.js dog are presentation adapters over the same
state, target bird, timing, movement, and point outcome.

## Sequence

| Beat | Simulation behavior | Presentation read |
| --- | --- | --- |
| Search | Existing wind-aware cover casts, edge work and interior quartering | Breed cadence, flexible torso, independent head and tail |
| Checking | Stops briefly and faces the scent cone | Head up; existing scent audio cue and 2D point frame |
| Locating | Makes tightening lateral casts toward the source | Purposeful trot, counter-scanning head and active tail |
| Stalking | Roads directly and slows near point range | Low neck, forehand weight, firm topline, quieting tail |
| Locking | Stops before bird pressure begins | Body settles and pointing foreleg folds progressively |
| Point | Existing authoritative point state | Breed-specific finished point pose |

The public presentation facts are `Dog.scentStage` and
`Dog.scentProgress`. Renderers do not choose targets or advance stages.

## Breed character

`scentApproachStyle()` derives timing, locate arc, and approach pace from the
existing breed steadiness, search looseness, head freedom, and maturity. This
keeps the breed interface small and automatically gives future breeds a
coherent sequence:

- English Setter: more deliberate check and settle
- German Shorthaired Pointer: efficient, moderate locate and controlled stalk
- English Pointer: quicker, wider locating action

## Verification

- `test/dog.test.ts` asserts the complete ordered sequence, clean scent loss,
  reliable point completion, and breed distinctions.
- `tools3d/capture.mjs` provides `review-scent-checking`,
  `review-scent-locating`, `review-scent-stalking`, and
  `review-scent-locking`, each staged by the real deterministic simulation.
