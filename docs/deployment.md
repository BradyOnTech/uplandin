# Deploying and updating Uplandin

Uplandin is configured for Cloudflare Workers Static Assets on the Free plan.
The production game is the normal `dist/` build. Briar Glen's independent
`dist-2d/` build is separate.

**Play:** <https://uplandin.brady-on-tech.workers.dev/>

The existing `uplandin` Worker is connected to `BradyOnTech/uplandin`.
**Pushes or merges into `main` start an automatic build and deployment.**
Static requests and storage cost $0; no paid plan or custom domain is needed.
The GitHub app has access only to this repository. The Cloudflare build token
is restricted to Workers Scripts edit and Account Settings read within the
Brady Cloudflare account.

## Release feature changes

1. Make and test the change locally. Run `npm test` for gameplay changes and
   `npm run build` to produce the complete production `dist/` folder.
2. Commit the intended files, then push `main` or merge the feature branch
   into `main`. Cloudflare installs dependencies, builds the game, and deploys
   the complete production `dist/` using the checked-in Wrangler configuration.
3. Open the [Uplandin Worker dashboard](https://dash.cloudflare.com/bc81aa678eddf93a3ac587d49faace10/workers/services/view/uplandin/production)
   and check the build result for that commit. A failed build keeps the previous
   production release live; fix the reported error and push again.
4. When the deployment succeeds, open the public game and verify the changed
   feature and a direct field URL. Check **Install & offline** for offline
   readiness if the release changes assets or navigation. The public address
   stays the same.

Pushes to other branches do not publish production. Preview builds are disabled.

## Connected Git build settings

The existing Worker named `uplandin` has these **Settings → Builds** values:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | `22.17.0` (also recorded in `.node-version`) |
| Build variable | `PUPPETEER_SKIP_DOWNLOAD=true` |

Cloudflare's build environment installs dependencies before running the build.
Puppeteer's browser download is skipped because it is only needed for local
capture and validation tools. Wrangler is a checked-in development dependency,
so the lockfile determines the deployment tool version.

The `wrangler.jsonc` configuration uploads `dist/` and preserves `.html` URLs.
`public/_redirects` serves `/index.html` at `/`, matching the PWA start URL.
`public/_headers` revalidates the service worker and precache manifest and gives
content-hashed JavaScript/CSS long-lived caching. Other static assets retain
Cloudflare's default revalidation behavior.

The production build uses the API token named `Uplandin Cloudflare build token`.
Keep its permissions limited to the two account permissions above. The separate
`Uplandin production builds` token created during setup is not used by this
connection; it did not appear in Cloudflare's connection selector.

## Player updates and rollback

Cloudflare publishes complete deployments; do not upload individual changed
files. If a release breaks, roll back to the previous production deployment in
Cloudflare and revert or fix the bad commit in Git before the next release.

An active hunt continues on its existing cached version. The game stages updates
in the background and offers **Update game** at a safe screen. Its worker may
ask the player to close other game tabs before applying the update. Closing
every game tab and reopening also allows a ready update to activate. Updates
preserve career saves, subject to the compatibility of future save migrations.

Saves belong to the browser and host address. Use **Export save** and
**Import save** to move a career from localhost, another device, or another
hosting address. Do not clear site data to refresh the game: it removes saves.

## Optional command-line release

After signing in to the same Cloudflare account with `npx wrangler login`, run:

```sh
npm ci
npm run deploy
```

This builds the game and uploads the complete `dist/` to the same Worker.
Manual publication and Git publication use the same Wrangler configuration.
The next push to `main` replaces a manual release with the build from that commit.

## Dashboard upload fallback

If Git builds are unavailable, run `npm run build`, choose **New deployment**
in the Worker dashboard, click **folder**, select the whole local `dist/` folder,
and choose **Deploy**. Preserve assets directory `/`, HTML handling `none`, and
not-found handling `none` if the uploader offers those options. Upload the built
folder, not the repository or individual files.

## Sources

- [Cloudflare Git build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Static asset deployment](https://developers.cloudflare.com/workers/static-assets/get-started/)
- [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
- [Redirects and proxy rules](https://developers.cloudflare.com/workers/static-assets/redirects/)
- [Static asset cache headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Puppeteer configuration](https://pptr.dev/api/puppeteer.configuration)

Local verification on October 2, 2026: production build passed; 36 focused
offline/update tests passed; Cloudflare's local runtime parsed the redirect and
header rules, returned the root and `.html` pages without redirects, and applied
the intended cache headers. Chrome opened the home/preparation flow and rendered
a live Quail Fields hunt.

Public verification: Cloudflare deployed 216 files as static assets (version
`a9b607e5`). Chrome opened the HTTPS root, followed the preparation flow, and
rendered an active Quail Fields hunt at an explicit `index3d.html` URL with
query parameters. The public **Install & offline** panel reported “3D game
saved for offline play.” Actual airplane-mode launch, installed mobile play,
and command-line publication were not tested during this deployment.
