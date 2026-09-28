# Installed 3D playtest

The 3D app retains its separate install identity and now opens native preparation at `prepare3d.html?installed=1`. Preparation restores the last successfully launched choices and reads current Quick Hunt and Career saves. Launching starts a fresh hunt; ordinary shared field links retain their explicit setup and replay seed. Older installed links to `index3d.html` remain supported. The existing 2D install identity and saves are preserved.

This is a local implementation checkpoint, September 27, 2026. No hosting destination has been selected or published by this work. Physical iPhone/Android install, orientation and sustained-performance acceptance remain outstanding.

**Prepare a candidate**

1. Integrate the HTML metadata and boot/menu hooks with the same source checkpoint. Run the production build once in an isolated candidate directory, record its commit and preserve the complete resulting artifact.
2. Serve that artifact at an approved HTTPS origin, either at its root or under a directory with a trailing slash. Keep HTML, `sw.js` and `precache.json` revalidatable; hashed assets may be immutable. Publish the directory atomically and retain the preceding artifact for rollback. Do not replace files behind an active shared playtest server during another worker's build.
3. Open `/prepare3d.html` (or the corresponding subpath), expand the offline details, wait for the offline-ready message, then install from that page. Raw LAN HTTP supports online play but does not provide the secure context required for the worker on a remote phone. Desktop localhost is suitable for worker checks.

Installation and preferences belong to the chosen origin/browser storage. LAN choices and career data do not automatically migrate to a new HTTPS origin. An existing 2D Home Screen icon keeps its original launch; add the new 3D icon from the 3D page.

**On iPhone**

In Safari, open the HTTPS 3D page, use Share → Add to Home Screen, and keep Open as Web App enabled when offered. Launch from the new icon. Apple documents this [Home Screen web-app flow](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios); [WebKit describes standalone behavior](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).

Check the actual phone and OS: browser-toolbar absence, safe areas, portrait/landscape transitions, background/resume, touch shooting, gun-rack return and a cold offline launch. The manifest requests landscape; it does not prove the device locks orientation. The OS status/home indicators may remain. Test Android installation separately when a device is available.

**What is saved offline**

A build is ready only after every listed shell, JS/CSS chunk, terrain texture and required model has cached successfully. This includes Standard/Lite Chukar and Quail kits, the rigged GSP fallback, generated gameplay and the wet-alder ground texture. The message applies to the 3D game, rather than always naming Quail. 2D artwork is saved as visited, not all downloaded in advance; its existing unavailable-art fallback remains necessary.

The cache is not a guarantee against browser eviction or user-cleared site data. Interrupted installs discard the incomplete new cache and leave the active shell intact. A manifest from a mismatched deployment is rejected. Worker-source changes participate in the build fingerprint, so a worker-only fix receives a separate cache.

**Updates without losing a hunt**

A completed new worker waits; downloading it never forces activation or reload. Preparation and the entry menu/results offer an explicit update action. A paused active hunt remains protected. The page checks that reload is safe before requesting activation and again when the controller changes.

The waiting worker also checks every game window in its scope, including legacy 2D windows. If another window is open, it asks the user to close that window before retrying. Closing all game windows naturally allows the browser to activate the update; this also upgrades an older version with no update UI. This follows the browser's [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle).

At activation, retain the current and immediately preceding activated shells. Discard abandoned staged shells and older scoped shells; do not choose a newer abandoned staging cache as the predecessor. Content-hashed lazy chunks may fall back to the retained shell, while HTML and mutable public assets stay within their version. The first migration additionally retains the prior legacy shell; the next scoped upgrade retires it. Previously visited 2D art moves into a persistent scoped art cache. Other deployment scopes and unrelated caches remain untouched.

An explicit preparation update preserves the current unsaved form in session storage, checks it again immediately before reload, and restores it once against the latest saves. This includes initial dog setup and Quick Hunt choices; it does not serialize an older Career save over current progress. If another window or unavailable storage blocks the update, the form remains editable and retry captures its latest values.

An active hunt is not serialized to disk by this package. Safe updating protects the running hunt by deferring reload; normal hunt completion remains responsible for career/results persistence.

**Verification at this checkpoint**

Focused worker, client and installed-launch tests exercise successful offline cold shell/chunk reads, interrupted and mixed-build installs, old-tab blocking, explicit safe reload, entry/activation races, bounded predecessor retention, legacy art migration, root/subpath icons, fresh installed seeds, direct replay preservation, denied storage and exclusion of career/capture launches from saved standalone choices. These are code-level checks, not browser or physical-device acceptance.

Run the focused checks with:

```sh
npx vitest run test/offlineWorker.test.ts test/offlineClient.test.ts test/installedLaunch.test.ts test/preparationOffline.test.ts
```

**Actual browser evidence**

`output/blitz-offline/report.json` records 12 checks in disposable Chrome 148.0.7778.97 contexts. The frozen production build is `0910d1f965767c3d`, captured from commit `201a8098` plus the in-progress blitz patch; the complete source fingerprint is `886caba9bff63e47e44424f46f5ab44ae1c32d4530208a88962f737de4f01e30`. `source-manifest.json` records every input. The isolated build and port 4631 did not replace the user's preview or browser profile.

A is that production artifact. B (`568bd30fa55efb43`) and C (`415a8612af8fc49e`) retain its real assets and add an HTML comment with a recomputed worker/build fingerprint to exercise deployment transitions. Both root and `/sub/` installations passed complete precaching, staged updates without replacing the open page, second-window activation blocking, explicit safe activation, retained previous chunks, visited-art preservation, and rejection of an injected interrupted C download. Only current/previous scoped shells remain after the subsequent successful C update. The injected failed installs produced the expected worker rejection; no unexpected browser errors occurred.

With the origin server destroying every new connection and browser HTTP caching disabled, a fresh window fetched the real 3D HTML, every built JS/CSS chunk and visited 2D art from CacheStorage. A genuine cold installed launch at `/sub/` then reached the paused Lightweight Chukar entry menu with GSP/generated-dog choices and a fresh seed. After reconnecting, the integrated Update game button applied C from the pre-entry menu and returned to a ready field. Saved career and quality values remained byte-identical. Screenshots are `cold-offline-chukar-menu.png` and `safe-updated-chukar-menu.png`; the reproducible script is `output/blitz-offline/validate.mjs --gameboot`.

These checks validate the browser lifecycle and paused startup. They do not complete a hunt, exercise the full 2D career flow, prove a physical Home Screen install or establish phone performance. Existing 2D gameplay preservation evidence remains separate. Remaining acceptance is a named physical phone/OS install, toolbar/safe-area and orientation review, background/resume, a completed hunt and offline restart. No user cache or save was cleared during this validation.

**September 27 native preparation evidence**

Commit `fa9b93a` adds native installed preparation and preservation of unsaved update drafts. Forty focused checks, TypeScript and the production build pass. Nine actual Chrome 153 service-worker/UI cases pass without unexpected errors in `output/installed-preparation-browser/report.json`: first offline cache, another-tab activation block, editable retry and restored newest draft, denied storage, explicit Career initialization, Quick launch save isolation, cold native offline launch, legacy direct installed field launch and explicit outfit overrides. Portrait and landscape form screenshots were reviewed.

The worker transitions vary build identities over the same application runtime; they do not prove migration between different application schemas. The cold offline case blocks network connections and disables HTTP caching. This establishes desktop browser behavior, not physical Home Screen installation, orientation, thermal behavior or a completed phone hunt. The accepted source is frozen on local port 4615; no hosted deployment is implied.
