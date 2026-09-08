# GSP contact correction evidence

The September 4 runtime review found two concrete animation defects: the lock clip's fade did not advance, and tight turns could relocate a supporting paw without lifting it. Both have been corrected in the skeletal runtime. The dog geometry in these captures is the earlier provisional asset; this report does not evaluate the later anatomy revision or establish final animation quality.

**Original observations**

The original [career report](dog-contact-evidence/before-career.json) recorded 99 qualifying support pairs, a mean horizontal drift of 2.98 millimeters and a maximum of 18.53 centimeters over 91 milliseconds. The [Quick Hunt report](dog-contact-evidence/before-quick.json) recorded 55 pairs, a mean of 4.00 millimeters and a maximum of 16.21 centimeters over 83 milliseconds. Those outliers remain preserved rather than being replaced by newer results.

The runtime reset a paw's anchor whenever its horizontal correction exceeded 16 centimeters. It left the contact weight, locked state and touchdown identifier unchanged. This was both an actual supporting-foot relocation and ambiguous telemetry identity. The Quick Hunt trace associated most resets with repeated quartering turns; counts stayed steady during the subsequent straight approach and return. The exact old outlier pairs did not retain adjacent yaw and reset values, so they cannot independently establish the cause of each individual jump.

Separately, the incoming lock action began a crossfade while the runtime called the mixer with zero elapsed time. A reproduction with the installed Three.js mixer kept the lock's weight at zero and its outgoing gait at one throughout the lock. Advancing the mixer released the old gait. The regression now exercises real mixer weights and confirms that the authored lock phase remains fixed while the fade advances.

**Runtime changes**

The Quail GSP now samples heading and position from the same adjacent fixed simulation snapshots. Heading interpolates through the shorter angular path. Only presentation changes; hunting decisions, movement authority and other dog renderers retain their existing behavior.

A paw that exceeds its bounded support correction now releases contact, follows a 0.1-second corrective swing with a 7.5-centimeter target lift, and acquires a new support point after landing. The leg solver still uses the same skeleton after the animation mixer and never stretches bone scale. The former abrupt anchor reassignment has been removed. Telemetry reports the corrective-step state and phase, actual solved world paw positions and gaps, and a fresh touchdown identifier only when the paw lands. The legacy `contactResets` counter now counts these explicit corrective steps; `correctiveSteps` exposes the same count by its current meaning.

The phase-driven lock advances mixer time while holding only the lock action at the scent-driven phase. Thus normal crossfades and posture layers continue blending. Pausing still freezes the mixer.

**Recorded validation**

Both new runs use the immutable build containing `boot3d-jniLcY8b.js` and `three-COioDaW5.js`. They use ordinary automated player input, a live simulation and read-only telemetry for mouse aiming. No capture flag, forced bird hit, teleport or manual simulation stepping is used. These are functional runs, not human usability or standalone performance measurements.

| Run | Result | Support pairs | Mean horizontal drift | Maximum horizontal drift | Point support gap | Corrective steps |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| [Default GSP](dog-contact-evidence/after-default.json) | Complete hunt and replay | 109 | 1.08 mm | 3.01 mm | 6.08 mm | 22 |
| [Quick Hunt with repeated quartering](dog-contact-evidence/after-quick.json) | Complete hunt, replay and reload | 49 | 0.95 mm | 3.26 mm | 6.16 mm | 96 |

The second run uses the same isolated Quick Hunt profile recipe as the earlier difficult turning case. Both runs held point, flushed birds, deliberately missed once, hit with ordinary firing input, retrieved and delivered a bird, showed the summary, and replayed successfully without console errors. The Quick Hunt left the seeded career byte-identical through summary, replay and reload. Recorded bird-to-mouth attachment distance was zero in both runs.

The [default hunt recording](dog-contact-evidence/after-default.mp4) preserves the complete sequence. Its [trace](dog-contact-evidence/after-default.ndjson) includes a released front paw 6.8 centimeters above the ground during a retrieval turn. The [Quick Hunt trace](dog-contact-evidence/after-quick.ndjson) records corrective paws approximately 7.7–7.9 centimeters above the ground around the middle of their swing, with contact zero, followed by near-ground placement at the end. Thus the new touchdown identity accompanies visible movement through the air rather than hiding an unchanged ground slide.

The focused motion and hunt-adapter suites passed all 22 tests, including real mixer blending, corrective lift/landing, and shared heading/position interpolation. The integrating full suite subsequently passed 325 tests and the production build succeeded. The same build also passed the [real disabled-WebGL startup and retry check](dog-contact-evidence/graphics-fallback.json).

**Follow-up: the quartering travel basis**

The 96-step Quick Hunt exposed a second cause beyond discontinuous turning. The shared dog's heading is its base travel or scent bearing; quartering moves at that heading plus a weave angle. The torso had faced the base bearing while its forward leg cycle needed to follow the actual displacement.

The [interval analysis](dog-contact-evidence/travel-facing-diagnosis.json) found 75 corrective steps during initial quartering, 9 during scent/gait transitions, and 12 through retrieval and delivery. Later quartering intervals had a 29–43-degree mismatch between torso forward and actual travel. One interval added 12 corrective steps while net base yaw changed only 0.040 radians over 1.08 seconds. Steady straight scent travel and steady straight retrieval/carrying added no repeated corrections. Interval labels describe the ending sampled state and do not claim exact per-trigger attribution.

The gait dimensions support that diagnosis: the lope clip covers approximately 0.496 meters per stance. A 43-degree error between body forward and actual displacement leaves approximately 0.36 meters of uncompensated world movement per stance. At 5.5 meters per second, four paws and the clip's cycle rate predict approximately 11.5 corrections per second, close to the observed repeated 12-per-second intervals. Increasing the correction threshold would retain that mechanical mismatch.

The moving torso now follows the actual displacement tangent from the authoritative fixed snapshots, interpolated at render time. Its head can address the base scent bearing within a bounded angle. Stationary scent, point and honor turn toward the authoritative intent; near-zero travel keeps the previous bearing. Zero-delta normal renders do not create a new facing direction, and capture/spawn placement remains deterministic. No simulation rule or correction-distance threshold changed.

The [new Quick Hunt](dog-contact-evidence/travel-facing-quick.json), built as `boot3d-8t4TfEap.js` and `three--rVoz04d.js`, completed the same isolated profile recipe, including ordinary misses/hits, retrieval, delivery, summary, replay and reload. The seeded career remained byte-identical and no browser errors occurred. There were 50 qualifying support pairs, mean horizontal drift 0.96 millimeters, maximum 4.04 millimeters, and point support gap 6.15 millimeters. Bird-to-mouth distance remained zero.

Corrective steps through delivery fell from 96 to 23. Initial quartering fell from 75 to 3, with no repeated corrections from approximately 2.1 to 11.1 seconds. Remaining corrections cluster around clip/state transitions, the pickup turn and the delivery stop. Four additional steps appear in the short resumed-hunting interval after delivery and before the summary; the support statistics above stop before that interval. The [recording](dog-contact-evidence/travel-facing-quick.mp4) and its shot/retrieval frames also show the revised small debris presentation without the earlier oversized dark cards. These live runs use the same fixture recipe but are not identical frame-timing replays.

The immutable asset's unconstrained geometric chain length is approximately 0.636 meters for a front leg and 0.678 meters for a hind leg. Rest-pose direct distances are approximately 0.588 and 0.544 meters. These totals do not establish usable anatomical reach: a sideways correction and a correction along an already extended leg have different limits. The trace does not retain exact trigger-time unconstrained paw position, anchor, joint angles or chain-root distance. There is therefore no evidence here that the 14-centimeter threshold should simply be increased. Any future adaptive reach limit should first record those quantities and respect joint bends rather than using total segment length as permission to straighten the leg.

The travel-facing patch passed 25 focused motion/adapter tests, including the 43-degree weave case and deterministic stationary point behavior. The integrating full suite passed 328 tests and the production build succeeded before the recorded run.

**Anatomy revision: settling into point and lifting the retrieve**

The revised anatomical asset places its moving hind support center about 17.1 centimeters ahead of its stationary support. Crossfading directly into lock could otherwise relocate those feet or force them against their correction bounds. The runtime now samples the actual point clip on a detached copy of the shipped skeleton to obtain its support targets. It does not retain the old rig's hard-coded limb dimensions.

On entry to lock or point, airborne feet finish their flight first. Occupied supports that need to move take visible 0.22-second settling steps in sequence. Waiting supports keep their world anchors and previous leg pose until liftoff; a lifted foot has zero contact and receives a new plant identifier only at touchdown. Lock-to-point preserves these anchors and any settling step already in progress. `settlingSteps` and each paw's `settlingStep`/`settlingPhase` report these planned transitions separately from emergency corrective steps.

The new pickup clip finishes at the low grip pose. Its carry transition lifts over 0.30 seconds after the existing hunt event attaches the bird. A loaded-skeleton regression then exposed a second interruption issue: as filtered speed crossed the carry-to-trot threshold, the partly faded carry action restarted its outgoing fade at full weight. The mouth moved 23.60 centimeters in one 60 Hz frame. Crossfades now preserve the outgoing action's current effective weight. The same fixture's maximum mouth movement is 7.48 centimeters per frame, including the dog's 4-centimeter root advance.

The [focused anatomical model report](dog-contact-evidence/anatomy-settling-focused.json) records maximum same-plant horizontal movements of 0.60 millimeters for a trot stop, 0.002 millimeters for a lope stop, and 1.77 millimeters while turning 43 degrees into scent. Settling feet visibly release contact; the tested trajectories reach 9.36–13.80 centimeters above the flat surface, including feet which were already in flight. Final supporting-paw gaps are approximately 4.3–5.1 millimeters. Raw per-frame displacement is also tested independently of plant identity, and a paused settling sequence preserves the pose.

These are deterministic Three.js mixer/skeleton checks against the anatomical GLB identified by hash in the report. They do not replace a fresh ordinary hunt or prove skin deformation, animal gait quality, or reference-game parity. The earlier full-hunt recordings and outliers above remain evidence of their own older asset/build.

**Limits and next review**

Support drift statistics compare only adjacent samples with the same touchdown identifier, the same moving clip, more than 90 percent support weight and a locked paw, within 250 milliseconds. They do not describe every frame, partial-contact transition or the airborne corrective swings. The newer reports retain complete prior/current audit states for their worst qualifying pair.

The latest run still needs corrective steps around performance transitions. Those remaining events should be reviewed against authored start, stop, pickup and turn timing after the anatomy update. The videos have natural cover occlusion and do not resolve every paw at every instant. Final acceptance should recheck the revised dog in ordinary hunts and close locomotion views, retaining raw outliers and separate airborne-step evidence. No reference-game quality or physical mobile readiness claim follows from these checks.
