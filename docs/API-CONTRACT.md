# API contract

Every repository method already returns the JSON the real API will return.
Swapping `localStorage` for a server means editing only `assets/js/repositories/*`
plus `assets/js/api.js`; no page changes.

Base URL: `/api/v1`. Auth: bearer token in `Authorization`.

## Envelopes

```jsonc
// collection
{ "data": [ /* … */ ],
  "meta": { "page": 1, "pageSize": 12, "total": 45, "totalPages": 4 } }

// resource
{ "data": { /* … */ } }

// error  (thrown client-side as ApiError; over HTTP it is the response body)
{ "error": { "status": 422, "code": "validation_failed",
             "message": "Some fields need attention",
             "fields": { "price": "Enter an amount like 12.50" } } }
```

Status codes in use: `200` `201` `204` `400` `401` `402` `403` `404` `409` `422` `500`.
Error codes: `invalid_credentials`, `account_suspended`, `unauthorized`,
`forbidden`, `not_found`, `validation_failed`, `email_taken`, `store_name_taken`,
`code_taken`, `already_owned`, `already_in_cart`, `already_reviewed`,
`unavailable`, `not_refundable`, `payment_failed`, `by_agreement`,
`plan_free_no_paid_listings`, `paid_upload_cap_reached`, `invalid_token`.

Shared list parameters: `page`, `pageSize`, `q`, `sort`, `sortDir`, plus the
resource-specific filters listed below. All are optional.

---

## Auth — `assets/js/auth.js`

| Method | Endpoint | Request | Response |
|---|---|---|---|
| `login(email, password)` | `POST /auth/login` | `{email, password}` | `{data: User}` + session token · `401 invalid_credentials` · `403 account_suspended` |
| `logout()` | `POST /auth/logout` | — | `{data:{ok:true}}` |
| `requestPasswordReset(email)` | `POST /auth/password/forgot` | `{email}` | `{data:{sent:true}}` — always 200, never reveals whether the address exists |
| `resetPassword(token, password)` | `POST /auth/password/reset` | `{token, password}` | `{data:{ok:true}}` · `400 invalid_token` |
| `currentUser()` | `GET /auth/me` | — | `{data: User}` · `401` |

`requireRole(...roles)` and `guardRoute(name)` are client-side page guards; the
server must repeat the check on every endpoint.

## Products — `repositories/productsRepo.js`

| Method | Endpoint | Notes |
|---|---|---|
| `listProducts(opts)` | `GET /products` | `status`, `vendorId`, `categoryIds[]`, `subjects[]`, `grades[]`, `resourceTypes[]`, `themes[]`, `priceMin`, `priceMax`, `freeOnly`, `q`, `sort` = `relevance｜newest｜oldest｜price_asc｜price_desc｜rating｜downloads｜title` |
| `getProduct(id)` | `GET /products/{id}` | `404 not_found` |
| `relatedProducts(id, limit)` | `GET /products/{id}/related` | same category first, then fill |
| `facets(opts)` | `GET /products/facets` | counts per category, subject, type, theme, grade |
| `createProduct(vendorId, body)` | `POST /vendors/{vendorId}/products` | `409 plan_free_no_paid_listings` · `409 paid_upload_cap_reached` |
| `updateProduct(id, patch)` | `PATCH /products/{id}` | approved → `pending`; response carries `returnedToQueue` |
| `deleteProduct(id)` | `DELETE /products/{id}` | `204` |
| `submitProduct(id)` | `POST /products/{id}/submit` | clears prior decline reason |
| `approveProduct(id, adminId)` | `POST /products/{id}/approve` | admin only |
| `declineProduct(id, adminId, reason, note)` | `POST /products/{id}/decline` | `reason` required |
| `unpublishProduct(id)` | `POST /products/{id}/unpublish` | admin only |
| `duplicateProduct(id)` | `POST /products/{id}/duplicate` | returns a new draft |
| `bulkModerate(ids, action, adminId, reason)` | `POST /products/bulk-moderate` | `action` = `approve｜decline` |
| `checkAllowance(vendorId)` | `GET /vendors/{id}/upload-allowance` | `{allowed, limit, used, reason}` |

Product response adds: `vendorName`, `vendorSlug`, `vendorLogo`, `vendorFollowers`,
`categoryName`, `categorySlug`, `categoryTint`, `isFree`, `discountPct`, `gradeLabel`.
`getProduct` also adds `vendorProductCount`.

## Vendors — `repositories/vendorsRepo.js`

| Method | Endpoint | Notes |
|---|---|---|
| `listVendors(opts)` | `GET /vendors` | filters `status`, `planCode` |
| `getVendor(id)` / `getVendorBySlug(slug)` | `GET /vendors/{id}` · `GET /vendors/slug/{slug}` | |
| `registerVendor(body)` | `POST /vendors` | creates Vendor + User + Subscription + two notifications, transactionally. `409 email_taken｜store_name_taken` |
| `updateVendor(id, patch)` | `PATCH /vendors/{id}` | |
| `approveVendor(id, adminId)` | `POST /vendors/{id}/approve` | activates the subscription, notifies the vendor |
| `declineVendor(id, adminId, reason, note)` | `POST /vendors/{id}/decline` | |
| `suspendVendor(id, reason)` / `reinstateVendor(id)` | `POST /vendors/{id}/suspend` · `/reinstate` | |
| `vendorStats(id)` | `GET /vendors/{id}/stats` | see below |
| `toggleFollow(vendorId, userId)` | `POST /vendors/{id}/follow` | `{following, followers}` |
| `listFollowing(userId)` | `GET /me/following` | |

`vendorStats` → `{ grossSales, earnings, commission, transactionFees,
withdrawable, paidOut, ordersReceived, unitsSold, customerCount, productCount,
pendingCount, draftCount, declinedCount, followers, topProducts[], byMonth[] }`.

## Orders & delivery — `repositories/ordersRepo.js`

| Method | Endpoint | Notes |
|---|---|---|
| `listOrders(opts)` | `GET /orders` | `customerId`, `vendorId`, `status`. With `vendorId` each row adds `vendorItems`, `vendorGross`, `vendorEarnings` |
| `getOrder(id)` | `GET /orders/{id}` | |
| `placeOrder(body)` | `POST /orders` | `{customerId, items:[{productId}], couponCode?, paymentMethod}`. `409 already_owned｜unavailable` · `402 payment_failed` · `422` on a bad coupon |
| `refundOrder(id, reason)` | `POST /orders/{id}/refund` | `409 not_refundable` |
| `listDownloads(customerId, opts)` | `GET /me/downloads` | de-duplicated across orders |
| `downloadUrl(customerId, productId)` | `GET /products/{id}/download` | verifies purchase, then mints a token. `403 forbidden` |
| `hasPurchased(customerId, productId)` | — | client helper; server enforces on the download endpoint |

`downloadUrl` returns `{token, expiresAt, href}`. **`href` must be a signed URL
from the external storage workspace** (BRD OI-8): short-lived, non-guessable and
not derivable from the product id (FR-10.2, FR-10.3).

## Cart — `repositories/cartRepo.js`

`GET /me/cart` · `POST /me/cart {productId}` · `DELETE /me/cart/{lineId}` ·
`DELETE /me/cart`. All return the whole cart:
`{ items[], itemCount, vendorCount, subtotal, discount, total }`.
`409 already_in_cart｜already_owned｜unavailable`.

## Reviews — `repositories/reviewsRepo.js`

`GET /products/{id}/reviews` · `GET /products/{id}/rating` ·
`POST /products/{id}/reviews {rating, body}` · `GET /me/reviews` ·
`DELETE /reviews/{id}`.
`rating` returns `{average, count, distribution:[{star,pct}×5]}`.
`403` if the buyer has not purchased; `409 already_reviewed`.

## Users & wishlist — `repositories/usersRepo.js`

`GET /users` · `GET /users/{id}` · `POST /users` (customer registration) ·
`PATCH /users/{id}` · `POST /users/{id}/suspend` ·
`GET /me/wishlist` · `POST /me/wishlist {productId}` (toggle → `{saved}`).

## Finance — `repositories/financeRepo.js`

| Method | Endpoint | Notes |
|---|---|---|
| `listPayouts(opts)` | `GET /payouts` | `vendorId`, `status` |
| `requestWithdrawal(vendorId, body)` | `POST /payouts` | `422` below `$25` or above the balance |
| `markPaid(id)` | `POST /payouts/{id}/pay` | admin only; notifies the vendor |
| `listCoupons(opts)` | `GET /coupons` | |
| `createCoupon(vendorId, body)` | `POST /coupons` | `409 code_taken` |
| `updateCoupon(id, patch)` / `deleteCoupon(id)` | `PATCH｜DELETE /coupons/{id}` | |
| `getSubscription(vendorId)` | `GET /vendors/{id}/subscription` | includes promo dates |
| `changePlan(vendorId, planCode)` | `POST /vendors/{id}/subscription/plan` | **no cancel step** (FR-3.6). `409 by_agreement` for Publishers |
| `updatePaymentMethod(vendorId, body)` | `POST /vendors/{id}/subscription/payment` | independent of the plan (FR-3.7) |
| `cancelSubscription(vendorId)` / `resumeSubscription(vendorId)` | `POST …/cancel` · `…/resume` | |

## Platform — `repositories/platformRepo.js`

`GET /me/notifications` · `POST /notifications/{id}/read` · `POST /notifications/read-all` ·
`POST /subscribers {email,name}` (`409 already_subscribed`) · `GET /subscribers` ·
`GET /messages` · `POST /messages/{id}/reply` · `POST /messages` (enquiry) ·
`GET /pages/{slug}` · `GET /pages` · `PATCH /pages/{id}` ·
`GET /settings` · `PATCH /settings/{key}` ·
`GET /reports/platform` · `GET /reports/queues`.

## Media — `repositories/mediaRepo.js`

`GET /vendors/{id}/media` · `POST /vendors/{id}/media` (multipart) ·
`DELETE /media/{id}` · `POST /products/{id}/file` (attach the resource file).
Prototype limit 25 MB; bytes go to IndexedDB and records keep only the key.

## Webhooks the real build will need

| Event | Purpose |
|---|---|
| `payment.succeeded` | mark the order `completed`, release downloads, notify |
| `payment.failed` | mark `failed`, keep the cart |
| `subscription.renewed` / `subscription.payment_failed` | update `Subscription`, notify |
| `payout.paid` | flip `Payout.status`, notify (FR-11.4) |
| scheduled `promo.ending` | advance notice before 2 Jan 2027 (FR-11.7) |
| scheduled `billing.transition` | start paid billing on the confirmed date (FR-3.5, AC-12) |
