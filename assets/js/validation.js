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

import { t } from './i18n.js';

export const rules = {
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
export function validate(values, schema) {
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
export function validateField(field, values, schema) {
  const checks = schema[field] || [];
  for (const check of checks) {
    const msg = check(values[field], values);
    if (msg) return msg;
  }
  return null;
}

/* ------------------------------------------------------- shared schemas -- */

export const schemas = {
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
