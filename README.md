# Uloominate — click-through prototype

An Islamic digital-resources marketplace: vendors publish downloadable
educational resources, an administrator approves them against a content
standard, and educators buy and re-download them without limit.

Built from `Uloominate_BRD_v1.0`, `Uloominate_PRD_v1.0` and the `Uloominate.fig`
design file. The three designed pages are replicated from the Figma source
itself — the archive was decoded and its node tree read directly.

## Putting it online (what to send a client)

The prototype is plain static files, so any static host serves it as-is - and
once it is hosted the "needs a server" notice can never appear again.

Everything for GitHub Pages is already committed: `.nojekyll`, `robots.txt`, a
`404.html`, and a workflow at `.github/workflows/deploy-pages.yml`. Push the
folder, set **Settings -> Pages -> Source: GitHub Actions**, and the link is
`https://your-name.github.io/your-repo/`.

Double-click `publish-to-github.bat` to do the push. **[DEPLOY.md](DEPLOY.md)
has the whole thing step by step**, including Netlify Drop if you need a link in
sixty seconds.

## Running it locally

**Double-click `start-mac-linux.command` (macOS/Linux) or `start-windows.bat` (Windows).**
It starts a small local server and opens the start page. Leave the window open
while you use the prototype.

No server at hand? Open `standalone.html` - the whole prototype compiled into
one self-contained file that runs straight from disk. Only screens that take an
id in the address (product detail, vendor storefront) need the served copy.

Not sure? Open `START-HERE.html` - it detects how you opened it and tells you what to do.

Prefer to do it yourself:

```bash
cd path/to/this/folder
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

### Why a server is required

Every page loads its data with an ES module `import()`. Browsers block that over
`file://` for security, so **double-clicking a `.dc.html` file shows the layout
with no data** - empty grids, permanent loading states, dead buttons. Nothing is
broken; it just needs to be served over `http://`. Any static server works:
`npx serve .`, `php -S localhost:8000`, or the launchers above. Hosting it
removes the problem entirely.

An internet connection is needed on first load: the component runtime pulls React
and the web fonts from a CDN. Self-host both before launch.

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@uloominate.com` | `admin1234` |
| Vendor — Premium, approved | `reyes@literacylane.com` | `vendor1234` |
| Vendor — Pioneer, free tier | `yusra@kindergartenhub.org` | `vendor1234` |
| Vendor — pending approval | `contact@muslimlegacyseries.com` | `vendor1234` |
| Customer | `aisha.rahman@example.com` | `customer1234` |

The dev toolbar in the bottom-right of every page (or ⌘/Ctrl + `.`) switches
role without a password, jumps to any page, flips the pre-launch gate, and
resets the demo data.

## What to click to verify it works

1. **Browse** — open `Browse.dc.html`. Tick *Math* in Product Categories, expand
   it, tick *Addition*. The count, the chips and the grid all change. Change
   Sort By. Page to 2. Reload the page: the filters survive, because they are in
   the URL.
2. **Product detail** — click any card. Cycle the gallery with the arrows or the
   thumbnails; the counter follows. Switch tabs. Press *See all reviews* — more
   load from the store. Ask a question on the Q&A tab; it persists.
3. **Persistence** — add two resources to the cart from different vendors. The
   header badge counts them. Hard-refresh: they are still there.
4. **Mailing list** — on `Landing.dc.html`, submit the Join Our Community form
   with a bad address (inline error), then a good one (toast + a real record).
   Submit the same address twice and it is rejected as a duplicate.
5. **Reset** — dev toolbar → *Reset demo data* → confirm.

## Architecture in one paragraph

Each screen is its own file. Shared chrome (`SiteHeader`, `SiteFooter`,
`DevToolbar`) is imported, not copy-pasted. All data goes through
`assets/js/repositories/*.js`, whose methods are async and return the exact JSON
envelopes the future REST API will return. Those repositories are the only code
that talks to `assets/js/db.js`, a localStorage-backed store with an IndexedDB
side-store for uploaded files. **No page touches storage directly** — that is
what makes the swap to a real backend a repository-layer change and nothing more.

## Swapping the mock data layer for a real API

1. `assets/js/api.js` — replace `simulate(fn, ms)` with a `fetch` wrapper that
   throws `ApiError` on a non-2xx body. Keep the `collection()` / `resource()`
   envelope helpers.
2. `assets/js/repositories/*.js` — replace each `db.*` call with a request. The
   endpoint, method, request body, response shape and error codes for every
   method are already written down in `docs/API-CONTRACT.md`.
3. `assets/js/auth.js` — store the returned bearer token instead of the user id.
4. Delete `db.js` and `seed.js`.
5. Grep for `TODO(backend):` — every place server logic replaces mock logic is
   marked.

No `.dc.html` file changes.

## Business rules

Everything the BRD and PRD fix numerically lives in
`assets/js/business-rules.js`: the four plan tiers with their commission rates,
transaction fees and upload caps; the founding-promotion dates (free until
1 January 2027, billing from 2 January 2027); the nine storefront categories and
their subjects; the content standard; the decline reasons; the settlement
function. Change a number there and every page that shows it follows.

## Documentation

| File | Contents |
|---|---|
| `docs/PROTOTYPE-SPEC.md` | Design system extracted from the Figma file, personas and permissions, the 51-page inventory, user flows, the state matrix, client decisions applied, and the gaps in the source material |
| `docs/DATA-MODEL.md` | Every entity, field, type, validation rule and relationship, with a Mermaid ER diagram and the settlement maths |
| `docs/API-CONTRACT.md` | Every repository method as a REST endpoint: method, path, request, response, errors, plus the webhooks the real build needs |
| `docs/PAGE-INDEX.md` | Page ID → file → route key → purpose → roles → entities, and the shared-module map |
| `docs/DEV-NOTES.md` | Deliberate deviations from the Figma file, known gaps, open assumptions, conventions, and how to extend |

## Current status

**All 51 pages are built and wired to real data**, plus the five shared shells
(`SiteHeader`, `SiteFooter`, `VendorShell`, `AdminShell`, `DevToolbar`) and the
whole data layer behind them: nine repositories, auth with route guards,
validation schemas, business rules and seed data.

| Module | Pages | Notes |
|---|---|---|
| Public storefront | 13 | Landing, homepage, browse, product, vendor store, cart, checkout, confirmation, plans, 4 static |
| Registration & onboarding | 8 | Login, two registration paths, password reset, verification, pending state, setup wizard |
| Customer account | 6 | Orders, downloads, wishlist, reviews, following, profile |
| Vendor dashboard | 12 | Dashboard, products, editor, orders, payments, coupons, customers, messages, reports, media, subscription, store profile |
| Administration | 10 | Dashboard, both approval queues, vendors, catalogue, orders, payouts, plans, reports, content |
| System | 4 | Sitemap and three error pages |

Every route in `assets/js/router.js` resolves to a file — verified, no dead links.

Still simulated, each with one marked swap point: payment capture, email
delivery, and external file storage. See the `TODO(backend):` markers.
