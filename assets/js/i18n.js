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

export function t(key, vars) {
  let s = (strings[LOCALE] && strings[LOCALE][key]) || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(v);
  return s;
}

export function has(key) { return !!(strings[LOCALE] && strings[LOCALE][key]); }

export default strings;
