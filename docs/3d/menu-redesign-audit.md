# Complete menu redesign audit

The player now enters through a shared native home and preparation flow for both 3D and Classic 2D. Ordinary navigation no longer depends on the old Phaser selection menus. Property, dog and gun previews show the actual game assets; results and the journal use a consistent paper-and-ink field-book treatment. Career rules, Quick Hunt isolation and renderer-specific gameplay remain intact.

This audit began on 2026-09-29 as a pre-change inventory and now records the implemented surfaces and the parent's combined browser review. The previous root booted the Phaser title, native preparation only launched 3D, and Classic results were drawn on the canvas. Those routes and presentations have been replaced. The verified browser cases below are desktop-browser checks at specified viewport sizes, not physical-phone or installed-device acceptance.

**Current player-facing surface inventory**

| Surface | Player route and actions | Current source and scope |
| --- | --- | --- |
| Home/title | `/`, `index.html` and `home3d.html`; Quick Hunt, start/continue Career, four property previews, play settings, gun rack and journal. | `src/three/home.ts/.css`. Generated landscape supplies the title composition; actual property captures identify the four core hunts. Explicit saved 2D preference is retained; no-preference home starts with 3D. |
| Play settings | Choose 3D or Classic 2D; installation instructions, cache/update status and safe update action. | Home's native dialog. Uses the existing renderer preference and shared saves. Field-specific settings remain in the field, rather than implying that 3D controls change Classic play. |
| First career | Choose a breed, name the dog and select home region; create the initial kennel/home together. | `preparation.ts::dogForm` and `huntPreparation.ts`. Native onboarding replaces the ordinary legacy Breed/Map route and retains the pending puppy draft during rerenders. |
| Career travel/calendar | Home/travel eligibility, property openers, waiting, next season, hunter progress, tracking gear and shotgun. | Shared preparation and the existing pure preparation/progression models. Calendar, unlocks and capacity follow existing rules. |
| Kennel and loadout | Select lead and brace, inspect age/level/XP and next development, add a dog when capacity allows. | Preparation Kit panel with game-rendered dog and gun previews. Existing dog, breed, capacity, brace and equipment eligibility remains authoritative. |
| Quick setup | Property, breed/level/brace, weather/wind, gun/method and tracking gear. | Same native preparation shell. Quick setup has its own saved configuration and never advances Career. Goshawk remains a clearly identified 3D-only Quick variant. |
| Ground/drop selection | Scene and survey views, property identity, authored truck entry and launch eligibility. | `maps/preparationMap.ts`, preparation Ground panel and actual property artwork. Authored drops and geography remain authoritative; the scene preview is not a substitute for the atlas. |
| Preparation shell | Ground/Kit/Conditions tabs, Career/Quick, renderer link, journal/rack and a persistent launch action. | `prepare3d.html`, `preparation.ts/.css`, `menuSelect.ts/.css`. Custom choices retain native select values, IDs and change events. Local panels scroll within the viewport. |
| Field loading/entry | Property and hunt identity, readiness/progress, entry action, failure/retry and preparation return. | `index3d.html`, `fieldInterface.ts`, `fieldMenus.css`. Ready, loading, failed and context-recovery states retain their functional paths. Prepared hunts use a compact arrival card with optional equipment review; standalone links and pause retain the full menu. Gameplay HUD labels stay hidden behind entry/pause. Portrait and short-landscape arrival, expansion/collapse, entry and pause were checked in the final build. |
| Pause / Your hunt | Resume, current gun, rack link, challenge, preparation return and End hunt. | The redesigned 3D field shell. Challenge changes before entry can reload; after entry they apply to the next hunt. |
| Field settings | Light, quality, control mode, audio, Shot view; touch sensitivities/assistance where applicable. | Existing preference and input models through the new shell. Current-visit preferences and explicit quality semantics remain intact. |
| Controls and field guide | Input-specific bindings, species advice, contextual-tip preference and repeat-tips action. | Existing `firstHuntGuide.ts` behavior inside the redesigned pause UI. Mouse, trackpad and touch instructions remain distinct. |
| Survey | Native modal atlas with pan/pinch/wheel, zoom, fit/find-me/truck, terrain/cover key and current player/dog/truck readings. | `subsystems/fieldMap.ts`, `maps/` and field-map styles. The actual interactive map remains in place; it received a landscape browser check. |
| 3D results | Actual bag/outcomes, Career awards/unlocks/dog development/calendar, replay, preparation, season planning and journal. | `subsystems/huntHud.ts`, `fieldNotes.ts` and result styles. Presentation consumes the existing settlement; it does not award again. Falconry retains its own outcome copy. |
| Field journal | Empty/legacy states and latest 30 actual Career entries, with local scrolling and native Close. | `huntJournalView.ts/.css`, `game/huntJournal.ts`. New field-book presentation includes a recent-history overview without reconstructing old records. |
| Gun rack | Four actual models, selection, rotation/zoom/fixed views, reload/action controls, design notes and a Pheasant field preview. | `shotguns3d.html`, `shotgunViewer.ts/.css`. The preview action is explicitly labeled; it does not pretend to resume the caller's Career or Quick Hunt. |
| Classic field and results | Validated direct Classic launch, original field/shooting controls, native field report, replay and shared preparation return. | `classic.html`, `src/main.ts`, `game/classicLaunch.ts`, `FieldScene.ts`, `ui/classicSummary.ts/.css`. `FlushScene` still transfers the live hunt/dogs/simulation. Classic has no separate pause/settings/survey equivalent to redesign. |
| Installation/offline/error | Cache readiness, update readiness/applying/blocked/failed, unsupported conditions and preparation-draft preservation. | `offline.ts`, `preparationOffline.ts`, `public/sw.js`, manifests and build precache. Home and preparation use the existing lifecycle. Installed/offline behavior was not freshly certified on a physical device in this menu review. |

Legacy Breed, Map, Kennel, Area, Quick and Drop scene source remains available for compatibility, but the new main bootstrap does not register that selection stack. `TitleScene` redirects to the shared home if reached. Developer pages under `tools3d/` remain authoring/review tools and are not ordinary player menu destinations.

**Launch, return and save contracts**

Home carries explicit `renderer=2d|3d` into `prepare3d.html?mode=career|quick`. Both views use the same Career and Quick keys; renderer choice is not a save slot. Preparation's explicit mutations re-read and validate the current Career. Viewing the screen or editing an unsaved draft does not settle a hunt, award XP or spend a week.

`commitCareerLaunch` and `commitQuickLaunch` validate the property, drop and loadout. The preparation adapter changes the validated `index3d.html` destination to `classic.html` only for Classic. Goshawk resolves to 3D even if the requested view is Classic. Career URLs include the property; Quick uses its saved setup. Renderer intent survives mode switches and the preparation offline-reload path.

`src/game/classicLaunch.ts` revalidates current saves at the Classic page boundary. Valid launches supply fresh data to `FieldScene`; absent or invalid launches return to shared home/preparation. `src/main.ts` is now only the Classic gameplay bootstrap. The live `FlushScene → FieldScene` transfer is unchanged and does not run through a fresh URL resolver.

Both result routes preserve mode, property, entry and the selected graphics preference when returning to preparation. Classic adds `renderer=2d`. Classic replay passes through the validated page boundary again, so a completed season or changed save cannot bypass eligibility. `build3DPreparationHref` retains `quality=auto|lite|high`, not the resolved graphics tier; the 3D HUD resolves the return from the current location so a later field preference change is retained.

The Classic completion boundary now latches before settlement, saves the Career result once, then opens a read-only native report. It stops field input and simulation while the report is shown and disposes its DOM on scene shutdown/destroy. Quick does not call Career settlement. The report counts retrieved birds separately from merely downed birds, reports existing work and consequences, and does not invent elapsed time or expose unseen stocking as a completion target. Escape returns to preparation rather than resuming a completed hunt.

**Artwork provenance and authoring**

The shipping menu images live under `public/art/menus3d/`. `src/three/menuArt.ts` resolves property/title URLs with the application base path. Preparation loads dog and gun previews from the same asset directory. Static images keep home and preparation independent of an active WebGL context; the interactive gun rack still uses the actual model renderer.

| Files | Source and meaning |
| --- | --- |
| `quail-fields.webp`, `pheasant-coverts.webp`, `chukar-ridge.webp`, `sharptail-prairie.webp` | Captures of the actual runtime properties, using staged cameras, documented views and lighting in `tools3d/menu-art-studio.ts`. These are game-render previews, not generated concept paintings or evidence of a natural hunt. |
| `dogs/gsp.webp`, `dogs/english-setter.webp` | Actual runtime dog assets rendered in the authoring studio: generated GSP and current Setter renderer. They depict the chosen breed asset, not every coat/age state. |
| `guns/remington-870.webp`, `guns/side-by-side.webp`, `guns/over-under.webp`, `guns/semi-auto.webp` | Actual sporting shotgun models rendered without hands in the studio. No substitute product photography is used. |
| `title-landscape.webp` | Generated title illustration, distinct from the property captures. Original PNG: `/Users/bradya/.codex/generated_images/01a06e19-2078-7df2-9635-befac80304f1/exec-bc8e48b0-76df-4582-944b-3f829634f76b.png`. Converted with `cwebp` at quality 85. It supplies title atmosphere and is not a claim about a playable camera view. |

The reusable authoring entry is `tools3d/menu-art-studio.html` with `tools3d/menu-art-studio.ts`. It stages the existing world/model assets, renders a preview and exports WebP. The utility's browser export uses quality 0.88; the generated title's separate quality-85 conversion is recorded above. Artwork is served as static files, with no image-generation request during play. `vite.config.ts` includes all eleven menu images and the home/classic entry documents in the build's precache list. This source/build coverage does not itself demonstrate installed offline use on a device.

**Verified browser and automated evidence**

The parent reviewed the combined menu candidate on port 4691 at 1366×768, 375×667 and 844×390. The actual interaction checks included fresh Career creation; a Classic launch, End hunt, native results and return to the correct Classic preparation; a 3D Quick Hunt through survey, pause, results and journal; rack selection/reload/design notes; and a 30-entry journal in short landscape. These are real page/UI actions in a desktop browser. They do not establish physical touch ergonomics, phone Safari keyboard behavior or shooting comfort.

Saved evidence is under `output/menu-art-direction-review/`. The delivery screenshots include `preparation-laptop-final.png`, `kit-phone-final.png`, `breed-picker-phone-final.png`, `career-phone-final.png`, `home-tablet-final.png`, `home-landscape-final.png`, `preparation-tablet-final.png`, `arrival-phone-delivery.png`, `arrival-landscape-delivery.png`, `pause-phone-delivery.png` and `touch-settings-phone.png`. Representative files are `home-laptop.png`, `home-phone.png`, `preparation-laptop.png`, `ground-phone.png`, `career-phone.png`, `breed-picker-phone.png`, `entry-landscape.png`, `survey-landscape.png`, `results-phone.png`, `classic-results-phone.png`, `classic-results-landscape.png`, `journal-empty-phone.png`, `journal-landscape.png`, `rack-phone.png` and `rack-landscape.png`.

`tests.log` records 1,481 passing tests across 188 files. `build.log` and `final-build.log` record production builds; the final build includes the shared home, preparation, Classic bootstrap and report. This is a package checkpoint, not a claim that every test is a menu acceptance case. The subsequent final review verified the sticky onboarding action, native missing-name validation, successful first-career submission, enlarged dog/gun images, chooser focus return, compact arrival expansion/collapse and full pause after entry. The final CSS correction hides gameplay labels while the field menu is visible and restores them during play. `final-focused-tests.log` records another 64 passing tests across seven relevant files after the arrival revision.

Meaningful contracts are covered by `test/classicLaunch.test.ts` and `classicSummary.test.ts`: current-save launch validation, Classic preparation return, 3D-only goshawk, exactly-once completion/save, no simulation after results, Quick save isolation and truthful report values. Existing `huntPreparation`, `career`, `season`, `careerProgress`, `huntJournal` and `fieldNotes` tests cover the shared rules. `menuSelect` tests exercise value/change authority, descriptions, keyboard/disabled state and rerender cleanup. Quality/input and offline-client/worker tests protect preference and update semantics. Automated fixtures do not substitute for browser layout or user judgment of the visual direction.

**Delivery and follow-up acceptance**

| Area | Evidence or follow-up |
| --- | --- |
| Final combined presentation | Complete for this package. Delivery build: `output/review-menu-redesign-delivery`, served at `http://127.0.0.1:4693/`; `delivery-build.log` records its successful production build. Additional checks cover 1024×768 tablet home/preparation, 844×390 home/arrival, 375×667 entry/pause, long touch settings in both phone orientations, and all 30 journal entries reachable. User judgment of the visual direction remains separate from test counts. |
| Complete renderer/mode matrix | The reviewed Classic round trip and 3D Quick flow are substantial coverage. Do not imply that every Career/Quick × renderer × season-end combination received a new browser outing. Focused tests protect the shared contracts. |
| Physical mobile | Check actual phone portrait/landscape, Safari/Chrome safe areas, on-screen keyboard during naming, touch targets and scrolling. Desktop viewport emulation does not certify these. |
| Accessibility | Native modal focus and keyboard controls have targeted checks. Screen-reader flow, large text/zoom and every long-name/long-description combination still need deliberate acceptance. |
| Failure recovery | Preserve existing retry, storage-denied/full, stale-save, context loss and update-blocked behavior. The redesign review did not exercise every failure state in a browser. |
| Installed/offline device | Verify a newly installed and an upgraded app on real devices, including safe areas, cached entry assets, incomplete-cache messaging and draft-safe update activation. Do not infer this from precache contents or prior offline work. |
| Scope fidelity | Classic selection and results now use native menus; Classic gameplay remains its original 2D renderer. The four-core property focus, hunting rules and shared progression were not expanded by the menu redesign. |

The previous containment/custom-picker pass did not cover the root title, legacy selection journey, Classic results or a shared 2D handoff. This package closes those implementation gaps and adds concrete combined browser evidence. Remaining acceptance should address the specific limits above rather than restart the menu architecture or equate the full automated test count with complete product polish.

**Sources**

- `index.html`, `home3d.html`, `prepare3d.html`, `classic.html`, `index3d.html`, `shotguns3d.html`, `vite.config.ts` and `public/manifest*.webmanifest`.
- `src/three/{home,preparation,fieldInterface,fieldNotes,huntJournalView,shotgunViewer,offline,preparationOffline,menuSelect,menuArt}.ts` and related styles.
- `src/main.ts`, `src/scenes/{Title,Field,Flush}Scene.ts`, `src/ui/classicSummary.ts/.css` and `src/game/{classicLaunch,gameplayMode,huntPreparation,career,quick,season,careerProgress,huntResults,huntJournal}.ts`.
- `tools3d/menu-art-studio.html`, `tools3d/menu-art-studio.ts`, `public/art/menus3d/` and the generated title PNG path above.
- `output/menu-art-direction-review/`, the focused test pointers above and [[responsive-menu-overhaul]].
