# Offline menu preservation

The cold offline return from Quail 3D now reaches a readable menu, Quick Hunt setup and drop chooser. Unavailable artwork uses muted tiles and a brief notice. Ordinary controls can relaunch the cached GSP Quail hunt, and the next menu preload after reconnecting restores real artwork. This does not add 2D artwork to the 3D preload.

**Verified snapshot**

The durable report is `docs/3d/offline-preservation-evidence/report.json`. Its menu bundle is `main-xYFpkSTy.js` and game bundle is `boot3d-8t4TfEap.js`. Ten browser checks passed in disposable profiles at 1280 × 720, including online 2D entry, movement, voluntary finish and return to menu. No career was created and no uncaught page errors occurred.

The cold profile first visited only 3D. Its installed cache contained the application shell and all three GSP LODs, with zero 2D artwork entries. A local proxy then denied every new connection, including requests made by the service worker, while browser HTTP caching remained disabled. Under that boundary, normal input traversed menu → Quick Hunt → Quail drop chooser → 3D entry and movement. No GSP request reached the blocked network and the artwork cache remained empty. After network recovery, the next menu loaded the real art and cleared its notice.

The screenshots in `offline-preservation-evidence` show the offline title and setup, restored setup after reconnecting, and the online 2D field. These are preservation evidence for this implementation snapshot; they do not approve the pending GSP anatomy, gait or final visual quality.

**Reproduce**

Build and serve an immutable production snapshot:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

In another terminal, run:

```sh
node tools3d/validate-offline-preservation.mjs --url http://localhost:4173 --out artifacts/3d/offline-preservation
```

The test creates its own temporary proxy origin and browser contexts. It does not open the user's browser, change a user profile, or seed gameplay state. Add `--headed` to see its ordinary UI inputs. A development server is rejected because reloads and unbuilt service-worker resources invalidate this evidence. The report records the browser arguments, actual loaded bundles, cache inventory, failed requests and screenshots. A failed assertion exits unsuccessfully and preserves the current state.

**Earlier offline evidence is superseded**

`tools3d/validate-offline.mjs` and the initial page-only menu probe used `page.setOfflineMode(true)`. That check established physical cache contents and service-worker responses, but it did not establish a complete network outage: service-worker fetches could still reach the network. A first cold menu result appeared to load artwork even though its art cache was empty. That result was rejected after inspecting the actual cache and network boundary.

The newer proxy test supersedes those results for cold offline availability. It also explicitly controls the browser's reported connectivity through `Network.overrideNetworkState`, because `navigator.onLine` remained true after a service-worker navigation in this Chromium test environment. The proxy's denial is independent of that reported state. Uncached 2D art really fails during this test; a service-worker response alone is not accepted as proof that its body came from cache.

**Limits**

This smoke does not complete a 2D shooting and retrieval hunt, establish offline replay, simulate cache eviction or an interrupted installation, or verify a physical phone. Those remain separate checks. Later code or asset bundles require their own reconciled evidence.
