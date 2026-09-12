# Setter search and travel

The reported failures are repeated searching near the West Track truck and a dog that the sprinting hunter can overtake while it travels toward cover. They require changes to search selection and travel pace, not more birds or hidden-bird steering.

**Reproduction**

The reported standalone launch uses Pheasant Coverts, West Track, evening, seed `1184004868`, relaxed challenge and the over/under. It resolves to an English Setter at level 8. `dog=generated` selects generated geometry only for the liver-white GSP, so it does not replace this Setter's presentation. This seed starts with 16 hidden birds.

A deterministic browser replay walks 10.12 metres along the starting heading, then stands for the remainder of five minutes. It advances the real 3D hunt and bird systems. Before the fix, the dog travels 1,195.5 metres around only 72 four-metre cells, with no scent, point or rise. An independent simulation reproduction, including the real terrain and 157 scenery/landmark obstacles, repeats the same failure twice.

**Causes**

Cover selection uses patch centres for eligibility. At the entry, an edge is 9.75 metres from the work anchor but its centre is 20.58 metres away, outside the effective 19.36-metre search range. Every selection attempt fails despite reachable cover. The fallback then repeats a circuit without a finite searched-ground policy. Allowing nearby portions of patches alone creates objectives but does not end prolonged repetition around a stationary handler.

The 3D adapter separately halves the movement scale for a trot. Travel toward a cover objective uses that gait, producing approximately 3.06 m/s for the level-8 Setter and 3.70 m/s for the GSP in a dry, unobstructed cast. Both are slower than the hunter's 4.18 m/s sprint. Open searching already uses a faster running pace; increasing every dog state would unnecessarily accelerate scent work and pointing approaches.

**Changes**

Live pheasant searches use reachable portions of large cover patches and remember the portions checked. Local steering follows real elapsed time so the dog can turn through these smaller checks; movement still uses the 3D distance scale. After a finite local search without fresh ground, the dog rejoins the handler and resumes after eight metres of handler progress. Slow continuous progress prevents automatic waiting. The HUD distinguishes this from a deliberate whistle recall. Ordinary scent, point, marking and recovery priorities remain authoritative, and a manual whistle heel remains under player control.

Active travel toward cover uses a running movement scale. Deliberate heel, scent approach and terrain speed limits retain their own pacing. Animation follows actual displacement. The controlled five-second cast improves from 3.06 to 6.07 m/s for the Setter and from 3.70 to 7.35 m/s for the GSP. Both close from ten metres behind a sprinting handler to within two metres over five seconds.

**Verification**

The matched browser entry replay now travels 204.3 metres, completes its local check and rejoins the hunter within the first minute. It remains ready for fresh ground, with no repeat circuit for the rest of the five-minute observation. The HUD displays `DOG READY TO MOVE ON` and tells the player to walk toward fresh cover. The matched 253.73-metre route still produces two points and one escaped rise, with the final dog holding a point. There were no browser errors in that route replay.

All 752 tests across 100 files pass, as do TypeScript and the production build. The existing large-bundle warning remains. Regressions cover the real map/obstacle entry failure, reachable large-patch edges, slow walking, movement after a finished search, manual whistle recall, ordinary scent and recovery during automatic waiting, and identical search paths when concealed birds lie outside scent range. Quail and Chukar retain their existing search policy. Generated motion checks extend through 7.8–8.0 m/s.

Review caught and corrected two additional cases: a natural rise while automatically waiting must enter marking instead of leaving the dog permanently heeled, and an empty trail array must not turn cover scores into infinity. Both have regression coverage.

**Evidence boundaries**

The browser replay follows prescribed camera coordinates; it does not establish ordinary keyboard control, aiming, audio or complete-hunt readiness. Its fixed route uses the first six authored West Pothole Line waypoints without reading birds to steer. Before the fix, that 253.73-metre route produces two point episodes and one escaped rise, ending on another point. This is useful protection against solving entry circling by merely parking the dog.

The entry contains no guaranteed immediate scent contact. Nearby cover should be searched plausibly, and the player should understand when to move onward. This change does not promise a bird beside the truck or add omniscient guidance.

Reproduction scripts and before/after measurements are retained under `output/audit/setter-search-20260912/`, including `browser-{before,after}.json`, `browser-route-{before,after}.json` and `pace-cast-{before,after}.json`.
