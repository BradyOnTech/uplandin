# German Shorthaired Pointer — implementation outcome

The GSP is implemented as a breed-specific low-poly sculpt on the shared
action-ready canine rig. It is selectable in the live 3D preview and uses the
same contact-first walk, trot, canter and gallop system as the English Setter.

## Delivered visual read

- Short, firm, deep-and-tucked torso with a strong rear assembly
- Broad head, long deep muzzle, large nose and close-hanging ears
- Compact paws and no Setter feathering
- Horizontal docked tail at roughly 40% of natural length
- Four legal gameplay coats: liver roan, liver and white, solid liver, and
  black roan
- 568 triangles and 27 draw calls in the capture audit

## Delivered motion character

- Economical, ground-covering canter/lope with lower vertical action than the
  English Setter
- Breed-scaled stride and cadence rather than one universal dog speed
- Contact-locked paws, articulated scapulae/carpus/hocks, and release blending
- Stride-boundary gait changes and queued turn-aware canter/gallop lead changes
- Search motion driven by quartering, head probes, pelvis counterbalance and
  tail-rudder action rather than exaggerated topline roll

## Preview

Run `npm run dev:3d`, then open:

`http://localhost:4517/index3d.html?breed=gsp&coat=liver-roan`

Use the **Dog breed** and **GSP coat** selectors to compare the GSP against the
English Setter and inspect all coat variants.

## Evidence and references

- Breed-standard and motion research: [reference-research.md](./reference-research.md)
- Locomotion research shared by both breeds: [../../canine-locomotion-research.md](../../canine-locomotion-research.md)
- Automated coverage lives in `test/germanShorthairedPointer.test.ts`,
  `test/breeds.test.ts`, `test/huntMotion.test.ts`, and `test/locomotion.test.ts`.

The external reference images and models were used for observation only; no
third-party mesh, animation, texture or copyrighted asset is shipped.
