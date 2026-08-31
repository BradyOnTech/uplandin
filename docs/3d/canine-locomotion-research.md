# Canine locomotion research for the low-poly English Setter

_Research and repo review, 2026-08-30_

## Conclusion

The current dog is stiff for structural reasons. More angle tuning on the existing cycle will have diminishing returns. The next pass should preserve the low-poly appearance but replace the pose-first animation with a **contact-first locomotion rig**:

1. define which paws are in stance and lock those paws to the ground;
2. give the forequarters, pelvis/loin, distal legs, and paws enough joints to express weight transfer;
3. solve limb angles from paw targets rather than prescribing two angles per leg;
4. derive gait and stride timing from measured world speed, with state-specific posture layered on top;
5. use actual lead/trail asymmetry for the gallop and switch the lead when turning.

This is compatible with a deliberately low-poly model. Realism here depends much more on transform hierarchy, contact timing, and weight transfer than on polygon count or fur detail.

## What a Setter should look like in motion

The official English Setter standard emphasizes a free, smooth gait with long forward reach, strong rear drive, and a firm topline. It also calls for a level or slightly descending topline in motion and a tail carried as a continuation of that line. This argues against large whole-body bob, rubbery torso scaling, or a constantly wagging tail during sustained travel. The dog should read as an efficient, ground-covering gun dog rather than a sprinting sighthound. ([American Kennel Club, Official Standard for the English Setter](https://images.akc.org/pdf/breeds/standards/EnglishSetter.pdf))

That breed description does not eliminate spinal movement. It means the **visible ribcage/topline should remain controlled at the working trot**, while the pelvis, scapulae, limbs, and caudal loin do the work. At a gallop, sagittal flexion and extension of the lumbar region must become visible.

## Animation-relevant biomechanics

### Gait and footfall timing

- A canine lateral-sequence walk is a four-beat gait; a trot synchronizes diagonal limb pairs. In an overground study of six healthy retriever-type dogs, the contralateral limbs were almost exactly half a cycle apart during the symmetrical gaits, while galloping limb pairs were substantially less than half a cycle apart. The measured average gallop separation was about 18% of a cycle for the forelimbs and 26% for the hindlimbs, with much larger hindlimb variability. These values are useful reference anchors, not universal Setter constants. ([Catavitello, Ivanenko & Lacquaniti 2015](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0133936))
- Walk has longer support: a canine study found walk duty factors predominantly in the 50-80% range and trot predominantly in the 40-60% range. As normalized speed increased, stance time shortened while swing time stayed comparatively stable. ([Shin et al. 2018](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0198893))
- Dogs can use both transverse and rotary gallops. In one acceleration study, all 14 Belgian shepherd dogs used transverse gallop and 10 also used rotary gallop; gait transitions involved discrete changes in inter-limb timing rather than merely increasing the amplitude of one shared sine wave. ([Schwaner et al. 2013](https://journals.biologists.com/jeb/article/216/12/2257/11423/Gait-transitions-and-modular-organization-of))
- In a rotary gallop, trailing and lead forelimb contacts are distinct, followed by gathered suspension, distinct trailing and lead hindlimb contacts, then extended suspension. A transverse gallop reverses the relationship between the hind and fore lead order. The four limbs do not act as paired skis. ([Walter & Carrier 2007](https://journals.biologists.com/jeb/article/210/2/208/17106/Ground-forces-applied-by-galloping-dogs))

**Animation inference:** retain a transverse gallop as the default Setter field gait if desired, but make it a clearly asymmetric four-beat pattern. A rotary variant can be introduced for the fastest straight travel. Either choice is more credible than the current almost-paired contacts.

### Paw contact and limb trajectories

Stance is the interval in which the paw is on the ground; swing is the interval in which it is off the ground. Video-based canine gait work identifies toe-off and toe-touch as the actual phase boundaries, and shows that the limb rotates strongly forward during swing before reversing around contact. ([Shin et al. 2018](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0198893))

Canine limb motion is not well represented by a single pendulum per leg. Kinematic studies model the hind limb as thigh, shank, and foot, and the forelimb as upper arm, lower arm, and hand, with the scapula as an additional proximal segment. The timing and range of distal motion differ substantially between fore and hind limbs. ([Catavitello, Ivanenko & Lacquaniti 2015](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0133936))

**Animation inference:** during stance, a non-slipping paw should remain approximately fixed in world space while the body travels over it. During swing, the paw should follow a deliberately shaped clearance arc and orient for the next contact. This requires an independent paw transform and explicit contact events; it cannot be guaranteed by sampling upper- and lower-leg angles independently.

### Forequarters and scapula

The scapula undergoes appreciable sagittal rotation during canine locomotion, and fluoroscopy-based inverse dynamics confirms that scapular rotation is a dominant contributor to forelimb kinematics. ([Catavitello, Ivanenko & Lacquaniti 2015](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0133936); [Andrada et al. 2017](https://pubmed.ncbi.nlm.nih.gov/28650238/))

The forelimbs carry more of the supporting and braking work than the hinds. In galloping dogs, combined forelimb vertical impulse was greater than combined hindlimb impulse, the forelimbs produced much greater decelerating impulse, and the hindlimbs produced net forward acceleration. Lead and trailing limbs also had meaningfully different force roles. ([Walter & Carrier 2007](https://journals.biologists.com/jeb/article/210/2/208/17106/Ground-forces-applied-by-galloping-dogs))

**Animation inference:** fore contact should read as catch/compression through a sliding scapula and flexing elbow/carpus; hind contact should read as gather and drive. Applying the same curve with a tiny phase offset to left/right limbs suppresses this distinction.

### Pelvis, spine, and root motion

At a walk, the canine fore and hind quarters behave like two coupled vaulting systems. The whole-body center of mass rises and falls twice per stride, rather than the torso performing one large vertical bounce. ([Griffin, Main & Farley 2004](https://pubmed.ncbi.nlm.nih.gov/15339951/))

Walk and trot keep the axial skeleton comparatively controlled, but the pelvis moves in all three rotational planes in a stride-linked pattern. X-ray reconstruction measured pelvic roll as the largest rotation, pelvic pitch as biphasic, and the largest lumbar intervertebral motion near the lumbosacral end; motion decreased toward the cranial lumbar spine. ([Wachs et al. 2016](https://www.sciencedirect.com/science/article/pii/S1090023315005407); [Schaub et al. 2021](https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2021.709966/pdf))

Gallop is different: dogs show one substantial sagittal flexion-extension wave per stride, with motion increasing toward the caudal spine and the greatest sagittal bending near the presacral region. Trotting instead has lower-amplitude sagittal movement and a more stabilizing trunk pattern. ([Schilling & Carrier 2010](https://journals.biologists.com/jeb/article/213/9/1490/10266/Function-of-the-epaxial-muscles-in-walking))

**Animation inference:** do not scale one rigid torso longitudinally to imitate spinal flexion. Keep the ribcage comparatively stable, rotate/translate the pelvis, and bend at a short loin joint. Let support events drive a restrained root/center-of-mass curve; do not move the entire dog vertically to force an arbitrary paw to the terrain.

### Head, neck, tail, and ears

Three-dimensional canine studies find gait-cycle-linked head and upper-neck motion, including compensatory craniocervical movement that helps maintain a stable head position. The basic pattern is conserved across Labrador retrievers and much smaller breeds even though amplitude varies by individual. ([Schikowski et al. 2021](https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2021.709967/full); [Nickel et al. 2023](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0278665))

Tail behavior changes by gait. In seven dogs, walking and trotting produced reciprocal left/right tail-muscle activity associated with lateral tail movement, while galloping produced synchronized activity that kept the tail comparatively stable against cyclic limb torques. ([Wada, Hori & Tokuriki 1993](https://pubmed.ncbi.nlm.nih.gov/8411184/))

**Animation inference:** use head stabilization as a lagged correction, not a perfect inverse copy of the neck angle. Allow modest lateral tail response at walk/trot and make the galloping tail a steadier counterweight. Ear leather and feathering are visual secondary motion rather than a locomotor driver; give the two ears slightly different damped responses based on head acceleration, lead side, and turn, rather than the same phase-locked angle.

### Turning and transitions

Galloping mammals preferentially use the inside forelimb as the lead in a turn. In galloping dogs, lead and trailing limbs have distinct braking/accelerating roles, and the force arrangement supports turning by placing the more propulsive trailing forelimb and lead hindlimb toward the outside. ([Walter & Carrier 2007](https://journals.biologists.com/jeb/article/210/2/208/17106/Ground-forces-applied-by-galloping-dogs))

Dog gait transitions are not simply a crossfade between four identical oscillators. High-speed video of accelerating and decelerating shepherd dogs found that swing timing, especially in the hindlimbs, changed discretely at transitions, while swing duration itself was comparatively insensitive to speed. ([Schwaner et al. 2013](https://journals.biologists.com/jeb/article/216/12/2257/11423/Gait-transitions-and-modular-organization-of))

**Animation inference:** preserve the currently planted feet, select a new lead from turn direction, and retime the next one or two swing events into the new gait. Blend posture and body motion, but do not linearly blend incompatible contact schedules for long enough to make every foot slide.

## Why the current implementation reads stiff

These are direct observations from the repository, not claims from the papers above.

1. **Every joint stops at every key.** `src/three/dogs/gallop.ts:56-84` has eight equally spaced keys and applies `smoothstep` independently to every interval. Smoothstep has zero slope at both interval ends, so every animated channel briefly decelerates to zero eight times per cycle. That creates visible micro-pauses even when the intended biological motion should flow through the key.
2. **The gallop is almost a bound.** `gallop.ts:98-107` separates the forelimbs by only 3.6% of a cycle and hinds by 4.4%. The overground dog data above measured much clearer forelimb asymmetry, and the ground-force study shows the paired limbs perform different roles.
3. **There is no explicit contact schedule.** The pose exposes only a global `flight` value. It does not say which individual paw is in stance, at touchdown, or at toe-off.
4. **The terrain solver considers every paw.** `src/three/subsystems/dog.ts:1667-1688` finds the lowest of all paws except the lifted pointing paw. A swing paw can therefore influence root height. During non-run movement it applies the full correction, even though only stance paws should support the body.
5. **Feet cannot plant.** `dog.ts:1162-1237` builds each paw into the lower-leg mesh. There is no independent paw/carpus transform to keep the sole level in stance or prepare it for touchdown.
6. **The limbs are under-articulated.** Each limb has only an upper and lower joint (`dog.ts:332-336`). There is no scapular segment; the hind shank, hock/cannon, and paw are visually collapsed into one lower group.
7. **The torso does not bend.** `dog.ts:1630-1657` scales one body group along its length and translates both shoulder pivots together and both hip pivots together. That is not scapular rotation, pelvic rotation, or caudal-lumbar flexion.
8. **Trot and tracking are still sine waves.** `dog.ts:1521-1533` drives both joint angles from sines/cosines. This gives clean phase labels but not contact, loading, toe-off, clearance, or touchdown.
9. **Secondary motion is phase-locked.** Both ears receive the same angle and trot/track tail motion is clock-driven rather than responding to body acceleration (`dog.ts:1531-1533`, `1662-1665`).
10. **The gait label and actual speed disagree.** Live movement scales sim speed into world space (`src/three/subsystems/hunt3d.ts:36-53`). For the shipped level-8 English Setter, ordinary cover `run` works out to about 4.56 m/s while the cast labeled `trot` is about 5.25 m/s because it multiplies the same base speed by `CAST_SPEED_MULT = 1.15` (`src/game/dog.ts:498-512`). The animation should use measured world speed and treat hunt state as a posture/intent input, not trust the label as physical pace.
11. **Tests validate poses, not locomotion.** `test/gallop.test.ts` checks selected angles, stretch, flight pulses, and a root clamp. It does not check footfall order, per-paw stance, world-space paw drift, touchdown continuity, or terrain penetration.

## Recommended low-poly rig

The low-poly surfaces can stay. Add transform hierarchy, not decorative geometry:

```text
locomotionRoot (world translation + heading)
└── bodyRoot (small COM height/roll response)
    ├── ribcage/chest
    │   ├── scapula L -> upper fore -> lower fore -> paw L
    │   ├── scapula R -> upper fore -> lower fore -> paw R
    │   └── neck base -> head -> ear L / ear R
    └── loin pivot -> pelvis
        ├── thigh L -> shank/hock L -> paw L
        ├── thigh R -> shank/hock R -> paw R
        └── tail root -> tail flag
```

Minimum high-value changes:

- independent left/right scapula pivots;
- separate ribcage and pelvis joined by one short loin pivot;
- independent paw transforms on all four limbs;
- one additional distal hind segment so the hock is not the paw;
- independent left/right contact state and foot target.

Groups/bones do not add polygons. Separating paw meshes may add four draw calls in the simplest implementation; a single skinned mesh can retain draw-call count if that budget becomes important. The visual style should remain faceted and low-poly either way.

## Recommended locomotion architecture

### 1. One pure locomotion sampler

Create a Three.js-independent module that accepts:

```ts
type LocomotionInput = {
  distance: number;
  speed: number;
  acceleration: number;
  turnRate: number;
  slopeForward: number;
  slopeSide: number;
  intent: 'cast' | 'cover' | 'track' | 'retrieve' | 'heel';
};
```

and returns a complete pose with per-foot contact metadata:

```ts
type FootPose = {
  localTarget: Vec3;
  solePitch: number;
  contact: 'swing' | 'touchdown' | 'stance' | 'toeoff';
  load: number;
};
```

This makes locomotion testable without the scene, terrain, or materials.

### 2. Drive phase by distance, select gait by physical speed

Keep the good existing idea that phase advances from ground distance rather than wall-clock time. Compute a smoothed real world speed from `moved / dt`; use it to select or blend walk, trot, canter, and gallop with hysteresis. The sim's `gait`/state remains useful for intent (head down while tracking, purposeful cast, retrieve carriage), but should not dictate an impossible footfall pattern at the wrong speed.

### 3. Author contact schedules, not angle tracks

For each gait, specify touchdown phase and stance duration per foot. The schedule determines support, lead, suspension, and transitions. Then:

- **stance:** preserve a world-space foot lock and let the root move over it;
- **toe-off:** unload the foot and allow the paw to roll/flex;
- **swing:** use a smooth clearance arc toward a predicted terrain-aware touchdown;
- **touchdown:** align the paw with local terrain and begin the next lock.

Use analytic two-bone IK for the major limb segments and a separate distal/paw orientation. Scapular and pelvic motion can be sampled from the contact/loading state rather than from the same leg sine.

### 4. Separate body laws by gait

- **Walk:** four-beat lateral sequence, long stance, two restrained COM rises per stride, visible alternating pelvic/scapular motion, minimal ribcage pitch.
- **Trot:** synchronized diagonals, firm Setter topline, small two-pulse vertical response, small pelvis roll, brisk distal flexion during swing.
- **Track/creep:** a posture overlay on a slow walk or short trot—lower neck/chest, shorter forward reach, more deliberate contacts—not its own diagonal sine regardless of speed.
- **Canter:** useful intermediate asymmetrical gait for acceleration, deceleration, and tight cover turns; this prevents popping directly from symmetric trot into full gallop.
- **Gallop:** four distinct contacts, selected lead, one caudal-lumbar flexion/extension wave, clear gather/extend phases, and suspension only when no feet are scheduled in stance.

### 5. Make body and secondary motion responsive

- derive ribcage/pelvis pitch and root height primarily from stance load and foot placement;
- flex the loin once per gallop cycle but keep it controlled at trot;
- stabilize the head with a damped aim target plus limited counter-rotation;
- drive ears from head angular acceleration with slight left/right variation;
- make the tail a damped counterweight, with relatively stable gallop carriage and behavior overlays for scent intensity.

### 6. Treat turns as locomotion, not just body roll

Select the inside fore as the gallop lead, shorten inside stride, lengthen outside reach slightly, offset touchdown width, rotate chest before pelvis, and add restrained bank. The current whole-body roll can remain as one small component but should not be the entire turn response.

## Implementation order

1. **Instrument the existing motion.** Add debug paw trails, stance colors, phase/contact timeline, speed, and lead. Record a flat-ground broadside reference and a real gameplay turning sequence.
2. **Upgrade the rig only.** Add chest/pelvis/loin, scapulae, distal hinds, and paws while preserving the neutral pose and coat geometry.
3. **Build contact-first walk and trot.** These expose foot sliding and weight transfer most clearly and establish the reusable IK/contact system.
4. **Add canter and rebuild gallop on the same system.** Choose a transverse Setter field gallop first; add rotary only if the game has a visibly faster sprint state.
5. **Add transition and turn logic.** Preserve planted feet during gait changes and switch lead according to turn direction.
6. **Add restrained secondary motion.** Head stabilization, asymmetric ear lag, and tail response come after the feet and torso are credible.
7. **Tune in the actual game camera.** Keep the biomechanics correct, then exaggerate only motions that disappear at gameplay scale.

## Engineering acceptance targets

These are proposed production checks, not measured biological constants:

- a stance paw drifts no more than 1 cm on level ground;
- a stance sole neither penetrates nor floats more than 1 cm on smooth terrain;
- automated tests assert the selected gait's exact footfall order, stance masks, and suspension windows;
- gallop lead switches correctly for left and right sustained turns;
- pose position and first derivative are continuous across cycle wrap and gait transitions;
- no generic interpolation rule forces all channels to zero velocity at every authoring key;
- world speed, stride length, and stride frequency remain internally consistent;
- captures include broadside phases at touchdown, mid-stance, toe-off, mid-swing, gather, extension, and both turn directions;
- visual review occurs at normal gameplay distance as well as close broadside, because low-poly readability and anatomical subtlety require different tuning.

## Setter video calibration (2026-08-30)

The user supplied [Rudi the English Setter, running in slow motion](https://www.youtube.com/watch?v=21H1R8HaDGM) as the breed-specific motion reference. The clearest broadside portion is roughly 5.0-6.5 seconds. Direct frame review showed:

- near 5.0 seconds the limbs collect tightly under the body rather than hanging as four evenly spaced pendulums;
- near 5.5 seconds the forehand loads low while the hinds remain folded under the pelvis;
- around 6.0-6.3 seconds both forelegs project well ahead and both hinds trail behind in a long, nearly level suspension silhouette;
- the head is substantially steadier than the limbs, while the ears and coat absorb much of the secondary movement;
- vertical COM travel is present but visually subordinate to the fore/aft reach and spinal gather/extension.

The first reference-driven calibration therefore lengthens the gallop stride and fore/aft paw travel, increases controlled loin/pelvis articulation, and preserves restrained root bob. These timestamps are visual observations from a turning, perspective camera pass—not laboratory measurements—so contact order continues to use the primary biomechanical sources above.

### Fore-paw correction after motion review

The first contact-first gallop still read as a horse-like front-foot tap. A
frame and derivative audit isolated five interacting causes: excessive
left/right fore separation, a broad 12 cm recovery lift, the wrong forelimb
IK bend branch, discontinuous scapula/sole channels at toe-off, and a paw
that still carried substantial forward world velocity when the stance lock
engaged. The correction narrows the fore contacts, uses a 9 cm peaked skim,
folds the elbow caudally beneath the chest, preserves toe-off continuity,
and finishes the recovery with a velocity-matched Hermite retraction. These
properties now have direct regression tests rather than relying only on a
good-looking frozen pose.

## Expected result

With this change, the dog should stop looking like a rigid torso with four hinged rods and start reading as a supported mass moving over planted feet: the scapulae glide, the pelvis participates, the loin gathers at gallop, paws arrive and leave deliberately, and the head remains attentive rather than being bolted to the body wave. The model can remain recognizably low-poly; the animation system is the part that needs to become more anatomically expressive.
