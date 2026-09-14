# Mobile playtest

The 3D game has touch movement, running, camera control, shotgun actions and goshawk actions. This pass starts from merged main at `9f7f56e` and is checkpointed separately on `codex/mobile-playtest`. Physical phone performance and Safari behavior still need device playtesting.

**Open on your phone**

Connect the phone and computer to the same Wi-Fi. Keep the computer awake. Run:

```sh
npm run play:mobile
```

This builds the game and serves `dist` on port 4593. Use the Network address printed by Vite, not localhost. During this review the Wi-Fi address was `192.168.1.9`; it can change when the computer reconnects.

- [Chukar Ridge](http://192.168.1.9:4593/index3d.html?area=chukar-ridge&drop=south-gate&quality=lite&tod=morning&dog=generated&controls=touch&challenge=relaxed)
- [Cattail Coverts](http://192.168.1.9:4593/index3d.html?area=pheasant-coverts&drop=west-track&quality=lite&tod=morning&dog=generated&controls=touch&challenge=relaxed)
- [Goshawk practice](http://192.168.1.9:4593/index3d.html?play=quick&method=goshawk&practice=slip&quality=lite&controls=touch)

Turn the phone sideways and tap Enter the field. These links select Lightweight graphics and Touch controls explicitly. The pause menu can change both. Automatic controls detect coarse pointing hardware; a saved control choice is used when the URL does not specify one.

If the page cannot load, check that the server is still running, the phone is using the same Wi-Fi, and the printed Network address matches the link. Guest networks can isolate devices. This is a local playtest link; it does not provide access away from this network.

**Controls**

| Action | Touch input |
| --- | --- |
| Walk | Drag on the left side; movement starts at your thumb's initial position. |
| Run | Drag farther until the movement ring says Run. Move back inward to walk. |
| Look | Drag on the right side with a second thumb. |
| Aim | Tap Aim to raise or lower the shotgun. |
| Fire | Tap Fire, or hold and drag on Fire to track, then release to shoot. |
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
