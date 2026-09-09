# Complete low-poly hunting experience

Pheasant Coverts is the benchmark for the full user-approved September 8 objective. Completion means an ordinary, uninterrupted hunt that feels convincing, exciting, readable, and worth replaying, followed by species-specific application elsewhere. The benchmark remains unproven. Functional tests, staged views, assisted shots, and emulated phones cannot establish it independently.

**Current evidence and remaining work**

| Required outcome | Established evidence | Still required |
| --- | --- | --- |
| Exciting natural hunts | Natural close rooster rises, hens, points, tracking and recovery observed across several seeds and both entries; runner approach and whistle handling corrected | Uninterrupted ordinary play across routes; judge encounter distribution, anticipation, meaningful wind/approach, distant escapes and follow-up birds |
| Finished bird presentation | Species geometry, wing motion, banking and momentum-based falling; moving close rooster recognizable in West-87 recording | Unassisted rooster/hen acquisition across backgrounds, distance and presentation; final motion acceptance |
| Cohesive environment | Dense pheasant habitat, terrain variation, material transitions, autumn vegetation and horizon/canopy improvements in both quality tiers | A sustained walking-height composition review; identify the biggest remaining scene-level weaknesses before further asset detail |
| Finished dog | Natural shot-to-pickup-to-carry-to-delivery observed with assisted aiming; terrain-contact and movement checks; GSP head and hind-chain refinement | Current procedural asset remains unaccepted; moving field review of search, track, relocate, point, break, find and return before more breeds |
| Finished controls, shooting and sound | Laptop keyboard path; travelling patterns reward crossing lead; nearby movement audio; touch-emulated miss/reload/results/replay | Human aiming and tracking feel, recoil/reload rhythm, deliberate listening, comfortable touch tracking and cancellation during a rise |
| Performance and reliability | Active lightweight M1 Pro traversal over 107 seconds; both entries/light tiers represented in bounded hunt reviews; fresh replay verified | Ordinary lower-end laptop and actual phone performance, sustained/thermal behavior, loading and repeated complete hunts |
| Benchmark and transfer | Functional pheasant loop is playable through results; new visits vary seeds | Player acceptance of one cohesive pheasant experience, then species-specific application; other maps must not become reskins |

**Priority for the next pass**

The user explicitly asked to stop spending disproportionate time on minor refinements. Pause reporting-tool additions and isolated cosmetic experiments. The next substantial pass should improve visual understanding of the approach through pheasant cover: distinct habitat stands and transitions, readable working-dog movement, and landscape composition at walking height. Preserve tall, dense core cover; do not solve visibility by turning it into sparse quail habitat. Player feedback remains pending and can redirect this priority.

Fresh West Track review, seed 48291, Balanced, Standard, morning: entered normally, walked the entry track, followed the visible dog indicator, approached a point, and ended through Field notes. Results showed two point flushes, two escapes, zero retrieves, and two minutes afield. No hidden positions, forced rises, teleportation, or assisted shots were used. Browser action gaps and intermittent screenshots prevent conclusions about human reaction time, flight readability, or aiming difficulty. The review did show a broad, visually uniform stand and heavy dependence on HUD guidance until near the dog. Screenshots are `output/audit/ordinary-48291-22s.png`, `ordinary-48291-42s.png`, and `ordinary-48291-point.png`. The numbered `rise` screenshots are only approach captures; their filenames do not prove a visible rise.

Judge the next pass along a walking route from entry through a point approach, not one attractive still. It should create coherent variation in plant silhouettes and stand structure without moving hidden birds, adding outlines, or reducing habitat difficulty. Keep renderer cost comparable. This review is evidence for choosing work, not acceptance of a complete hunt.

The first implementation replaces broad sinusoidal height variation with neighboring stands that share height, spread, and color, and narrows the conspicuous V-shaped grass panicles. Core height range and root density remain intact. Matched West Track view (82.25, 118.95, yaw -120, pitch -12) remains 175 draws / 1,317,802 triangles. `output/audit/stand-composition-before.png` and `stand-composition-final.png` are the authoritative comparison; other `stand-composition` images show intermediate settings. Existing habitat/cover checks passed 26 tests and the production build passed. This is a limited improvement to stand structure, not proof of improved dog visibility or a completed composition pass; those need moving review.

The previously listed encounter-ID, movement-aliasing, runner-speed, recall, and physical-retrieve defects have already been addressed. Do not treat those older chronological findings as current instructions to fix them again. Natural shooting and recovery now have assisted functional evidence. What is still missing is ordinary unassisted quality acceptance, not the existence of a working recovery path.

Actual phone evidence needs an actual device. New touch visits already default to Lightweight unless the player or URL selects another tier; retain that choice. Browser touch emulation proves only the interactions and layouts exercised. Do not clear dense cover, highlight every bird, or force every rise close to make automated checks easier.

**Evidence and checkpoints**

The detailed record is `docs/3d/pheasant-completion.md`. Recent implementation checkpoints are `7526c27` (travelling shot patterns), `699e7c8` (physical movement audio), `fc799b2` (GSP proportions), and `7427be4` (landscape phone layout). Checkpoint `588a4b2` records touch-emulated miss-to-replay evidence. The last full suite passed 664 tests; later CSS-only work passed its build and focused browser review.

Key artifacts include `output/playwright/west87-balanced-rise-short.mp4`, `output/playwright/travelling-shot-delivery.png`, `output/audit/field-sound-review.wav`, `output/audit/dog-point-profile-after.png`, and `output/audit/phone-landscape-after.png`. Each has the limitations described in the detailed record. No artifact or checkpoint constitutes overall production acceptance.
