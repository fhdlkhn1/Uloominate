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
export const PROMO = {
  label: 'Founding Vendor Promotion',
  freeUntil: '2027-01-01',
  billingStarts: '2027-01-02',
  noticeDays: 30, // FR-11.7 advance notice before billing
};

/** OI-2 + OI-3 resolved: four tiers; Publishers is arranged by agreement. */
export const PLANS = [
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

export const planByCode = code => PLANS.find(p => p.code === code) || PLANS[0];
export const planById = id => PLANS.find(p => p.id === id) || PLANS[0];

/** OI-5 resolved: the per-transaction fee is deducted from the vendor payout. */
export const TRANSACTION_FEE_TREATMENT = 'deduct_from_payout';

/** OI-7 resolved: Free vendors are barred from paid listings entirely. */
export const FREE_TIER_BARS_PAID_LISTINGS = true;

/**
 * Split one order line across vendor and platform (BRD §5.5, PRD FR-8.6).
 * Fee treatment follows TRANSACTION_FEE_TREATMENT.
 */
export function settleLine({ price, planCode }) {
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
export function uploadAllowance(vendor, paidCount) {
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
export const CATEGORIES = [
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

export const categoryById = id => CATEGORIES.find(c => c.id === id);
export const categoryBySlug = slug => CATEGORIES.find(c => c.slug === slug);

export const GRADES = [
  'Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade',
  '5th Grade', '6th Grade', '7th Grade', '8th Grade', 'High School', 'Adult',
];

export const RESOURCE_TYPES = [
  'Worksheets', 'Activities', 'Printables', 'Lesson Plans', 'Unit Plans',
  'Flash Cards', 'Games', 'Posters', 'Assessments', 'Workbooks', 'Google Slides',
];

export const THEMES = ['Ramadan', 'Eid', 'Hajj', 'Back to School', 'Seasonal', 'Everyday'];

export const FILE_TYPES = ['PDF', 'PDF + Google Slides', 'PowerPoint', 'ZIP', 'Google Slides'];

/** PRD FR-6.5 — shown inside the moderation UI so review is consistent. */
export const CONTENT_STANDARD = [
  'All published material must align with the Qur\u2019an and authentic Sunnah, following the teachings of Ahlus-Sunnah wal-Jama\u2019ah.',
  'Uloominate reserves the right to review, decline, or remove any content not meeting that standard.',
  'Enforcement is by mandatory administrative review prior to publication, not by post-publication takedown alone.',
];

export const DECLINE_REASONS = [
  'Content does not meet the faith and community standard',
  'Resource file missing, corrupt, or does not match the listing',
  'Preview images are low quality or misleading',
  'Description or included-contents list is incomplete',
  'Incorrect grade range or subject classification',
  'Pricing inconsistent with the vendor plan',
  'Duplicate of an existing listing',
];

export const PAYOUT_METHODS = ['PayPal', 'Bank deposit'];
export const PAYOUT_CYCLE = 'Monthly, issued on the 5th for the previous month';
export const MIN_PAYOUT = 25;

export const ORDER_STATUSES = ['completed', 'processing', 'refunded', 'cancelled', 'failed'];
export const PRODUCT_STATUSES = ['draft', 'pending', 'approved', 'declined', 'unpublished'];
export const VENDOR_STATUSES = ['pending', 'approved', 'declined', 'suspended'];

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
