# Uloominate — Prototype Specification

Derived from `Uloominate_BRD_v1.0` and `Uloominate_PRD_v1.0`, and from the
Figma file `Uloominate` (decoded directly from the `.fig` archive, not from
screenshots).

## 0. Source material read

| File | Read | Notes |
|---|---|---|
| `Uloominate_PRD_v1.0.pdf` / `.docx` | ✅ | 13 pages. FR-1.1 → FR-12.7, DR-1 → DR-8, NFR-1 → NFR-9, MG-1 → MG-7, AC-1 → AC-14, OI-1 → OI-10 |
| `Uloominate_BRD_v1.0.pdf` / `.docx` | ✅ | 8 pages. BO-1 → BO-8, business rules §5, scope §6, SC-1 → SC-12, OI-1 → OI-10, R-1 → R-9 |
| `Uloominate.fig` | ✅ | 4,109 nodes decoded. 3 design pages + logo canvas + an M3 component library |
| Attached local codebase `Uloominate` | Available | Referenced for structure only; the prototype is a fresh build |

### What the Figma file actually contains

Canvas **Web Design** — three artboards, all 1728 px wide:

| Frame | Size | Built as |
|---|---|---|
| `landing page` | 1728 × 5780 | `Landing.dc.html` (pre-launch, FR-1.1) |
| `product page` | 1728 × 2798 | `Product Detail.dc.html` (FR-7.4) |
| `browse_filter page` | 1729 × 2456 | `Browse.dc.html` (FR-7.3) |

Canvas **Logos** — six lockups of the `uloominate logo` mark.
Canvas **Internal Only Canvas** — a Material 3 component library (text field,
search bar, icon button, toggle button) plus M3 colour/type variables. These are
the *source* of the design system tokens below; they are not screens.

26 image assets were extracted from the archive and are in `assets/img/`.
No post-launch homepage exists in the file — see Gap G-1.

---

## 1. Design system, lifted from the file

### Colour

| Token | Hex | Where the file uses it |
|---|---|---|
| `--brand-primary` | `#3A836B` | Header bar, primary buttons, links, active states, progress fill |
| `--brand-deep` | `#29483C` | All headings, dark labels, footer links |
| `--brand-teal` | `#116254` | Plan prices ($29/year, $49/year) |
| `--brand-gold` | `#FEDC97` | Login button, Vendor Login pill, CTA fill, highlight underline |
| `--brand-gold-ink` | `#B9913E` | Eyebrow labels (WHY CREATORS JOIN, TODAY) |
| `--brand-gold-alt` | `#C59E33` | CHOOSE YOUR VENDOR PATH eyebrow |
| `--tint-mint` | `#F2FAF7` | Earn card, founding-vendor band, testimonial cards |
| `--tint-lilac` | `#F5EDFF` | Share card, CTA band |
| `--tint-peach` | `#FFF2DE` | Connect card |
| `--tint-sky` | `#E3F7FD` | Inspire card, mailing-list band |
| `--tint-cream` | `#FFFDF7` | Hero band, top-vendors strip, You-Might-Also-Like band |
| `--tint-header` | `#EAF7F1` | Strip behind the Vendor Login pill |
| `--surface` | `#FFFFFF` | Page background, cards |
| `--surface-alt` | `#F3F4F6` | Image placeholders, social buttons |
| `--ink` | `#121212` | Body copy |
| `--ink-muted` | `#595959` | Secondary copy, breadcrumbs, meta |
| `--ink-faint` | `#666666` | Rating counts, original prices |
| `--ink-alt` | `#2B2B2B` | Card prices |
| `--star` | `#FFC107` | Rating stars |
| `--track` | `#C9C9C9` | Rating-distribution bar track |
| `--m3-outline` | `#49454F` | Material text-field labels and supporting text |

Semantic colours are not present in the Figma file. Added, tuned to the palette:
`--success #3A836B`, `--warning #B9913E`, `--danger #C0392B`, `--info #116254`.

### Type

Poppins carries the product (`SemiBold` / `Medium` / `Regular` / `Bold`, per
DR-2). Four support faces appear in the file and are kept where they appear:

| Face | Use in the file |
|---|---|
| Poppins | Everything except the below |
| Montserrat Alternates Medium 30 | The `Uloominate` wordmark |
| Playfair Display Regular 12 | Footer tagline "Teach More. Share More." |
| DM Sans Bold/Medium/Regular | Browse-page prices, rating counts, pagination, "Keep in Touch" |
| Roboto Regular 12 | Material text-field label and supporting text |
| Libre Baskerville SemiBold 14 | One vendor logo lockup |

Scale actually used: 50 / 48 / 44 / 36 / 32 / 30 / 28 / 24 / 21.6 / 20 / 18 /
16 / 15.2 / 14 / 13 / 12 / 10.

### Shape and elevation

Radii in the file: `4, 8, 10, 12, 16, 18, 20, 24, 28, 100, pill`.
Spacing steps: `4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 48, 54, 64`.
Container: 1280 px with 24 px gutters inside a 1728 px page.
The file uses no drop shadows. Elevation is added as hairline borders plus a
two-layer shadow, kept subtle so it reads as the same family.

---

## 2. Personas and permissions

| Role | Sees | Can do |
|---|---|---|
| **Guest** | Pre-launch landing (or full storefront post-launch), product pages, vendor storefronts, static pages | Browse, search, filter, subscribe to the mailing list, add to cart, register |
| **Customer** (educator buyer) | Everything a guest sees, plus their account area | Purchase, download without limit, review purchased items, wishlist, follow vendors, edit profile |
| **Creator vendor** (Pioneer/Basic) | Vendor dashboard scoped to their own store | Publish free (and, on Basic, up to 50 paid) resources, manage orders/coupons/media, request payouts, change plan |
| **Established vendor** (Premium) | As above, unlimited | Plus advanced reports and featured-placement eligibility |
| **Publisher** | As Premium | Custom commission by agreement; the tier is not self-service |
| **Administrator** | Everything | Approve/decline vendors and products with a recorded reason, manage plans/catalogue/orders/payouts, edit static content, flip the launch switch |

Enforcement lives in `assets/js/auth.js`. `ROUTE_ACCESS` maps every route to its
permitted roles; `requireRole()` runs on page load and **redirects**, so typing a
vendor URL as a customer lands on `Error 403`, not on a hidden-but-rendered page.

---

## 3. Page inventory

Prefix key: **P** public · **A** auth · **C** customer · **V** vendor · **D** admin · **S** system.

| ID | Route constant | File | Purpose | Roles |
|---|---|---|---|---|
| P-01 | `landing` | `Landing.dc.html` | Pre-launch gated homepage, exact Figma replication (FR-1.1, 1.4–1.6) | guest |
| P-02 | `home` | `Home.dc.html` | Post-launch homepage: category discovery + featured (FR-1.2) | all |
| P-03 | `browse` | `Browse.dc.html` | Shop & filter, exact Figma replication (FR-7.2, 7.3) | all |
| P-04 | `product` | `Product Detail.dc.html` | Product page, exact Figma replication (FR-7.4–7.9) | all |
| P-05 | `vendorStore` | `Vendor Storefront.dc.html` | Public vendor page, follower + product counts (FR-7.10) | all |
| P-06 | `cart` | `Cart.dc.html` | Multi-vendor cart (FR-8.1) | all |
| P-07 | `checkout` | `Checkout.dc.html` | Digital-only checkout, no shipping (FR-8.2, 8.3) | customer |
| P-08 | `orderConfirmation` | `Order Confirmation.dc.html` | Immediate delivery + download links (FR-8.4, 8.5) | customer |
| P-09 | `plans` | `Vendor Plans.dc.html` | Tier comparison with entitlements (FR-2.3, 3.1) | all |
| P-10..13 | `about`,`privacy`,`terms`,`contact` | four files | Static pages (FR-1.7) | all |
| A-01 | `login` | `Login.dc.html` | Credential check, session, next-URL return | guest |
| A-02 | `registerCustomer` | `Register Customer.dc.html` | Buyer account creation (FR-2.1) | guest |
| A-03 | `registerVendor` | `Register Vendor.dc.html` | Vendor path + plan selection (FR-2.2, 2.3, 2.7) | guest |
| A-04 | `forgotPassword` | `Forgot Password.dc.html` | Reset request | guest |
| A-05 | `resetPassword` | `Reset Password.dc.html` | Token-based reset | guest |
| A-06 | `verifyEmail` | `Verify Email.dc.html` | Email confirmation state | guest |
| A-07 | `vendorPending` | `Vendor Pending Approval.dc.html` | Held state, no publishing (FR-2.4) | vendor |
| A-08 | `storeSetup` | `Store Setup Wizard.dc.html` | Multi-step guided setup (FR-2.5, 2.6) | vendor |
| C-01 | `accountOrders` | `Account Orders.dc.html` | Purchase history (FR-9.1) | customer |
| C-02 | `accountDownloads` | `Account Downloads.dc.html` | Unlimited re-download (FR-9.2) | customer |
| C-03 | `accountWishlist` | `Account Wishlist.dc.html` | Saved items (FR-9.3) | customer |
| C-04 | `accountReviews` | `Account Reviews.dc.html` | Reviews written (FR-9.4) | customer |
| C-05 | `accountFollowing` | `Account Following.dc.html` | Followed vendors (FR-9.6) | customer |
| C-06 | `accountProfile` | `Account Profile.dc.html` | Profile + payment details (FR-9.5) | customer |
| V-01 | `vendorDashboard` | `Vendor Dashboard.dc.html` | Gross sales, earnings, orders, withdrawable, chart, top products, quick actions (FR-4.1–4.4) | vendor |
| V-02 | `vendorProducts` | `Vendor Products.dc.html` | List/edit/duplicate/delete with status (FR-4.5) | vendor |
| V-03 | `vendorProductEdit` | `Vendor Product Editor.dc.html` | Create/edit, file attach, draft + submit (FR-5.1–5.8) | vendor |
| V-04 | `vendorOrders` | `Vendor Orders.dc.html` | Orders with detail + customer (FR-4.6) | vendor |
| V-05 | `vendorPayments` | `Vendor Payments.dc.html` | Earnings, payout history, withdrawals (FR-4.7) | vendor |
| V-06 | `vendorCoupons` | `Vendor Coupons.dc.html` | Vendor-level coupons, rebuilt (FR-4.8) | vendor |
| V-07 | `vendorCustomers` | `Vendor Customers.dc.html` | Customer list (FR-4.9) | vendor |
| V-08 | `vendorMessages` | `Vendor Messages.dc.html` | Buyer messaging + enquiries (FR-4.9) | vendor |
| V-09 | `vendorReports` | `Vendor Reports.dc.html` | Sales and earnings reporting (FR-4.10) | vendor |
| V-10 | `vendorMedia` | `Vendor Media.dc.html` | Per-vendor media library (FR-5.9) | vendor |
| V-11 | `vendorSubscription` | `Vendor Subscription.dc.html` | Plan change, card update, status, cancel (FR-3.6–3.9) | vendor |
| V-12 | `vendorStoreProfile` | `Vendor Store Profile.dc.html` | Name, logo, banner, bio (FR-2.6) | vendor |
| D-01 | `adminDashboard` | `Admin Dashboard.dc.html` | Platform overview + queue counts | admin |
| D-02 | `adminVendorQueue` | `Admin Vendor Queue.dc.html` | Pending registrations, approve/decline (FR-6.1, 6.3) | admin |
| D-03 | `adminProductQueue` | `Admin Product Queue.dc.html` | Pending submissions, full preview, bulk actions, content standard on screen (FR-6.2–6.6) | admin |
| D-04 | `adminVendors` | `Admin Vendors.dc.html` | View/edit/suspend/remove (FR-12.1) | admin |
| D-05 | `adminCatalogue` | `Admin Catalogue.dc.html` | All products, withdraw/unpublish (FR-6.7, 12.3) | admin |
| D-06 | `adminOrders` | `Admin Orders.dc.html` | All orders with vendor attribution (FR-12.4) | admin |
| D-07 | `adminPayouts` | `Admin Payouts.dc.html` | Review and process payouts (FR-12.5) | admin |
| D-08 | `adminPlans` | `Admin Plans.dc.html` | Tiers, commission, fees, caps — no code change (FR-12.2) | admin |
| D-09 | `adminReports` | `Admin Reports.dc.html` | Sales, commission, vendor performance (FR-12.6) | admin |
| D-10 | `adminContent` | `Admin Content.dc.html` | Static pages, categories, launch switch (FR-1.3, 12.7) | admin |
| S-01 | `sitemap` | `Sitemap.dc.html` | Dev index of every page, grouped by role | all |
| S-02..04 | `notFound`,`forbidden`,`serverError` | `Error 404/403/500.dc.html` | Error states | all |

**51 pages.** Each is a separate file that opens on its own in a browser.

---

## 4. Entity model

Full field lists, types and validation are in `DATA-MODEL.md`. Summary:

`User` · `Vendor` · `Subscription` · `Plan` · `Category` · `Product` · `Media` ·
`Order` (with embedded `OrderItem[]`) · `Review` · `Payout` · `Coupon` ·
`CartLine` · `WishlistItem` · `Follow` · `Notification` · `Subscriber` ·
`Message` · `ContentPage` · `Setting`.

Relationships: `User 1—0..1 Vendor`; `Vendor 1—* Product`; `Vendor 1—1 Subscription`;
`Plan 1—* Vendor`; `Category 1—* Product`; `Order *—* Product` through embedded
items; `Product 1—* Review`; `Vendor 1—* Payout`, `1—* Coupon`, `1—* Media`,
`1—* Message`.

---

## 5. End-to-end flows

### F-1 Vendor onboarding to first sale (PRD §3.1)
1. `P-01` → *Become a Founding Vendor* → `A-03`
2. `A-03` register + pick a tier → account created `status: pending` → `A-07`
3. Admin opens `D-02`, approves → vendor notified → `A-08`
4. `A-08` four-step setup: store identity → branding → payout → content standard
5. `V-03` create product, attach file, **Submit for review**. Upload allowance is
   checked first: Pioneer is blocked from paid listings, Basic capped at 50
6. Admin opens `D-03`, sees the full preview and the content standard, approves
7. Product appears in `P-03` / `P-04`
8. Customer buys via `P-06` → `P-07`; commission applies at the vendor's tier
9. `V-01` counters and `V-05` balance move; `V-05` request withdrawal → `D-07`

### F-2 Customer discovery to download (PRD §3.2)
`P-01`/`P-02` → search or category → `P-03` filter by category, subject, grade,
resource type, theme, price → `P-04` gallery, file details, tabs, reviews →
Add to Cart → `P-06` → `P-07` → `P-08` immediate download → `C-02` re-download
without limit.

### F-3 Administrative moderation (PRD §3.3)
`D-01` shows both queues. `D-02`/`D-03` approve or decline; a decline requires a
reason from a fixed list plus an optional note; both are recorded and notified.
Declined products return to the vendor editable with the reason attached, and
resubmission puts them back in the queue. Editing an approved product also
returns it to the queue (FR-6.4).

### F-4 Plan change without cancellation (FR-3.6, AC-7)
`V-11` → choose a tier → confirm → `Subscription.planCode` and `Vendor.planCode`
update in one transaction. No cancel step. Card update is independent
(FR-3.7). Publishers is not selectable — it raises the by-agreement message.

### F-5 Launch switch (FR-1.3, AC-10)
`D-10` toggles `settings.launchMode` between `pre-launch` and `post-launch`.
Pre-launch, `index` resolves to `P-01` and storefront routes redirect there for
guests. Post-launch, `P-02` is the homepage and the storefront is open. No code
change.

---

## 6. State matrix

Every list and detail page implements all six. Loading is a skeleton, not a
spinner; an artificial delay (`LATENCY` in `api.js`) makes them testable.

| Page group | Loading | Empty | Populated | Error | Permission denied | Success |
|---|---|---|---|---|---|---|
| Storefront lists (P-03, P-05) | Card-grid skeleton | Designed no-results with clear-filters action | Grid + facets + pagination | Inline retry panel | n/a | Toast on cart/wishlist |
| Product detail (P-04) | Two-column skeleton | n/a (404 if missing) | Full page | Retry panel | n/a | Toast + cart badge increments |
| Cart / checkout | Row skeleton | Designed empty cart with browse CTA | Line items + totals | Field errors + toast | Redirect to login | Redirect to P-08 |
| Account (C-01..06) | Row skeleton | Per-page empty state | Table/grid | Retry panel | Redirect to login | Toast |
| Vendor dashboard (V-01) | Stat + chart skeleton | "No sales yet" panel | Metrics from stored orders | Retry panel | Redirect 403 | — |
| Vendor lists (V-02, 04–10) | Table skeleton | Per-page empty state | Table + search/sort/filter/pagination | Retry panel | Redirect 403 | Toast + row updates |
| Vendor editor (V-03) | Form skeleton | New-product blank form | Populated form | Inline field errors + summary | Redirect 403 | Toast + status badge change |
| Admin queues (D-02, D-03) | Table skeleton | "Queue is clear" panel | Queue + bulk bar | Retry panel | Redirect 403 | Toast + count decrements |
| Admin reports (D-09) | Chart skeleton | "No data for this range" | Charts from stored orders | Retry panel | Redirect 403 | — |

Additional states specific to this domain: **vendor pending** (A-07 blocks
publishing), **upload cap reached** (V-03 blocks with an upgrade path),
**declined with reason** (V-02/V-03 show the reason inline), **already owned**
(P-04 swaps Add to Cart for Download), **promo countdown** (V-11 shows days
until 1 Jan 2027).

---

## 7. Client decisions applied

The BRD's ten open items were put to the client on 8 Aug 2026. Five were
answered and are now build rules; five remain assumptions.

| Ref | Decision | Applied in |
|---|---|---|
| OI-1 | Free until **1 Jan 2027**, billing begins **2 Jan 2027** (the Figma dates) | `business-rules.js` `PROMO`; landing copy already matches |
| OI-2 | **Four** live plans | `PLANS` |
| OI-3 | Publishers is **arranged by agreement**, not self-service | `PLANS[3].selfService = false`; V-11 blocks selection |
| OI-5 | Transaction fee is **deducted from vendor payout** | `settleLine()` |
| OI-7 | Free vendors are **barred from paid listings entirely** | `uploadAllowance()`; V-03 blocks |

### Still open — marked ASSUMPTION in code

- **ASSUMPTION: OI-4 plan naming.** The Figma landing page names the free tier
  *Pioneer Vendor*; the vendor-plans document says *Free Vendor*. The Figma
  naming is used, since the client is the design authority. Confirm before launch.
- **ASSUMPTION: OI-6 gateways.** Card + PayPal are shown as labels only. No
  gateway is integrated.
- **ASSUMPTION: OI-8 storage.** `downloadUrl()` mints an expiring, non-guessable
  token and returns an opaque href. The real signed-URL call is the one line to
  replace.
- **ASSUMPTION: OI-9 existing vendor data.** Eight vendors are seeded to match
  the eight registered accounts, with plausible catalogues. Real migration data
  will differ.
- **ASSUMPTION: OI-10 notification wording.** Copy is drafted in `i18n.js` and
  is placeholder pending client wording.

---

## 8. Gaps in the source material

| Ref | Gap | How the prototype handles it |
|---|---|---|
| G-1 | **No post-launch homepage in Figma.** BRD §6.1 and FR-1.2 both require one; the file has only the pre-launch landing page. | `Home.dc.html` is composed strictly from parts that *do* exist in the file — the same header, category strip, product-card component from `browse_filter page`, the vendor strip and the footer. Nothing new is invented. Flagged for design supply (CD-1). |
| G-2 | No designs for auth, vendor dashboard, admin, cart, checkout or account. PRD FR-4.14 and DR-5 only say they adopt the storefront palette, typography and components. | Built from the extracted design system, reusing the storefront's exact tokens, radii and component shapes. |
| G-3 | No mobile or tablet frames. DR-6 requires all three. | Breakpoints chosen at 1440 / 1024 / 768 / 360; the 1728 desktop layout is the fixed reference and everything below it is a reflow, not a redesign. |
| G-4 | No empty, loading or error states anywhere in the file. | Designed from the system: icon, one explanatory line, one primary action. |
| G-5 | Product page shows a review distribution (89/8/2/1/0%) that cannot be recomputed from three visible reviews. | Seeded products carry an authored `ratingBreakdown` so the page matches the design exactly; user-created products compute theirs from real reviews. |
| G-6 | Browse page is a static two-row grid; no design for pagination beyond page 1, and no filter panel open/closed states. | Pagination is built exactly as drawn (1 2 3 4 … 48 with arrows) and wired to real paging. Filter groups collapse using the chevron already in the design. |
| G-7 | Figma product copy is generic-classroom, not Islamic (Main Idea & Details, Preschool Math). | Kept verbatim so the replication is exact and verifiable, and surrounded by a seeded Islamic-education catalogue of 55 products across the nine live categories. |
| G-8 | Content standard text exists in the BRD but has no UI in the file. | Rendered inside `D-03` beside every submission, per FR-6.5. |

---

## 9. Explicitly out of scope

Per BRD §6.2 and PRD §9: CRM integration, AI authoring tools, native apps, SEO,
social media management, content creation, vendor recruitment, physical goods.
Also out of scope for the prototype specifically: real payment capture, real
email delivery, real external file storage, and WordPress/WCFM implementation —
this prototype is the interaction and data contract, not the WordPress build.
