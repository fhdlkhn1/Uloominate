/**
 * router.js — every route in the prototype, declared once.
 *
 * Purpose:   pages never hardcode an href. Import ROUTES / url() from here.
 * Depends:   nothing.
 *
 * Each page is its own file so a developer can be handed one screen at a time.
 * TODO(backend): swap the `.dc.html` filenames for real server routes; the
 * constant names and query parameters are already the intended contract.
 */

export const ROUTES = {
  // public storefront
  landing:            'Landing.dc.html',
  home:               'Home.dc.html',
  browse:             'Browse.dc.html',
  product:            'Product Detail.dc.html',
  vendorStore:        'Vendor Storefront.dc.html',
  cart:               'Cart.dc.html',
  checkout:           'Checkout.dc.html',
  orderConfirmation:  'Order Confirmation.dc.html',
  about:              'About Us.dc.html',
  privacy:            'Privacy Policy.dc.html',
  terms:              'Terms and Conditions.dc.html',
  contact:            'Contact Us.dc.html',
  plans:              'Vendor Plans.dc.html',

  // auth + onboarding
  login:              'Login.dc.html',
  registerCustomer:   'Register Customer.dc.html',
  registerVendor:     'Register Vendor.dc.html',
  forgotPassword:     'Forgot Password.dc.html',
  resetPassword:      'Reset Password.dc.html',
  verifyEmail:        'Verify Email.dc.html',
  vendorPending:      'Vendor Pending Approval.dc.html',
  storeSetup:         'Store Setup Wizard.dc.html',

  // customer account
  accountOrders:      'Account Orders.dc.html',
  accountDownloads:   'Account Downloads.dc.html',
  accountWishlist:    'Account Wishlist.dc.html',
  accountReviews:     'Account Reviews.dc.html',
  accountFollowing:   'Account Following.dc.html',
  accountProfile:     'Account Profile.dc.html',

  // vendor dashboard
  vendorDashboard:    'Vendor Dashboard.dc.html',
  vendorProducts:     'Vendor Products.dc.html',
  vendorProductEdit:  'Vendor Product Editor.dc.html',
  vendorOrders:       'Vendor Orders.dc.html',
  vendorPayments:     'Vendor Payments.dc.html',
  vendorCoupons:      'Vendor Coupons.dc.html',
  vendorCustomers:    'Vendor Customers.dc.html',
  vendorMessages:     'Vendor Messages.dc.html',
  vendorReports:      'Vendor Reports.dc.html',
  vendorMedia:        'Vendor Media.dc.html',
  vendorSubscription: 'Vendor Subscription.dc.html',
  vendorStoreProfile: 'Vendor Store Profile.dc.html',

  // administration
  adminDashboard:     'Admin Dashboard.dc.html',
  adminVendorQueue:   'Admin Vendor Queue.dc.html',
  adminProductQueue:  'Admin Product Queue.dc.html',
  adminVendors:       'Admin Vendors.dc.html',
  adminCatalogue:     'Admin Catalogue.dc.html',
  adminOrders:        'Admin Orders.dc.html',
  adminPayouts:       'Admin Payouts.dc.html',
  adminPlans:         'Admin Plans.dc.html',
  adminReports:       'Admin Reports.dc.html',
  adminContent:       'Admin Content.dc.html',

  // system
  sitemap:            'Sitemap.dc.html',
  notFound:           'Error 404.dc.html',
  forbidden:          'Error 403.dc.html',
  serverError:        'Error 500.dc.html',
};

/** url('product', { id: 'p-1' }) -> 'Product Detail.dc.html?id=p-1' */
export function url(route, params) {
  const base = ROUTES[route] || route;
  if (!params) return base;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  return qs ? base + '?' + qs : base;
}

export function go(route, params) { window.location.href = url(route, params); }

export function replace(route, params) { window.location.replace(url(route, params)); }

/** Read a query-string parameter from the current page. */
export function param(name, fallback = null) {
  const v = new URLSearchParams(window.location.search).get(name);
  return v === null ? fallback : v;
}

/** All query-string parameters as a plain object. */
export function params() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

/** Rewrite the query string without a navigation — used by list filters. */
export function syncQuery(next) {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(next)) {
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) sp.delete(k);
    else sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const qs = sp.toString();
  history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
}

/** Which navigation group a route belongs to — drives sidebar highlighting. */
export const ROUTE_GROUPS = {
  storefront: ['landing', 'home', 'browse', 'product', 'vendorStore', 'cart', 'checkout', 'orderConfirmation', 'plans'],
  auth: ['login', 'registerCustomer', 'registerVendor', 'forgotPassword', 'resetPassword', 'verifyEmail', 'vendorPending', 'storeSetup'],
  account: ['accountOrders', 'accountDownloads', 'accountWishlist', 'accountReviews', 'accountFollowing', 'accountProfile'],
  vendor: ['vendorDashboard', 'vendorProducts', 'vendorProductEdit', 'vendorOrders', 'vendorPayments', 'vendorCoupons', 'vendorCustomers', 'vendorMessages', 'vendorReports', 'vendorMedia', 'vendorSubscription', 'vendorStoreProfile'],
  admin: ['adminDashboard', 'adminVendorQueue', 'adminProductQueue', 'adminVendors', 'adminCatalogue', 'adminOrders', 'adminPayouts', 'adminPlans', 'adminReports', 'adminContent'],
  content: ['about', 'privacy', 'terms', 'contact'],
  system: ['sitemap', 'notFound', 'forbidden', 'serverError'],
};
