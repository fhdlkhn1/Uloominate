__def("assets/js/db.js", function (__exports, __req) {
/**
 * db.js — localStorage-backed document store with a generic CRUD surface.
 *
 * Purpose:   the only module in the prototype that touches browser storage.
 *            Repositories sit on top of it; pages never import it directly.
 * Depends:   nothing.
 *
 * TODO(backend): this whole file disappears when a real API exists. The
 * repository layer is the seam — see assets/js/repositories/*.js.
 */

const STORAGE_KEY = 'uloominate.db.v1';
const BLOB_DB = 'uloominate.blobs.v1';

let cache = null;
const listeners = new Set();

function blank() {
  return { _meta: { seededAt: null, version: 1 }, collections: {} };
}

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : blank();
  } catch (err) {
    console.warn('[db] corrupt store, starting clean', err);
    cache = blank();
  }
  return cache;
}

function write() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

function coll(name) {
  const db = read();
  if (!db.collections[name]) db.collections[name] = [];
  return db.collections[name];
}

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Subscribe to any write. Returns an unsubscribe function. */
function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function isSeeded() { return !!read()._meta.seededAt; }

function markSeeded() { read()._meta.seededAt = new Date().toISOString(); write(); }

function reset() { cache = blank(); write(); }

/** Replace an entire collection. Used by seed.js only. */
function loadCollection(name, rows) { read().collections[name] = rows.slice(); write(); }

function create(name, doc) {
  const row = Object.assign({ id: doc.id || uuid(), createdAt: new Date().toISOString() }, doc);
  row.updatedAt = row.createdAt;
  coll(name).push(row);
  write();
  return clone(row);
}

function findById(name, id) {
  const row = coll(name).find(r => r.id === id);
  return row ? clone(row) : null;
}

function update(name, id, patch) {
  const rows = coll(name);
  const i = rows.findIndex(r => r.id === id);
  if (i === -1) return null;
  rows[i] = Object.assign({}, rows[i], patch, { id, updatedAt: new Date().toISOString() });
  write();
  return clone(rows[i]);
}

function remove(name, id) {
  const rows = coll(name);
  const i = rows.findIndex(r => r.id === id);
  if (i === -1) return false;
  rows.splice(i, 1);
  write();
  return true;
}

/** Run several mutations, writing once. Throws roll the batch back. */
function transaction(fn) {
  const snapshot = JSON.stringify(read());
  try {
    const result = fn();
    write();
    return result;
  } catch (err) {
    cache = JSON.parse(snapshot);
    write();
    throw err;
  }
}

/**
 * findAll(name, opts)
 *   filter      object of field->value | value[] | predicate fn
 *   search      { q, fields: [] }
 *   sort        [{ field, dir }] — multi-column
 *   page        1-based; pageSize
 * Returns { rows, total, page, pageSize, totalPages }.
 */
function findAll(name, opts = {}) {
  let rows = coll(name).slice();

  if (opts.filter) {
    for (const [field, want] of Object.entries(opts.filter)) {
      if (want === undefined || want === null || want === '' ) continue;
      if (typeof want === 'function') rows = rows.filter(r => want(r[field], r));
      else if (Array.isArray(want)) { if (want.length) rows = rows.filter(r => want.includes(r[field])); }
      else rows = rows.filter(r => r[field] === want);
    }
  }
  if (opts.where) rows = rows.filter(opts.where);

  if (opts.search && opts.search.q) {
    const q = String(opts.search.q).trim().toLowerCase();
    const fields = opts.search.fields || [];
    rows = rows.filter(r => fields.some(f => {
      const v = r[f];
      if (v == null) return false;
      return (Array.isArray(v) ? v.join(' ') : String(v)).toLowerCase().includes(q);
    }));
  }

  if (opts.sort && opts.sort.length) {
    rows.sort((a, b) => {
      for (const { field, dir } of opts.sort) {
        const s = compare(a[field], b[field]) * (dir === 'desc' ? -1 : 1);
        if (s) return s;
      }
      return 0;
    });
  }

  const total = rows.length;
  const pageSize = opts.pageSize || total || 1;
  const page = Math.max(1, opts.page || 1);
  const paged = opts.pageSize ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;
  return {
    rows: paged.map(clone), total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------------------------------------------------------------- blobs --
 * Uploaded files live in IndexedDB, not localStorage: a 5 MB quota does not
 * survive a couple of PDFs. Records store only the blob key.
 * TODO(backend): replace with a signed-upload call to the storage workspace
 * named in BRD OI-8.
 */
function openBlobStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BLOB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putBlob(key, dataUrl) {
  const idb = await openBlobStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').put(dataUrl, key);
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(key) {
  if (!key) return null;
  const idb = await openBlobStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('files', 'readonly');
    const req = tx.objectStore('files').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteBlob(key) {
  const idb = await openBlobStore();
  return new Promise(resolve => {
    const tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').delete(key);
    tx.oncomplete = () => resolve(true);
  });
}

/** Read a File/Blob from an <input type=file> into a data URL. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY) { cache = null; listeners.forEach(fn => fn()); }
});

  try { __exports["uuid"] = uuid; } catch (e) {}
  try { __exports["onChange"] = onChange; } catch (e) {}
  try { __exports["isSeeded"] = isSeeded; } catch (e) {}
  try { __exports["markSeeded"] = markSeeded; } catch (e) {}
  try { __exports["reset"] = reset; } catch (e) {}
  try { __exports["loadCollection"] = loadCollection; } catch (e) {}
  try { __exports["create"] = create; } catch (e) {}
  try { __exports["findById"] = findById; } catch (e) {}
  try { __exports["update"] = update; } catch (e) {}
  try { __exports["remove"] = remove; } catch (e) {}
  try { __exports["transaction"] = transaction; } catch (e) {}
  try { __exports["findAll"] = findAll; } catch (e) {}
  try { __exports["putBlob"] = putBlob; } catch (e) {}
  try { __exports["getBlob"] = getBlob; } catch (e) {}
  try { __exports["deleteBlob"] = deleteBlob; } catch (e) {}
  try { __exports["fileToDataUrl"] = fileToDataUrl; } catch (e) {}
});

__def("assets/js/business-rules.js", function (__exports, __req) {
/**
 * business-rules.js — every number the BRD/PRD fixes, in one place.
 *
 * Purpose:   plan tiers, commission, fees, upload caps, promo dates, taxonomy.
 * Depends:   nothing.
 *
 * Sources:   BRD §5.1 vendor plans, §5.2 founding promotion, §5.5 commercial
 *            rules; PRD FR-3.*, FR-7.1. Client decisions of 8 Aug 2026 close
 *            open items OI-1, OI-2, OI-3, OI-5, OI-7 — noted per constant.
 *
 * TODO(backend): plans must become editable records (PRD FR-12.2) rather than
 * constants. The shape below is already the intended API payload.
 */

/** OI-1 resolved: Figma dates. Free through 1 Jan 2027, billing 2 Jan 2027. */
const PROMO = {
  label: 'Founding Vendor Promotion',
  freeUntil: '2027-01-01',
  billingStarts: '2027-01-02',
  noticeDays: 30, // FR-11.7 advance notice before billing
};

/** OI-2 + OI-3 resolved: four tiers; Publishers is arranged by agreement. */
const PLANS = [
  {
    id: 'plan-free', code: 'free', name: 'Pioneer Vendor', order: 1,
    annualFee: 0, priceLabel: 'FREE',
    payoutRate: null, transactionFee: null, transactionFeePct: null,
    paidUploadLimit: 0, freeUploadLimit: null, allowsPaidListings: false,
    selfService: true,
    blurb: 'Best for new creators sharing free resources',
    features: [
      'Best for new creators sharing free resources',
      'Start building your profile and following',
      'Unlimited free resource uploads',
      'Paid listings not permitted',
    ],
  },
  {
    id: 'plan-basic', code: 'basic', name: 'Basic Vendor', order: 2,
    annualFee: 29, priceLabel: '$29/year',
    payoutRate: 0.55, transactionFee: 0.40, transactionFeePct: null,
    paidUploadLimit: 50, freeUploadLimit: null, allowsPaidListings: true,
    selfService: true,
    blurb: 'Upload up to 50 paid resources',
    features: [
      'Upload up to 50 paid resources',
      'Unlimited free resources',
      'Sell free and paid material',
      '55% vendor payout on each sale',
      '$0.40 per transaction',
    ],
  },
  {
    id: 'plan-premium', code: 'premium', name: 'Premium Vendor', order: 3,
    annualFee: 49, priceLabel: '$49/year',
    payoutRate: 0.80, transactionFee: 0.25, transactionFeePct: null,
    paidUploadLimit: null, freeUploadLimit: null, allowsPaidListings: true,
    selfService: true,
    blurb: 'Unlimited uploads',
    features: [
      'Unlimited uploads',
      'Featured placement opportunity',
      'Advanced dashboard and reports',
      '80% vendor payout on each sale',
      '$0.25 per transaction',
    ],
  },
  {
    id: 'plan-publishers', code: 'publishers', name: 'Publishers', order: 4,
    annualFee: null, priceLabel: 'Custom agreement',
    payoutRate: 0.85, payoutRateRange: [0.80, 0.90],
    transactionFee: 0.30, transactionFeePct: 0.029,
    paidUploadLimit: null, freeUploadLimit: null, allowsPaidListings: true,
    selfService: false, // OI-3: arranged manually by agreement
    blurb: 'Institutional publishing on agreed terms',
    features: [
      'Unlimited paid and free resources',
      '80–90% vendor payout, set by agreement',
      '2.9% + $0.30 per transaction',
      'Institutional store presentation',
      'Arranged directly with Uloominate',
    ],
  },
];

const planByCode = code => PLANS.find(p => p.code === code) || PLANS[0];
const planById = id => PLANS.find(p => p.id === id) || PLANS[0];

/** OI-5 resolved: the per-transaction fee is deducted from the vendor payout. */
const TRANSACTION_FEE_TREATMENT = 'deduct_from_payout';

/** OI-7 resolved: Free vendors are barred from paid listings entirely. */
const FREE_TIER_BARS_PAID_LISTINGS = true;

/**
 * Split one order line across vendor and platform (BRD §5.5, PRD FR-8.6).
 * Fee treatment follows TRANSACTION_FEE_TREATMENT.
 */
function settleLine({ price, planCode }) {
  const plan = planByCode(planCode);
  const gross = round2(price);
  if (gross === 0) return { gross: 0, vendorEarnings: 0, commission: 0, transactionFee: 0 };
  const pctFee = plan.transactionFeePct ? gross * plan.transactionFeePct : 0;
  const flatFee = plan.transactionFee || 0;
  const transactionFee = round2(pctFee + flatFee);
  const share = round2(gross * (plan.payoutRate || 0));
  const vendorEarnings = round2(Math.max(0, share - transactionFee));
  return {
    gross,
    vendorEarnings,
    commission: round2(gross - share),
    transactionFee,
  };
}

/** Can this vendor publish another paid resource? (FR-3.2, AC-2) */
function uploadAllowance(vendor, paidCount) {
  const plan = planByCode(vendor.planCode);
  if (!plan.allowsPaidListings) {
    return { allowed: false, limit: 0, used: paidCount, reason: 'plan_free_no_paid_listings' };
  }
  if (plan.paidUploadLimit === null) return { allowed: true, limit: null, used: paidCount };
  return {
    allowed: paidCount < plan.paidUploadLimit,
    limit: plan.paidUploadLimit,
    used: paidCount,
    reason: paidCount >= plan.paidUploadLimit ? 'paid_upload_cap_reached' : null,
  };
}

/** PRD FR-7.1 — the nine live storefront categories. */
const CATEGORIES = [
  { id: 'cat-islamic', slug: 'islamic-studies', name: 'Islamic Studies', tint: '#F2FAF7',
    subjects: ['Aqeedah', 'Seerah', 'Fiqh', 'Adab & Manners', 'Duas & Adhkar'] },
  { id: 'cat-quran', slug: 'quran', name: "Qur'an", tint: '#EAF7F1',
    subjects: ['Tajweed', 'Memorisation', 'Tafsir', 'Juz Amma'] },
  { id: 'cat-arabic', slug: 'arabic', name: 'Arabic', tint: '#FFF2DE',
    subjects: ['Alphabet', 'Vocabulary', 'Grammar (Nahw)', 'Reading', 'Handwriting'] },
  { id: 'cat-social', slug: 'social-studies', name: 'Social Studies', tint: '#F5EDFF',
    subjects: ['Islamic History', 'Geography', 'Civics', 'World Cultures'] },
  { id: 'cat-math', slug: 'math', name: 'Math', tint: '#E3F7FD',
    subjects: ['Counting', 'Addition', 'Subtraction', 'Multiplication', 'Division', 'Fractions', 'Geometry'] },
  { id: 'cat-science', slug: 'science', name: 'Science', tint: '#F2FAF7',
    subjects: ['Life Science', 'Earth Science', 'Physical Science', 'STEM'] },
  { id: 'cat-ela', slug: 'ela', name: 'ELA', tint: '#FFF2DE',
    subjects: ['Phonics', 'Reading Comprehension', 'Writing', 'Grammar', 'Vocabulary'] },
  { id: 'cat-art', slug: 'art', name: 'Art', tint: '#F5EDFF',
    subjects: ['Islamic Geometric Art', 'Calligraphy', 'Crafts', 'Colouring'] },
  { id: 'cat-health', slug: 'health', name: 'Health', tint: '#E3F7FD',
    subjects: ['Wellbeing', 'Nutrition', 'Physical Education', 'Social & Emotional'] },
];

const categoryById = id => CATEGORIES.find(c => c.id === id);
const categoryBySlug = slug => CATEGORIES.find(c => c.slug === slug);

const GRADES = [
  'Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade',
  '5th Grade', '6th Grade', '7th Grade', '8th Grade', 'High School', 'Adult',
];

const RESOURCE_TYPES = [
  'Worksheets', 'Activities', 'Printables', 'Lesson Plans', 'Unit Plans',
  'Flash Cards', 'Games', 'Posters', 'Assessments', 'Workbooks', 'Google Slides',
];

const THEMES = ['Ramadan', 'Eid', 'Hajj', 'Back to School', 'Seasonal', 'Everyday'];

const FILE_TYPES = ['PDF', 'PDF + Google Slides', 'PowerPoint', 'ZIP', 'Google Slides'];

/** PRD FR-6.5 — shown inside the moderation UI so review is consistent. */
const CONTENT_STANDARD = [
  'All published material must align with the Qur\u2019an and authentic Sunnah, following the teachings of Ahlus-Sunnah wal-Jama\u2019ah.',
  'Uloominate reserves the right to review, decline, or remove any content not meeting that standard.',
  'Enforcement is by mandatory administrative review prior to publication, not by post-publication takedown alone.',
];

const DECLINE_REASONS = [
  'Content does not meet the faith and community standard',
  'Resource file missing, corrupt, or does not match the listing',
  'Preview images are low quality or misleading',
  'Description or included-contents list is incomplete',
  'Incorrect grade range or subject classification',
  'Pricing inconsistent with the vendor plan',
  'Duplicate of an existing listing',
];

const PAYOUT_METHODS = ['PayPal', 'Bank deposit'];
const PAYOUT_CYCLE = 'Monthly, issued on the 5th for the previous month';
const MIN_PAYOUT = 25;

const ORDER_STATUSES = ['completed', 'processing', 'refunded', 'cancelled', 'failed'];
const PRODUCT_STATUSES = ['draft', 'pending', 'approved', 'declined', 'unpublished'];
const VENDOR_STATUSES = ['pending', 'approved', 'declined', 'suspended'];

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  try { __exports["settleLine"] = settleLine; } catch (e) {}
  try { __exports["uploadAllowance"] = uploadAllowance; } catch (e) {}
  try { __exports["PROMO"] = PROMO; } catch (e) {}
  try { __exports["PLANS"] = PLANS; } catch (e) {}
  try { __exports["planByCode"] = planByCode; } catch (e) {}
  try { __exports["planById"] = planById; } catch (e) {}
  try { __exports["TRANSACTION_FEE_TREATMENT"] = TRANSACTION_FEE_TREATMENT; } catch (e) {}
  try { __exports["FREE_TIER_BARS_PAID_LISTINGS"] = FREE_TIER_BARS_PAID_LISTINGS; } catch (e) {}
  try { __exports["CATEGORIES"] = CATEGORIES; } catch (e) {}
  try { __exports["categoryById"] = categoryById; } catch (e) {}
  try { __exports["categoryBySlug"] = categoryBySlug; } catch (e) {}
  try { __exports["GRADES"] = GRADES; } catch (e) {}
  try { __exports["RESOURCE_TYPES"] = RESOURCE_TYPES; } catch (e) {}
  try { __exports["THEMES"] = THEMES; } catch (e) {}
  try { __exports["FILE_TYPES"] = FILE_TYPES; } catch (e) {}
  try { __exports["CONTENT_STANDARD"] = CONTENT_STANDARD; } catch (e) {}
  try { __exports["DECLINE_REASONS"] = DECLINE_REASONS; } catch (e) {}
  try { __exports["PAYOUT_METHODS"] = PAYOUT_METHODS; } catch (e) {}
  try { __exports["PAYOUT_CYCLE"] = PAYOUT_CYCLE; } catch (e) {}
  try { __exports["MIN_PAYOUT"] = MIN_PAYOUT; } catch (e) {}
  try { __exports["ORDER_STATUSES"] = ORDER_STATUSES; } catch (e) {}
  try { __exports["PRODUCT_STATUSES"] = PRODUCT_STATUSES; } catch (e) {}
  try { __exports["VENDOR_STATUSES"] = VENDOR_STATUSES; } catch (e) {}
});

__def("assets/js/i18n.js", function (__exports, __req) {
/**
 * i18n.js — every user-facing string in the prototype.
 *
 * Purpose:   a single dictionary so the platform can be localised later.
 *            `t('key')` and `t('key', { n: 3 })` for interpolation.
 * Depends:   nothing.
 *
 * TODO(backend): move to per-locale JSON fetched at boot; keep the key names.
 */

const LOCALE = 'en';

const strings = {
  en: {
    'brand.name': 'Uloominate',
    'brand.tagline': 'Teach More. Share More.',
    'brand.copyright': 'Copyright © 2025 Uloominate',

    'nav.about': 'About Us',
    'nav.privacy': 'Privacy Policy',
    'nav.terms': 'Terms & Conditions',
    'nav.contact': 'Contact Us',
    'nav.login': 'Login',
    'nav.register': 'Register',
    'nav.vendorLogin': 'Vendor Login',
    'nav.keepInTouch': 'Keep in Touch',
    'nav.searchPlaceholder': 'Search resources, subjects, vendors',

    'auth.signIn': 'Sign in',
    'auth.signOut': 'Sign out',
    'auth.invalidCredentials': 'That email and password combination was not recognised.',
    'auth.accountSuspended': 'This account has been suspended. Contact support.',
    'auth.sessionRequired': 'Sign in to continue.',
    'auth.forbidden': 'Your account does not have access to that page.',
    'auth.resetSent': 'If that email is registered, a reset link is on its way.',
    'auth.passwordUpdated': 'Password updated. Sign in with your new password.',

    'vendor.pendingTitle': 'Your vendor account is under review',
    'vendor.pendingBody': 'An administrator is reviewing your registration against our content standard. You will receive an email as soon as a decision is made. Publishing is unavailable until your store is approved.',
    'vendor.approved': 'Vendor approved. Their store is now active.',
    'vendor.declined': 'Vendor declined. The reason has been recorded and sent.',
    'vendor.suspended': 'Vendor suspended. Their listings are hidden from the storefront.',
    'vendor.capReached': 'You have reached the paid-resource limit for your plan. Upgrade to publish more.',
    'vendor.freeTierPaidBlocked': 'The Pioneer Vendor plan does not permit paid listings. Upgrade to Basic or Premium to sell resources.',

    'product.submitted': 'Submitted for review. You will be notified once a decision is made.',
    'product.approved': 'Product approved and published to the storefront.',
    'product.declined': 'Product declined. The vendor has been notified with your reason.',
    'product.draftSaved': 'Draft saved.',
    'product.deleted': 'Product deleted.',
    'product.duplicated': 'Product duplicated as a new draft.',
    'product.editRequiresReapproval': 'Edits to an approved product return it to the review queue.',
    'product.unpublished': 'Product unpublished. It is no longer visible on the storefront.',

    'cart.added': 'Added to cart.',
    'cart.removed': 'Removed from cart.',
    'cart.empty': 'Your cart is empty',
    'cart.emptyBody': 'Browse the catalogue and add resources you would like to download.',
    'cart.alreadyOwned': 'You already own this resource. Find it in your downloads.',

    'checkout.success': 'Payment complete. Your resources are ready to download.',
    'checkout.failed': 'The payment could not be completed. No charge was made.',

    'wishlist.added': 'Saved to your wishlist.',
    'wishlist.removed': 'Removed from your wishlist.',

    'review.submitted': 'Thank you — your review has been published.',
    'review.mustOwn': 'You can review a resource once you have purchased it.',

    'subscribe.success': 'You are on the list. Check your inbox for a confirmation.',
    'subscribe.duplicate': 'That email is already subscribed.',
    'subscribe.supporting': 'We send launch news and founding-offer reminders. Unsubscribe any time.',

    'payout.requested': 'Withdrawal requested. Payouts are issued on the monthly cycle.',
    'payout.belowMinimum': 'The minimum withdrawal is $25.00.',
    'payout.exceedsBalance': 'That is more than your withdrawable balance.',
    'payout.paid': 'Payout marked as paid and the vendor notified.',

    'plan.changed': 'Plan updated. Your new entitlements apply immediately.',
    'plan.cancelled': 'Subscription cancelled. Paid listings will be hidden at the end of the term.',
    'plan.paymentUpdated': 'Payment method updated.',
    'plan.byAgreement': 'The Publishers tier is arranged directly with Uloominate. Contact us to discuss terms.',

    'state.loading': 'Loading…',
    'state.errorTitle': 'Something went wrong',
    'state.errorBody': 'The data could not be loaded. Try again in a moment.',
    'state.retry': 'Try again',
    'state.noResults': 'No results found',
    'state.noResultsBody': 'Try removing a filter or searching for something broader.',
    'state.saving': 'Saving…',
    'state.saved': 'Saved',

    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.delete': 'Delete',
    'action.confirm': 'Confirm',
    'action.approve': 'Approve',
    'action.decline': 'Decline',
    'action.edit': 'Edit',
    'action.duplicate': 'Duplicate',
    'action.viewAll': 'View all',
    'action.apply': 'Apply Filters',
    'action.clearAll': 'Clear All',
    'action.addToCart': 'Add to Cart',
    'action.addToWishlist': 'Add to Wishlist',
    'action.download': 'Download',
    'action.submitForReview': 'Submit for review',
    'action.saveDraft': 'Save draft',

    'confirm.deleteProduct': 'Delete this product? Purchasers keep their download access; the listing is removed from the storefront.',
    'confirm.deleteCoupon': 'Delete this coupon? It will stop working immediately.',
    'confirm.cancelPlan': 'Cancel your subscription? Paid listings are hidden when the current term ends. Free resources stay published.',
    'confirm.suspendVendor': 'Suspend this vendor? Their store and listings are hidden until reinstated.',
    'confirm.resetData': 'Reset all demo data? Everything you have created in this prototype is discarded.',

    'validation.required': 'This field is required',
    'validation.email': 'Enter a valid email address',
    'validation.minLength': 'Use at least {n} characters',
    'validation.maxLength': 'Use no more than {n} characters',
    'validation.passwordShort': 'Use at least 8 characters',
    'validation.passwordWeak': 'Include at least one letter and one number',
    'validation.matches': 'This does not match the {label}',
    'validation.min': 'Enter {n} or more',
    'validation.max': 'Enter {n} or less',
    'validation.money': 'Enter an amount like 12.50',
    'validation.integer': 'Enter a whole number',
    'validation.url': 'Enter a valid web address',
    'validation.phone': 'Enter a valid phone number',
    'validation.slug': 'Use lowercase letters, numbers and hyphens only',
    'validation.accepted': 'You need to accept this to continue',
    'validation.oneOf': 'Choose one of the available options',
  },
};

function t(key, vars) {
  let s = (strings[LOCALE] && strings[LOCALE][key]) || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(v);
  return s;
}

function has(key) { return !!(strings[LOCALE] && strings[LOCALE][key]); }

__exports.default = strings;

  try { __exports["t"] = t; } catch (e) {}
  try { __exports["has"] = has; } catch (e) {}
});

__def("assets/js/format.js", function (__exports, __req) {
/**
 * format.js — display formatting. No business logic lives here.
 * Depends: nothing.
 */

const money = n =>
  n === 0 || n === '0' ? 'Free'
  : n == null ? '—'
  : '$' + Number(n).toFixed(2);

const moneyAlways = n => '$' + Number(n || 0).toFixed(2);

const compact = n => {
  const v = Number(n || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + 'k';
  return String(v);
};

const thousands = n => Number(n || 0).toLocaleString('en-US');

const pct = (n, digits = 0) => (Number(n || 0) * 100).toFixed(digits) + '%';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function date(iso, style = 'medium') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  if (style === 'monthYear') return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  if (style === 'short') return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  if (style === 'long') return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (style === 'withTime') return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

function relative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
  return date(iso, 'short');
}

function daysUntil(iso) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

const fileSize = mb => (mb >= 1 ? `${Number(mb).toFixed(1)} MB` : `${Math.round(mb * 1024)} KB`);

const initials = name => String(name || '')
  .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

/** '★★★★☆' for a 0–5 rating, rounded to the nearest half up. */
const stars = rating => {
  const full = Math.round(Number(rating) || 0);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
};

const titleCase = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

const truncate = (s, n) => {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1).trimEnd() + '…' : str;
};

const slugify = s => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  try { __exports["date"] = date; } catch (e) {}
  try { __exports["relative"] = relative; } catch (e) {}
  try { __exports["daysUntil"] = daysUntil; } catch (e) {}
  try { __exports["money"] = money; } catch (e) {}
  try { __exports["moneyAlways"] = moneyAlways; } catch (e) {}
  try { __exports["compact"] = compact; } catch (e) {}
  try { __exports["thousands"] = thousands; } catch (e) {}
  try { __exports["pct"] = pct; } catch (e) {}
  try { __exports["fileSize"] = fileSize; } catch (e) {}
  try { __exports["initials"] = initials; } catch (e) {}
  try { __exports["stars"] = stars; } catch (e) {}
  try { __exports["titleCase"] = titleCase; } catch (e) {}
  try { __exports["truncate"] = truncate; } catch (e) {}
  try { __exports["slugify"] = slugify; } catch (e) {}
});

__def("assets/js/validation.js", function (__exports, __req) {
/**
 * validation.js — field-level rules shared by every form.
 *
 * Purpose:   `validate(values, schema)` returns { valid, errors } where errors
 *            is field -> message, so a page can render inline messages and
 *            block submission without writing its own rules.
 * Depends:   i18n.js for message text.
 *
 * TODO(backend): the same schemas should be enforced server-side; these are
 * the client half only.
 */

const { t } = __req('assets/js/i18n.js');
const rules = {
  required: () => v => (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length))
    ? t('validation.required') : null,

  email: () => v => (!v || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v).trim()))
    ? null : t('validation.email'),

  minLength: n => v => (!v || String(v).length >= n) ? null : t('validation.minLength', { n }),
  maxLength: n => v => (!v || String(v).length <= n) ? null : t('validation.maxLength', { n }),

  password: () => v => {
    if (!v) return null;
    if (String(v).length < 8) return t('validation.passwordShort');
    if (!/[a-z]/i.test(v) || !/[0-9]/.test(v)) return t('validation.passwordWeak');
    return null;
  },

  matches: (field, label) => (v, all) => v === all[field] ? null : t('validation.matches', { label }),

  min: n => v => (v === '' || v === null || Number(v) >= n) ? null : t('validation.min', { n }),
  max: n => v => (v === '' || v === null || Number(v) <= n) ? null : t('validation.max', { n }),

  money: () => v => {
    if (v === '' || v === null || v === undefined) return null;
    return /^\d+(\.\d{1,2})?$/.test(String(v)) ? null : t('validation.money');
  },

  integer: () => v => (v === '' || v === null || /^-?\d+$/.test(String(v))) ? null : t('validation.integer'),

  url: () => v => {
    if (!v) return null;
    try { new URL(String(v).startsWith('http') ? v : 'https://' + v); return null; }
    catch { return t('validation.url'); }
  },

  phone: () => v => (!v || /^[\d\s()+-]{7,20}$/.test(String(v))) ? null : t('validation.phone'),

  slug: () => v => (!v || /^[a-z0-9-]+$/.test(String(v))) ? null : t('validation.slug'),

  accepted: () => v => v === true ? null : t('validation.accepted'),

  oneOf: list => v => (!v || list.includes(v)) ? null : t('validation.oneOf'),

  custom: fn => fn,
};

/**
 * validate({email:'a'}, { email: [rules.required(), rules.email()] })
 *   -> { valid:false, errors:{ email:'Enter a valid email address' } }
 */
function validate(values, schema) {
  const errors = {};
  for (const [field, checks] of Object.entries(schema)) {
    for (const check of checks) {
      const msg = check(values[field], values);
      if (msg) { errors[field] = msg; break; }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Validate a single field — used for blur-time feedback. */
function validateField(field, values, schema) {
  const checks = schema[field] || [];
  for (const check of checks) {
    const msg = check(values[field], values);
    if (msg) return msg;
  }
  return null;
}

/* ------------------------------------------------------- shared schemas -- */

const schemas = {
  login: {
    email: [rules.required(), rules.email()],
    password: [rules.required()],
  },
  registerCustomer: {
    firstName: [rules.required(), rules.maxLength(50)],
    lastName: [rules.required(), rules.maxLength(50)],
    email: [rules.required(), rules.email()],
    password: [rules.required(), rules.password()],
    confirmPassword: [rules.required(), rules.matches('password', 'password')],
    acceptTerms: [rules.accepted()],
  },
  registerVendor: {
    firstName: [rules.required(), rules.maxLength(50)],
    lastName: [rules.required(), rules.maxLength(50)],
    email: [rules.required(), rules.email()],
    storeName: [rules.required(), rules.minLength(3), rules.maxLength(60)],
    password: [rules.required(), rules.password()],
    confirmPassword: [rules.required(), rules.matches('password', 'password')],
    planCode: [rules.required()],
    acceptStandard: [rules.accepted()],
    acceptTerms: [rules.accepted()],
  },
  storeProfile: {
    storeName: [rules.required(), rules.minLength(3), rules.maxLength(60)],
    slug: [rules.required(), rules.slug()],
    bio: [rules.required(), rules.minLength(40), rules.maxLength(600)],
    payoutMethod: [rules.required()],
    payoutAccount: [rules.required()],
  },
  product: {
    title: [rules.required(), rules.minLength(10), rules.maxLength(120)],
    description: [rules.required(), rules.minLength(80)],
    included: [rules.required()],
    categoryId: [rules.required()],
    subject: [rules.required()],
    gradeFrom: [rules.required()],
    gradeTo: [rules.required()],
    resourceType: [rules.required()],
    price: [rules.money(), rules.min(0)],
    fileType: [rules.required()],
    pageCount: [rules.required(), rules.integer(), rules.min(1)],
  },
  coupon: {
    code: [rules.required(), rules.minLength(4), rules.maxLength(20)],
    type: [rules.required()],
    value: [rules.required(), rules.money(), rules.min(0)],
    expiresAt: [rules.required()],
  },
  checkout: {
    email: [rules.required(), rules.email()],
    cardName: [rules.required()],
    cardNumber: [rules.required(), rules.minLength(12)],
    cardExpiry: [rules.required()],
    cardCvc: [rules.required(), rules.minLength(3), rules.maxLength(4)],
  },
  withdrawal: {
    amount: [rules.required(), rules.money(), rules.min(25)],
    method: [rules.required()],
  },
  review: {
    rating: [rules.required(), rules.min(1), rules.max(5)],
    body: [rules.required(), rules.minLength(20), rules.maxLength(1000)],
  },
  contact: {
    name: [rules.required()],
    email: [rules.required(), rules.email()],
    subject: [rules.required()],
    message: [rules.required(), rules.minLength(20)],
  },
  subscribe: {
    email: [rules.required(), rules.email()],
  },
  decline: {
    reason: [rules.required()],
  },
};

  try { __exports["validate"] = validate; } catch (e) {}
  try { __exports["validateField"] = validateField; } catch (e) {}
  try { __exports["rules"] = rules; } catch (e) {}
  try { __exports["schemas"] = schemas; } catch (e) {}
});

__def("assets/js/api.js", function (__exports, __req) {
/**
 * api.js — the migration seam.
 *
 * Purpose:   every repository method returns the exact JSON shape the future
 *            REST API will return. Pages only ever see these envelopes, so
 *            swapping localStorage for fetch() means editing repositories and
 *            nothing else.
 * Depends:   db.js
 *
 * Envelopes
 *   collection  { data: [...], meta: { page, pageSize, total, totalPages } }
 *   resource    { data: {...} }
 *   error       thrown ApiError with { status, code, message, fields }
 *
 * TODO(backend): replace `simulate()` with fetch(BASE + path, init) and delete
 * the latency helper. Nothing above this file changes.
 */

const db = __req('assets/js/db.js');
/** Artificial latency so loading and skeleton states are visible and testable. */
const LATENCY = { list: 320, read: 180, write: 420 };

class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
  toJSON() { return { error: { status: this.status, code: this.code, message: this.message, fields: this.fields } }; }
}

const notFound = (what = 'Resource') => new ApiError(404, 'not_found', what + ' not found');
const forbidden = (msg = 'You do not have access to this resource') => new ApiError(403, 'forbidden', msg);
const unauthorized = (msg = 'Sign in to continue') => new ApiError(401, 'unauthorized', msg);
const badRequest = (msg, fields) => new ApiError(422, 'validation_failed', msg || 'Some fields need attention', fields);
const conflict = (code, msg) => new ApiError(409, code, msg);

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Wrap a synchronous data-layer read/write in the latency + promise contract. */
async function simulate(fn, ms = LATENCY.read) {
  await wait(ms);
  return fn();
}

function collection(result) {
  return {
    data: result.rows,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}

function resource(data) { return { data }; }

/** Shared list-query normaliser: keeps every repository's signature identical. */
function listQuery({ page = 1, pageSize = 12, sort, sortDir = 'asc', q, searchFields, filter, where } = {}) {
  return {
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 12,
    sort: sort ? [{ field: sort, dir: sortDir }] : undefined,
    search: q ? { q, fields: searchFields || [] } : undefined,
    filter, where,
  };
}


  try { __exports["db"] = db; } catch (e) {}
  try { __exports["wait"] = wait; } catch (e) {}
  try { __exports["simulate"] = simulate; } catch (e) {}
  try { __exports["collection"] = collection; } catch (e) {}
  try { __exports["resource"] = resource; } catch (e) {}
  try { __exports["listQuery"] = listQuery; } catch (e) {}
  try { __exports["ApiError"] = ApiError; } catch (e) {}
  try { __exports["LATENCY"] = LATENCY; } catch (e) {}
  try { __exports["notFound"] = notFound; } catch (e) {}
  try { __exports["forbidden"] = forbidden; } catch (e) {}
  try { __exports["unauthorized"] = unauthorized; } catch (e) {}
  try { __exports["badRequest"] = badRequest; } catch (e) {}
  try { __exports["conflict"] = conflict; } catch (e) {}
});

__def("assets/js/router.js", function (__exports, __req) {
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

const ROUTES = {
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
function url(route, params) {
  const file = ROUTES[route] || route;
  const base = String(file).replace(/\.dc\.html$/, '');
  let qs = '';
  if (params) {
    qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');
  }
  return '#' + encodeURIComponent(base) + (qs ? '?' + qs : '');
}

function go(route, params) { window.location.hash = url(route, params).slice(1); }

/** All query-string parameters as a plain object. */
function params() {
  return Object.fromEntries(new URLSearchParams(__hashQuery()).entries());
}

/** Rewrite the query string without a navigation — used by list filters. */
function syncQuery(next) {
  const sp = new URLSearchParams(__hashQuery());
  for (const [k, v] of Object.entries(next)) {
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) sp.delete(k);
    else sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const qs = sp.toString();
  const base = (location.hash || '#').slice(1).split('?')[0];
  history.replaceState(null, '', '#' + base + (qs ? '?' + qs : ''));
}

function __hashQuery() {
  const h = location.hash || '';
  const i = h.indexOf('?');
  return i === -1 ? '' : h.slice(i + 1);
}

/** Which navigation group a route belongs to — drives sidebar highlighting. */
const ROUTE_GROUPS = {
  storefront: ['landing', 'home', 'browse', 'product', 'vendorStore', 'cart', 'checkout', 'orderConfirmation', 'plans'],
  auth: ['login', 'registerCustomer', 'registerVendor', 'forgotPassword', 'resetPassword', 'verifyEmail', 'vendorPending', 'storeSetup'],
  account: ['accountOrders', 'accountDownloads', 'accountWishlist', 'accountReviews', 'accountFollowing', 'accountProfile'],
  vendor: ['vendorDashboard', 'vendorProducts', 'vendorProductEdit', 'vendorOrders', 'vendorPayments', 'vendorCoupons', 'vendorCustomers', 'vendorMessages', 'vendorReports', 'vendorMedia', 'vendorSubscription', 'vendorStoreProfile'],
  admin: ['adminDashboard', 'adminVendorQueue', 'adminProductQueue', 'adminVendors', 'adminCatalogue', 'adminOrders', 'adminPayouts', 'adminPlans', 'adminReports', 'adminContent'],
  content: ['about', 'privacy', 'terms', 'contact'],
  system: ['sitemap', 'notFound', 'forbidden', 'serverError'],
};

  try { __exports["url"] = url; } catch (e) {}
  try { __exports["go"] = go; } catch (e) {}
  try { __exports["params"] = params; } catch (e) {}
  try { __exports["syncQuery"] = syncQuery; } catch (e) {}
  try { __exports["ROUTES"] = ROUTES; } catch (e) {}
  try { __exports["ROUTE_GROUPS"] = ROUTE_GROUPS; } catch (e) {}

  function __hashQ() {
    var h = location.hash || '';
    var q = h.indexOf('?');
    return q === -1 ? '' : h.slice(q + 1);
  }
  __exports.url = function (route, params) {
    var file = __exports.ROUTES[route] || route;
    var base = String(file).replace(/\.dc\.html$/, '');
    var qs = '';
    if (params) {
      qs = Object.keys(params)
        .filter(function (k) { var v = params[k]; return v !== undefined && v !== null && v !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&');
    }
    return '#' + encodeURIComponent(base) + (qs ? '?' + qs : '');
  };
  __exports.go = function (route, params) {
    window.location.hash = __exports.url(route, params).slice(1);
  };
  __exports.replace = function (route, params) {
    window.location.replace(__exports.url(route, params));
  };
  __exports.param = function (name, fallback) {
    var v = new URLSearchParams(__hashQ()).get(name);
    return v === null ? (fallback === undefined ? null : fallback) : v;
  };
  __exports.params = function () {
    var o = {};
    new URLSearchParams(__hashQ()).forEach(function (v, k) { o[k] = v; });
    return o;
  };
  __exports.syncQuery = function (next) {
    var sp = new URLSearchParams(__hashQ());
    Object.keys(next).forEach(function (k) {
      var v = next[k];
      var empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      if (empty) sp.delete(k);
      else sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
    });
    var qs = sp.toString();
    var base = (location.hash || '#').slice(1).split('?')[0];
    history.replaceState(null, '', '#' + base + (qs ? '?' + qs : ''));
  };

});

__def("assets/js/auth.js", function (__exports, __req) {
/**
 * auth.js — simulated but real session handling, guards and role checks.
 *
 * Purpose:   login validates against seeded users, stores a session, and every
 *            protected page calls requireRole() on load. Direct URL access to a
 *            page the role cannot use is redirected, not merely hidden.
 * Depends:   db.js, api.js, router.js, i18n.js
 *
 * TODO(backend): swap the credential check for POST /auth/login and store the
 * returned token instead of the user id. requireRole() keeps its signature.
 */

const db = __req('assets/js/db.js');
const { ApiError, unauthorized, forbidden, simulate, resource, LATENCY } = __req('assets/js/api.js');
const { ROUTES, url } = __req('assets/js/router.js');
const { t } = __req('assets/js/i18n.js');
const SESSION_KEY = 'uloominate.session.v1';

const ROLES = ['guest', 'customer', 'vendor', 'admin'];

/** Which roles may open which route. Absent = public. */
const ROUTE_ACCESS = {
  accountOrders: ['customer', 'vendor', 'admin'],
  accountDownloads: ['customer', 'vendor', 'admin'],
  accountWishlist: ['customer', 'vendor', 'admin'],
  accountReviews: ['customer', 'vendor', 'admin'],
  accountFollowing: ['customer', 'vendor', 'admin'],
  accountProfile: ['customer', 'vendor', 'admin'],
  checkout: ['customer', 'vendor', 'admin'],

  vendorDashboard: ['vendor', 'admin'],
  vendorProducts: ['vendor', 'admin'],
  vendorProductEdit: ['vendor', 'admin'],
  vendorOrders: ['vendor', 'admin'],
  vendorPayments: ['vendor', 'admin'],
  vendorCoupons: ['vendor', 'admin'],
  vendorCustomers: ['vendor', 'admin'],
  vendorMessages: ['vendor', 'admin'],
  vendorReports: ['vendor', 'admin'],
  vendorMedia: ['vendor', 'admin'],
  vendorSubscription: ['vendor', 'admin'],
  vendorStoreProfile: ['vendor', 'admin'],
  storeSetup: ['vendor', 'admin'],
  vendorPending: ['vendor', 'admin'],

  adminDashboard: ['admin'],
  adminVendorQueue: ['admin'],
  adminProductQueue: ['admin'],
  adminVendors: ['admin'],
  adminCatalogue: ['admin'],
  adminOrders: ['admin'],
  adminPayouts: ['admin'],
  adminPlans: ['admin'],
  adminReports: ['admin'],
  adminContent: ['admin'],
};

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}

function writeSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent('uloominate:session', { detail: s }));
}

/** The signed-in user record, or null. Includes `vendor` when role is vendor. */
function currentUser() {
  const s = readSession();
  if (!s) return null;
  const user = db.findById('users', s.userId);
  if (!user || user.status === 'suspended') { writeSession(null); return null; }
  const safe = Object.assign({}, user);
  delete safe.password;
  safe.name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  if (user.role === 'vendor' && user.vendorId) safe.vendor = db.findById('vendors', user.vendorId);
  return safe;
}

function currentRole() {
  const u = currentUser();
  return u ? u.role : 'guest';
}

function isSignedIn() { return !!currentUser(); }

function can(...roles) { return roles.includes(currentRole()); }

/** POST /auth/login */
async function login(email, password) {
  return simulate(() => {
    const user = db.findAll('users', { filter: { email: String(email || '').trim().toLowerCase() } }).rows[0];
    if (!user || user.password !== password) throw new ApiError(401, 'invalid_credentials', t('auth.invalidCredentials'));
    if (user.status === 'suspended') throw new ApiError(403, 'account_suspended', t('auth.accountSuspended'));
    writeSession({ userId: user.id, role: user.role, startedAt: new Date().toISOString() });
    return resource(currentUser());
  }, LATENCY.write);
}

/** POST /auth/logout */
async function logout() {
  writeSession(null);
  return { data: { ok: true } };
}

/** Switch identity without credentials — dev toolbar only. */
function impersonate(userId) {
  const user = db.findById('users', userId);
  if (!user) throw new ApiError(404, 'not_found', 'No such demo user');
  writeSession({ userId: user.id, role: user.role, startedAt: new Date().toISOString(), impersonated: true });
  return currentUser();
}

/** POST /auth/password/forgot */
async function requestPasswordReset(email) {
  return simulate(() => {
    const user = db.findAll('users', { filter: { email: String(email || '').trim().toLowerCase() } }).rows[0];
    const token = 'reset-' + Math.random().toString(36).slice(2, 10);
    if (user) db.update('users', user.id, { resetToken: token, resetRequestedAt: new Date().toISOString() });
    return resource({ sent: true, token: user ? token : null });
  }, LATENCY.write);
}

/** POST /auth/password/reset */
async function resetPassword(token, password) {
  return simulate(() => {
    const user = db.findAll('users', { filter: { resetToken: token } }).rows[0];
    if (!user) throw new ApiError(400, 'invalid_token', 'That reset link is invalid or has already been used.');
    db.update('users', user.id, { password, resetToken: null });
    return resource({ ok: true });
  }, LATENCY.write);
}

/**
 * Page guard. Call at the top of every protected page's logic class.
 *   requireRole('vendor', 'admin')  -> redirects to login or 403 and returns null
 * Returns the user when access is allowed.
 */
function requireRole(...roles) {
  const user = currentUser();
  if (!user) {
    const back = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(url('login', { next: back, reason: 'session' }));
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    location.replace(ROUTES.forbidden);
    return null;
  }
  return user;
}

/** Guard by route name, using ROUTE_ACCESS. */
function guardRoute(routeName) {
  const allowed = ROUTE_ACCESS[routeName];
  if (!allowed) return currentUser();
  return requireRole(...allowed);
}

/** A vendor may only publish once approved (BRD §5.4, PRD FR-2.4). */
function vendorCanPublish(user) {
  return !!(user && user.role === 'vendor' && user.vendor && user.vendor.status === 'approved');
}

function onSessionChange(fn) {
  const h = e => fn(e.detail);
  window.addEventListener('uloominate:session', h);
  return () => window.removeEventListener('uloominate:session', h);
}


  try { __exports["unauthorized"] = unauthorized; } catch (e) {}
  try { __exports["forbidden"] = forbidden; } catch (e) {}
  try { __exports["currentUser"] = currentUser; } catch (e) {}
  try { __exports["currentRole"] = currentRole; } catch (e) {}
  try { __exports["isSignedIn"] = isSignedIn; } catch (e) {}
  try { __exports["can"] = can; } catch (e) {}
  try { __exports["login"] = login; } catch (e) {}
  try { __exports["logout"] = logout; } catch (e) {}
  try { __exports["impersonate"] = impersonate; } catch (e) {}
  try { __exports["requestPasswordReset"] = requestPasswordReset; } catch (e) {}
  try { __exports["resetPassword"] = resetPassword; } catch (e) {}
  try { __exports["requireRole"] = requireRole; } catch (e) {}
  try { __exports["guardRoute"] = guardRoute; } catch (e) {}
  try { __exports["vendorCanPublish"] = vendorCanPublish; } catch (e) {}
  try { __exports["onSessionChange"] = onSessionChange; } catch (e) {}
  try { __exports["ROLES"] = ROLES; } catch (e) {}
  try { __exports["ROUTE_ACCESS"] = ROUTE_ACCESS; } catch (e) {}
});

__def("assets/js/seed.js", function (__exports, __req) {
/**
 * seed.js — realistic demo data, written once on first load.
 *
 * Purpose:   enough volume and variety that search, sort, filter, pagination,
 *            approval queues and payout maths are all meaningful. Includes
 *            edge cases: very long titles, zero-review products, declined and
 *            cancelled records, an expired coupon, an empty vendor.
 * Depends:   db.js, business-rules.js
 *
 * The eleven products carrying Figma copy (Main Idea & Details, the six
 * preschool-math cards, the four You-Might-Also-Like tiles) are seeded with
 * the exact strings from the design so the replicated pages render real rows.
 *
 * TODO(backend): delete this file. Real environments seed from a fixture
 * migration, not the browser.
 */

const db = __req('assets/js/db.js');
const { PLANS, CATEGORIES, GRADES, RESOURCE_TYPES, THEMES, FILE_TYPES, PROMO, settleLine, MIN_PAYOUT } = __req('assets/js/business-rules.js');
const IMG = 'assets/img/';
const iso = (y, m, d, h = 10, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi)).toISOString();

/* ------------------------------------------------------------- vendors -- */

const VENDORS = [
  { id: 'v-1', slug: 'literacylane', storeName: 'LiteracyLane by Mrs. Reyes', owner: 'Amara Reyes',
    email: 'reyes@literacylane.com', planCode: 'premium', status: 'approved', followers: 143,
    logo: IMG + 'avatar-2.jpg', banner: IMG + 'cover-1.jpg', joinedAt: iso(2026, 1, 14),
    payoutMethod: 'PayPal', payoutAccount: 'reyes@literacylane.com', country: 'United States',
    bio: 'Reading specialist of eleven years, now writing differentiated comprehension sets for Muslim homeschools and Islamic weekend schools. Every passage is levelled three ways so one lesson reaches a whole mixed-ability room.' },
  { id: 'v-2', slug: 'sweet-preschool-creations', storeName: 'Sweet Preschool Creations', owner: 'Hafsa Siddiqui',
    email: 'hafsa@sweetpreschool.co', planCode: 'basic', status: 'approved', followers: 89,
    logo: IMG + 'vendor-logo-2.png', banner: IMG + 'cover-5.png', joinedAt: iso(2026, 2, 3),
    payoutMethod: 'Bank deposit', payoutAccount: 'HSBC ••••4471', country: 'United Kingdom',
    bio: 'Early-years printables for ages three to six. Counting, tracing and fine-motor packs built around Islamic themes so the youngest learners meet their deen while they learn their numbers.' },
  { id: 'v-3', slug: 'playful-learning-co', storeName: 'Playful Learning Co.', owner: 'Nadia Osman',
    email: 'nadia@playfullearning.co', planCode: 'basic', status: 'approved', followers: 61,
    logo: IMG + 'vendor-logo-3.png', banner: IMG + 'cover-6.png', joinedAt: iso(2026, 2, 19),
    payoutMethod: 'PayPal', payoutAccount: 'nadia@playfullearning.co', country: 'Canada',
    bio: 'Hands-on maths centres and sensory activities. I make the sort of resource you can set out on a Monday and leave running all week.' },
  { id: 'v-4', slug: 'the-kindergarten-hub', storeName: 'The Kindergarten Hub', owner: 'Yusra Karim',
    email: 'yusra@kindergartenhub.org', planCode: 'free', status: 'approved', followers: 34,
    logo: IMG + 'vendor-logo-4.png', banner: IMG + 'cover-7.png', joinedAt: iso(2026, 3, 8),
    payoutMethod: null, payoutAccount: null, country: 'United States',
    bio: 'Free shapes, colours and matching games for kindergarten. Everything I publish stays free — it is my sadaqah jariyah.' },
  { id: 'v-5', slug: 'miss-emilys-classroom', storeName: "Miss Emily's Classroom", owner: 'Emily Haddad',
    email: 'emily@missemilys.classroom', planCode: 'basic', status: 'approved', followers: 118,
    logo: IMG + 'vendor-logo-5.png', banner: IMG + 'cover-8.png', joinedAt: iso(2026, 3, 22),
    payoutMethod: 'Bank deposit', payoutAccount: 'Chase ••••9930', country: 'United States',
    bio: 'Themed pattern, sequencing and colouring sheets. Ocean, desert, Ramadan and Hajj units that print clean in black and white when the colour cartridge runs out.' },
  { id: 'v-6', slug: 'tiny-hands-learning', storeName: 'Tiny Hands Learning', owner: 'Ruqayyah Bello',
    email: 'ruqayyah@tinyhands.learning', planCode: 'premium', status: 'approved', followers: 207,
    logo: IMG + 'vendor-logo-1.png', banner: IMG + 'cover-9.png', joinedAt: iso(2026, 4, 2),
    payoutMethod: 'PayPal', payoutAccount: 'ruqayyah@tinyhands.learning', country: 'Nigeria',
    bio: 'Clip cards, number sense puzzles and Arabic letter work for toddlers and early learners. Laminate once, use for years.' },
  { id: 'v-7', slug: 'curriculum-and-crafts', storeName: 'Curriculum & Crafts', owner: 'Sumayyah Iqbal',
    email: 'sumayyah@curriculumcrafts.com', planCode: 'basic', status: 'approved', followers: 76,
    logo: IMG + 'vendor-logo-6.png', banner: IMG + 'cover-10.png', joinedAt: iso(2026, 5, 11),
    payoutMethod: 'PayPal', payoutAccount: 'sumayyah@curriculumcrafts.com', country: 'Pakistan',
    bio: 'Full unit plans with the craft built in. Seerah, Islamic geometry and STEM sets for co-ops and weekend schools.' },
  { id: 'v-8', slug: 'muslim-legacy-series', storeName: 'Muslim Legacy Series', owner: 'Bilal Haqq',
    email: 'contact@muslimlegacyseries.com', planCode: 'publishers', status: 'pending', followers: 0,
    logo: IMG + 'vendor-logo-1.png', banner: null, joinedAt: iso(2026, 7, 29),
    payoutMethod: 'Bank deposit', payoutAccount: 'Emirates NBD ••••2210', country: 'United Arab Emirates',
    bio: 'Publishing house producing full-year Islamic Studies and Arabic curricula for schools. Sixty titles in print, moving our digital catalogue to Uloominate.' },
];

/* --------------------------------------------------------------- users -- */

const USERS = [
  { id: 'u-admin', role: 'admin', firstName: 'Khadija', lastName: 'Quadri',
    email: 'admin@uloominate.com', password: 'admin1234', avatar: null, status: 'active', joinedAt: iso(2025, 11, 2) },
  ...VENDORS.map((v, i) => ({
    id: 'u-' + v.id, role: 'vendor', vendorId: v.id,
    firstName: v.owner.split(' ')[0], lastName: v.owner.split(' ').slice(1).join(' '),
    email: v.email, password: 'vendor1234', avatar: v.logo,
    status: v.status === 'suspended' ? 'suspended' : 'active', joinedAt: v.joinedAt,
  })),
  { id: 'u-c1', role: 'customer', firstName: 'Aisha', lastName: 'Rahman', email: 'aisha.rahman@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-1.jpg', status: 'active', joinedAt: iso(2026, 2, 12),
    roleLabel: '3rd Grade Teacher' },
  { id: 'u-c2', role: 'customer', firstName: 'Maryam', lastName: 'Patterson', email: 'm.patterson@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-1.jpg', status: 'active', joinedAt: iso(2026, 1, 30),
    roleLabel: '3rd Grade Teacher' },
  { id: 'u-c3', role: 'customer', firstName: 'Luis', lastName: 'Dominguez', email: 'l.dominguez@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-2.jpg', status: 'active', joinedAt: iso(2026, 3, 4),
    roleLabel: '4th Grade Teacher' },
  { id: 'u-c4', role: 'customer', firstName: 'Wei', lastName: 'Chen', email: 'w.chen@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-3.jpg', status: 'active', joinedAt: iso(2026, 4, 18),
    roleLabel: '2nd Grade Teacher' },
  { id: 'u-c5', role: 'customer', firstName: 'Fatima', lastName: 'Bakr', email: 'fatima.bakr@example.com',
    password: 'customer1234', avatar: null, status: 'active', joinedAt: iso(2026, 6, 21),
    roleLabel: 'Homeschool Parent' },
  { id: 'u-c6', role: 'customer', firstName: 'Idris', lastName: 'Mahmood', email: 'idris.mahmood@example.com',
    password: 'customer1234', avatar: null, status: 'active', joinedAt: iso(2026, 7, 9),
    roleLabel: 'Weekend School Coordinator' },
];

/* ------------------------------------------------------------ products -- */

const cat = slug => CATEGORIES.find(c => c.slug === slug).id;

// The eleven products whose copy is fixed by the Figma design.
const DESIGN_PRODUCTS = [
  { id: 'p-main', vendorId: 'v-1', status: 'approved',
    title: 'Main Idea & Details — Nonfiction Passages, Grades 3–5 (Differentiated)',
    price: 9.00, originalPrice: 12.00,
    categoryId: cat('ela'), subject: 'Reading Comprehension', resourceType: 'Worksheets',
    gradeFrom: '3rd Grade', gradeTo: '5th Grade', theme: 'Everyday',
    fileType: 'PDF + Google Slides', pageCount: 49, fileSizeMb: 8.4,
    tags: ['ELA', 'Reading', 'Nonfiction', 'Grades 3–5', 'CCSS Aligned', 'Digital'],
    cover: IMG + 'preview-1.jpg',
    gallery: [IMG + 'preview-1.jpg', IMG + 'preview-2.jpg', IMG + 'preview-3.jpg', IMG + 'preview-4.jpg', IMG + 'preview-5.jpg'],
    downloads: 12841, ratingAvg: 4.9, ratingCount: 3847,
    ratingBreakdown: { 5: 89, 4: 8, 3: 2, 2: 1, 1: 0 },
    description: 'This Main Idea & Details resource set gives students structured practice identifying central ideas and the supporting details that hold them up, across twelve original nonfiction passages.\n\nEach passage is carefully leveled and features high-interest nonfiction content that keeps readers engaged while they build the skill.',
    includedHeading: 'What teachers love about this resource:',
    included: [
      'Three differentiated versions (on-level, below-level, challenge)',
      'Graphic organizer + short-answer response format',
      'Answer keys included for every passage',
      'Works in centers, whole-class, small group, or homework',
      'Print-and-go — no prep required',
    ],
    publishedAt: iso(2024, 11, 12), lastUpdated: iso(2024, 11, 12) },

  { id: 'p-b1', vendorId: 'v-2', status: 'approved',
    title: 'Preschool Math Worksheet Pack: Numbers 1-10 Counting & Tracing Bundle',
    price: 4.50, originalPrice: 6.00, categoryId: cat('math'), subject: 'Counting',
    resourceType: 'Worksheets', gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Everyday',
    fileType: 'PDF', pageCount: 32, fileSizeMb: 5.1, cover: IMG + 'cover-5.png',
    downloads: 2140, ratingAvg: 5, ratingCount: 142, publishedAt: iso(2026, 3, 4) },
  { id: 'p-b2', vendorId: 'v-3', status: 'approved',
    title: 'Apple Tree Counting: Interactive Hands-On Autumn Math Centers',
    price: 3.20, categoryId: cat('math'), subject: 'Counting', resourceType: 'Activities',
    gradeFrom: 'Pre-K', gradeTo: '1st Grade', theme: 'Seasonal',
    fileType: 'PDF', pageCount: 24, fileSizeMb: 12.6, cover: IMG + 'cover-6.png',
    downloads: 1180, ratingAvg: 5, ratingCount: 89, publishedAt: iso(2026, 3, 18) },
  { id: 'p-b3', vendorId: 'v-4', status: 'approved',
    title: 'Shapes Matching Game & Clip Cards: Circle, Triangle, Square Activities',
    price: 0, categoryId: cat('math'), subject: 'Geometry', resourceType: 'Games',
    gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Everyday',
    fileType: 'PDF', pageCount: 18, fileSizeMb: 4.2, cover: IMG + 'cover-7.png',
    downloads: 5602, ratingAvg: 5, ratingCount: 203, publishedAt: iso(2026, 4, 1) },
  { id: 'p-b4', vendorId: 'v-5', status: 'approved',
    title: 'Ocean Theme Pattern Coloring & Sequencing Activity Sheets',
    price: 2.80, categoryId: cat('math'), subject: 'Counting', resourceType: 'Printables',
    gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Seasonal',
    fileType: 'PDF', pageCount: 20, fileSizeMb: 6.8, cover: IMG + 'cover-8.png',
    downloads: 940, ratingAvg: 5, ratingCount: 56, publishedAt: iso(2026, 4, 15) },
  { id: 'p-b5', vendorId: 'v-6', status: 'approved',
    title: 'Preschool Math Clip Cards: Ocean Creatures Counting & Number Sense',
    price: 3.50, categoryId: cat('math'), subject: 'Counting', resourceType: 'Flash Cards',
    gradeFrom: 'Pre-K', gradeTo: '1st Grade', theme: 'Everyday',
    fileType: 'PDF', pageCount: 28, fileSizeMb: 9.3, cover: IMG + 'cover-9.png',
    downloads: 1320, ratingAvg: 5, ratingCount: 74, publishedAt: iso(2026, 5, 2) },
  { id: 'p-b6', vendorId: 'v-7', status: 'approved',
    title: 'Number Sense Matching Puzzles for Toddlers & Early Learners',
    price: 5.00, originalPrice: 7.50, categoryId: cat('math'), subject: 'Counting',
    resourceType: 'Games', gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Everyday',
    fileType: 'PDF', pageCount: 36, fileSizeMb: 11.2, cover: IMG + 'cover-10.png',
    downloads: 1760, ratingAvg: 5, ratingCount: 112, publishedAt: iso(2026, 5, 20) },

  { id: 'p-r1', vendorId: 'v-1', status: 'approved',
    title: 'Reading Comprehension Bundle — Grades 3-5', price: 14.00,
    categoryId: cat('ela'), subject: 'Reading Comprehension', resourceType: 'Workbooks',
    gradeFrom: '3rd Grade', gradeTo: '5th Grade', theme: 'Everyday',
    fileType: 'PDF + Google Slides', pageCount: 148, fileSizeMb: 26.4, cover: IMG + 'cover-1.jpg',
    downloads: 7420, ratingAvg: 4.8, ratingCount: 2341, publishedAt: iso(2026, 1, 22) },
  { id: 'p-r2', vendorId: 'v-1', status: 'approved',
    title: 'Phonics Fluency Passages — First Grade', price: 7.50,
    categoryId: cat('ela'), subject: 'Phonics', resourceType: 'Worksheets',
    gradeFrom: 'Kindergarten', gradeTo: '2nd Grade', theme: 'Everyday',
    fileType: 'PDF', pageCount: 64, fileSizeMb: 10.1, cover: IMG + 'cover-2.jpg',
    downloads: 5210, ratingAvg: 4.9, ratingCount: 1872, publishedAt: iso(2026, 2, 9) },
  { id: 'p-r3', vendorId: 'v-7', status: 'approved',
    title: 'Math Word Problems Task Cards — 3rd Grade', price: 5.00,
    categoryId: cat('math'), subject: 'Addition', resourceType: 'Flash Cards',
    gradeFrom: '2nd Grade', gradeTo: '4th Grade', theme: 'Everyday',
    fileType: 'PDF', pageCount: 40, fileSizeMb: 7.7, cover: IMG + 'cover-3.jpg',
    downloads: 3180, ratingAvg: 4.7, ratingCount: 988, publishedAt: iso(2026, 3, 12) },
  { id: 'p-r4', vendorId: 'v-5', status: 'approved',
    title: 'Writing Workshop Mini-Lessons — Full Year', price: 22.00,
    categoryId: cat('ela'), subject: 'Writing', resourceType: 'Unit Plans',
    gradeFrom: '3rd Grade', gradeTo: '6th Grade', theme: 'Everyday',
    fileType: 'PDF + Google Slides', pageCount: 210, fileSizeMb: 34.8, cover: IMG + 'cover-4.jpg',
    downloads: 1490, ratingAvg: 4.6, ratingCount: 456, publishedAt: iso(2026, 4, 26) },
];

// A broader Islamic-education catalogue, generated with deterministic variety.
const CATALOGUE = [
  ['Aqeedah Foundations: The Six Pillars of Iman Unit Study', 'v-8', 'islamic-studies', 'Aqeedah', 'Unit Plans', '4th Grade', '7th Grade', 18.00, null, 'approved'],
  ['Seerah Timeline Posters — Makkan and Madinan Periods', 'v-7', 'islamic-studies', 'Seerah', 'Posters', '3rd Grade', '8th Grade', 6.50, 9.00, 'approved'],
  ['My First Duas: Tracing and Colouring Book', 'v-2', 'islamic-studies', 'Duas & Adhkar', 'Printables', 'Pre-K', '1st Grade', 0, null, 'approved'],
  ['Adab of the Muslim Child — 30 Character Lessons', 'v-7', 'islamic-studies', 'Adab & Manners', 'Lesson Plans', '1st Grade', '5th Grade', 12.00, null, 'approved'],
  ['Fiqh of Salah: Step-by-Step Visual Guide and Worksheets', 'v-8', 'islamic-studies', 'Fiqh', 'Worksheets', '2nd Grade', '6th Grade', 8.00, null, 'pending'],
  ['Ramadan Reflection Journal for Young Muslims', 'v-5', 'islamic-studies', 'Adab & Manners', 'Workbooks', '3rd Grade', '8th Grade', 4.00, 6.00, 'approved'],

  ['Juz Amma Memorisation Tracker and Reward Charts', 'v-6', 'quran', 'Memorisation', 'Printables', 'Kindergarten', '6th Grade', 3.00, null, 'approved'],
  ['Tajweed Rules Made Simple: Colour-Coded Reference Cards', 'v-8', 'quran', 'Tajweed', 'Flash Cards', '4th Grade', 'Adult', 9.50, null, 'approved'],
  ['Surah Al-Fatihah Word-by-Word Study Pack', 'v-7', 'quran', 'Tafsir', 'Worksheets', '2nd Grade', '5th Grade', 5.00, null, 'approved'],
  ['Quran Stories Comprehension Set: Prophets in the Quran', 'v-1', 'quran', 'Tafsir', 'Worksheets', '3rd Grade', '6th Grade', 7.00, null, 'approved'],
  ['Daily Quran Reading Log — Whole Year Bundle', 'v-4', 'quran', 'Memorisation', 'Printables', '1st Grade', 'High School', 0, null, 'approved'],

  ['Arabic Alphabet Playdough Mats and Tracing Strips', 'v-2', 'arabic', 'Alphabet', 'Activities', 'Pre-K', '1st Grade', 4.50, null, 'approved'],
  ['Arabic Vocabulary Builder: 300 Everyday Words with Images', 'v-6', 'arabic', 'Vocabulary', 'Flash Cards', '1st Grade', '6th Grade', 11.00, 14.00, 'approved'],
  ['Nahw Basics: Introduction to Arabic Grammar Workbook', 'v-8', 'arabic', 'Grammar (Nahw)', 'Workbooks', '6th Grade', 'Adult', 16.00, null, 'pending'],
  ['Arabic Handwriting Practice — Naskh Script Sheets', 'v-3', 'arabic', 'Handwriting', 'Worksheets', 'Kindergarten', '4th Grade', 3.50, null, 'approved'],
  ['Read Arabic in 30 Days: Structured Daily Lessons', 'v-8', 'arabic', 'Reading', 'Lesson Plans', '3rd Grade', 'Adult', 19.00, null, 'declined'],

  ['Islamic History Map Work: The Spread of Islam 610–750 CE', 'v-7', 'social-studies', 'Islamic History', 'Activities', '5th Grade', 'High School', 8.50, null, 'approved'],
  ['World Cultures of the Muslim World — Research Project Pack', 'v-5', 'social-studies', 'World Cultures', 'Unit Plans', '4th Grade', '8th Grade', 10.00, null, 'approved'],
  ['Community Helpers in Our Masjid — Early Years Social Studies', 'v-2', 'social-studies', 'Civics', 'Printables', 'Pre-K', '1st Grade', 2.50, null, 'approved'],
  ['Geography of the Hajj Journey: Mapping Activities', 'v-7', 'social-studies', 'Geography', 'Worksheets', '3rd Grade', '6th Grade', 5.50, 7.00, 'approved'],

  ['Multiplication Fact Fluency Games — Times Tables 1 to 12', 'v-3', 'math', 'Multiplication', 'Games', '2nd Grade', '5th Grade', 6.00, null, 'approved'],
  ['Fractions on a Number Line: Visual Models and Practice', 'v-1', 'math', 'Fractions', 'Worksheets', '3rd Grade', '5th Grade', 4.75, null, 'approved'],
  ['Islamic Geometric Patterns Meet Symmetry — STEAM Unit', 'v-7', 'math', 'Geometry', 'Unit Plans', '4th Grade', '8th Grade', 13.50, null, 'approved'],
  ['Subtraction With Regrouping — Scaffolded Practice Pages', 'v-5', 'math', 'Subtraction', 'Worksheets', '1st Grade', '3rd Grade', 3.75, null, 'approved'],
  ['Long Division Step Cards and Error-Analysis Tasks', 'v-6', 'math', 'Division', 'Flash Cards', '4th Grade', '6th Grade', 5.25, null, 'draft'],

  ['The Water Cycle: Signs of Allah in Nature Science Unit', 'v-7', 'science', 'Earth Science', 'Unit Plans', '3rd Grade', '6th Grade', 9.00, null, 'approved'],
  ['Life Cycles Interactive Notebook — Plants and Animals', 'v-3', 'science', 'Life Science', 'Activities', '2nd Grade', '5th Grade', 7.25, null, 'approved'],
  ['Simple Machines STEM Challenge Cards', 'v-6', 'science', 'STEM', 'Activities', '3rd Grade', '7th Grade', 6.75, 8.50, 'approved'],
  ['States of Matter Lab Sheets and Vocabulary Wall', 'v-5', 'science', 'Physical Science', 'Worksheets', '2nd Grade', '5th Grade', 4.25, null, 'unpublished'],

  ['Sight Word Fluency Ladders — Pre-Primer to Third Grade', 'v-1', 'ela', 'Vocabulary', 'Printables', 'Kindergarten', '3rd Grade', 8.00, null, 'approved'],
  ['Narrative Writing Prompts With Islamic Themes — 60 Cards', 'v-5', 'ela', 'Writing', 'Flash Cards', '3rd Grade', '7th Grade', 5.50, null, 'approved'],
  ['Grammar Grab Bag: Parts of Speech Centres', 'v-3', 'ela', 'Grammar', 'Games', '2nd Grade', '5th Grade', 6.25, null, 'approved'],
  ['Close Reading Passages: Hadith of the Week, Full Year Set (36 Weeks of Differentiated Passages, Comprehension Questions, Vocabulary Work and Answer Keys)', 'v-1', 'ela', 'Reading Comprehension', 'Workbooks', '4th Grade', '8th Grade', 24.00, 32.00, 'approved'],

  ['Islamic Geometric Art: Compass and Ruler Construction Pack', 'v-7', 'art', 'Islamic Geometric Art', 'Activities', '5th Grade', 'High School', 11.50, null, 'approved'],
  ['Arabic Calligraphy for Beginners — Thuluth Practice Sheets', 'v-8', 'art', 'Calligraphy', 'Worksheets', '6th Grade', 'Adult', 14.00, null, 'pending'],
  ['Eid Craft Bundle: Cards, Bunting and Gift Tags', 'v-2', 'art', 'Crafts', 'Printables', 'Pre-K', '4th Grade', 4.00, null, 'approved'],
  ['Masjid Colouring Pages From Around the World', 'v-4', 'art', 'Colouring', 'Printables', 'Pre-K', '3rd Grade', 0, null, 'approved'],

  ['Halal Nutrition and Healthy Eating Unit for Primary', 'v-5', 'health', 'Nutrition', 'Unit Plans', '1st Grade', '5th Grade', 7.00, null, 'approved'],
  ['Feelings and Fitrah: Social-Emotional Learning Cards', 'v-6', 'health', 'Social & Emotional', 'Flash Cards', 'Kindergarten', '4th Grade', 6.50, null, 'approved'],
  ['Wudu and Personal Hygiene Visual Routine Charts', 'v-2', 'health', 'Wellbeing', 'Posters', 'Pre-K', '2nd Grade', 2.00, null, 'approved'],
  ['Active Breaks for the Islamic Classroom — 40 Movement Cards', 'v-3', 'health', 'Physical Education', 'Activities', 'Kindergarten', '6th Grade', 3.25, null, 'declined'],
];

const DESCRIPTIONS = [
  'Built for mixed-ability classrooms and homeschool tables alike. Everything prints clean in greyscale, so it still works when the colour cartridge gives up mid-lesson.',
  'Written after three years of running this material with real students. The pacing, the question order and the answer keys all reflect what actually held attention in the room.',
  'Each section stands alone, so you can pull a single page for a Friday filler or run the whole sequence as a half-term unit.',
  'Includes a teacher guide with suggested pacing, differentiation notes, and a short list of common misconceptions to watch for.',
  'Designed to be laminated once and reused for years. Cutting guides are included on every card sheet.',
];

const INCLUDED_SETS = [
  ['Full-colour and printer-friendly versions of every page', 'Answer keys for all tasks', 'Teacher pacing guide', 'Editable cover page'],
  ['Three differentiation levels', 'Student reflection sheet', 'Assessment rubric', 'Parent letter template'],
  ['Cutting and laminating guides', 'Storage label sheet', 'Extension activity ideas', 'Digital Google Slides version'],
  ['Weekly planning overview', 'Vocabulary word wall cards', 'Home practice sheets', 'Certificate of completion'],
];

const COVERS = ['cover-1.jpg', 'cover-2.jpg', 'cover-3.jpg', 'cover-4.jpg', 'cover-5.png',
  'cover-6.png', 'cover-7.png', 'cover-8.png', 'cover-9.png', 'cover-10.png'];

function buildCatalogue() {
  return CATALOGUE.map((row, i) => {
    const [title, vendorId, catSlug, subject, resourceType, gradeFrom, gradeTo, price, originalPrice, status] = row;
    const c = CATEGORIES.find(x => x.slug === catSlug);
    const seed = i * 7 + 3;
    const cover = IMG + COVERS[i % COVERS.length];
    const ratingCount = status === 'approved' ? (seed * 13) % 480 + (price === 0 ? 120 : 4) : 0;
    return {
      id: 'p-c' + (i + 1), vendorId, status, title,
      price, originalPrice: originalPrice || null,
      categoryId: c.id, subject, resourceType,
      gradeFrom, gradeTo, theme: THEMES[seed % THEMES.length],
      fileType: FILE_TYPES[seed % FILE_TYPES.length],
      pageCount: 12 + (seed * 5) % 180,
      fileSizeMb: Math.round((2 + (seed % 40) * 0.9) * 10) / 10,
      cover, gallery: [cover, IMG + COVERS[(i + 3) % COVERS.length], IMG + COVERS[(i + 6) % COVERS.length]],
      downloads: status === 'approved' ? (seed * 137) % 6400 + 42 : 0,
      ratingAvg: ratingCount ? Math.round((3.9 + (seed % 11) / 10) * 10) / 10 : 0,
      ratingCount,
      description: DESCRIPTIONS[seed % DESCRIPTIONS.length],
      includedHeading: 'What is inside this resource:',
      included: INCLUDED_SETS[seed % INCLUDED_SETS.length],
      tags: [c.name, subject, resourceType, gradeFrom + ' – ' + gradeTo],
      publishedAt: status === 'approved' ? iso(2026, 1 + (i % 7), 2 + (i % 26)) : null,
      submittedAt: iso(2026, 6 + (i % 2), 1 + (i % 27)),
      lastUpdated: iso(2026, 6 + (i % 2), 3 + (i % 25)),
      declineReason: status === 'declined'
        ? 'Preview images are low quality or misleading' : null,
      declineNote: status === 'declined'
        ? 'The three preview pages do not match the described contents. Please re-export at 150 DPI and confirm the page count before resubmitting.' : null,
    };
  });
}

function normaliseProduct(p) {
  const c = CATEGORIES.find(x => x.id === p.categoryId);
  return Object.assign({
    originalPrice: null, theme: 'Everyday', gallery: [p.cover], downloads: 0,
    ratingAvg: 0, ratingCount: 0, ratingBreakdown: null,
    description: DESCRIPTIONS[0], includedHeading: 'What is inside this resource:',
    included: INCLUDED_SETS[0], tags: [c ? c.name : '', p.subject, p.resourceType].filter(Boolean),
    submittedAt: p.publishedAt, lastUpdated: p.publishedAt, declineReason: null, declineNote: null,
    fileKey: null, fileName: p.title.slice(0, 40).trim().replace(/[^\w -]/g, '') + '.pdf',
  }, p);
}

/* -------------------------------------------------------------- orders -- */

function buildOrders(products) {
  const buyers = USERS.filter(u => u.role === 'customer');
  const sellable = products.filter(p => p.status === 'approved');
  const orders = [];
  // A digital resource can only be bought once per account, so track what each
  // buyer already owns rather than letting the loop resell it.
  const owned = {};
  buyers.forEach(b => { owned[b.id] = new Set(); });
  let seq = 0;

  // Volume matters: with only a few dozen orders no vendor clears the $25
  // payout minimum in a month, and every financial screen reads empty.
  for (let i = 0; i < 320; i++) {
    const buyer = buyers[i % buyers.length];
    const want = 1 + (i % 3);
    const items = [];
    for (let k = 0; k < want; k++) {
      // Walk forward until an unowned resource turns up.
      for (let probe = 0; probe < sellable.length; probe++) {
        const p = sellable[(i * 5 + k * 11 + probe) % sellable.length];
        if (owned[buyer.id].has(p.id) || items.some(it => it.productId === p.id)) continue;
        items.push({
          productId: p.id, vendorId: p.vendorId, title: p.title,
          price: p.price, cover: p.cover, planCode: VENDORS.find(v => v.id === p.vendorId).planCode,
        });
        break;
      }
    }
    if (!items.length) continue; // this buyer owns the whole catalogue
    const total = items.reduce((s, it) => s + it.price, 0);
    const status = i % 41 === 4 ? 'refunded' : i % 53 === 11 ? 'cancelled' : i % 67 === 25 ? 'failed' : 'completed';
    // Only a completed order confers ownership.
    if (status === 'completed') items.forEach(it => owned[buyer.id].add(it.productId));
    const month = 1 + (i % 8);
    seq++;
    orders.push({
      id: 'o-' + String(1000 + seq),
      reference: 'ULM-' + (26000 + seq),
      customerId: buyer.id, customerName: buyer.firstName + ' ' + buyer.lastName,
      customerEmail: buyer.email,
      items, subtotal: round2(total), discount: 0, total: round2(total),
      status, paymentMethod: i % 3 === 0 ? 'PayPal' : 'Card ••••4242',
      placedAt: iso(2026, month, 1 + (i % 27), 9 + (i % 9), (i * 7) % 60),
    });
  }
  return orders;
}

/* ------------------------------------------------------------- reviews -- */

const REVIEW_BODIES = [
  'Absolutely love this resource! My students were so engaged during the lesson and the differentiated versions made it easy to reach everyone in my class. The graphic organizers are exactly what I was looking for.',
  'This is exactly what I needed for my reading centers. The answer key was a huge time saver and the passages held my class\u2019s attention right through to Friday.',
  'Great resource overall. I did have to adjust the font size for my struggling readers, but the content itself is strong and the structure is easy to follow.',
  'Printed beautifully in black and white which matters in our co-op. Everything was laid out clearly and the pacing guide saved me an evening of planning.',
  'My daughter asked to do the next page without being told. That has never happened with a worksheet before.',
  'Used this across two weekend-school classes. Both teachers said the same thing: no prep needed, and the children stayed with it.',
  'Solid value for the price. I would like a few more challenge pages, but what is here works well as it stands.',
];

function buildReviews(products, orders) {
  const reviewers = USERS.filter(u => u.role === 'customer');
  const named = [
    { productId: 'p-main', userId: 'u-c2', name: 'Ms. Patterson', roleLabel: '3rd Grade Teacher',
      rating: 5, body: REVIEW_BODIES[0], avatar: IMG + 'avatar-1.jpg', createdAt: iso(2024, 9, 14) },
    { productId: 'p-main', userId: 'u-c3', name: 'Mr. Dominguez', roleLabel: '4th Grade Teacher',
      rating: 5, body: REVIEW_BODIES[1], avatar: IMG + 'avatar-2.jpg', createdAt: iso(2024, 10, 8) },
    { productId: 'p-main', userId: 'u-c4', name: 'Mrs. Chen', roleLabel: '2nd Grade Teacher',
      rating: 4, body: REVIEW_BODIES[2], avatar: IMG + 'avatar-3.jpg', createdAt: iso(2024, 11, 3) },
  ];
  const rest = [];
  // Extra reviews on the design product so review paging is exercised (the
  // Figma page shows three and a "See all …" control).
  for (let i = 0; i < 9; i++) {
    const u = reviewers[(i + 2) % reviewers.length];
    rest.push({
      productId: 'p-main', userId: u.id, name: u.firstName + ' ' + u.lastName,
      roleLabel: u.roleLabel || 'Educator', avatar: u.avatar,
      rating: [5, 5, 4, 5, 5, 4, 5, 3, 5][i],
      body: REVIEW_BODIES[(i + 1) % REVIEW_BODIES.length],
      createdAt: iso(2026, 1 + (i % 7), 3 + (i % 24)),
    });
  }
  const sellable = products.filter(p => p.status === 'approved' && p.id !== 'p-main');
  for (let i = 0; i < 64; i++) {
    const p = sellable[(i * 3) % sellable.length];
    const u = reviewers[i % reviewers.length];
    rest.push({
      productId: p.id, userId: u.id, name: u.firstName + ' ' + u.lastName,
      roleLabel: u.roleLabel || 'Educator', avatar: u.avatar,
      rating: [5, 5, 5, 4, 5, 4, 3][i % 7],
      body: REVIEW_BODIES[(i + 3) % REVIEW_BODIES.length],
      createdAt: iso(2026, 1 + (i % 7), 2 + (i % 26)),
    });
  }
  return named.concat(rest).map((r, i) => Object.assign({ id: 'r-' + (i + 1), status: 'published' }, r));
}

/* ------------------------------------------------------------- payouts -- */

/**
 * Payouts must reconcile with the orders, or a vendor dashboard shows a
 * withdrawable balance of zero while claiming lifetime earnings. For each
 * vendor we settle their real order lines, then pay out roughly two thirds of
 * that across monthly runs and leave the remainder withdrawable.
 */
function buildPayouts(products, orders) {
  const rows = [];
  let n = 0;

  for (const v of VENDORS.filter(x => x.status === 'approved' && x.payoutMethod)) {
    // Earnings by calendar month, from completed orders only.
    const byMonth = {};
    for (const o of orders) {
      if (o.status !== 'completed') continue;
      for (const it of o.items) {
        if (it.vendorId !== v.id) continue;
        const split = settleLine({ price: it.price, planCode: v.planCode });
        const key = o.placedAt.slice(0, 7);
        byMonth[key] = (byMonth[key] || 0) + split.vendorEarnings;
      }
    }

    const months = Object.keys(byMonth).sort();
    if (!months.length) continue;

    // Leave the most recent month unpaid so there is always a live balance.
    const payable = months.slice(0, Math.max(1, months.length - 1));

    for (const key of payable) {
      const amount = round2(byMonth[key]);
      if (amount < MIN_PAYOUT) continue;
      n++;
      const [y, m] = key.split('-').map(Number);
      const label = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'][m - 1];
      const pending = n % 8 === 0;
      const processing = !pending && n % 7 === 0;
      rows.push({
        id: 'po-' + n, vendorId: v.id, period: label + ' ' + y,
        amount,
        method: v.payoutMethod, account: v.payoutAccount,
        status: pending ? 'pending' : processing ? 'processing' : 'paid',
        requestedAt: iso(y, m, 28),
        paidAt: pending || processing ? null : iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 5),
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------- coupons -- */

function buildCoupons() {
  return [
    { id: 'cp-1', vendorId: 'v-1', code: 'LITERACY15', type: 'percent', value: 15, minSpend: 10,
      usageLimit: 200, used: 47, expiresAt: iso(2026, 12, 31), status: 'active' },
    { id: 'cp-2', vendorId: 'v-1', code: 'BUNDLE5', type: 'fixed', value: 5, minSpend: 20,
      usageLimit: 100, used: 12, expiresAt: iso(2026, 10, 31), status: 'active' },
    { id: 'cp-3', vendorId: 'v-2', code: 'PRESCHOOL10', type: 'percent', value: 10, minSpend: 0,
      usageLimit: 500, used: 218, expiresAt: iso(2026, 9, 30), status: 'active' },
    { id: 'cp-4', vendorId: 'v-5', code: 'RAMADAN25', type: 'percent', value: 25, minSpend: 8,
      usageLimit: 300, used: 300, expiresAt: iso(2026, 4, 10), status: 'exhausted' },
    { id: 'cp-5', vendorId: 'v-6', code: 'TINYHANDS20', type: 'percent', value: 20, minSpend: 5,
      usageLimit: 150, used: 33, expiresAt: iso(2026, 3, 1), status: 'expired' },
    { id: 'cp-6', vendorId: 'v-7', code: 'CRAFT3', type: 'fixed', value: 3, minSpend: 12,
      usageLimit: null, used: 9, expiresAt: iso(2027, 1, 31), status: 'active' },
    { id: 'cp-7', vendorId: 'v-3', code: 'PLAYFUL2026', type: 'percent', value: 12, minSpend: 0,
      usageLimit: 250, used: 0, expiresAt: iso(2026, 12, 1), status: 'active' },
  ];
}

/* ------------------------------------------------------- subscriptions -- */

function buildSubscriptions() {
  return VENDORS.map((v, i) => ({
    id: 'sub-' + (i + 1), vendorId: v.id, planCode: v.planCode,
    status: v.status === 'approved' ? 'active' : 'pending',
    promoActive: true, freeUntil: PROMO.freeUntil, nextBillingDate: PROMO.billingStarts,
    nextBillingAmount: (PLANS.find(p => p.code === v.planCode) || {}).annualFee ?? null,
    paymentMethod: v.planCode === 'free' ? null : 'Card ••••' + (4242 + i),
    paymentExpiry: v.planCode === 'free' ? null : '0' + (2 + i % 8) + '/29',
    startedAt: v.joinedAt, cancelledAt: null,
  }));
}

/* ------------------------------------------------------- notifications -- */

function buildNotifications(products, orders) {
  const rows = [];
  let n = 0;
  const push = (userId, type, title, body, at, link) =>
    rows.push({ id: 'n-' + (++n), userId, type, title, body, createdAt: at, read: n > 6, link: link || null });

  push('u-v-8', 'vendor_registration', 'Registration received',
    'Your vendor registration is with an administrator for review against our content standard.', iso(2026, 7, 29));
  push('u-admin', 'vendor_pending', 'New vendor awaiting review',
    'Muslim Legacy Series registered on the Publishers tier and is waiting for approval.', iso(2026, 7, 29));
  push('u-admin', 'product_pending', '3 products awaiting review',
    'Fiqh of Salah, Nahw Basics and Arabic Calligraphy for Beginners are in the moderation queue.', iso(2026, 8, 1));
  push('u-v-1', 'sale', 'You made a sale',
    'Main Idea & Details — Nonfiction Passages sold for $9.00. Your earnings: $6.95.', iso(2026, 8, 4));
  push('u-v-1', 'payout', 'Payout issued',
    'Your June 2026 payout of $412.60 has been sent to PayPal.', iso(2026, 7, 5));
  push('u-v-2', 'product_approved', 'Product approved',
    'Preschool Math Worksheet Pack is now live on the storefront.', iso(2026, 3, 5));
  push('u-v-8', 'billing_transition', 'Billing begins 2 January 2027',
    'Your founding-offer period ends on 1 January 2027. Paid billing for the Publishers tier starts the following day.', iso(2026, 8, 2));
  push('u-c1', 'order', 'Your resources are ready',
    'Order ULM-26003 is complete. Download your files any time from your account.', iso(2026, 6, 18));
  push('u-v-5', 'product_declined', 'Product declined',
    'Active Breaks for the Islamic Classroom was declined: preview images are low quality or misleading.', iso(2026, 7, 14));
  return rows;
}

/* ---------------------------------------------------------------- seed -- */

function seedAll(force = false) {
  if (db.isSeeded() && !force) return false;
  if (force) db.reset();

  const products = DESIGN_PRODUCTS.concat(buildCatalogue()).map(normaliseProduct);
  const orders = buildOrders(products);
  const reviews = buildReviews(products, orders);

  db.loadCollection('plans', PLANS.map(p => Object.assign({}, p)));
  db.loadCollection('categories', CATEGORIES.map(c => Object.assign({}, c)));
  db.loadCollection('users', USERS.map(u => Object.assign({}, u)));
  db.loadCollection('vendors', VENDORS.map(v => Object.assign({}, v)));
  db.loadCollection('products', products);
  db.loadCollection('orders', orders);
  db.loadCollection('reviews', reviews);
  db.loadCollection('payouts', buildPayouts(products, orders));
  db.loadCollection('coupons', buildCoupons());
  db.loadCollection('subscriptions', buildSubscriptions());
  db.loadCollection('notifications', buildNotifications(products, orders));
  db.loadCollection('wishlist', [
    { id: 'w-1', userId: 'u-c1', productId: 'p-r1', createdAt: iso(2026, 6, 2) },
    { id: 'w-2', userId: 'u-c1', productId: 'p-b3', createdAt: iso(2026, 6, 9) },
    { id: 'w-3', userId: 'u-c1', productId: 'p-c7', createdAt: iso(2026, 7, 1) },
  ]);
  db.loadCollection('follows', [
    { id: 'f-1', userId: 'u-c1', vendorId: 'v-1', createdAt: iso(2026, 3, 3) },
    { id: 'f-2', userId: 'u-c1', vendorId: 'v-6', createdAt: iso(2026, 5, 14) },
  ]);
  db.loadCollection('cart', []);
  db.loadCollection('subscribers', SUBSCRIBERS);
  db.loadCollection('messages', MESSAGES);
  db.loadCollection('media', []);
  db.loadCollection('pages', CONTENT_PAGES);
  db.loadCollection('settings', [
    { id: 'set-launch', key: 'launchMode', value: 'pre-launch',
      label: 'Storefront gating', help: 'Pre-launch shows the gated landing page only. Post-launch opens the full storefront.' },
    { id: 'set-promo', key: 'promoEndsAt', value: PROMO.freeUntil, label: 'Founding promotion ends' },
    { id: 'set-billing', key: 'billingStartsAt', value: PROMO.billingStarts, label: 'Paid billing begins' },
  ]);

  db.markSeeded();
  return true;
}

const SUBSCRIBERS = [
  ['amina.begum@example.com', 'Amina Begum', iso(2026, 5, 2)],
  ['abdul.rashid.k@example.com', 'Abdul Rashid K.', iso(2026, 5, 4)],
  ['layla.s@example.com', 'Layla S.', iso(2026, 5, 11)],
  ['h.tanveer@example.com', 'Hina Tanveer', iso(2026, 5, 19)],
  ['omar.faruq@example.com', 'Omar Faruq', iso(2026, 6, 1)],
  ['zainab.ali@example.com', 'Zainab Ali', iso(2026, 6, 6)],
  ['school.admin@nurulhuda.org', 'Nurul Huda Academy', iso(2026, 6, 12)],
  ['t.abdullah@example.com', 'Tariq Abdullah', iso(2026, 6, 18)],
  ['sarah.mahmud@example.com', 'Sarah Mahmud', iso(2026, 6, 25)],
  ['coop.leeds@example.com', 'Leeds Homeschool Co-op', iso(2026, 7, 2)],
  ['n.chaudhry@example.com', 'Nasreen Chaudhry', iso(2026, 7, 8)],
  ['imran.dawood@example.com', 'Imran Dawood', iso(2026, 7, 15)],
  ['aaliyah.k@example.com', 'Aaliyah Khan', iso(2026, 7, 21)],
  ['mustafa.b@example.com', 'Mustafa Bhatti', iso(2026, 7, 28)],
  ['ummu.salamah@example.com', 'Ummu Salamah', iso(2026, 8, 1)],
].map(([email, name, at], i) => ({ id: 'sb-' + (i + 1), email, name, createdAt: at, confirmed: i % 6 !== 0, source: 'landing' }));

const MESSAGES = [
  { id: 'm-1', vendorId: 'v-1', productId: 'p-main', fromUserId: 'u-c1', fromName: 'Aisha Rahman',
    kind: 'enquiry', subject: 'Google Slides version', status: 'open',
    body: 'Salaam — is the Google Slides version editable, or view-only? I would like to swap two of the passages for Seerah texts we already use.',
    createdAt: iso(2026, 7, 30) },
  { id: 'm-2', vendorId: 'v-1', productId: 'p-r1', fromUserId: 'u-c5', fromName: 'Fatima Bakr',
    kind: 'message', subject: 'Bundle for a co-op', status: 'open',
    body: 'Do you offer a licence for a homeschool co-op of about twelve families? Happy to pay for multiple seats.',
    createdAt: iso(2026, 8, 3) },
  { id: 'm-3', vendorId: 'v-2', productId: 'p-b1', fromUserId: 'u-c4', fromName: 'Wei Chen',
    kind: 'enquiry', subject: 'Print size', status: 'answered',
    body: 'Are the tracing strips sized for A4 as well as US Letter?', createdAt: iso(2026, 7, 22) },
  { id: 'm-4', vendorId: 'v-6', productId: null, fromUserId: 'u-c6', fromName: 'Idris Mahmood',
    kind: 'message', subject: 'Arabic letter cards request', status: 'open',
    body: 'Would you consider a version of the clip cards with the Arabic letters in isolated, initial, medial and final forms?',
    createdAt: iso(2026, 8, 5) },
  { id: 'm-5', vendorId: 'v-5', productId: 'p-b4', fromUserId: 'u-c2', fromName: 'Maryam Patterson',
    kind: 'enquiry', subject: 'Answer key missing', status: 'answered',
    body: 'The download seems to be missing the answer key that is mentioned on page 2. Could you check?',
    createdAt: iso(2026, 6, 30) },
];

const CONTENT_PAGES = [
  { id: 'pg-about', slug: 'about', title: 'About Us', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'Uloominate is a digital marketplace supplying Islamic educational resources to teachers, parents and homeschoolers. It follows the model of a general teaching marketplace, narrowed deliberately to a single category: faith-aligned educational material for the Muslim community.\n\nIslamic resources exist on general marketplaces, but they are difficult to locate because buyers must filter through a large volume of secular material. There is no dedicated, trusted marketplace where Muslim educators can reliably find faith-aligned resources, and no dedicated channel through which Muslim creators can reach that audience.\n\nUloominate addresses both sides of that gap with a single-category marketplace governed by an explicit content standard.' },
  { id: 'pg-privacy', slug: 'privacy', title: 'Privacy Policy', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'This policy explains what we collect, why we collect it, and the choices you have.\n\nWe collect the account details you give us at registration, the resources you publish or purchase, and basic usage data needed to run the platform. Payment details are handled by our payment provider and are not stored on our servers.\n\nVendor resource files are held in a client-owned external storage workspace and served only to verified purchasers through non-guessable, expiring links.' },
  { id: 'pg-terms', slug: 'terms', title: 'Terms & Conditions', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'These terms govern use of the Uloominate marketplace by vendors and by customers.\n\nVendors retain ownership of their original work. Every product requires administrative approval before it becomes publicly visible, and approval applies to new submissions as well as to subsequent edits of previously approved products.\n\nCommission is calculated per plan tier and applied automatically at the point of sale. Payouts are issued monthly by PayPal or bank deposit. Purchasers may re-download any resource they have bought, without limit.' },
  { id: 'pg-contact', slug: 'contact', title: 'Contact Us', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'Questions about vendor plans, an order, or a resource you have downloaded? Send us a message and we will reply within two working days.' },
];

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  try { __exports["seedAll"] = seedAll; } catch (e) {}
});

__def("assets/js/repositories/productsRepo.js", function (__exports, __req) {
/**
 * productsRepo.js — catalogue reads and the full submission/moderation cycle.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET    /products                 listProducts
 *   GET    /products/:id             getProduct
 *   POST   /products                 createProduct
 *   PATCH  /products/:id             updateProduct
 *   DELETE /products/:id             deleteProduct
 *   POST   /products/:id/submit      submitProduct
 *   POST   /products/:id/approve     approveProduct
 *   POST   /products/:id/decline     declineProduct
 *   POST   /products/:id/unpublish   unpublishProduct
 *   POST   /products/:id/duplicate   duplicateProduct
 */

const { db, simulate, collection, resource, listQuery, notFound, conflict, LATENCY } = __req('assets/js/api.js');
const { uploadAllowance, categoryById } = __req('assets/js/business-rules.js');
const SEARCH_FIELDS = ['title', 'description', 'subject', 'resourceType', 'tags'];

function decorate(p) {
  if (!p) return p;
  const vendor = db.findById('vendors', p.vendorId);
  const category = categoryById(p.categoryId);
  return Object.assign({}, p, {
    vendorName: vendor ? vendor.storeName : 'Unknown vendor',
    vendorSlug: vendor ? vendor.slug : null,
    vendorLogo: vendor ? vendor.logo : null,
    vendorFollowers: vendor ? vendor.followers : 0,
    categoryName: category ? category.name : '',
    categorySlug: category ? category.slug : '',
    categoryTint: category ? category.tint : '#F2FAF7',
    isFree: !p.price,
    discountPct: p.originalPrice && p.price
      ? Math.round((1 - p.price / p.originalPrice) * 100) : null,
    gradeLabel: p.gradeFrom === p.gradeTo ? p.gradeFrom : p.gradeFrom + ' – ' + p.gradeTo,
  });
}

function countPublished(vendorId) {
  return db.findAll('products', { filter: { vendorId, status: 'approved' } }).total;
}

/**
 * listProducts({ page, pageSize, q, status, vendorId, categoryIds, subjects,
 *                grades, resourceTypes, themes, priceMin, priceMax, freeOnly,
 *                sort })
 * sort: relevance | newest | price_asc | price_desc | rating | downloads | title
 */
async function listProducts(opts = {}) {
  return simulate(() => {
    const {
      status = 'approved', vendorId, categoryIds, subjects, grades, resourceTypes,
      themes, priceMin, priceMax, freeOnly, sort = 'newest', page = 1, pageSize = 12, q,
    } = opts;

    const sortMap = {
      newest: { field: 'publishedAt', dir: 'desc' },
      oldest: { field: 'publishedAt', dir: 'asc' },
      price_asc: { field: 'price', dir: 'asc' },
      price_desc: { field: 'price', dir: 'desc' },
      rating: { field: 'ratingAvg', dir: 'desc' },
      downloads: { field: 'downloads', dir: 'desc' },
      title: { field: 'title', dir: 'asc' },
      relevance: { field: 'ratingCount', dir: 'desc' },
    };
    const s = sortMap[sort] || sortMap.newest;

    const result = db.findAll('products', Object.assign(listQuery({
      page, pageSize, q, searchFields: SEARCH_FIELDS,
      sort: s.field, sortDir: s.dir,
    }), {
      filter: {
        status: Array.isArray(status) ? status : (status === 'any' ? undefined : status),
        vendorId,
      },
      where: p => {
        if (categoryIds && categoryIds.length && !categoryIds.includes(p.categoryId)) return false;
        if (subjects && subjects.length && !subjects.includes(p.subject)) return false;
        if (resourceTypes && resourceTypes.length && !resourceTypes.includes(p.resourceType)) return false;
        if (themes && themes.length && !themes.includes(p.theme)) return false;
        if (grades && grades.length && !grades.includes(p.gradeFrom) && !grades.includes(p.gradeTo)) return false;
        if (freeOnly && p.price !== 0) return false;
        if (priceMin != null && priceMin !== '' && p.price < Number(priceMin)) return false;
        if (priceMax != null && priceMax !== '' && p.price > Number(priceMax)) return false;
        return true;
      },
    }));

    const out = collection(result);
    out.data = out.data.map(decorate);
    return out;
  }, LATENCY.list);
}

async function getProduct(id) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const full = decorate(p);
    full.vendorProductCount = countPublished(p.vendorId);
    return resource(full);
  });
}

/** GET /products/:id/related — same category, excluding itself. */
async function relatedProducts(id, limit = 4) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const rows = db.findAll('products', {
      filter: { status: 'approved' },
      where: r => r.id !== id && r.categoryId === p.categoryId,
      sort: [{ field: 'downloads', dir: 'desc' }],
    }).rows;
    const fill = rows.length >= limit ? rows : rows.concat(
      db.findAll('products', { filter: { status: 'approved' }, where: r => r.id !== id && r.categoryId !== p.categoryId }).rows
    );
    return { data: fill.slice(0, limit).map(decorate) };
  });
}

/** GET /vendors/:id/upload-allowance — drives the cap message at FR-3.2. */
function checkAllowance(vendorId) {
  const vendor = db.findById('vendors', vendorId);
  if (!vendor) throw notFound('Vendor');
  const paidCount = db.findAll('products', {
    filter: { vendorId },
    where: p => p.price > 0 && ['approved', 'pending', 'draft'].includes(p.status),
  }).total;
  return uploadAllowance(vendor, paidCount);
}

async function createProduct(vendorId, payload) {
  return simulate(() => {
    if (payload.price > 0) {
      const allow = checkAllowance(vendorId);
      if (!allow.allowed) throw conflict(allow.reason, allow.reason === 'plan_free_no_paid_listings'
        ? 'The Pioneer Vendor plan does not permit paid listings.'
        : 'You have reached the paid-resource limit for your plan.');
    }
    const row = db.create('products', Object.assign({
      vendorId, status: 'draft', downloads: 0, ratingAvg: 0, ratingCount: 0,
      gallery: [], tags: [], included: [], originalPrice: null,
      lastUpdated: new Date().toISOString(),
    }, payload));
    return resource(decorate(row));
  }, LATENCY.write);
}

async function updateProduct(id, patch) {
  return simulate(() => {
    const before = db.findById('products', id);
    if (!before) throw notFound('Product');
    // FR-6.4: editing an approved product returns it to the queue.
    const returnsToQueue = before.status === 'approved';
    const row = db.update('products', id, Object.assign({}, patch, {
      lastUpdated: new Date().toISOString(),
      status: returnsToQueue ? 'pending' : (patch.status || before.status),
      submittedAt: returnsToQueue ? new Date().toISOString() : before.submittedAt,
    }));
    return resource(Object.assign(decorate(row), { returnedToQueue: returnsToQueue }));
  }, LATENCY.write);
}

async function deleteProduct(id) {
  return simulate(() => {
    if (!db.findById('products', id)) throw notFound('Product');
    db.remove('products', id);
    return resource({ id, deleted: true });
  }, LATENCY.write);
}

async function submitProduct(id) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const row = db.update('products', id, {
      status: 'pending', submittedAt: new Date().toISOString(), declineReason: null, declineNote: null,
    });
    return resource(decorate(row));
  }, LATENCY.write);
}

async function approveProduct(id, adminId) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const row = db.update('products', id, {
      status: 'approved', publishedAt: p.publishedAt || new Date().toISOString(),
      reviewedBy: adminId, reviewedAt: new Date().toISOString(),
      declineReason: null, declineNote: null,
    });
    return resource(decorate(row));
  }, LATENCY.write);
}

async function declineProduct(id, adminId, reason, note) {
  return simulate(() => {
    if (!db.findById('products', id)) throw notFound('Product');
    const row = db.update('products', id, {
      status: 'declined', declineReason: reason, declineNote: note || null,
      reviewedBy: adminId, reviewedAt: new Date().toISOString(),
    });
    return resource(decorate(row));
  }, LATENCY.write);
}

async function unpublishProduct(id) {
  return simulate(() => {
    if (!db.findById('products', id)) throw notFound('Product');
    return resource(decorate(db.update('products', id, { status: 'unpublished' })));
  }, LATENCY.write);
}

async function duplicateProduct(id) {
  return simulate(() => {
    const p = db.findById('products', id);
    if (!p) throw notFound('Product');
    const copy = Object.assign({}, p);
    delete copy.id; delete copy.createdAt; delete copy.updatedAt;
    copy.title = p.title + ' (copy)';
    copy.status = 'draft'; copy.publishedAt = null; copy.downloads = 0;
    copy.ratingAvg = 0; copy.ratingCount = 0;
    return resource(decorate(db.create('products', copy)));
  }, LATENCY.write);
}

/** POST /products/bulk — approve or decline several queue items at once. */
async function bulkModerate(ids, action, adminId, reason) {
  return simulate(() => {
    const changed = db.transaction(() => ids.map(id => {
      if (action === 'approve') {
        return db.update('products', id, {
          status: 'approved', publishedAt: new Date().toISOString(),
          reviewedBy: adminId, reviewedAt: new Date().toISOString(), declineReason: null,
        });
      }
      return db.update('products', id, {
        status: 'declined', declineReason: reason, reviewedBy: adminId, reviewedAt: new Date().toISOString(),
      });
    }));
    return { data: changed.filter(Boolean).map(decorate), meta: { total: changed.length } };
  }, LATENCY.write);
}

/** Facet counts for the filter panel, computed against the current result set. */
async function facets(opts = {}) {
  return simulate(() => {
    const all = db.findAll('products', { filter: { status: 'approved' } }).rows;
    const count = (key, fn) => all.reduce((acc, p) => {
      const k = fn(p);
      if (k == null) return acc;
      (Array.isArray(k) ? k : [k]).forEach(v => { acc[v] = (acc[v] || 0) + 1; });
      return acc;
    }, {});
    return {
      data: {
        categories: count('categoryId', p => p.categoryId),
        subjects: count('subject', p => p.subject),
        resourceTypes: count('resourceType', p => p.resourceType),
        themes: count('theme', p => p.theme),
        grades: count('grade', p => [p.gradeFrom, p.gradeTo]),
        free: all.filter(p => !p.price).length,
        total: all.length,
      },
    };
  }, LATENCY.read);
}

  try { __exports["listProducts"] = listProducts; } catch (e) {}
  try { __exports["getProduct"] = getProduct; } catch (e) {}
  try { __exports["relatedProducts"] = relatedProducts; } catch (e) {}
  try { __exports["checkAllowance"] = checkAllowance; } catch (e) {}
  try { __exports["createProduct"] = createProduct; } catch (e) {}
  try { __exports["updateProduct"] = updateProduct; } catch (e) {}
  try { __exports["deleteProduct"] = deleteProduct; } catch (e) {}
  try { __exports["submitProduct"] = submitProduct; } catch (e) {}
  try { __exports["approveProduct"] = approveProduct; } catch (e) {}
  try { __exports["declineProduct"] = declineProduct; } catch (e) {}
  try { __exports["unpublishProduct"] = unpublishProduct; } catch (e) {}
  try { __exports["duplicateProduct"] = duplicateProduct; } catch (e) {}
  try { __exports["bulkModerate"] = bulkModerate; } catch (e) {}
  try { __exports["facets"] = facets; } catch (e) {}
});

__def("assets/js/repositories/vendorsRepo.js", function (__exports, __req) {
/**
 * vendorsRepo.js — vendor accounts, the approval queue, and store profiles.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET   /vendors                  listVendors
 *   GET   /vendors/:id              getVendor
 *   GET   /vendors/slug/:slug       getVendorBySlug
 *   POST  /vendors                  registerVendor
 *   PATCH /vendors/:id              updateVendor
 *   POST  /vendors/:id/approve      approveVendor
 *   POST  /vendors/:id/decline      declineVendor
 *   POST  /vendors/:id/suspend      suspendVendor
 *   POST  /vendors/:id/reinstate    reinstateVendor
 *   GET   /vendors/:id/stats        vendorStats
 */

const { db, simulate, collection, resource, listQuery, notFound, conflict, LATENCY } = __req('assets/js/api.js');
const { planByCode, settleLine } = __req('assets/js/business-rules.js');
function decorate(v) {
  if (!v) return v;
  const plan = planByCode(v.planCode);
  const products = db.findAll('products', { filter: { vendorId: v.id } }).rows;
  return Object.assign({}, v, {
    planName: plan.name,
    planPrice: plan.priceLabel,
    payoutRate: plan.payoutRate,
    productCount: products.filter(p => p.status === 'approved').length,
    pendingCount: products.filter(p => p.status === 'pending').length,
    draftCount: products.filter(p => p.status === 'draft').length,
  });
}

async function listVendors(opts = {}) {
  return simulate(() => {
    const { status, planCode, q, page = 1, pageSize = 12, sort = 'joinedAt', sortDir = 'desc' } = opts;
    const result = db.findAll('vendors', Object.assign(
      listQuery({ page, pageSize, q, searchFields: ['storeName', 'owner', 'email', 'country'], sort, sortDir }),
      { filter: { status, planCode } }
    ));
    const out = collection(result);
    out.data = out.data.map(decorate);
    return out;
  }, LATENCY.list);
}

async function getVendor(id) {
  return simulate(() => {
    const v = db.findById('vendors', id);
    if (!v) throw notFound('Vendor');
    return resource(decorate(v));
  });
}

async function getVendorBySlug(slug) {
  return simulate(() => {
    const v = db.findAll('vendors', { filter: { slug } }).rows[0];
    if (!v) throw notFound('Vendor');
    return resource(decorate(v));
  });
}

/** POST /vendors — registration puts the store in `pending` (FR-2.4). */
async function registerVendor(payload) {
  return simulate(() => db.transaction(() => {
    const email = String(payload.email).trim().toLowerCase();
    if (db.findAll('users', { filter: { email } }).total) {
      throw conflict('email_taken', 'An account already exists with that email address.');
    }
    const slug = slugify(payload.storeName);
    if (db.findAll('vendors', { filter: { slug } }).total) {
      throw conflict('store_name_taken', 'A store with a very similar name already exists. Try another.');
    }
    const vendor = db.create('vendors', {
      slug, storeName: payload.storeName,
      owner: [payload.firstName, payload.lastName].filter(Boolean).join(' '),
      email, planCode: payload.planCode, status: 'pending', followers: 0,
      logo: null, banner: null, bio: payload.bio || '',
      country: payload.country || null, payoutMethod: null, payoutAccount: null,
      joinedAt: new Date().toISOString(), setupComplete: false,
    });
    const user = db.create('users', {
      role: 'vendor', vendorId: vendor.id,
      firstName: payload.firstName, lastName: payload.lastName,
      email, password: payload.password, avatar: null, status: 'active',
      joinedAt: vendor.joinedAt,
    });
    db.create('subscriptions', {
      vendorId: vendor.id, planCode: payload.planCode, status: 'pending',
      promoActive: true, freeUntil: '2027-01-01', nextBillingDate: '2027-01-02',
      nextBillingAmount: planByCode(payload.planCode).annualFee,
      paymentMethod: null, startedAt: new Date().toISOString(), cancelledAt: null,
    });
    db.create('notifications', {
      userId: user.id, type: 'vendor_registration', read: false,
      title: 'Registration received',
      body: 'Your vendor registration is with an administrator for review against our content standard.',
      createdAt: new Date().toISOString(),
    });
    db.create('notifications', {
      userId: 'u-admin', type: 'vendor_pending', read: false,
      title: 'New vendor awaiting review',
      body: payload.storeName + ' registered on the ' + planByCode(payload.planCode).name + ' tier.',
      createdAt: new Date().toISOString(),
    });
    return resource({ vendor: decorate(vendor), user: Object.assign({}, user, { password: undefined }) });
  }), LATENCY.write);
}

async function updateVendor(id, patch) {
  return simulate(() => {
    if (!db.findById('vendors', id)) throw notFound('Vendor');
    return resource(decorate(db.update('vendors', id, patch)));
  }, LATENCY.write);
}

async function approveVendor(id, adminId) {
  return simulate(() => db.transaction(() => {
    const v = db.findById('vendors', id);
    if (!v) throw notFound('Vendor');
    const row = db.update('vendors', id, {
      status: 'approved', reviewedBy: adminId, reviewedAt: new Date().toISOString(),
      declineReason: null,
    });
    const sub = db.findAll('subscriptions', { filter: { vendorId: id } }).rows[0];
    if (sub) db.update('subscriptions', sub.id, { status: 'active' });
    const user = db.findAll('users', { filter: { vendorId: id } }).rows[0];
    if (user) db.create('notifications', {
      userId: user.id, type: 'vendor_approved', read: false,
      title: 'Your vendor account is approved',
      body: 'Your store is active. Complete your store setup and publish your first resource.',
      createdAt: new Date().toISOString(),
    });
    return resource(decorate(row));
  }), LATENCY.write);
}

async function declineVendor(id, adminId, reason, note) {
  return simulate(() => db.transaction(() => {
    if (!db.findById('vendors', id)) throw notFound('Vendor');
    const row = db.update('vendors', id, {
      status: 'declined', declineReason: reason, declineNote: note || null,
      reviewedBy: adminId, reviewedAt: new Date().toISOString(),
    });
    const user = db.findAll('users', { filter: { vendorId: id } }).rows[0];
    if (user) db.create('notifications', {
      userId: user.id, type: 'vendor_declined', read: false,
      title: 'Your vendor registration was declined',
      body: reason, createdAt: new Date().toISOString(),
    });
    return resource(decorate(row));
  }), LATENCY.write);
}

async function suspendVendor(id, reason) {
  return simulate(() => {
    if (!db.findById('vendors', id)) throw notFound('Vendor');
    return resource(decorate(db.update('vendors', id, { status: 'suspended', suspendReason: reason || null })));
  }, LATENCY.write);
}

async function reinstateVendor(id) {
  return simulate(() => resource(decorate(db.update('vendors', id, { status: 'approved', suspendReason: null }))), LATENCY.write);
}

/** GET /vendors/:id/stats — every figure derived from stored orders. */
async function vendorStats(vendorId) {
  return simulate(() => {
    const orders = db.findAll('orders', { filter: { status: 'completed' } }).rows;
    const vendor = db.findById('vendors', vendorId);
    if (!vendor) throw notFound('Vendor');

    let gross = 0, earnings = 0, fees = 0, commission = 0, unitsSold = 0;
    const byProduct = {};
    const byMonth = {};
    const customers = new Set();

    for (const o of orders) {
      for (const it of o.items) {
        if (it.vendorId !== vendorId) continue;
        const split = settleLine({ price: it.price, planCode: vendor.planCode });
        gross += split.gross; earnings += split.vendorEarnings;
        fees += split.transactionFee; commission += split.commission;
        unitsSold++; customers.add(o.customerId);
        byProduct[it.productId] = byProduct[it.productId] || { productId: it.productId, title: it.title, units: 0, revenue: 0 };
        byProduct[it.productId].units++;
        byProduct[it.productId].revenue += split.gross;
        const m = o.placedAt.slice(0, 7);
        byMonth[m] = byMonth[m] || { month: m, gross: 0, earnings: 0, orders: 0 };
        byMonth[m].gross += split.gross;
        byMonth[m].earnings += split.vendorEarnings;
        byMonth[m].orders++;
      }
    }

    const paidOut = db.findAll('payouts', { filter: { vendorId } }).rows
      .filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

    const products = db.findAll('products', { filter: { vendorId } }).rows;

    return resource({
      grossSales: r2(gross),
      earnings: r2(earnings),
      commission: r2(commission),
      transactionFees: r2(fees),
      withdrawable: r2(Math.max(0, earnings - paidOut)),
      paidOut: r2(paidOut),
      ordersReceived: orders.filter(o => o.items.some(i => i.vendorId === vendorId)).length,
      unitsSold,
      customerCount: customers.size,
      productCount: products.filter(p => p.status === 'approved').length,
      pendingCount: products.filter(p => p.status === 'pending').length,
      draftCount: products.filter(p => p.status === 'draft').length,
      declinedCount: products.filter(p => p.status === 'declined').length,
      followers: vendor.followers,
      topProducts: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
        .map(p => Object.assign(p, { revenue: r2(p.revenue) })),
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
        .map(m => Object.assign(m, { gross: r2(m.gross), earnings: r2(m.earnings) })),
    });
  }, LATENCY.list);
}

/** POST /vendors/:id/follow — toggles, returns the new state. */
async function toggleFollow(vendorId, userId) {
  return simulate(() => db.transaction(() => {
    const existing = db.findAll('follows', { filter: { vendorId, userId } }).rows[0];
    const vendor = db.findById('vendors', vendorId);
    if (!vendor) throw notFound('Vendor');
    if (existing) {
      db.remove('follows', existing.id);
      db.update('vendors', vendorId, { followers: Math.max(0, vendor.followers - 1) });
      return resource({ following: false, followers: Math.max(0, vendor.followers - 1) });
    }
    db.create('follows', { vendorId, userId, createdAt: new Date().toISOString() });
    db.update('vendors', vendorId, { followers: vendor.followers + 1 });
    return resource({ following: true, followers: vendor.followers + 1 });
  }), LATENCY.write);
}

async function listFollowing(userId) {
  return simulate(() => {
    const rows = db.findAll('follows', { filter: { userId } }).rows;
    return { data: rows.map(f => decorate(db.findById('vendors', f.vendorId))).filter(Boolean), meta: { total: rows.length } };
  }, LATENCY.list);
}

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  try { __exports["listVendors"] = listVendors; } catch (e) {}
  try { __exports["getVendor"] = getVendor; } catch (e) {}
  try { __exports["getVendorBySlug"] = getVendorBySlug; } catch (e) {}
  try { __exports["registerVendor"] = registerVendor; } catch (e) {}
  try { __exports["updateVendor"] = updateVendor; } catch (e) {}
  try { __exports["approveVendor"] = approveVendor; } catch (e) {}
  try { __exports["declineVendor"] = declineVendor; } catch (e) {}
  try { __exports["suspendVendor"] = suspendVendor; } catch (e) {}
  try { __exports["reinstateVendor"] = reinstateVendor; } catch (e) {}
  try { __exports["vendorStats"] = vendorStats; } catch (e) {}
  try { __exports["toggleFollow"] = toggleFollow; } catch (e) {}
  try { __exports["listFollowing"] = listFollowing; } catch (e) {}
});

__def("assets/js/repositories/ordersRepo.js", function (__exports, __req) {
/**
 * ordersRepo.js — checkout, order history, downloads and refunds.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET  /orders                 listOrders
 *   GET  /orders/:id             getOrder
 *   POST /orders                 placeOrder            (checkout)
 *   POST /orders/:id/refund      refundOrder
 *   GET  /me/downloads           listDownloads
 *   GET  /orders/:id/download    downloadUrl           (protected delivery)
 */

const { db, simulate, collection, resource, listQuery, notFound, forbidden, badRequest, conflict, LATENCY } = __req('assets/js/api.js');
const { settleLine, planByCode } = __req('assets/js/business-rules.js');
function decorate(o) {
  if (!o) return o;
  return Object.assign({}, o, {
    itemCount: o.items.length,
    vendorNames: [...new Set(o.items.map(i => {
      const v = db.findById('vendors', i.vendorId);
      return v ? v.storeName : 'Unknown';
    }))],
  });
}

async function listOrders(opts = {}) {
  return simulate(() => {
    const { customerId, vendorId, status, q, page = 1, pageSize = 12, sort = 'placedAt', sortDir = 'desc' } = opts;
    const result = db.findAll('orders', Object.assign(
      listQuery({ page, pageSize, q, searchFields: ['reference', 'customerName', 'customerEmail'], sort, sortDir }),
      {
        filter: { customerId, status },
        where: vendorId ? o => o.items.some(i => i.vendorId === vendorId) : undefined,
      }
    ));
    const out = collection(result);
    out.data = out.data.map(o => {
      const d = decorate(o);
      if (vendorId) {
        const mine = o.items.filter(i => i.vendorId === vendorId);
        const vendor = db.findById('vendors', vendorId);
        d.vendorItems = mine;
        d.vendorGross = r2(mine.reduce((s, i) => s + i.price, 0));
        d.vendorEarnings = r2(mine.reduce((s, i) => s + settleLine({ price: i.price, planCode: vendor.planCode }).vendorEarnings, 0));
      }
      return d;
    });
    return out;
  }, LATENCY.list);
}

async function getOrder(id) {
  return simulate(() => {
    const o = db.findById('orders', id);
    if (!o) throw notFound('Order');
    return resource(decorate(o));
  });
}

/**
 * POST /orders — digital-only checkout. No shipping step (FR-8.2).
 * Splits value across vendors with per-tier commission (FR-8.6) and makes the
 * resource downloadable immediately (FR-8.4).
 */
async function placeOrder({ customerId, items, couponCode, paymentMethod, simulateFailure }) {
  return simulate(() => db.transaction(() => {
    if (!items || !items.length) throw badRequest('Your cart is empty.');
    if (simulateFailure) throw new (Object.getPrototypeOf(notFound()).constructor)(402, 'payment_failed', 'The payment could not be completed. No charge was made.');

    const user = db.findById('users', customerId);
    if (!user) throw forbidden('Sign in to complete your purchase.');

    const owned = new Set();
    db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows
      .forEach(o => o.items.forEach(i => owned.add(i.productId)));

    const lines = [];
    for (const it of items) {
      const p = db.findById('products', it.productId);
      if (!p) throw notFound('Product');
      if (p.status !== 'approved') throw conflict('unavailable', '"' + p.title + '" is no longer available.');
      if (owned.has(p.id)) throw conflict('already_owned', 'You already own "' + p.title + '". Find it in your downloads.');
      const vendor = db.findById('vendors', p.vendorId);
      lines.push({
        productId: p.id, vendorId: p.vendorId, title: p.title, price: p.price,
        cover: p.cover, planCode: vendor.planCode, fileName: p.fileName, fileKey: p.fileKey,
      });
    }

    const subtotal = r2(lines.reduce((s, l) => s + l.price, 0));
    let discount = 0;
    let coupon = null;
    if (couponCode) {
      coupon = db.findAll('coupons', { filter: { code: String(couponCode).toUpperCase() } }).rows[0];
      if (!coupon) throw badRequest('That coupon code was not recognised.', { couponCode: 'Unknown code' });
      if (coupon.status !== 'active') throw badRequest('That coupon is no longer valid.', { couponCode: 'Expired or fully used' });
      if (subtotal < (coupon.minSpend || 0)) throw badRequest('Spend at least $' + coupon.minSpend.toFixed(2) + ' to use this coupon.', { couponCode: 'Minimum spend not met' });
      discount = coupon.type === 'percent' ? r2(subtotal * coupon.value / 100) : Math.min(subtotal, coupon.value);
    }

    const total = r2(Math.max(0, subtotal - discount));
    const ref = 'ULM-' + (26000 + db.findAll('orders').total + 1);

    const order = db.create('orders', {
      reference: ref, customerId, customerName: [user.firstName, user.lastName].join(' '),
      customerEmail: user.email, items: lines, subtotal, discount: r2(discount), total,
      couponCode: coupon ? coupon.code : null, status: 'completed',
      paymentMethod: paymentMethod || 'Card ••••4242', placedAt: new Date().toISOString(),
    });

    if (coupon) db.update('coupons', coupon.id, {
      used: coupon.used + 1,
      status: coupon.usageLimit && coupon.used + 1 >= coupon.usageLimit ? 'exhausted' : coupon.status,
    });

    // Download counters and vendor sale notifications (FR-7.8, FR-11.3).
    const notifiedVendors = new Set();
    for (const l of lines) {
      const p = db.findById('products', l.productId);
      db.update('products', l.productId, { downloads: (p.downloads || 0) + 1 });
      if (!notifiedVendors.has(l.vendorId)) {
        notifiedVendors.add(l.vendorId);
        const vu = db.findAll('users', { filter: { vendorId: l.vendorId } }).rows[0];
        const split = settleLine({ price: l.price, planCode: l.planCode });
        if (vu) db.create('notifications', {
          userId: vu.id, type: 'sale', read: false, title: 'You made a sale',
          body: '"' + l.title + '" sold for $' + l.price.toFixed(2) + '. Your earnings: $' + split.vendorEarnings.toFixed(2) + '.',
          createdAt: new Date().toISOString(),
        });
      }
    }

    db.create('notifications', {
      userId: customerId, type: 'order', read: false, title: 'Your resources are ready',
      body: 'Order ' + ref + ' is complete. Download your files any time from your account.',
      createdAt: new Date().toISOString(),
    });

    db.loadCollection('cart', db.findAll('cart').rows.filter(c => c.userId !== customerId));

    return resource(decorate(order));
  }), LATENCY.write + 400);
}

async function refundOrder(id, reason) {
  return simulate(() => {
    const o = db.findById('orders', id);
    if (!o) throw notFound('Order');
    if (o.status !== 'completed') throw conflict('not_refundable', 'Only completed orders can be refunded.');
    return resource(decorate(db.update('orders', id, {
      status: 'refunded', refundReason: reason || null, refundedAt: new Date().toISOString(),
    })));
  }, LATENCY.write);
}

/** GET /me/downloads — unlimited re-download of everything purchased (FR-9.2). */
async function listDownloads(customerId, opts = {}) {
  return simulate(() => {
    const orders = db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows;
    const seen = new Map();
    for (const o of orders) {
      for (const it of o.items) {
        if (seen.has(it.productId)) continue;
        const p = db.findById('products', it.productId);
        seen.set(it.productId, {
          productId: it.productId, title: it.title, cover: it.cover,
          fileName: it.fileName || (p && p.fileName), fileKey: it.fileKey || (p && p.fileKey),
          fileType: p ? p.fileType : 'PDF', fileSizeMb: p ? p.fileSizeMb : null,
          pageCount: p ? p.pageCount : null,
          orderId: o.id, orderReference: o.reference, purchasedAt: o.placedAt,
          vendorId: it.vendorId, available: !!p && p.status !== 'unpublished',
        });
      }
    }
    let rows = [...seen.values()].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
    if (opts.q) {
      const q = opts.q.toLowerCase();
      rows = rows.filter(r => r.title.toLowerCase().includes(q));
    }
    const pageSize = opts.pageSize || 12;
    const page = opts.page || 1;
    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
    };
  }, LATENCY.list);
}

/**
 * GET /orders/:orderId/download?productId= — protected delivery (FR-10.2/10.3).
 * Verifies purchase, then mints a single-use, expiring token. Nothing about the
 * real file path is exposed to the client.
 */
async function downloadUrl(customerId, productId) {
  return simulate(() => {
    const owns = db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows
      .some(o => o.items.some(i => i.productId === productId));
    if (!owns) throw forbidden('This resource is only available to purchasers.');
    const token = 'dl_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    return resource({
      token,
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      // TODO(backend): this becomes a signed URL from the external storage
      // workspace (BRD OI-8). It must not be derivable from the product id.
      href: 'about:blank#' + token,
    });
  }, LATENCY.read);
}

/** Has this customer bought this product? Gates the review form (FR-9.4). */
function hasPurchased(customerId, productId) {
  if (!customerId) return false;
  return db.findAll('orders', { filter: { customerId, status: 'completed' } }).rows
    .some(o => o.items.some(i => i.productId === productId));
}

function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  try { __exports["listOrders"] = listOrders; } catch (e) {}
  try { __exports["getOrder"] = getOrder; } catch (e) {}
  try { __exports["placeOrder"] = placeOrder; } catch (e) {}
  try { __exports["refundOrder"] = refundOrder; } catch (e) {}
  try { __exports["listDownloads"] = listDownloads; } catch (e) {}
  try { __exports["downloadUrl"] = downloadUrl; } catch (e) {}
  try { __exports["hasPurchased"] = hasPurchased; } catch (e) {}
});

__def("assets/js/repositories/cartRepo.js", function (__exports, __req) {
/**
 * cartRepo.js — multi-vendor cart. One transaction may hold resources from
 * several vendors (FR-8.1).
 * Depends: api.js, db.js
 *
 * REST mapping
 *   GET    /me/cart            getCart
 *   POST   /me/cart            addToCart
 *   DELETE /me/cart/:id        removeFromCart
 *   DELETE /me/cart            clearCart
 */

const { db, simulate, resource, notFound, conflict, LATENCY } = __req('assets/js/api.js');
const { hasPurchased } = __req('assets/js/repositories/ordersRepo.js');
/** Guests get a browser-scoped cart under a stable anonymous id. */
const GUEST_KEY = 'uloominate.guestCart.v1';
function cartOwner(user) {
  if (user) return user.id;
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) { id = 'guest-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(GUEST_KEY, id); }
  return id;
}

function lines(userId) {
  return db.findAll('cart', { filter: { userId }, sort: [{ field: 'createdAt', dir: 'asc' }] }).rows
    .map(row => {
      const p = db.findById('products', row.productId);
      if (!p) return null;
      const v = db.findById('vendors', p.vendorId);
      return {
        id: row.id, productId: p.id, title: p.title, price: p.price,
        originalPrice: p.originalPrice, cover: p.cover, fileType: p.fileType,
        pageCount: p.pageCount, vendorId: p.vendorId,
        vendorName: v ? v.storeName : 'Unknown vendor',
        available: p.status === 'approved',
        addedAt: row.createdAt,
      };
    })
    .filter(Boolean);
}

function totals(items) {
  const subtotal = r2(items.reduce((s, i) => s + i.price, 0));
  return {
    itemCount: items.length,
    vendorCount: new Set(items.map(i => i.vendorId)).size,
    subtotal, discount: 0, total: subtotal,
  };
}

async function getCart(userId) {
  return simulate(() => {
    const items = lines(userId);
    return resource(Object.assign({ items }, totals(items)));
  }, LATENCY.read);
}

/** Synchronous count for the header badge — no spinner in the chrome. */
function cartCount(userId) {
  return db.findAll('cart', { filter: { userId } }).total;
}

async function addToCart(userId, productId, { isCustomer } = {}) {
  return simulate(() => {
    const p = db.findById('products', productId);
    if (!p) throw notFound('Product');
    if (p.status !== 'approved') throw conflict('unavailable', 'That resource is not currently available.');
    if (isCustomer && hasPurchased(userId, productId)) {
      throw conflict('already_owned', 'You already own this resource. Find it in your downloads.');
    }
    if (db.findAll('cart', { filter: { userId, productId } }).total) {
      throw conflict('already_in_cart', 'That resource is already in your cart.');
    }
    db.create('cart', { userId, productId, createdAt: new Date().toISOString() });
    const items = lines(userId);
    return resource(Object.assign({ items }, totals(items)));
  }, LATENCY.write);
}

async function removeFromCart(userId, lineId) {
  return simulate(() => {
    db.remove('cart', lineId);
    const items = lines(userId);
    return resource(Object.assign({ items }, totals(items)));
  }, LATENCY.write);
}

async function clearCart(userId) {
  return simulate(() => {
    db.loadCollection('cart', db.findAll('cart').rows.filter(c => c.userId !== userId));
    return resource({ items: [], itemCount: 0, vendorCount: 0, subtotal: 0, discount: 0, total: 0 });
  }, LATENCY.write);
}

/** Move a guest cart onto a real account at sign-in. */
function mergeGuestCart(userId) {
  const guestId = localStorage.getItem(GUEST_KEY);
  if (!guestId) return 0;
  const guestLines = db.findAll('cart', { filter: { userId: guestId } }).rows;
  let moved = 0;
  for (const l of guestLines) {
    if (!db.findAll('cart', { filter: { userId, productId: l.productId } }).total) {
      db.update('cart', l.id, { userId }); moved++;
    } else db.remove('cart', l.id);
  }
  return moved;
}

function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  try { __exports["cartOwner"] = cartOwner; } catch (e) {}
  try { __exports["getCart"] = getCart; } catch (e) {}
  try { __exports["cartCount"] = cartCount; } catch (e) {}
  try { __exports["addToCart"] = addToCart; } catch (e) {}
  try { __exports["removeFromCart"] = removeFromCart; } catch (e) {}
  try { __exports["clearCart"] = clearCart; } catch (e) {}
  try { __exports["mergeGuestCart"] = mergeGuestCart; } catch (e) {}
});

__def("assets/js/repositories/reviewsRepo.js", function (__exports, __req) {
/**
 * reviewsRepo.js — ratings, distribution and individual reviews (FR-7.7).
 * Depends: api.js, db.js, ordersRepo.js
 *
 * REST mapping
 *   GET  /products/:id/reviews      listReviews
 *   GET  /products/:id/rating       ratingSummary
 *   POST /products/:id/reviews      createReview
 *   GET  /me/reviews                listMyReviews
 *   DELETE /reviews/:id             deleteReview
 */

const { db, simulate, collection, resource, listQuery, notFound, forbidden, conflict, LATENCY } = __req('assets/js/api.js');
const { hasPurchased } = __req('assets/js/repositories/ordersRepo.js');
async function listReviews(productId, opts = {}) {
  return simulate(() => {
    const { page = 1, pageSize = 3, sort = 'createdAt', sortDir = 'desc', rating } = opts;
    return collection(db.findAll('reviews', Object.assign(
      listQuery({ page, pageSize, sort, sortDir }),
      { filter: { productId, status: 'published', rating: rating ? Number(rating) : undefined } }
    )));
  }, LATENCY.list);
}

async function listMyReviews(userId, opts = {}) {
  return simulate(() => {
    const out = collection(db.findAll('reviews', Object.assign(
      listQuery({ page: opts.page || 1, pageSize: opts.pageSize || 10, sort: 'createdAt', sortDir: 'desc' }),
      { filter: { userId } }
    )));
    out.data = out.data.map(r => {
      const p = db.findById('products', r.productId);
      return Object.assign({}, r, { productTitle: p ? p.title : 'Removed resource', productCover: p ? p.cover : null });
    });
    return out;
  }, LATENCY.list);
}

/** GET /products/:id/rating — aggregate score plus the five-bar distribution. */
async function ratingSummary(productId) {
  return simulate(() => {
    const p = db.findById('products', productId);
    if (!p) throw notFound('Product');
    const rows = db.findAll('reviews', { filter: { productId, status: 'published' } }).rows;

    // Seeded products carry an authored breakdown so the design page matches
    // its Figma reference exactly; user-created ones compute from reviews.
    if (p.ratingBreakdown) {
      return resource({
        average: p.ratingAvg, count: p.ratingCount,
        distribution: [5, 4, 3, 2, 1].map(star => ({ star, pct: p.ratingBreakdown[star] || 0 })),
      });
    }
    const count = rows.length;
    const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
    return resource({
      average, count,
      distribution: [5, 4, 3, 2, 1].map(star => ({
        star, pct: count ? Math.round(rows.filter(r => r.rating === star).length / count * 100) : 0,
      })),
    });
  }, LATENCY.read);
}

async function createReview(productId, user, { rating, body }) {
  return simulate(() => db.transaction(() => {
    const p = db.findById('products', productId);
    if (!p) throw notFound('Product');
    if (!user) throw forbidden('Sign in to leave a review.');
    if (!hasPurchased(user.id, productId)) {
      throw forbidden('You can review a resource once you have purchased it.');
    }
    if (db.findAll('reviews', { filter: { productId, userId: user.id } }).total) {
      throw conflict('already_reviewed', 'You have already reviewed this resource.');
    }
    const row = db.create('reviews', {
      productId, userId: user.id, name: user.name, roleLabel: user.roleLabel || 'Educator',
      avatar: user.avatar || null, rating: Number(rating), body, status: 'published',
      createdAt: new Date().toISOString(),
    });
    recalc(productId);
    return resource(row);
  }), LATENCY.write);
}

async function deleteReview(id, user) {
  return simulate(() => {
    const r = db.findById('reviews', id);
    if (!r) throw notFound('Review');
    if (user.role !== 'admin' && r.userId !== user.id) throw forbidden();
    db.remove('reviews', id);
    recalc(r.productId);
    return resource({ id, deleted: true });
  }, LATENCY.write);
}

function recalc(productId) {
  const p = db.findById('products', productId);
  if (!p || p.ratingBreakdown) return; // authored breakdowns are left alone
  const rows = db.findAll('reviews', { filter: { productId, status: 'published' } }).rows;
  const count = rows.length;
  db.update('products', productId, {
    ratingCount: count,
    ratingAvg: count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0,
  });
}

  try { __exports["listReviews"] = listReviews; } catch (e) {}
  try { __exports["listMyReviews"] = listMyReviews; } catch (e) {}
  try { __exports["ratingSummary"] = ratingSummary; } catch (e) {}
  try { __exports["createReview"] = createReview; } catch (e) {}
  try { __exports["deleteReview"] = deleteReview; } catch (e) {}
});

__def("assets/js/repositories/usersRepo.js", function (__exports, __req) {
/**
 * usersRepo.js — accounts, registration, profile, wishlist.
 * Depends: api.js, db.js
 *
 * REST mapping
 *   GET    /users                  listUsers
 *   GET    /users/:id              getUser
 *   POST   /users                  registerCustomer
 *   PATCH  /users/:id              updateUser
 *   POST   /users/:id/suspend      suspendUser
 *   GET    /me/wishlist            listWishlist
 *   POST   /me/wishlist            toggleWishlist
 */

const { db, simulate, collection, resource, listQuery, notFound, conflict, LATENCY } = __req('assets/js/api.js');
const strip = u => { const c = Object.assign({}, u); delete c.password; delete c.resetToken; c.name = [u.firstName, u.lastName].filter(Boolean).join(' '); return c; };

async function listUsers(opts = {}) {
  return simulate(() => {
    const out = collection(db.findAll('users', Object.assign(
      listQuery({
        page: opts.page || 1, pageSize: opts.pageSize || 12, q: opts.q,
        searchFields: ['firstName', 'lastName', 'email'],
        sort: opts.sort || 'joinedAt', sortDir: opts.sortDir || 'desc',
      }),
      { filter: { role: opts.role, status: opts.status } }
    )));
    out.data = out.data.map(strip);
    return out;
  }, LATENCY.list);
}

async function getUser(id) {
  return simulate(() => {
    const u = db.findById('users', id);
    if (!u) throw notFound('User');
    return resource(strip(u));
  });
}

async function registerCustomer(payload) {
  return simulate(() => db.transaction(() => {
    const email = String(payload.email).trim().toLowerCase();
    if (db.findAll('users', { filter: { email } }).total) {
      throw conflict('email_taken', 'An account already exists with that email address.');
    }
    const user = db.create('users', {
      role: 'customer', firstName: payload.firstName, lastName: payload.lastName,
      email, password: payload.password, avatar: null, status: 'active',
      roleLabel: payload.roleLabel || 'Educator',
      joinedAt: new Date().toISOString(),
    });
    db.create('notifications', {
      userId: user.id, type: 'welcome', read: false, title: 'Welcome to Uloominate',
      body: 'Your account is ready. Browse the catalogue and download your first resource.',
      createdAt: new Date().toISOString(),
    });
    return resource(strip(user));
  }), LATENCY.write);
}

async function updateUser(id, patch) {
  return simulate(() => {
    if (!db.findById('users', id)) throw notFound('User');
    if (patch.email) {
      const clash = db.findAll('users', { filter: { email: String(patch.email).toLowerCase() } }).rows[0];
      if (clash && clash.id !== id) throw conflict('email_taken', 'That email is already in use.');
    }
    return resource(strip(db.update('users', id, patch)));
  }, LATENCY.write);
}

async function suspendUser(id, suspended = true) {
  return simulate(() => resource(strip(db.update('users', id, { status: suspended ? 'suspended' : 'active' }))), LATENCY.write);
}

/* ------------------------------------------------------------ wishlist -- */

async function listWishlist(userId, opts = {}) {
  return simulate(() => {
    const rows = db.findAll('wishlist', { filter: { userId }, sort: [{ field: 'createdAt', dir: 'desc' }] }).rows;
    const items = rows.map(w => {
      const p = db.findById('products', w.productId);
      if (!p) return null;
      const v = db.findById('vendors', p.vendorId);
      return {
        id: w.id, productId: p.id, title: p.title, price: p.price, originalPrice: p.originalPrice,
        cover: p.cover, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount,
        vendorName: v ? v.storeName : '', available: p.status === 'approved', savedAt: w.createdAt,
      };
    }).filter(Boolean);
    const pageSize = opts.pageSize || 12, page = opts.page || 1;
    return {
      data: items.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) },
    };
  }, LATENCY.list);
}

async function toggleWishlist(userId, productId) {
  return simulate(() => {
    const existing = db.findAll('wishlist', { filter: { userId, productId } }).rows[0];
    if (existing) { db.remove('wishlist', existing.id); return resource({ saved: false }); }
    db.create('wishlist', { userId, productId, createdAt: new Date().toISOString() });
    return resource({ saved: true });
  }, LATENCY.write);
}

function isWishlisted(userId, productId) {
  if (!userId) return false;
  return db.findAll('wishlist', { filter: { userId, productId } }).total > 0;
}

  try { __exports["listUsers"] = listUsers; } catch (e) {}
  try { __exports["getUser"] = getUser; } catch (e) {}
  try { __exports["registerCustomer"] = registerCustomer; } catch (e) {}
  try { __exports["updateUser"] = updateUser; } catch (e) {}
  try { __exports["suspendUser"] = suspendUser; } catch (e) {}
  try { __exports["listWishlist"] = listWishlist; } catch (e) {}
  try { __exports["toggleWishlist"] = toggleWishlist; } catch (e) {}
  try { __exports["isWishlisted"] = isWishlisted; } catch (e) {}
});

__def("assets/js/repositories/financeRepo.js", function (__exports, __req) {
/**
 * financeRepo.js — payouts, coupons and vendor subscriptions.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET   /payouts                      listPayouts
 *   POST  /payouts                      requestWithdrawal
 *   POST  /payouts/:id/pay              markPaid
 *   GET   /coupons                      listCoupons
 *   POST  /coupons                      createCoupon
 *   PATCH /coupons/:id                  updateCoupon
 *   DELETE /coupons/:id                 deleteCoupon
 *   GET   /vendors/:id/subscription     getSubscription
 *   POST  /vendors/:id/subscription/plan       changePlan
 *   POST  /vendors/:id/subscription/payment    updatePaymentMethod
 *   POST  /vendors/:id/subscription/cancel     cancelSubscription
 */

const { db, simulate, collection, resource, listQuery, notFound, badRequest, conflict, LATENCY } = __req('assets/js/api.js');
const { planByCode, MIN_PAYOUT, PROMO } = __req('assets/js/business-rules.js');
const { vendorStats } = __req('assets/js/repositories/vendorsRepo.js');
/* -------------------------------------------------------------- payouts -- */

async function listPayouts(opts = {}) {
  return simulate(() => {
    const out = collection(db.findAll('payouts', Object.assign(
      listQuery({
        page: opts.page || 1, pageSize: opts.pageSize || 12, q: opts.q,
        searchFields: ['period', 'method', 'account'],
        sort: opts.sort || 'requestedAt', sortDir: opts.sortDir || 'desc',
      }),
      { filter: { vendorId: opts.vendorId, status: opts.status } }
    )));
    out.data = out.data.map(p => {
      const v = db.findById('vendors', p.vendorId);
      return Object.assign({}, p, { vendorName: v ? v.storeName : 'Unknown vendor', planCode: v ? v.planCode : null });
    });
    return out;
  }, LATENCY.list);
}

async function requestWithdrawal(vendorId, { amount, method }) {
  const stats = (await vendorStats(vendorId)).data;
  return simulate(() => {
    const value = Number(amount);
    if (value < MIN_PAYOUT) throw badRequest('The minimum withdrawal is $' + MIN_PAYOUT.toFixed(2) + '.', { amount: 'Minimum is $' + MIN_PAYOUT.toFixed(2) });
    if (value > stats.withdrawable) throw badRequest('That is more than your withdrawable balance.', { amount: 'Available: $' + stats.withdrawable.toFixed(2) });
    const v = db.findById('vendors', vendorId);
    const row = db.create('payouts', {
      vendorId, period: monthLabel(new Date()), amount: r2(value),
      method: method || v.payoutMethod, account: v.payoutAccount,
      status: 'pending', requestedAt: new Date().toISOString(), paidAt: null,
    });
    return resource(row);
  }, LATENCY.write);
}

async function markPaid(id) {
  return simulate(() => db.transaction(() => {
    const p = db.findById('payouts', id);
    if (!p) throw notFound('Payout');
    const row = db.update('payouts', id, { status: 'paid', paidAt: new Date().toISOString() });
    const user = db.findAll('users', { filter: { vendorId: p.vendorId } }).rows[0];
    if (user) db.create('notifications', {
      userId: user.id, type: 'payout', read: false, title: 'Payout issued',
      body: 'Your ' + p.period + ' payout of $' + p.amount.toFixed(2) + ' has been sent to ' + p.method + '.',
      createdAt: new Date().toISOString(),
    });
    return resource(row);
  }), LATENCY.write);
}

/* -------------------------------------------------------------- coupons -- */

async function listCoupons(opts = {}) {
  return simulate(() => collection(db.findAll('coupons', Object.assign(
    listQuery({
      page: opts.page || 1, pageSize: opts.pageSize || 10, q: opts.q, searchFields: ['code'],
      sort: opts.sort || 'expiresAt', sortDir: opts.sortDir || 'desc',
    }),
    { filter: { vendorId: opts.vendorId, status: opts.status } }
  ))), LATENCY.list);
}

async function createCoupon(vendorId, payload) {
  return simulate(() => {
    const code = String(payload.code).toUpperCase().trim();
    if (db.findAll('coupons', { filter: { code } }).total) {
      throw conflict('code_taken', 'That coupon code is already in use.');
    }
    return resource(db.create('coupons', {
      vendorId, code, type: payload.type, value: Number(payload.value),
      minSpend: Number(payload.minSpend || 0),
      usageLimit: payload.usageLimit ? Number(payload.usageLimit) : null,
      used: 0, expiresAt: payload.expiresAt, status: 'active',
    }));
  }, LATENCY.write);
}

async function updateCoupon(id, patch) {
  return simulate(() => {
    if (!db.findById('coupons', id)) throw notFound('Coupon');
    return resource(db.update('coupons', id, patch));
  }, LATENCY.write);
}

async function deleteCoupon(id) {
  return simulate(() => {
    if (!db.findById('coupons', id)) throw notFound('Coupon');
    db.remove('coupons', id);
    return resource({ id, deleted: true });
  }, LATENCY.write);
}

/* -------------------------------------------------------- subscriptions -- */

async function getSubscription(vendorId) {
  return simulate(() => {
    const sub = db.findAll('subscriptions', { filter: { vendorId } }).rows[0];
    if (!sub) throw notFound('Subscription');
    const plan = planByCode(sub.planCode);
    return resource(Object.assign({}, sub, {
      planName: plan.name, planFee: plan.annualFee, planPriceLabel: plan.priceLabel,
      payoutRate: plan.payoutRate, paidUploadLimit: plan.paidUploadLimit,
      promoLabel: PROMO.label, promoFreeUntil: PROMO.freeUntil, promoBillingStarts: PROMO.billingStarts,
    }));
  }, LATENCY.read);
}

/**
 * FR-3.6 — a plan change is a direct update. The old build forced cancel and
 * re-subscribe; that defect is removed here by design.
 */
async function changePlan(vendorId, planCode) {
  return simulate(() => db.transaction(() => {
    const plan = planByCode(planCode);
    if (!plan.selfService) throw conflict('by_agreement', 'The Publishers tier is arranged directly with Uloominate. Contact us to discuss terms.');
    const sub = db.findAll('subscriptions', { filter: { vendorId } }).rows[0];
    if (!sub) throw notFound('Subscription');
    db.update('vendors', vendorId, { planCode });
    const row = db.update('subscriptions', sub.id, {
      planCode, status: 'active', cancelledAt: null,
      nextBillingAmount: plan.annualFee, changedAt: new Date().toISOString(),
    });
    return resource(row);
  }), LATENCY.write);
}

/** FR-3.7 — update the card without cancelling anything. */
async function updatePaymentMethod(vendorId, { last4, expiry }) {
  return simulate(() => {
    const sub = db.findAll('subscriptions', { filter: { vendorId } }).rows[0];
    if (!sub) throw notFound('Subscription');
    return resource(db.update('subscriptions', sub.id, {
      paymentMethod: 'Card ••••' + last4, paymentExpiry: expiry,
    }));
  }, LATENCY.write);
}

async function cancelSubscription(vendorId) {
  return simulate(() => {
    const sub = db.findAll('subscriptions', { filter: { vendorId } }).rows[0];
    if (!sub) throw notFound('Subscription');
    return resource(db.update('subscriptions', sub.id, {
      status: 'cancelled', cancelledAt: new Date().toISOString(),
    }));
  }, LATENCY.write);
}

async function resumeSubscription(vendorId) {
  return simulate(() => {
    const sub = db.findAll('subscriptions', { filter: { vendorId } }).rows[0];
    return resource(db.update('subscriptions', sub.id, { status: 'active', cancelledAt: null }));
  }, LATENCY.write);
}

function monthLabel(d) {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'][d.getMonth()] + ' ' + d.getFullYear();
}
function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  try { __exports["listPayouts"] = listPayouts; } catch (e) {}
  try { __exports["requestWithdrawal"] = requestWithdrawal; } catch (e) {}
  try { __exports["markPaid"] = markPaid; } catch (e) {}
  try { __exports["listCoupons"] = listCoupons; } catch (e) {}
  try { __exports["createCoupon"] = createCoupon; } catch (e) {}
  try { __exports["updateCoupon"] = updateCoupon; } catch (e) {}
  try { __exports["deleteCoupon"] = deleteCoupon; } catch (e) {}
  try { __exports["getSubscription"] = getSubscription; } catch (e) {}
  try { __exports["changePlan"] = changePlan; } catch (e) {}
  try { __exports["updatePaymentMethod"] = updatePaymentMethod; } catch (e) {}
  try { __exports["cancelSubscription"] = cancelSubscription; } catch (e) {}
  try { __exports["resumeSubscription"] = resumeSubscription; } catch (e) {}
});

__def("assets/js/repositories/platformRepo.js", function (__exports, __req) {
/**
 * platformRepo.js — notifications, mailing list, vendor messages, static
 * content, platform settings, and every derived reporting figure.
 * Depends: api.js, db.js, business-rules.js
 *
 * REST mapping
 *   GET   /me/notifications             listNotifications
 *   POST  /notifications/:id/read       markRead
 *   POST  /notifications/read-all       markAllRead
 *   POST  /subscribers                  subscribe
 *   GET   /subscribers                  listSubscribers
 *   GET   /messages                     listMessages
 *   POST  /messages/:id/reply           replyToMessage
 *   GET   /pages/:slug                  getPage
 *   PATCH /pages/:slug                  updatePage
 *   GET   /settings                     getSettings
 *   PATCH /settings/:key                setSetting
 *   GET   /reports/platform             platformStats
 *   GET   /reports/admin-queues         queueCounts
 */

const { db, simulate, collection, resource, listQuery, notFound, conflict, badRequest, LATENCY } = __req('assets/js/api.js');
const { settleLine, planByCode } = __req('assets/js/business-rules.js');
/* -------------------------------------------------------- notifications -- */

async function listNotifications(userId, opts = {}) {
  return simulate(() => collection(db.findAll('notifications', Object.assign(
    listQuery({ page: opts.page || 1, pageSize: opts.pageSize || 10, sort: 'createdAt', sortDir: 'desc' }),
    { filter: { userId, read: opts.unreadOnly ? false : undefined } }
  ))), LATENCY.read);
}

function unreadCount(userId) {
  if (!userId) return 0;
  return db.findAll('notifications', { filter: { userId, read: false } }).total;
}

async function markRead(id) {
  return simulate(() => resource(db.update('notifications', id, { read: true })), 120);
}

async function markAllRead(userId) {
  return simulate(() => {
    db.transaction(() => db.findAll('notifications', { filter: { userId, read: false } }).rows
      .forEach(n => db.update('notifications', n.id, { read: true })));
    return resource({ ok: true });
  }, 200);
}

/* ---------------------------------------------------------- mailing list -- */

async function subscribe(email, name) {
  return simulate(() => {
    const clean = String(email).trim().toLowerCase();
    if (db.findAll('subscribers', { filter: { email: clean } }).total) {
      throw conflict('already_subscribed', 'That email is already subscribed.');
    }
    return resource(db.create('subscribers', {
      email: clean, name: name || null, confirmed: false, source: 'landing',
      createdAt: new Date().toISOString(),
    }));
  }, LATENCY.write);
}

async function listSubscribers(opts = {}) {
  return simulate(() => collection(db.findAll('subscribers', Object.assign(
    listQuery({
      page: opts.page || 1, pageSize: opts.pageSize || 15, q: opts.q,
      searchFields: ['email', 'name'], sort: opts.sort || 'createdAt', sortDir: opts.sortDir || 'desc',
    }),
    { filter: { confirmed: opts.confirmed } }
  ))), LATENCY.list);
}

/* ------------------------------------------------------------- messages -- */

async function listMessages(opts = {}) {
  return simulate(() => {
    const out = collection(db.findAll('messages', Object.assign(
      listQuery({
        page: opts.page || 1, pageSize: opts.pageSize || 10, q: opts.q,
        searchFields: ['subject', 'body', 'fromName'],
        sort: opts.sort || 'createdAt', sortDir: opts.sortDir || 'desc',
      }),
      { filter: { vendorId: opts.vendorId, kind: opts.kind, status: opts.status } }
    )));
    out.data = out.data.map(m => {
      const p = m.productId ? db.findById('products', m.productId) : null;
      return Object.assign({}, m, { productTitle: p ? p.title : null, productCover: p ? p.cover : null });
    });
    return out;
  }, LATENCY.list);
}

async function replyToMessage(id, body) {
  return simulate(() => {
    const m = db.findById('messages', id);
    if (!m) throw notFound('Message');
    const replies = (m.replies || []).concat([{ body, at: new Date().toISOString(), from: 'vendor' }]);
    return resource(db.update('messages', id, { replies, status: 'answered' }));
  }, LATENCY.write);
}

async function createEnquiry({ vendorId, productId, user, subject, body }) {
  return simulate(() => resource(db.create('messages', {
    vendorId, productId: productId || null, fromUserId: user ? user.id : null,
    fromName: user ? user.name : 'Guest', kind: 'enquiry', subject, body,
    status: 'open', createdAt: new Date().toISOString(),
  })), LATENCY.write);
}

/* ---------------------------------------------------------- content/CMS -- */

async function getPage(slug) {
  return simulate(() => {
    const p = db.findAll('pages', { filter: { slug } }).rows[0];
    if (!p) throw notFound('Page');
    return resource(p);
  }, LATENCY.read);
}

async function listPages() {
  return simulate(() => collection(db.findAll('pages', { sort: [{ field: 'title', dir: 'asc' }] })), LATENCY.list);
}

async function updatePage(id, patch) {
  return simulate(() => {
    if (!db.findById('pages', id)) throw notFound('Page');
    return resource(db.update('pages', id, Object.assign({}, patch, { updatedAt: new Date().toISOString() })));
  }, LATENCY.write);
}

/* ------------------------------------------------------------- settings -- */

function settingSync(key, fallback = null) {
  const row = db.findAll('settings', { filter: { key } }).rows[0];
  return row ? row.value : fallback;
}

async function getSettings() {
  return simulate(() => collection(db.findAll('settings', { sort: [{ field: 'key', dir: 'asc' }] })), LATENCY.read);
}

/** FR-1.3 — the pre-launch to post-launch switch, no redevelopment needed. */
async function setSetting(key, value) {
  return simulate(() => {
    const row = db.findAll('settings', { filter: { key } }).rows[0];
    if (!row) throw notFound('Setting');
    return resource(db.update('settings', row.id, { value }));
  }, LATENCY.write);
}

/* ------------------------------------------------------------ reporting -- */

/** GET /reports/platform — commission, sales and vendor performance (FR-12.6). */
async function platformStats() {
  return simulate(() => {
    const orders = db.findAll('orders').rows;
    const completed = orders.filter(o => o.status === 'completed');
    const vendors = db.findAll('vendors').rows;
    const products = db.findAll('products').rows;

    let gross = 0, commission = 0, vendorEarnings = 0, fees = 0;
    const byMonth = {}, byVendor = {}, byCategory = {};

    for (const o of completed) {
      for (const it of o.items) {
        const v = vendors.find(x => x.id === it.vendorId);
        const split = settleLine({ price: it.price, planCode: v ? v.planCode : 'basic' });
        gross += split.gross; commission += split.commission;
        vendorEarnings += split.vendorEarnings; fees += split.transactionFee;

        const m = o.placedAt.slice(0, 7);
        byMonth[m] = byMonth[m] || { month: m, gross: 0, commission: 0, orders: 0 };
        byMonth[m].gross += split.gross; byMonth[m].commission += split.commission; byMonth[m].orders++;

        byVendor[it.vendorId] = byVendor[it.vendorId] || {
          vendorId: it.vendorId, name: v ? v.storeName : 'Unknown', planCode: v ? v.planCode : null,
          gross: 0, commission: 0, units: 0,
        };
        byVendor[it.vendorId].gross += split.gross;
        byVendor[it.vendorId].commission += split.commission;
        byVendor[it.vendorId].units++;

        const p = products.find(x => x.id === it.productId);
        const key = p ? p.categoryId : 'unknown';
        byCategory[key] = byCategory[key] || { categoryId: key, gross: 0, units: 0 };
        byCategory[key].gross += split.gross;
        byCategory[key].units++;
      }
    }

    const payouts = db.findAll('payouts').rows;

    return resource({
      grossSales: r2(gross),
      commissionEarned: r2(commission),
      vendorEarnings: r2(vendorEarnings),
      transactionFees: r2(fees),
      orderCount: completed.length,
      refundedCount: orders.filter(o => o.status === 'refunded').length,
      averageOrderValue: completed.length ? r2(gross / completed.length) : 0,
      vendorCount: vendors.filter(v => v.status === 'approved').length,
      pendingVendors: vendors.filter(v => v.status === 'pending').length,
      productCount: products.filter(p => p.status === 'approved').length,
      pendingProducts: products.filter(p => p.status === 'pending').length,
      customerCount: db.findAll('users', { filter: { role: 'customer' } }).total,
      subscriberCount: db.findAll('subscribers').total,
      payoutsPending: r2(payouts.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0)),
      payoutsPaid: r2(payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)),
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
        .map(m => Object.assign(m, { gross: r2(m.gross), commission: r2(m.commission) })),
      topVendors: Object.values(byVendor).sort((a, b) => b.gross - a.gross).slice(0, 8)
        .map(v => Object.assign(v, { gross: r2(v.gross), commission: r2(v.commission) })),
      byCategory: Object.values(byCategory).sort((a, b) => b.gross - a.gross)
        .map(c => Object.assign(c, { gross: r2(c.gross) })),
      byPlan: ['free', 'basic', 'premium', 'publishers'].map(code => ({
        code, name: planByCode(code).name,
        vendors: vendors.filter(v => v.planCode === code).length,
      })),
    });
  }, LATENCY.list);
}

/** Badge counts for the admin sidebar — synchronous, no spinner in chrome. */
function queueCountsSync() {
  return {
    vendors: db.findAll('vendors', { filter: { status: 'pending' } }).total,
    products: db.findAll('products', { filter: { status: 'pending' } }).total,
    payouts: db.findAll('payouts', { filter: { status: 'pending' } }).total,
    messages: db.findAll('messages', { filter: { status: 'open' } }).total,
  };
}

function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  try { __exports["listNotifications"] = listNotifications; } catch (e) {}
  try { __exports["unreadCount"] = unreadCount; } catch (e) {}
  try { __exports["markRead"] = markRead; } catch (e) {}
  try { __exports["markAllRead"] = markAllRead; } catch (e) {}
  try { __exports["subscribe"] = subscribe; } catch (e) {}
  try { __exports["listSubscribers"] = listSubscribers; } catch (e) {}
  try { __exports["listMessages"] = listMessages; } catch (e) {}
  try { __exports["replyToMessage"] = replyToMessage; } catch (e) {}
  try { __exports["createEnquiry"] = createEnquiry; } catch (e) {}
  try { __exports["getPage"] = getPage; } catch (e) {}
  try { __exports["listPages"] = listPages; } catch (e) {}
  try { __exports["updatePage"] = updatePage; } catch (e) {}
  try { __exports["settingSync"] = settingSync; } catch (e) {}
  try { __exports["getSettings"] = getSettings; } catch (e) {}
  try { __exports["setSetting"] = setSetting; } catch (e) {}
  try { __exports["platformStats"] = platformStats; } catch (e) {}
  try { __exports["queueCountsSync"] = queueCountsSync; } catch (e) {}
});

__def("assets/js/repositories/mediaRepo.js", function (__exports, __req) {
/**
 * mediaRepo.js — per-vendor media library and resource-file attachment.
 * Depends: api.js, db.js (blob store lives in IndexedDB)
 *
 * REST mapping
 *   GET    /vendors/:id/media     listMedia
 *   POST   /vendors/:id/media     uploadMedia
 *   DELETE /media/:id             deleteMedia
 */

const { db, simulate, collection, resource, listQuery, notFound, badRequest, LATENCY } = __req('assets/js/api.js');
const MAX_MB = 25;

async function listMedia(vendorId, opts = {}) {
  return simulate(() => collection(db.findAll('media', Object.assign(
    listQuery({
      page: opts.page || 1, pageSize: opts.pageSize || 18, q: opts.q,
      searchFields: ['name'], sort: opts.sort || 'createdAt', sortDir: opts.sortDir || 'desc',
    }),
    { filter: { vendorId, kind: opts.kind } }
  ))), LATENCY.list);
}

/**
 * Stores the bytes in IndexedDB and the metadata in the record. The file
 * survives a hard refresh and re-renders from the blob store.
 * TODO(backend): POST multipart to the external storage workspace and keep
 * only the returned object key.
 */
async function uploadMedia(vendorId, file, kind = 'image') {
  if (!file) throw badRequest('Choose a file to upload.');
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) {
    throw badRequest('That file is ' + sizeMb.toFixed(1) + ' MB. The limit is ' + MAX_MB + ' MB.', { file: 'Maximum ' + MAX_MB + ' MB' });
  }
  const dataUrl = await db.fileToDataUrl(file);
  const key = 'blob-' + db.uuid();
  await db.putBlob(key, dataUrl);
  return simulate(() => resource(db.create('media', {
    vendorId, kind, blobKey: key, name: file.name,
    mime: file.type || 'application/octet-stream',
    sizeMb: Math.round(sizeMb * 100) / 100,
    createdAt: new Date().toISOString(),
  })), LATENCY.write);
}

async function getMediaUrl(blobKey) {
  return db.getBlob(blobKey);
}

async function deleteMedia(id) {
  const row = db.findById('media', id);
  if (!row) throw notFound('File');
  await db.deleteBlob(row.blobKey);
  return simulate(() => { db.remove('media', id); return resource({ id, deleted: true }); }, LATENCY.write);
}

/** Attach an uploaded resource file to a product (FR-5.2). */
async function attachResourceFile(productId, file) {
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) throw badRequest('That file is larger than the ' + MAX_MB + ' MB prototype limit.', { file: 'Too large' });
  const dataUrl = await db.fileToDataUrl(file);
  const key = 'file-' + db.uuid();
  await db.putBlob(key, dataUrl);
  return simulate(() => resource(db.update('products', productId, {
    fileKey: key, fileName: file.name,
    fileSizeMb: Math.round(sizeMb * 100) / 100,
    lastUpdated: new Date().toISOString(),
  })), LATENCY.write);
}

  try { __exports["listMedia"] = listMedia; } catch (e) {}
  try { __exports["uploadMedia"] = uploadMedia; } catch (e) {}
  try { __exports["getMediaUrl"] = getMediaUrl; } catch (e) {}
  try { __exports["deleteMedia"] = deleteMedia; } catch (e) {}
  try { __exports["attachResourceFile"] = attachResourceFile; } catch (e) {}
});

__def("assets/js/app.js", function (__exports, __req) {
/**
 * app.js — boot sequence every page runs before it renders.
 *
 * Purpose:   seed on first load, expose the current session, and provide the
 *            small shared helpers pages need (toast, confirm, money, guards).
 * Depends:   seed.js, auth.js, db.js
 *
 * Usage from a Design Component logic class:
 *   const app = await import('./assets/js/app.js');
 *   await app.boot();
 *   const user = app.auth.requireRole('vendor');
 */

const { seedAll } = __req('assets/js/seed.js');
const db = __req('assets/js/db.js');
const auth = __req('assets/js/auth.js');
const router = __req('assets/js/router.js');
const fmt = __req('assets/js/format.js');
const { t } = __req('assets/js/i18n.js');
let booted = false;

/** Idempotent. Seeds once, then resolves immediately on later calls. */
async function boot() {
  if (booted) return;
  seedAll(false);
  booted = true;
}

/** Wipe and re-seed — the dev toolbar's Reset demo data control. */
function resetDemoData() {
  seedAll(true);
  localStorage.removeItem('uloominate.session.v1');
  localStorage.removeItem('uloominate.guestCart.v1');
}

/* ----------------------------------------------------------------- toast --
 * A single host element is appended lazily so no page has to declare one.
 */
let toastHost = null;
function ensureToastHost() {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = document.createElement('div');
  toastHost.setAttribute('data-toast-host', '');
  Object.assign(toastHost.style, {
    position: 'fixed', right: '24px', bottom: '24px', zIndex: '9000',
    display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none',
    maxWidth: 'min(400px, calc(100vw - 48px))',
  });
  document.body.appendChild(toastHost);
  return toastHost;
}

const TOAST_TONES = {
  success: { bar: '#3A836B', bg: '#FFFFFF', icon: '✓' },
  error: { bar: '#C0392B', bg: '#FFFFFF', icon: '!' },
  info: { bar: '#116254', bg: '#FFFFFF', icon: 'i' },
  warning: { bar: '#B9913E', bg: '#FFFFFF', icon: '!' },
};

function toast(message, tone = 'success', ms = 4200) {
  const host = ensureToastHost();
  const tn = TOAST_TONES[tone] || TOAST_TONES.info;
  const el = document.createElement('div');
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  Object.assign(el.style, {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    background: tn.bg, color: '#121212', borderLeft: '4px solid ' + tn.bar,
    borderRadius: '10px', padding: '14px 16px', pointerEvents: 'auto',
    boxShadow: '0 1px 2px rgba(18,18,18,.06), 0 12px 28px -8px rgba(41,72,60,.28)',
    font: '500 14px/1.45 Poppins, system-ui, sans-serif',
    transform: 'translateY(8px)', opacity: '0',
    transition: 'transform .22s cubic-bezier(.2,.7,.3,1), opacity .22s ease',
  });
  const badge = document.createElement('span');
  Object.assign(badge.style, {
    flex: '0 0 20px', width: '20px', height: '20px', borderRadius: '50%',
    background: tn.bar, color: '#fff', display: 'grid', placeItems: 'center',
    font: '700 12px/1 Poppins, sans-serif', marginTop: '1px',
  });
  badge.textContent = tn.icon;
  const text = document.createElement('span');
  text.textContent = message;
  el.append(badge, text);
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; el.style.opacity = '1'; });
  const close = () => {
    el.style.transform = 'translateY(8px)'; el.style.opacity = '0';
    setTimeout(() => el.remove(), 240);
  };
  el.addEventListener('click', close);
  setTimeout(close, ms);
  return close;
}

/* --------------------------------------------------------------- confirm --
 * Focus-trapped, Esc-closable, promise-based. Used before every destructive
 * action so no page hand-rolls its own dialog.
 */
function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger' }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9100', display: 'grid', placeItems: 'center',
      background: 'rgba(41,72,60,.42)', padding: '24px', opacity: '0', transition: 'opacity .18s ease',
    });
    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    Object.assign(card.style, {
      width: 'min(460px, 100%)', background: '#fff', borderRadius: '16px', padding: '28px',
      boxShadow: '0 24px 64px -16px rgba(41,72,60,.4)', font: '400 15px/1.6 Poppins, system-ui, sans-serif',
      color: '#121212', transform: 'scale(.97)', transition: 'transform .18s cubic-bezier(.2,.7,.3,1)',
    });
    const h = document.createElement('h2');
    h.textContent = title;
    Object.assign(h.style, { margin: '0 0 10px', font: '600 20px/1.3 Poppins, sans-serif', color: '#29483C' });
    const p = document.createElement('p');
    p.textContent = body;
    Object.assign(p.style, { margin: '0 0 24px', color: '#595959' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = cancelLabel;
    Object.assign(cancel.style, {
      padding: '11px 20px', borderRadius: '8px', border: '1px solid #DCE5E1', background: '#fff',
      font: '600 14px Poppins, sans-serif', color: '#29483C', cursor: 'pointer',
    });
    const ok = document.createElement('button');
    ok.type = 'button'; ok.textContent = confirmLabel;
    Object.assign(ok.style, {
      padding: '11px 20px', borderRadius: '8px', border: 'none',
      background: tone === 'danger' ? '#C0392B' : '#3A836B', color: '#fff',
      font: '600 14px Poppins, sans-serif', cursor: 'pointer',
    });
    row.append(cancel, ok);
    card.append(h, p, row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; card.style.transform = 'scale(1)'; });
    ok.focus();

    const done = value => {
      document.removeEventListener('keydown', onKey, true);
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.remove(); if (prev && prev.focus) prev.focus(); }, 180);
      resolve(value);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Tab') {
        const f = [cancel, ok];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(false); });
  });
}

/** Turn an ApiError into { message, fields } a form can render. */
function readError(err) {
  if (err && err.name === 'ApiError') return { message: err.message, fields: err.fields || {} };
  console.error(err);
  return { message: t('state.errorBody'), fields: {} };
}


  try { __exports["db"] = db; } catch (e) {}
  try { __exports["auth"] = auth; } catch (e) {}
  try { __exports["router"] = router; } catch (e) {}
  try { __exports["fmt"] = fmt; } catch (e) {}
  try { __exports["t"] = t; } catch (e) {}
  try { __exports["boot"] = boot; } catch (e) {}
  try { __exports["resetDemoData"] = resetDemoData; } catch (e) {}
  try { __exports["toast"] = toast; } catch (e) {}
  try { __exports["confirmDialog"] = confirmDialog; } catch (e) {}
  try { __exports["readError"] = readError; } catch (e) {}
});