# GSP gait pairing audit

The exported walk had a real step-order error. The trot already paired the left forepaw with the right hindpaw, alternating with the other diagonal. Correcting the walking offsets changed all seven walk-family clips; the trot was left unchanged.

**Measured exported motion**

`tools3d/audit-gait.mjs` samples the actual GLB skin at 120 phases per clip. It selects low paw vertices by their physical rest-space location, independently of bone names, skin-group names and the manifest's contact offsets. It also samples the exported contact markers. In this asset's +Z forward / +Y up coordinates, anatomical left is +X; the physical paw clusters and named markers agree.

The original hero hash `8eef9c491601217d53782ab398119b7b44b4731758c2c0d22a0c2503b78141d1` reached forward paw extrema in the order FL → HL → FR → HR, at approximately 0, 0.242, 0.483 and 0.758 of the walking cycle. The skin and markers both showed that order. This was an authored walking-sequence error, not evidence that the exported trot was pacing.

The corrected hero hash `9d4fec6ae66a133bd7ef46b7caaa697df8b4d7b73f7694c2462feb5e329689ff` passes the physical walk order FL → HR → FR → HL. Its trot retains diagonal fore-aft correlations of approximately 0.999995 and 0.999994, with same-side correlations around −0.99894. The durable reports are `gait-evidence/exported-before.json` and `gait-evidence/exported-after.json`; both include measured ranges, phases, selection counts and explicit regression tolerances.

The optional `--verify` mode fails the pre-fix exported skin and passes the corrected skin. It requires at least 5 cm of paw travel, the measured walking order with each forward peak within 0.08 of its quarter-cycle target, diagonal trot correlation above 0.95 and same-side correlation below −0.90. These are bounded motion regressions; they do not approve the animation's weight, anatomy or artistic finish.

**Actual runtime comparison**

The immutable integration bundle `boot3d-BHq7gkFx.js` was tested with ordinary headed browser input from entry through settled point. A passive observer recorded 2,742 rendered frames. The analysis excludes the first 250 ms after each clip switch and compares each paw immediately before terrain/stance IK with its solved position in the same frame, transformed through the inverse actual root quaternion.

There were 2,384 stable trot samples spanning all 24 phase bins. Diagonal correlations were 0.999839 / 0.999837 before IK and 0.999857 / 0.999861 after IK. Same-side correlations stayed negative, around −0.9988 before and −0.9976 after. No corrective-paw samples occurred in this interval. This opening trot does not show a pacing conversion in the runtime.

The runtime did not select a stable walk long enough to certify walking order in this run. That limit is explicit in `gait-evidence/runtime-trot.json`. Normal turns, corrective replants, broader gait transitions and subjective motion quality remain separate checks. Other workstation jobs were active, so this run is not standalone performance evidence.

**Labeled visual evidence**

`gait-evidence/walk-four-phases.png` and `gait-evidence/trot-four-phases.png` render the actual corrected GLB at phases 0, 0.25, 0.5 and 0.75. Amber labels identify left front and right hind; blue identifies right front and left hind. The images are explicitly staged raw-asset diagnostics, with no game terrain correction. They are not ordinary-camera screenshots or final visual approval.

**Reproduce**

```sh
node tools3d/audit-gait.mjs --verify --out artifacts/3d/gait-audit
node tools3d/review-gait.mjs --clip walk --out artifacts/3d/gait-audit
node tools3d/review-gait.mjs --clip trot --out artifacts/3d/gait-audit
node tools3d/audit-runtime-gait.mjs --url http://localhost:4173 --headed --out artifacts/3d/runtime-gait-audit
```

The runtime command requires a production preview with the read-only `preIK` and root-quaternion audit fields. It changes only diagnostic sample buffers and sends ordinary keyboard/pointer input; it does not set dog pose, clip, phase, simulation state or contact state.
