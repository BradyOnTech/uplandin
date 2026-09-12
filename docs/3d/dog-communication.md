# Generated dog field communication

The current generated GSP now expresses the shared hunting simulation's scent work through head carriage, neck reach, head turns, tail activity and point entry. This is the user-selected dog communication pass, following the world and presentation batch. The current procedural model remains the asset; broader dog and complete-hunt acceptance remain open.

**What changed**

The generated renderer previously passed only movement, point and retrieval inputs into its motion controller. At identical travel speed, searching, locating and stalking produced identical upper-body poses; checking, locking and handler waiting all looked like ordinary standing. The read-only baseline is `output/playwright/dog-communication-baseline.json`.

`GeneratedDogSystem` now passes the dog's public state, scent stage, stage progress, handler hold and relative intent heading into `GeneratedScentMotion`. Open search has mobile head carriage and restrained tail movement. First scent raises the head and stills the searching tail. Locating narrows a head check over the existing finite beat. Stalking reaches lower and forward, with a quiet, purposeful head. The head can lead the torso toward the dog's existing intent bearing, including across the heading wrap.

Locking begins the pointing foreleg lift during the shared locking clock. Its progress carries into the established point, avoiding a second point-entry sequence after the simulation has already finished settling. Releasing a point into renewed tracking retains the existing gradual paw release while the upper body returns to its tracking reach. A handler hold overrides the retained scent stage and keeps four feet on the ground with alert carriage. Retrieval and marking ease the scent offsets away; swimming resets them.

Actual displacement still determines strides and gait selection. The shared bridge deliberately lets stalking travel faster than locating so the dog can lead a walking hunter; this pass preserves that behavior. The new layer uses the existing mesh, material and skeleton, adding only bone transforms each frame. Foot contacts, hunting decisions and habitat remain under their existing authorities.

**Verification**

Six regressions exercise the actual generated-dog bridge: searching versus stalking at identical displacement, first-scent head lift with planted paws, handler waiting over a retained locking stage, stable zero-time renders, progressive locking on sloping ground at 30/60/120 FPS, smooth release into tracking, and signed intent through both heading seams. The combined suite passed 697 tests in 95 files, including existing locomotion, point, retrieval, attention and swimming coverage. Type checking, production build and diff checks passed; the existing large-bundle warning remains.

Two 14.6-second staged recordings use the actual generated renderer and contact solver at approximately 14 and 25 yards, FOV 70 and 1.65-metre eye height. The short checking, locating and locking beats last 0.35, 0.60 and 0.25 seconds respectively. The farther view places shipped pheasant vegetation behind the dog on a flat review parcel. Both recorded without page errors. These are authored state/path sequences, not natural encounters or device-performance measurements.

The nearer sequence shows the head lift, forward tracking reach and continuous point entry. At the farther distance, head detail occupies few pixels; travel, pauses and the held silhouette remain the stronger cues. Diagnostic contact sheets explicitly enlarge crops and must not be treated as normal field-distance readability proof. Dense foreground cover can still conceal the dog.

Retained artifacts are `output/playwright/dog-communication-after-{open,cover}.mp4`, corresponding JSON samples, full state frames and `-contact.png` sheets. `dog-communication-lock-sequence.png` is a magnified sequence extracted from the near recording. The untracked review driver is `output/playwright/dog-communication-review.mjs`.

A separate 70-second live West Track seed-87 observation confirmed the generated renderer through ordinary keyboard walking and mouse steering. It observed search and heel across trot, canter and gallop, with no page errors or non-finite bone/contact values. That observation did not reach scent or point: the driver's initial heading change and pursuit of every search cast curved its route back near the truck. Its video and JSON establish live movement integration only; the final screenshot has the dog off-screen. Files use the `output/playwright/dog-communication-live` prefix.

A corrected 60-second approach preserved the entry heading and walked the mapped track before following the tracking dog. It naturally reached checking at 15.59 seconds, locating at 16.04, stalking at 16.73, locking at 22.65 and point at 23.04, then marking at 37.23 and renewed search and scent work. All 7,043 observed frames had finite bone/contact values, with no console errors or state/performance mismatches. On point, movement stopped with one forepaw raised about 25 centimetres and three supporting paws planted. Maximum locked-foot target error was 1.2 centimetres; minimum ground gap was -2.8 millimetres during transition. No hidden bird data, forced events, simulation stepping or shots were used. This establishes ordinary scent-to-point integration, while cover occlusion limits visual readability conclusions. Evidence uses the `output/playwright/dog-communication-live-second` prefix.

**Remaining judgment**

The missing presentation connection is addressed. Ordinary scent-to-point readability through real foreground cover, the current dog's overall visual quality, and actual phone performance still need acceptance. This pass does not establish that the dog or pheasant experience is finished at the broader quality target.
