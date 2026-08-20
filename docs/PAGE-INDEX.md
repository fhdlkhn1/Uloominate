# Page index

All 51 pages are built and wired to real data. Each is a standalone
`.dc.html` file at the project root; routes are declared once in
`assets/js/router.js` and no page hardcodes an href.

| ID | File | Route key | Purpose | Roles | Entities |
|---|---|---|---|---|---|
| **Public storefront** |
| P-01 | `Landing.dc.html` | `landing` | Pre-launch gated homepage. Figma replication. Working mailing-list capture | guest | Subscriber |
| P-02 | `Home.dc.html` | `home` | Post-launch homepage: search, nine categories, most-downloaded, free picks, vendors | all | Product, Category, Vendor |
| P-03 | `Browse.dc.html` | `browse` | Shop & filter. Figma replication. Search, facets, sort, pagination | all | Product, Category, Wishlist, Cart |
| P-04 | `Product Detail.dc.html` | `product` | Figma replication. Gallery, tabs, file details, rating distribution, reviews, Q&A, related | all | Product, Review, Order, Message, Cart |
| P-05 | `Vendor Storefront.dc.html` | `vendorStore` | Public vendor page with banner, bio, stats, follow toggle, sortable catalogue | all | Vendor, Product, Follow |
| P-06 | `Cart.dc.html` | `cart` | Multi-vendor cart grouped by vendor; guest cart merges on sign-in | all | Cart, Product |
| P-07 | `Checkout.dc.html` | `checkout` | Digital-only checkout, coupon validation, simulated card/PayPal, failure state | customer | Cart, Order, Coupon |
| P-08 | `Order Confirmation.dc.html` | `orderConfirmation` | Immediate download links plus receipt | customer | Order, Product |
| P-09 | `Vendor Plans.dc.html` | `plans` | Four tiers, comparison table, FAQ, promotion banner | all | Plan |
| P-10 | `About Us.dc.html` | `about` | Static content with live platform stats and the content standard | all | ContentPage |
| P-11 | `Privacy Policy.dc.html` | `privacy` | Static content page | all | ContentPage |
| P-12 | `Terms and Conditions.dc.html` | `terms` | Static content plus the commission and fee table | all | ContentPage, Plan |
| P-13 | `Contact Us.dc.html` | `contact` | Working enquiry form with validation | all | ContentPage, Message |
| **Registration & onboarding** |
| A-01 | `Login.dc.html` | `login` | Credential check, session, next-URL return, demo-account fills | guest | User |
| A-02 | `Register Customer.dc.html` | `registerCustomer` | Buyer registration with duplicate-email guard | guest | User |
| A-03 | `Register Vendor.dc.html` | `registerVendor` | Vendor registration, plan selection, content-standard consent | guest | Vendor, User, Subscription |
| A-04 | `Forgot Password.dc.html` | `forgotPassword` | Reset request; never reveals whether an address exists | guest | User |
| A-05 | `Reset Password.dc.html` | `resetPassword` | Token-based reset, one-shot token | guest | User |
| A-06 | `Verify Email.dc.html` | `verifyEmail` | Confirmation state, routes by role | guest | User |
| A-07 | `Vendor Pending Approval.dc.html` | `vendorPending` | Held state with four-step timeline; blocks publishing | vendor | Vendor, Subscription |
| A-08 | `Store Setup Wizard.dc.html` | `storeSetup` | Four steps: identity, branding, payouts, content standard | vendor | Vendor, Media |
| **Customer account** |
| C-01 | `Account Orders.dc.html` | `accountOrders` | Purchase history with status filter and receipts | customer | Order |
| C-02 | `Account Downloads.dc.html` | `accountDownloads` | Unlimited re-download, searchable, paginated | customer | Order, Product |
| C-03 | `Account Wishlist.dc.html` | `accountWishlist` | Saved items with direct add-to-cart | customer | Wishlist, Product |
| C-04 | `Account Reviews.dc.html` | `accountReviews` | Reviews written, plus prompts for unreviewed purchases | customer | Review, Order |
| C-05 | `Account Following.dc.html` | `accountFollowing` | Followed vendors with unfollow | customer | Follow, Vendor |
| C-06 | `Account Profile.dc.html` | `accountProfile` | Profile, avatar upload, password change | customer | User |
| **Vendor dashboard** |
| V-01 | `Vendor Dashboard.dc.html` | `vendorDashboard` | Gross sales, earnings, orders, withdrawable, monthly chart, top products, recent orders | vendor | Order, Product, Payout |
| V-02 | `Vendor Products.dc.html` | `vendorProducts` | Status tabs, search, edit, submit, duplicate, delete, upload-cap notice | vendor | Product |
| V-03 | `Vendor Product Editor.dc.html` | `vendorProductEdit` | Full editor, file attach, gallery, live settlement preview, checklist, draft or submit | vendor | Product, Media |
| V-04 | `Vendor Orders.dc.html` | `vendorOrders` | Expandable rows with per-line earnings breakdown | vendor | Order |
| V-05 | `Vendor Payments.dc.html` | `vendorPayments` | Balance, withdrawal request with minimum enforcement, payout history | vendor | Payout, Order |
| V-06 | `Vendor Coupons.dc.html` | `vendorCoupons` | Create, usage bars, delete; unique-code guard | vendor | Coupon |
| V-07 | `Vendor Customers.dc.html` | `vendorCustomers` | Buyers with spend, units and last order | vendor | Order, User |
| V-08 | `Vendor Messages.dc.html` | `vendorMessages` | Enquiries and messages with inline reply | vendor | Message |
| V-09 | `Vendor Reports.dc.html` | `vendorReports` | Monthly gross vs earnings, revenue by resource, settlement split | vendor | Order |
| V-10 | `Vendor Media.dc.html` | `vendorMedia` | Multi-file upload to IndexedDB, searchable library | vendor | Media |
| V-11 | `Vendor Subscription.dc.html` | `vendorSubscription` | Plan change with no cancel step, card update, billing timeline | vendor | Subscription, Plan |
| V-12 | `Vendor Store Profile.dc.html` | `vendorStoreProfile` | Branding, bio, slug, payout details, live buyer preview | vendor | Vendor, Media |
| **Administration** |
| D-01 | `Admin Dashboard.dc.html` | `adminDashboard` | Queue cards, six platform metrics, gross vs commission chart, plan mix, top vendors, launch switch | admin | all |
| D-02 | `Admin Vendor Queue.dc.html` | `adminVendorQueue` | Approve or decline registrations with a recorded reason | admin | Vendor |
| D-03 | `Admin Product Queue.dc.html` | `adminProductQueue` | Full submission preview, content standard on screen, bulk approve/decline | admin | Product |
| D-04 | `Admin Vendors.dc.html` | `adminVendors` | Status tabs, inline plan change, suspend and reinstate | admin | Vendor, Subscription |
| D-05 | `Admin Catalogue.dc.html` | `adminCatalogue` | Every resource, vendor filter, unpublish, publish, delete | admin | Product |
| D-06 | `Admin Orders.dc.html` | `adminOrders` | All orders with per-line vendor and platform split, refunds | admin | Order |
| D-07 | `Admin Payouts.dc.html` | `adminPayouts` | Status tabs, totals, mark as paid with notification | admin | Payout |
| D-08 | `Admin Plans.dc.html` | `adminPlans` | Edit commission, fees and caps with a live $10 worked example | admin | Plan |
| D-09 | `Admin Reports.dc.html` | `adminReports` | Monthly series, vendor performance, revenue by category, platform health | admin | Order, Vendor |
| D-10 | `Admin Content.dc.html` | `adminContent` | Launch switch, static-page editor, categories, mailing list | admin | ContentPage, Setting, Subscriber |
| **System** |
| S-01 | `Sitemap.dc.html` | `sitemap` | Index of every page with demo credentials | all | — |
| S-02 | `Error 404.dc.html` | `notFound` | Page not found | all | — |
| S-03 | `Error 403.dc.html` | `forbidden` | Role denied; message adapts to the signed-in role | all | User |
| S-04 | `Error 500.dc.html` | `serverError` | Unexpected failure with a reference code | all | — |

## Shared shells

| File | Purpose |
|---|---|
| `SiteHeader.dc.html` | Storefront chrome: search, cart badge, account menu, category nav |
| `SiteFooter.dc.html` | Storefront footer |
| `VendorShell.dc.html` | Vendor sidebar, header and queue badges; wraps all V-* pages |
| `AdminShell.dc.html` | Admin sidebar, header and queue chips; wraps all D-* pages |
| `DevToolbar.dc.html` | Role switch, page jump, launch switch, reset data (⌘/Ctrl + `.`) |

## Shared modules

| File | Purpose |
|---|---|
| `assets/js/app.js` | Boot, toast, confirm dialog, error reader, re-exports |
| `assets/js/db.js` | localStorage store + IndexedDB blobs. The only storage touchpoint |
| `assets/js/api.js` | Envelopes, `ApiError`, latency. **The migration seam** |
| `assets/js/auth.js` | Session, `requireRole`, `ROUTE_ACCESS` |
| `assets/js/router.js` | `ROUTES`, `url()`, `go()`, `param()`, `syncQuery()` |
| `assets/js/business-rules.js` | Plans, commission, fees, caps, promo dates, taxonomy |
| `assets/js/validation.js` | `rules`, `validate()`, shared `schemas` |
| `assets/js/i18n.js` | Every user-facing string |
| `assets/js/format.js` | Money, dates, stars, truncation |
| `assets/js/seed.js` | Demo data |
| `assets/js/repositories/*.js` | Domain API per entity group |
