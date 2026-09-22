# Regional field follow-through

The September 22, 2026 continuation through `2dbe5dc` adds regional sound, vegetation that follows the hunt wind, and consistent results reporting to the Chukar, Quail and Sharptail polish work. The current production artifact is `output/world-2dbe5dc`, served locally at `http://127.0.0.1:4604`. The combined source passes 126 test files / 969 tests and the production build. Twenty final High/Lite environment views pass without browser errors. An audio-enabled Sharptail hunt on the preceding `39e8dbb` build also passed, including recovery, revised field notes and replay. The final two commits change only results layout and initial-install update detection.

**Integrated changes**

| Commit | Result |
| --- | --- |
| `d85698d` | Chukar uses exposed wind, dry sage movement and gravel steps; Quail uses sheltered wind, leaves and softer litter steps; Sharptail uses low prairie wind and dry grass movement. Player audio receives the selected area, and zero-delta or zero-distance motion cannot produce a footfall. |
| `d13af33` | Quail grasses/sage, Chukar plants and Sharptail grass/shrubs bend with the current hunt's wind direction and strength. Instanced plants account for their rotation/scale; Chukar visible and depth materials share the wind. |
| `39e8dbb` | Shotgun hunts share the field-notes presentation: retrieved and escaped birds, point flushes, time afield and doubles when earned. Results no longer expose the total hidden bird population or label unshot escapees "lost." Falconry retains its existing results. |
| `302c944` | Results notes scroll independently while Hunt again and Main menu stay visible. A wider, more compact landscape card preserves 44-pixel button targets. |
| `2dbe5dc` | First offline installation no longer advertises a waiting upgrade. Actual replacement workers retain the existing safe-transition update flow, including uncontrolled-page upgrades. |

Ambient audio and vegetation read the same live hunt snapshot; they do not add weather simulation or change scent, flight or encounter rules. Strong wind retains the previous maximum plant displacement. Calm/breezy/strong scale vegetation by 0.25/0.65/1 and ambient levels by 0.45/0.75/1. Ambient loops have no positional bird calls or hidden-quarry cues. Existing gun, flush and dog sounds remain unchanged, as does the accepted Cattail sound profile.

**Three-map functional hunts**

The evidence manifest is `output/sharptail-full-hunt-review/be64317-functional-review.json`. These runs use the preceding `be64317` production build on port 4602, Lite, Balanced, seed `1184004868`, and South Gate on each map. They establish the functional hunt loop before the final sound/wind/field-notes integration; they are not mislabeled as runs of `39e8dbb`.

Navigation followed visible dog cues with ordinary keyboard/mouse input. Each run reached a natural point/rise, then used assisted mouse aim for one legal travelling-shot intercept. All three completed a downed bird, search, pickup, delivery, results and replay, with no browser errors. Result persistence stayed stable while the summary remained open and after replay. Sampled carried-bird positions remained on the mouth socket.

| Map | Assisted intercept range | Carry to delivery | Result |
| --- | --- | --- | --- |
| Sharptail Prairie | 43.52 m | 8.72 s | One bird retrieved; results and replay passed. |
| Quail Fields | 11.15 m | 3.08 s | One bird retrieved; results and replay passed. |
| Chukar Ridge | 54.17 m | 10.64 s | One bird retrieved; results and replay passed. |

The aiming driver sampled the airborne bird twice and predicted the intercept using shot travel time. It did not use hidden-bird routes, camera setters, time jumps, forced hits or inventory changes. This checks legal shooting and recovery integration, not human aim or mobile hit rates. The original straight-heading Sharptail attempt encountered the first bird at 55.09 m, beyond the 55 m gun limit; following the dog and firing at a valid intercept completed the same seed without changing the range rule.

The review exposed misleading old Sharptail/Chukar summary copy. Commit `39e8dbb` addresses that presentation issue; the recorded `be64317` summary screenshots naturally retain the old wording. One seed/entry per map and one retrieval each are bounded samples, not exhaustive hunting coverage or a complete property sweep.

**Audio evidence and budget**

`output/regional-audio/report.json` records actual CPU-only WebAudio offline renders. `render.mjs` reproduces the 12-second, 48 kHz WAVs: `chukar-ridge.wav`, `quail-fields.wav`, `sharptail-prairie.wav`, `pheasant-coverts.wav` and `chukar-ridge-lifecycle.wav` in the same directory. The ordinary samples contain ambience first, followed by open-ground steps and then cover steps/brush. The lifecycle sample pauses at 3–5 seconds and mutes at 7–9 seconds.

All renders contain finite, non-clipping output; the largest measured sample peak is about 0.046 on a full-scale range of 1. The sampled pause/mute windows have zero RMS, and resumed/unmuted windows have nonzero output. These are synthesis/lifecycle checks and audition files, not a claim that the mix has been accepted by a human listener or tested on a phone speaker.

Each new regional bed has at most two mono looping sources, two filters and two layer gains. Combined loop buffers are at most 28 seconds, about 5.4 MB of float samples at 48 kHz; no audio files are downloaded. Native gains change only on wind-strength or lifecycle transitions. Focused checks cover unlock retries, pause/visibility, page departure, replay/disposal, mute, zero-delta dog movement, legacy Cattail behavior and unchanged pheasant launch routing. Pause/resume retains the existing bed rather than starting extra loops; disposal is idempotent.

**Final-build review**

The final `39e8dbb` review captured ten High and ten Lite views, recorded in `output/regional-wind-review/wind-39e8dbb-{high,lite-mobile}.json` with their corresponding PNGs. All twenty have no browser errors. The coordinator inspected representative High stills and found no composition regression from the new wind. `render-cost-comparison.json` records zero draw-call and triangle-count changes in all twenty views against the earlier matched `a9be754` scenes. These are environment-only counts: they do not measure bird geometry, shader execution time, audio CPU cost or phone frame rates.

- [x] Complete final High/Lite shader captures and bounded visual review on `39e8dbb`.
- [x] Complete the audio-enabled Sharptail hunt on `39e8dbb`, including revised field notes, recovery and replay.

The final hunt manifest and audio recording are `output/sharptail-full-hunt-review/39e8dbb-final-audio/south-gate-lite.json` and `.mp4`. A natural point at about 39.7 seconds led to a five-bird rise, one assisted legal shot, pickup, delivery and field notes reporting one retrieved and four escaped. Pause and mute produced zero sampled audio; resume and replay restored output without duplicate outputs. There were no browser errors. This remains automated assisted-aim evidence, not human shooting acceptance.

The final review also exposed two interface issues: a fresh installation could retain an unnecessary update notice, and the old results layout required scrolling to reach the next-hunt actions in a short landscape viewport. Commits `302c944` and `2dbe5dc` fix those issues.

**Final mobile interface follow-up**

The `2dbe5dc` artifact passes 126 test files / 969 tests and the production build. Logs are `/tmp/uplandin-world-final-tests.log` and `/tmp/uplandin-world-final-build.log`; only the existing bundle-size warnings remain. Fresh Chrome touch contexts started at 844×390 landscape and 390×844 portrait before navigation. Both completed actual Enter, Pause, End and Replay taps. Ordinary results fit with visible, unobstructed 44-pixel actions. First offline installation activated successfully with no waiting worker and no false update notice, including after replay.

`output/sharptail-full-hunt-review/2dbe5dc-results-touch/results-touch.json` records these checks and exact-dimension screenshots. Separate, explicitly labeled DOM fixtures added long notes, an update panel and diagnostics. Actual touch swipes reached the bottom while the action footer stayed stationary, with no horizontal overflow or browser errors. Those fixtures check layout only; the ordinary UI checks use a short zero-bird hunt. This does not replace the earlier full-hunt evidence.

The final artifact preserves the tested world/audio/gameplay from `39e8dbb`. Ports 4602 and 4603 retain their earlier frozen artifacts; port 4604 is the new local candidate.

Physical-phone touch feel, shooting enjoyment, speaker mix, installation/background behavior and sustained thermal performance remain separate acceptance work. Desktop Lite and instrumented recordings do not establish them. The current preview is a local production build, not a new hosted release or deployment.
