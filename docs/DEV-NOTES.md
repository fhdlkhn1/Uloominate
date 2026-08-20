# Developer notes

## What this prototype is

An interaction and data contract for the Uloominate rebuild. The three Figma
pages are replicated from the `.fig` file itself — the archive was decoded and
its 4,109-node tree read directly, so colours, type, sizes, radii, spacing and
copy come from the source rather than from a screenshot. The other screens are
composed from the design system those pages define.

It is **not** the WordPress/WCFM build. It is what the WordPress build should do.

## Architecture

```
Landing.dc.html          one file per screen — hand one to a developer on its own
Browse.dc.html
Product Detail.dc.html
Sitemap.dc.html
SiteHeader.dc.html       shared chrome, imported by every storefront page
SiteFooter.dc.html
DevToolbar.dc.html
assets/
  js/
    app.js               boot + toast + confirm
    db.js                storage (localStorage + IndexedDB for blobs)
    api.js               envelopes, ApiError, latency  ← THE MIGRATION SEAM
    auth.js              session, guards, ROUTE_ACCESS
    router.js            every route, declared once
    business-rules.js    plans, commission, fees, caps, promo dates, taxonomy
    validation.js        field rules + shared schemas
    i18n.js              every user-facing string
    format.js            money, dates, stars
    seed.js              demo data
    repositories/        productsRepo, vendorsRepo, ordersRepo, cartRepo,
                         reviewsRepo, usersRepo, financeRepo, platformRepo,
                         mediaRepo
  img/                   26 assets extracted from the Figma archive
docs/
figma/                   the decoder and the extracted node outlines, kept for
                         re-verifying the replication against the source
```

**No page touches `localStorage`.** Pages call repositories; repositories call
`db.js`. Search the codebase for `localStorage` and you will find it only in
`db.js`, `auth.js` (session) and `cartRepo.js` (guest cart id).

## Swapping the mock layer for a real API

1. In `api.js`, replace `simulate(fn, ms)` with a `request(path, init)` helper
   that calls `fetch(BASE + path, …)` and throws `ApiError` on a non-2xx body.
2. In each repository, replace the `db.*` calls with `request(...)`. The method
   signatures, return shapes and error codes are already the contract — see
   `API-CONTRACT.md`.
3. Delete `db.js` and `seed.js`.
4. In `auth.js`, store the returned token instead of the user id. `requireRole`
   and `ROUTE_ACCESS` keep their signatures.
5. Every place a server call will replace mock logic is marked `// TODO(backend):`.

Nothing in any `.dc.html` file changes.

## Deliberate deviations from the Figma file

| # | Deviation | Why |
|---|---|---|
| D-1 | ~~Header margins normalised~~ **Reverted 15 Aug 2026 at client request.** The build now uses the file's real offsets, scaled proportionally below 1728 px: logo row at 336 px, category nav at 257 px, 66 px right margin; hero text at 75 px, hero image flush to the right page edge; section content at 216 px; vendor logo tiles at 132 px; footer link column beside the logo. |
| D-2 | **The mint strip and the "Vendor Login" pill are rendered visible.** In the file they sit *underneath* the green header bar in paint order, so they do not appear in the Figma render. | A buried duplicate layer is almost certainly leftover from an earlier iteration, and dropping the vendor entry point would break FR-2.2. Confirm with the design authority. |
| D-3 | **Cards have a 1 px `#E6EFEA` border and a two-layer shadow.** The file uses neither. | White cards on a white section are otherwise invisible in a browser. Tuned to stay within the palette. |
| D-4 | **Empty, loading and error states designed.** None exist in the file. | Required by the brief; built from the same tokens. |
| D-5 | **Responsive reflow below 1728 px.** The file has desktop frames only. | DR-6 requires desktop, tablet and mobile. The 1728 layout is the fixed reference; smaller widths reflow (sidebar wraps above the grid, header actions wrap). |
| D-6 | **Icons redrawn.** The file uses Streamline and Material icons that are not in the archive as vectors. | One consistent minimal stroke set, drawn inline at the same sizes. Replace with the licensed set when the client supplies it (CD-2). |
| D-7 | **Top-vendor strip laid out as an even row.** The file positions its six logos at irregular offsets with two overlapping text labels. | Preserves every asset and the intent; the raw offsets look like an in-progress arrangement. |
| D-8 | **Poppins, Montserrat Alternates, Playfair Display, DM Sans and Roboto load from Google Fonts.** | The archive carries no font files. Self-host before launch. |

## Known gaps

- Pages P-02, P-05 to P-13, all of A-*, C-*, V-*, D-* and the error pages are
  specified and routed but not yet implemented. `Sitemap.dc.html` marks each
  one **PLANNED**; the routes exist so nothing links into a void.
- No design exists for the post-launch homepage (BRD §6.1, FR-1.2). `Home.dc.html`
  is specified to be composed only from parts that exist in the file. Flagged
  under CD-1.
- Payments, email and external storage are simulated. See the `TODO(backend):`
  markers in `ordersRepo.js`, `financeRepo.js` and `mediaRepo.js`.
- Passwords are stored in plaintext in the demo store. Obviously never do this
  server-side.

## Assumptions still awaiting written confirmation

| Ref | Assumption |
|---|---|
| OI-4 | Free tier is named **Pioneer Vendor** (Figma) rather than *Free Vendor* (vendor-plans document). The design authority's naming was taken. |
| OI-6 | Card and PayPal appear as labels only; no gateway is integrated. |
| OI-8 | `downloadUrl()` mints an expiring opaque token. The signed-URL call to the real storage workspace is one line. |
| OI-9 | Eight vendors are seeded to match the eight registered accounts, with plausible catalogues. Real migration data will differ. |
| OI-10 | Approval, decline and notification copy in `i18n.js` is drafted, not client-approved. |

Resolved on 8 Aug 2026 and now built in: OI-1 (free until 1 Jan 2027, billing
2 Jan 2027), OI-2 (four plans), OI-3 (Publishers by agreement), OI-5 (transaction
fee off the vendor payout), OI-7 (Free tier barred from paid listings).

## Conventions

- **Naming.** `data-testid` on anything a test or a developer will need to bind
  to. `data-region` on layout landmarks. `data-screen-label` on each screen root.
  `data-product-id`, `data-order-id` and similar on repeated rows.
- **Strings.** Every user-facing string belongs in `i18n.js`. If you add copy,
  add a key.
- **Routes.** Never write an href by hand. `url('product', { id })`.
- **Money.** Always `settleLine()` for splits and `format.money()` for display.
  Never recompute a commission in a page.
- **Async.** Every repository method returns a Promise, including the ones that
  are synchronous today. Do not "optimise" the await away.
- **Latency.** `api.js` `LATENCY` adds 180–420 ms so loading states are visible
  and testable. Set all three to `0` to make the prototype feel instant.

## Verifying the replication

`figma/kiwi.js` and `figma/extract.js` decode a `.fig` archive into a plain node
tree. `figma/pages/*.txt` are the extracted outlines of the three design pages —
every frame with its size, position, fill, radius, auto-layout and text style.
When the client sends a design revision, re-run the decoder against the new
archive and diff the outline rather than eyeballing screenshots.

## Extending

Add a screen:
1. Add its route to `ROUTES` in `router.js`, and to `ROUTE_ACCESS` in `auth.js`
   if it is not public.
2. Create `Name.dc.html`; import `SiteHeader` / `SiteFooter` (storefront) or the
   dashboard shell, plus `DevToolbar`.
3. Call `auth.requireRole(...)` at the top of `componentDidMount` for protected
   pages.
4. Read data through a repository. If you need a new query, add a method to the
   repository and a row to `API-CONTRACT.md`.
5. Flip its entry in `Sitemap.dc.html`'s `BUILT` array.
