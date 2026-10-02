# Hosting Uplandin for friends

Researched October 2, 2026. Repository inspected at `da23c9e59198cd326e013f65622459d595a51ddf`. Prices are USD; provider terms and quotas can change. This is a recommendation and deployment recipe; nothing has been deployed.

## Recommendation

Use **Cloudflare Workers Static Assets on the Free plan** for the main game. Expected hosting cost is **$0/month** with a supplied `workers.dev` address; a purchased domain is optional. The game runs in each player's browser, so a static host is sufficient. Cloudflare serves static assets without running server code, makes static requests free and unlimited, and charges nothing extra for asset storage. Cloudflare now recommends Workers for new projects rather than Pages. [Static asset behavior](https://developers.cloudflare.com/workers/static-assets/), [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [current Pages guidance](https://developers.cloudflare.com/pages/), [provided deployment addresses](https://developers.cloudflare.com/workers/ci-cd/builds/).

**itch.io is the best secondary option** if a game page with screenshots, comments and discovery matters more than a standalone app address. Uploading and hosting are free. Keep Cloudflare as the primary browser/PWA link, and consider an itch.io release later. This preference is an inference from this game's existing install/offline features and itch.io's iframe presentation; the embedded game and PWA behavior have not been tested there. [Creator FAQ](https://itch.io/docs/creators/faq), [HTML5 hosting](https://itch.io/docs/creators/html5).

## What this game needs

The checked-in [`package.json`](../package.json) builds with TypeScript and Vite. [`vite.config.ts`](../vite.config.ts) uses relative asset paths and emits ordinary HTML, JavaScript, images and models into `dist/`. The current normal build serves the shared home/preparation and 3D hunting flow. Briar Glen is a separate experiment with `dist-2d/`; it should not replace the main game deployment.

No multiplayer transport or remote game backend was found in `src/`. Career data lives in browser `localStorage`, with existing file export/import in [`saveTransfer.ts`](../src/three/saveTransfer.ts). Hosting lets friends play their own games from one link. It does not add simultaneous multiplayer or automatic cross-device saves. A new host address also gets separate browser storage; export a save before moving it to the public address.

The production build passed locally with Node **22.17.0**. Measured output:

| Item | Result |
| --- | --- |
| Entire `dist/` | 214 files; 40,659,055 bytes, approximately 38.78 MiB |
| Largest single file | 2,713,836 bytes, approximately 2.59 MiB; a prototype reference PNG |
| Offline precache | 88 files; approximately 5.85 MiB; all listed files exist |

These are deployment sizes, not a measurement of an individual player's network transfer. The existing worker precaches the game shell/assets and preserves safe update transitions. A first-time visit still needs an internet connection; mobile performance and installation should be verified on actual phones. Sources: [`vite.config.ts`](../vite.config.ts), [`public/sw.js`](../public/sw.js), [`mobile playtest guide`](3d/mobile-playtest.md).

## Alternatives and costs

| Host | Cost and useful limits | Fit for Uplandin |
| --- | --- | --- |
| **Cloudflare Workers Static Assets** | Free static requests and storage. Free plan: 20,000 asset files, 25 MiB maximum per file, 3,000 build minutes/month, one concurrent build. | Best overall. Current build fits comfortably. No server script is needed; deploy built output without making the source repository public. [Billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [asset limits](https://developers.cloudflare.com/workers/platform/limits/), [build quotas](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [static deployment](https://developers.cloudflare.com/workers/static-assets/get-started/). |
| **Cloudflare Pages** | Free static requests; advertised unlimited bandwidth. 500 builds/month, 20,000 files, 25 MiB/file. Supports private and public GitHub repositories. | Still a good, simple `npm run build` → `dist` option. Workers is Cloudflare's preferred starting point now. [Pricing](https://developers.cloudflare.com/pages/functions/pricing/), [bandwidth](https://www.cloudflare.com/products/pages/), [limits](https://developers.cloudflare.com/pages/platform/limits/), [Git support](https://developers.cloudflare.com/pages/get-started/git-integration/). |
| **itch.io** | Free hosting. HTML5 ZIP: at most 1,000 extracted files, 500 MB total, 200 MB/file. | Current output fits. ZIP the contents of `dist/` with `index.html` at ZIP root; choose HTML Game and click-to-launch fullscreen. Test navigation, touch, saves and offline behavior in its iframe. [Cost](https://itch.io/docs/creators/faq), [upload requirements](https://itch.io/docs/creators/html5). |
| **GitHub Pages** | Free for public source repos; publishing from private repos needs a paid GitHub plan. Site limit 1 GB; soft bandwidth limit 100 GB/month. | Works technically, but less attractive if the source should stay private. A separate public repository containing only the built distribution is another workflow. [Availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). |
| **Vercel Hobby** | Free for personal, noncommercial use; 100 GB data transfer and 1 million CDN requests/month. Pro starts at $20/month. | Good alternative for personal sharing. Hobby cannot import private organization repositories; personal private repositories have different rules. Less flexible if monetizing later. [Hobby quotas](https://vercel.com/docs/plans/hobby), [Git restrictions](https://vercel.com/docs/git), [paid pricing](https://vercel.com/pricing). |
| **Netlify Free** | 300 credits/month. Production deploy: 15 credits; bandwidth: 20 credits/GB; requests: 2 credits/10,000. Personal: $9/month, 1,000 credits. | Easy deployment, but frequent releases consume the shared allowance. Projects pause at quota exhaustion. Organization-owned private repositories require Pro. [Credit rates](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [pause behavior](https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/), [repository/pricing details](https://www.netlify.com/pricing/). |

For perspective, Netlify's 300 credits would cover **14.25 GB after one production deployment**, before request usage: `(300 - 15) / 20`. Ten production releases leave at most **7.5 GB** for bandwidth. These are calculations from the published rates, not traffic forecasts. Cloudflare avoids that bandwidth/deploy credit tradeoff for this static game.

## Proposed Cloudflare setup

1. Keep the game on the existing `main` branch. Add a small Wrangler configuration when deployment is requested; no game server or database is necessary.
2. Pin Node 22.17.0 or a tested newer Node 22 release. Install with `npm ci`, then build with `npm run build`. Set `PUPPETEER_SKIP_DOWNLOAD=true` in the build environment because Puppeteer is capture/validation tooling, not part of the production build. The environment option is supported by Puppeteer. [Puppeteer configuration](https://pptr.dev/api/puppeteer.configuration), [Cloudflare build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
3. Deploy `dist/` as static assets, either through Wrangler or Cloudflare's repository integration. Git integration can build and deploy automatically on push, and provides the deployment's `workers.dev` link. [Static deployment](https://developers.cloudflare.com/workers/static-assets/get-started/), [Git builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
4. Share the root HTTPS address for the home flow; direct hunt links can retain their parameters. Verify the first load, a completed hunt, save export/import, phone controls, installed launch, offline launch and an update before sending it widely.

Suggested `wrangler.jsonc` configuration, to implement and verify during deployment:

```json
{
  "name": "uplandin",
  "compatibility_date": "2026-10-02",
  "assets": {
    "directory": "./dist",
    "html_handling": "none"
  }
}
```

Suggested `public/_redirects` (Vite copies it into `dist/`):

```text
/ /index.html 200
```

This preserves explicit `.html` game URLs while rendering the root from `index.html`. Cloudflare's default HTML handling redirects `/index3d.html` to `/index3d`; this repo's offline navigation keys and installed-choice logic expect the `.html` paths. Disabling that handling avoids this mismatch, while the explicit root rule keeps the PWA's `start_url: "./"` usable. Official docs show that `none` serves `.html` directly, and `_redirects` supports relative URL proxying with status 200 and follows matching rules regardless of an asset match. The combination is a documentation-supported proposal, not a deployed verification. [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), [redirect/proxy rules](https://developers.cloudflare.com/workers/static-assets/redirects/), [`offline.ts`](../src/three/offline.ts), [`service worker`](../public/sw.js).

Leave the project as pure static assets. Dynamic Worker requests have separate compute quotas and billing; they are unnecessary for the current game. If cloud saves or multiplayer are added later, evaluate those requirements then. Workers Paid has a $5/month minimum plus usage, but it is not needed for this release. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
