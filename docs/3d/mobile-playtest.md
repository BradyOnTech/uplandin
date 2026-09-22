# Mobile playtest

The 3D game has touch movement, running, camera control, shotgun actions and goshawk actions. This pass starts from merged main at `9f7f56e` and is checkpointed separately on `codex/mobile-playtest`. Physical phone performance and Safari behavior still need device playtesting.

**Open on your phone**

Connect the phone and computer to the same Wi-Fi. Keep the computer awake. Run:

```sh
npm run play:mobile
```

This builds the game and serves `dist` on port 4593. Use the Network address printed by Vite, not localhost. The Wi-Fi address can change when the computer reconnects; use the current Network URL printed by the server. The September 22 review used `192.168.0.138`.

- [Chukar Ridge](http://192.168.0.138:4593/index3d.html?area=chukar-ridge&drop=south-gate&quality=lite&tod=morning&dog=generated&controls=touch&challenge=relaxed)
- [Cattail Coverts](http://192.168.0.138:4593/index3d.html?area=pheasant-coverts&drop=west-track&quality=lite&tod=morning&dog=generated&controls=touch&challenge=relaxed)
- [Goshawk practice](http://192.168.0.138:4593/index3d.html?play=quick&method=goshawk&practice=slip&quality=lite&controls=touch)

Turn the phone sideways and tap Enter the field. These links select Lightweight graphics and Touch controls explicitly. The pause menu can change both. Automatic controls detect coarse pointing hardware; a saved control choice is used when the URL does not specify one.

If the page cannot load, check that the server is still running, the phone is using the same Wi-Fi, and the printed Network address matches the link. Guest networks can isolate devices. This is a local playtest link; it does not provide access away from this network.

**Controls**

| Action | Touch input |
| --- | --- |
| Walk | Drag on the left side; movement starts at your thumb's initial position. |
| Run | Drag farther until the movement ring says Run. Move back inward to walk. |
| Look | Drag on the right side with a second thumb. |
| Raise, swing and fire | Hold Shotgun to shoulder it, drag with the same thumb, then release to shoot. Tracking continues outside the button. |
| Follow-up shot | Press and swing again. The gun stays raised for 2.5 seconds after release, and while the next shot is held. |
| Cancel or lower | Release over Lower to cancel a held shot; tap Lower to put the gun down. |
| Sensitivity | Pause and adjust Look speed and Shotgun swing separately (0.5–2.0×). |
| Reload | Tap Reload. |
| Dog | Tap Whistle to recall; tap again from heel to send hunting. |
| Falconry | Use Slip, Recall hawk, Pick up and Watch hawk as they become available. |
| Map | Tap Survey; drag to pan, pinch or use the buttons to zoom. |
| Pause | Tap Pause. Rotating the phone also pauses an active hunt. |

**Before and after**

| Area | Before | After |
| --- | --- | --- |
| Phone access | Existing dev server was localhost-only. | A repeatable command serves the built game on the local network. |
| Movement | Touch walking with no sprint or visible starting guide. | Movement guides, a center dead zone, walking and deliberate outer-drag running. |
| Multiple fingers | An extra finger could take over an occupied control role. | One movement finger and one look finger retain ownership; extra fingers are ignored. |
| Control selection | Touch mode depended on hardware detection. | Automatic, Touch and Mouse & keyboard options, saved locally and overridable in the URL. |
| Field layout | Generic coarse-pointer layout and desktop-centric tips. | Compact phone HUD, reachable action targets, movement/look hints, safe-area spacing and portrait guidance. |
| Falconry | Actions relied on ordinary clicks and showed keyboard prompts. | Pointer-aware actions support a second thumb, with touch labels and dedicated phone layouts. |
| Canceled input | Some resets left pointer capture or movement state active. | Pause, control changes, rotation/resize, interrupted touches and teardown clear owned input. |
| Paused rotation | Resizing could clear the field behind the menu. | The paused scene redraws at its new size without advancing the hunt. |
| Survey | Hunting controls remained present beneath the map. | Shotgun and hawk controls hide while the atlas is open; keyboard close hints hide in Touch mode. |
| Verification | No explicit phone movement coverage. | Regression coverage for touch speed, two-thumb ownership, cancellation and paused resizing. |

**Validation and remaining limits**

- `npm test`: 107 files, 806 tests passed. Input tests use synthetic pointer events; they do not substitute for physical device input.
- `npm run build`: TypeScript and production bundle passed. Existing large-bundle warnings remain.
- Desktop browser reviews at 844 × 390, 667 × 375 and 390 × 844 with Touch controls selected. Verified readable menus, shotgun aim/fire/reload/whistle, the atlas, compact goshawk controls and a field background that survives paused resizing.
- The built falconry page loaded through the LAN address, entered the field and opened the atlas without recorded browser errors. The LAN game endpoint returned HTTP 200.
- Actual iPhone/Android multi-touch feel, browser chrome, frame rate, temperature and sustained battery use remain unverified. Lightweight mode uses the existing rendering budget; no measured mobile frame-rate claim is made.
- This HTTP preview is for local playtesting. HTTPS installation and offline/PWA behavior were not validated in this pass. Vite describes preview as a local production-build check, not a public production server: [static deployment guide](https://vite.dev/guide/static-deploy).

Touch cancellation follows the browser's pointer lifecycle, including interruptions such as rotation: [MDN pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event).

**Combined shotgun control refinement**

The default now uses a single shooting thumb. Movement stays independent. The existing gun mount, action cooldown, reload, shot pattern and manual lead rules still apply. A very early release uses the existing short mount buffer; Lower, pause, reload or an input reset cancels that pending shot. No target snapping or automatic firing was added.

| Before | After |
| --- | --- |
| Separate Aim tap before Fire tracking. | Shotgun shoulders on press, swings on drag, fires one shot on release. Mouse preview and keyboard activation of the button follow the same intent. |
| Small 72px firing button. | 108px control with thumb-friendly spacing in both orientations and updated field instructions. Portrait End hunt and look hints move clear of the shooting controls. |
| No explicit gesture cancel target. | Lower doubles as a release-to-cancel target, with highlight and cancel feedback. Tapping Lower also cancels a held shot; leaving the target before release allows tracking to continue. |
| Gun remained raised until manually lowered. | It stays raised for a 2.5-second follow-up window and throughout an active hold, then lowers. |
| Generic Fire label. | The control reports raising, ready/release, action cycling, empty and reloading states. |
| Fixed look and firing-thumb sensitivity. | Independently saved Look speed and Shotgun swing settings in the pause menu. Falconry shows only Look speed. |
| Latest swing could wait until the next animation frame. | A shooting-thumb drag updates camera pose immediately so a same-frame release uses the latest direction. |
| Pointer cancellation coverage only. | Added gesture cancellation, mouse preview, repeat-release suppression, real gun follow-up/mount/reload/reset coverage and independent sensitivity checks. |

Validation: 107 test files / 817 tests passed; production build passed. Desktop browser review at phone viewport sizes verified combined firing, release over Lower preserving ammunition, and the responsive layout. This is still browser review with mouse input; the feel of the revised controls on a physical phone needs another playtest.

**Field visibility and retrieve refinement**

The phone HUD now prioritizes ammunition, the dog and wind. A closer sight picture enlarges the field by approximately 26% while the shotgun is shouldered (70° to 58° vertical field of view); choose Wide under Shot view to disable it. Swing sensitivity compensates for the optical change. Flight timing, bird models, shot patterns and collision rules are unchanged.

| Before | After |
| --- | --- |
| Large property/status panel with duplicated dog information. | Compact heading, tally, dog and wind display; only the tally stays during a mounted shot. Property and detailed navigation remain in menus/the atlas. |
| End hunt occupied field space. | The same action moves into Pause on touch devices, with immediate result display while paused. Desktop placement and existing completion restrictions remain. |
| Large persistent movement instructions and four shooting buttons. | Movement instructions remain in the entry menu. An 88px shotgun control, smaller secondary controls, and Lower only while raised leave more visible terrain. Whistle and Reload hide during a held shot. |
| Small distant birds in the wide shot view. | Default Closer sight picture and an optional Wide setting, with matched swing response. No additional effects or meshes. |
| Raising message could remain after a fast shot. | The raising message clears when the shot fires. |
| The 3D retrieve used the gentle trot scale. | Fetch/return use a dedicated faster scale while breed, fatigue and water effects remain. |
| Immediate return reversal and uncapped arrival travel. | Physical fetches turn before travel, then stop within pickup/delivery range; obstacle routing remains active. |
| Stationary carry could look like delivery during a turn. | Generated dogs offer the bird only during the actual delivery hold. The alternate procedural dog also separates pickup and carrying posture. |

Reproduction: an unobstructed marked 40m retrieve at level 8 originally took the English Setter 32.0 seconds and GSP 26.5 seconds, including pickup and delivery. Both now complete in under 23 seconds with pickup in under 12 seconds. Regression coverage also checks close falls on 250ms frames, bounded return turns, obstacle detours, and the real camera's enlargement/restoration. These are simulated timing checks, not physical-phone frame-rate measurements.

Browser review uses a 736 × 336 landscape field viewport to account for limited height from browser chrome, plus 390 × 700 portrait. The local preview remains on port 4593; refresh an existing phone tab for the rebuilt assets.


**Parallel blitz: mobile shooting and installed play**

Shot assistance now lives in Pause beside Shot view. Match difficulty uses the active hunt: Relaxed gets Generous, Balanced gets Light, and Wild gets Off. An explicit Off, Light or Generous choice persists separately. Changing the next hunt's challenge does not change the current hunt's assistance.

| Before | After |
| --- | --- |
| Identical near-miss tolerance for touch and desktop shots. | A bounded touch-only allowance, resolved at trigger request and retained through the existing early-mount buffer. |
| No explicit assistance choice. | Match difficulty, Off, Light and Generous in Pause, with no extra field control. |
| Browser-only entry point. | Separate installed 3D entry, remembered setup with a fresh hunt seed, and a staged update action at entry or completed results. |
| Frame statistics mixed counters and percentile windows. | Opt-in resettable capture, consistent frame windows, CPU phases, renderer object counts and downloadable device/build/context metadata. |

Light adds at most 0.45 degrees / 0.24 metres to the existing radial tolerance; Generous adds at most 0.8 degrees / 0.40 metres. Both limits apply. At 12, 30 and 50 metres, Generous adds 0.168, 0.400 and 0.400 metres respectively. Obstruction, weapon spread differences, travelling shot lead and the 55-metre maximum remain. Actual pointer provenance determines eligibility: showing Touch controls on a laptop does not assist mouse or keyboard shots.

No extra release smoothing has been added. The existing control uses the latest swing direction immediately; physical gesture traces are needed before introducing a filter that could delay an intentional swing. Pointer interruption, Lower, pause, reload and control resets retain their cancellation behavior.

The integrated UI was reviewed in Chrome at 844 × 390 and 390 × 700. Verified assistance choices, the active-hunt versus next-hunt distinction, keyboard access to collapsed app/diagnostic sections, and capture start/export through ordinary buttons, including exporting from completed hunt results. No browser errors were recorded. These are desktop layout and wiring checks, not physical touch acceptance.

For measured routes, add `diagnostics=1` to the game URL, expand Performance capture in the menu, name the route and select Start capture and play. Pause after the route and select Save report. This panel is absent from ordinary play. See [mobile-performance.md](mobile-performance.md) for the frozen desktop baseline and its limits, and [mobile-install.md](mobile-install.md) for secure-host installation and offline update verification. Local HTTP LAN play remains online-only; actual installed iPhone/Android acceptance is pending.

Combined checkpoint validation: 114 test files / 892 tests passed, with TypeScript and the production build passing. Existing large-bundle warnings remain. The new offline lifecycle also passed 12 real-browser checks; see the install runbook for exact artifact identity and limits.
