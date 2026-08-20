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

import { db, simulate, collection, resource, listQuery, notFound, badRequest, conflict, LATENCY } from '../api.js';
import { planByCode, MIN_PAYOUT, PROMO } from '../business-rules.js';
import { vendorStats } from './vendorsRepo.js';

/* -------------------------------------------------------------- payouts -- */

export async function listPayouts(opts = {}) {
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

export async function requestWithdrawal(vendorId, { amount, method }) {
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

export async function markPaid(id) {
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

export async function listCoupons(opts = {}) {
  return simulate(() => collection(db.findAll('coupons', Object.assign(
    listQuery({
      page: opts.page || 1, pageSize: opts.pageSize || 10, q: opts.q, searchFields: ['code'],
      sort: opts.sort || 'expiresAt', sortDir: opts.sortDir || 'desc',
    }),
    { filter: { vendorId: opts.vendorId, status: opts.status } }
  ))), LATENCY.list);
}

export async function createCoupon(vendorId, payload) {
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

export async function updateCoupon(id, patch) {
  return simulate(() => {
    if (!db.findById('coupons', id)) throw notFound('Coupon');
    return resource(db.update('coupons', id, patch));
  }, LATENCY.write);
}

export async function deleteCoupon(id) {
  return simulate(() => {
    if (!db.findById('coupons', id)) throw notFound('Coupon');
    db.remove('coupons', id);
    return resource({ id, deleted: true });
  }, LATENCY.write);
}

/* -------------------------------------------------------- subscriptions -- */

export async function getSubscription(vendorId) {
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
export async function changePlan(vendorId, planCode) {
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
export async function updatePaymentMethod(vendorId, { last4, expiry }) {
  return simulate(() => {
    const sub = db.findAll('subscriptions', { filter: { vendorId } }).rows[0];
    if (!sub) throw notFound('Subscription');
    return resource(db.update('subscriptions', sub.id, {
      paymentMethod: 'Card ••••' + last4, paymentExpiry: expiry,
    }));
  }, LATENCY.write);
}

export async function cancelSubscription(vendorId) {
  return simulate(() => {
    const sub = db.findAll('subscriptions', { filter: { vendorId } }).rows[0];
    if (!sub) throw notFound('Subscription');
    return resource(db.update('subscriptions', sub.id, {
      status: 'cancelled', cancelledAt: new Date().toISOString(),
    }));
  }, LATENCY.write);
}

export async function resumeSubscription(vendorId) {
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
