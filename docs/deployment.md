# Deploying and updating Uplandin

Uplandin is configured for Cloudflare Workers Static Assets on the Free plan.
The production game is the normal `dist/` build. Briar Glen's independent
`dist-2d/` build is separate.

## Initial setup

Connect `BradyOnTech/uplandin` to a Cloudflare Worker named `uplandin`, using:

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

## Release feature changes

1. Make and test the change locally. Run `npm test` for gameplay changes and
   `npm run build` to confirm the production build succeeds.
2. Commit the intended files and push to `origin/main`, or merge your feature
   pull request into `main`. Pushes to another branch do not publish production.
3. Check the Worker build in Cloudflare. With the Git connection enabled,
   Cloudflare builds the new commit and publishes it at the same public address.
4. Open that address and verify the changed feature. Check a direct field URL
   and wait for offline readiness if the change affects assets or navigation.

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

## Manual release

After signing in with `npx wrangler login`, run:

```sh
npm ci
npm run deploy
```

This builds the game and uploads the complete `dist/` to the same Worker.
Manual publication and Git publication use the same Wrangler configuration.
If the Git connection is enabled, the next push to `main` replaces the manual
release with the build from that commit.

## Sources

- [Cloudflare Git build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Static asset deployment](https://developers.cloudflare.com/workers/static-assets/get-started/)
- [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
- [Redirects and proxy rules](https://developers.cloudflare.com/workers/static-assets/redirects/)
- [Static asset cache headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Puppeteer configuration](https://pptr.dev/api/puppeteer.configuration)

This guide describes the configured workflow; successful public deployment and
the Git connection still need verification in Cloudflare.

Local verification on October 2, 2026: production build passed; 36 focused
offline/update tests passed; Cloudflare's local runtime parsed the redirect and
header rules, returned the root and `.html` pages without redirects, and applied
the intended cache headers. Chrome opened the home/preparation flow and rendered
a live Quail Fields hunt. Public hosting has not yet been verified.
